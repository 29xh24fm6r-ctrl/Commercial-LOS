import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedActorResolver } from '../authorization/actorResolver.js';
import type { DealAuthorizationService } from '../authorization/dealAuthorization.js';
import { configurationHash, validateConfiguration } from '../contract/configuration.js';
import {
  CONTRACT_VERSION, TARGET_LIBRARY_ID, TARGET_ROOT_PATH, TARGET_SITE_URL,
  type EnsureFolderRequest, type NormalizedActorIdentity, type SharePointTransportConfiguration,
  type ServerIdentityContext, type UploadRequest, type VerifiedFolderIdentity,
} from '../contract/types.js';
import { type GraphDriveItem, type SharePointGraphClient } from '../graph/graphClient.js';
import { handleAuthenticatedTransportRequest } from '../host/httpHandler.js';
import { SharePointTransportHost } from '../host/sharePointTransportHost.js';
import { InMemoryIdempotencyLedger } from '../idempotency/idempotencyLedger.js';
import { InMemoryOrphanReconciliationLedger } from '../orphan-reconciliation/orphanLedger.js';

const actor: NormalizedActorIdentity = { tenantId: '11111111-1111-4111-8111-111111111111', objectId: 'actor-object', systemUserId: 'actor-user', upn: 'banker@oldglorybank.com', identityHash: 'a'.repeat(64) };
const identity: ServerIdentityContext = { claims: { tid: actor.tenantId, oid: actor.objectId }, connectorIdentity: 'connector-app-id' };
const now = '2026-08-05T12:00:00.000Z';

function configuration(overrides: Partial<SharePointTransportConfiguration> = {}): SharePointTransportConfiguration {
  const fields = {
    tenantId: actor.tenantId, graphSiteId: 'site-id', graphDriveId: 'drive-id', governedRootItemId: 'root-id',
    verifiedRootPath: TARGET_ROOT_PATH, siteUrl: TARGET_SITE_URL, libraryId: TARGET_LIBRARY_ID,
    contractVersion: CONTRACT_VERSION, connectorIdentity: 'connector-app-id', runtimeIdentity: 'function-app-id',
    permissionGrantEvidenceId: 'sites-selected-grant-1', configurationVersion: 'sp-a1.1', ...overrides,
  } as Omit<SharePointTransportConfiguration, 'configurationHash'>;
  return { ...fields, configurationHash: configurationHash(fields), ...(overrides.configurationHash ? { configurationHash: overrides.configurationHash } : {}) };
}

function folderItem(id: string, name: string, parentId: string, path: string): GraphDriveItem {
  return { id, name, webUrl: `${TARGET_SITE_URL}/Shared Documents${path}`, size: 0, parentReference: { driveId: 'drive-id', id: parentId, path }, folder: {} };
}
function fileItem(id: string, name: string, parentId: string, path: string, size: number, mimeType = 'application/pdf'): GraphDriveItem {
  return { id, name, webUrl: `${TARGET_SITE_URL}/Shared Documents${path}`, size, parentReference: { driveId: 'drive-id', id: parentId, path }, file: { mimeType } };
}

class FakeGraph implements SharePointGraphClient {
  readonly items = new Map<string, GraphDriveItem>();
  readonly creates: Array<{ name: string; conflictBehavior: 'fail' }> = [];
  readonly uploads: Array<{ name: string; conflictBehavior: 'fail' }> = [];
  siteUrl: string = TARGET_SITE_URL;
  listId: string = TARGET_LIBRARY_ID;
  uploadError?: Error;
  malformedUpload = false;
  missingUploadReadback = false;
  constructor() { this.items.set('root-id', folderItem('root-id', '(a) Loans', 'drive-root', TARGET_ROOT_PATH)); }
  async readSite() { return { id: 'site-id', webUrl: this.siteUrl }; }
  async readDrive() { return { id: 'drive-id', webUrl: `${TARGET_SITE_URL}/Documents`, listId: this.listId }; }
  async readItem(_driveId: string, itemId: string) { if (this.missingUploadReadback && itemId === 'file-id') return undefined; return this.items.get(itemId); }
  async findChildByExactName(_driveId: string, parentItemId: string, exactName: string) { return [...this.items.values()].find((item) => item.parentReference?.id === parentItemId && item.name === exactName); }
  async createFolder(input: { driveId: string; parentItemId: string; name: string; conflictBehavior: 'fail' }) {
    this.creates.push(input); const parent = this.items.get(input.parentItemId)!; const id = `folder-${this.creates.length}`;
    const item = folderItem(id, input.name, parent.id, `${relative(parent.webUrl)}/${input.name}`); this.items.set(id, item); return item;
  }
  async uploadFile(input: { driveId: string; parentItemId: string; name: string; mimeType: string; content: Uint8Array; conflictBehavior: 'fail' }) {
    this.uploads.push(input); if (this.uploadError) throw this.uploadError; const parent = this.items.get(input.parentItemId)!;
    const item = this.malformedUpload ? fileItem('file-id', input.name, 'wrong-parent', `${relative(parent.webUrl)}/${input.name}`, input.content.byteLength, input.mimeType) : fileItem('file-id', input.name, parent.id, `${relative(parent.webUrl)}/${input.name}`, input.content.byteLength, input.mimeType);
    this.items.set(item.id, item); return item;
  }
}
function relative(webUrl: string): string { return decodeURIComponent(new URL(webUrl).pathname).split('/Shared Documents')[1]; }

function requests() {
  const ensure: EnsureFolderRequest = { contractVersion: CONTRACT_VERSION, dealId: 'deal-1', correlationId: 'corr-1', borrowerIdentity: 'borrower-1', borrowerLegalName: 'Acme Holdings LLC', loanYear: 2026, annualFolderPath: `${TARGET_ROOT_PATH}/2026 Loans`, companyFolderPath: `${TARGET_ROOT_PATH}/2026 Loans/Acme Holdings LLC` };
  return { ensure };
}

function harness(options: { config?: Partial<SharePointTransportConfiguration>; authorize?: boolean; graph?: FakeGraph } = {}) {
  const graph = options.graph ?? new FakeGraph();
  const actors: AuthenticatedActorResolver = { resolve: vi.fn(async () => actor) };
  const authorization: DealAuthorizationService = { authorize: vi.fn(async ({ dealId }) => options.authorize === false ? undefined : ({ dealId, borrowerIdentity: 'borrower-1', borrowerLegalName: 'Acme Holdings LLC', permitted: true as const, evidenceId: 'auth-1' })) };
  const orphans = new InMemoryOrphanReconciliationLedger(() => new Date(now));
  const host = new SharePointTransportHost({ configuration: options.config ?? configuration(), graph, actors, authorization, idempotency: new InMemoryIdempotencyLedger(), orphans, clock: () => new Date(now) });
  return { host, graph, actors, authorization, orphans };
}

async function readyFolder(h = harness()): Promise<{ h: ReturnType<typeof harness>; folder: VerifiedFolderIdentity }> {
  const result = await h.host.ensureFolder(requests().ensure, identity);
  if (!result.ok) throw new Error(result.code);
  return { h, folder: result.folder };
}
function upload(folder: VerifiedFolderIdentity, overrides: Partial<UploadRequest> = {}): UploadRequest {
  return { contractVersion: CONTRACT_VERSION, dealId: 'deal-1', correlationId: 'upload-1', borrowerIdentity: 'borrower-1', documentId: 'document-1', requirementIds: ['requirement-1'], folder, storedFileName: 'credit-package.pdf', originalFileName: 'credit-package.pdf', mimeType: 'application/pdf', content: new Uint8Array([1, 2, 3]), ...overrides };
}

describe('immutable configuration', () => {
  it('hashes the same activation fields deterministically', () => { const left = configuration(); const right = configuration(); expect(left.configurationHash).toBe(right.configurationHash); expect(validateConfiguration(left).valid).toBe(true); });
  it.each([
    ['missing IDs', { graphSiteId: '' }], ['malformed hash', { configurationHash: 'bad' }],
    ['wrong site', { siteUrl: 'https://example.invalid' }], ['wrong drive/list', { libraryId: 'wrong' }],
    ['wrong root', { verifiedRootPath: '/Other' }],
  ])('fails closed for %s', async (_name, overrides) => { const h = harness({ config: { ...configuration(), ...overrides } as never }); const result = await h.host.ensureFolder(requests().ensure, identity); expect(result.ok).toBe(false); if (!result.ok) expect(result.code).toBe('CONFIGURATION_REQUIRED'); });
});

describe('folder operations', () => {
  it('creates only exact folders with conflict fail and verifies readback', async () => { const { h, folder } = await readyFolder(); expect(folder.companyFolderPath).toBe(`${TARGET_ROOT_PATH}/2026 Loans/Acme Holdings LLC`); expect(h.graph.creates).toEqual([{ driveId: 'drive-id', parentItemId: 'root-id', name: '2026 Loans', conflictBehavior: 'fail' }, { driveId: 'drive-id', parentItemId: 'folder-1', name: 'Acme Holdings LLC', conflictBehavior: 'fail' }]); });
  it('is idempotent and replays the same verified identity', async () => { const h = harness(); const first = await h.host.ensureFolder(requests().ensure, identity); const second = await h.host.ensureFolder(requests().ensure, identity); expect(second).toEqual(first); expect(h.graph.creates).toHaveLength(2); });
  it('returns created=false for an existing exact company folder', async () => { const h = harness(); h.graph.items.set('annual', folderItem('annual', '2026 Loans', 'root-id', `${TARGET_ROOT_PATH}/2026 Loans`)); h.graph.items.set('company', folderItem('company', 'Acme Holdings LLC', 'annual', `${TARGET_ROOT_PATH}/2026 Loans/Acme Holdings LLC`)); const result = await h.host.ensureFolder(requests().ensure, identity); expect(result.ok && result.created).toBe(false); expect(h.graph.creates).toHaveLength(0); });
  it('rejects changed payload reuse of a correlation ID', async () => { const h = harness(); await h.host.ensureFolder(requests().ensure, identity); const result = await h.host.ensureFolder({ ...requests().ensure, borrowerLegalName: 'Other' }, identity); expect(!result.ok && result.code).toBe('IDEMPOTENCY_COLLISION'); });
  it('fails closed on actor-resolution failure and connector mismatch', async () => { const h = harness(); vi.mocked(h.actors.resolve).mockRejectedValueOnce(new Error('identity unavailable')); const actorFailure = await h.host.ensureFolder(requests().ensure, identity); expect(!actorFailure.ok && actorFailure.code).toBe('ACTOR_RESOLUTION_FAILED'); const connectorFailure = await h.host.ensureFolder({ ...requests().ensure, correlationId: 'corr-connector' }, { claims: identity.claims, connectorIdentity: 'wrong-connector' }); expect(!connectorFailure.ok && connectorFailure.code).toBe('CONNECTOR_IDENTITY_MISMATCH'); expect(h.graph.creates).toHaveLength(0); });
  it('fails closed when authorization throws', async () => { const h = harness(); vi.mocked(h.authorization.authorize).mockRejectedValueOnce(new Error('authorization unavailable')); const result = await h.host.ensureFolder(requests().ensure, identity); expect(!result.ok && result.code).toBe('AUTHORIZATION_UNAVAILABLE'); expect(h.graph.creates).toHaveLength(0); });
  it('blocks unauthorized and cross-deal bindings before Graph mutation', async () => { const denied = harness({ authorize: false }); const result = await denied.host.ensureFolder(requests().ensure, identity); expect(!result.ok && result.code).toBe('UNAUTHORIZED'); expect(denied.graph.creates).toHaveLength(0); const h = harness(); const cross = await h.host.ensureFolder({ ...requests().ensure, borrowerIdentity: 'borrower-other' }, identity); expect(cross.ok).toBe(false); });
  it.each([['site', (g: FakeGraph) => { g.siteUrl = 'https://evil.invalid'; }], ['drive', (g: FakeGraph) => { g.listId = 'wrong'; }], ['root', (g: FakeGraph) => { g.items.set('root-id', folderItem('root-id', 'Wrong', 'drive-root', '/Wrong')); }]])('blocks wrong %s readback', async (_name, alter) => { const h = harness(); alter(h.graph); const result = await h.host.ensureFolder(requests().ensure, identity); expect(!result.ok && result.code).toBe('TARGET_READBACK_FAILED'); });
  it('rejects malformed paths instead of renaming', async () => { const h = harness(); const result = await h.host.ensureFolder({ ...requests().ensure, companyFolderPath: `${TARGET_ROOT_PATH}/2026 Loans/Acme Holdings LLC 1` }, identity); expect(!result.ok && result.code).toBe('INVALID_FOLDER_BINDING'); expect(h.graph.creates).toHaveLength(0); });
});

describe('binary and verification operations', () => {
  it('uploads bytes with conflict fail and returns an exact verified reference', async () => { const { h, folder } = await readyFolder(); const result = await h.host.upload(upload(folder), identity); expect(result.ok).toBe(true); expect(h.graph.uploads[0]?.conflictBehavior).toBe('fail'); if (result.ok) { expect(result.reference.fileSizeBytes).toBe(3); expect(result.reference.itemId).toBe('file-id'); expect(await h.host.verifyFile({ contractVersion: CONTRACT_VERSION, dealId: 'deal-1', correlationId: 'verify-file-1', borrowerIdentity: 'borrower-1', reference: result.reference }, identity)).toMatchObject({ ok: true, exists: true }); } });
  it('blocks exact-name collisions and never uploads', async () => { const { h, folder } = await readyFolder(); h.graph.items.set('existing-file', fileItem('existing-file', 'credit-package.pdf', folder.folderItemId, `${folder.companyFolderPath}/credit-package.pdf`, 3)); const result = await h.host.upload(upload(folder), identity); expect(!result.ok && result.code).toBe('FILE_COLLISION'); expect(h.graph.uploads).toHaveLength(0); });
  it('records an unreconciled orphan when the upload response is ambiguous', async () => { const { h, folder } = await readyFolder(); h.graph.uploadError = new Error('network lost'); const result = await h.host.upload(upload(folder), identity); expect(!result.ok && result.fileMayExist).toBe(true); expect(await h.orphans.find('upload-1', 'deal-1', 'document-1')).toMatchObject({ status: 'UNRECONCILED', failureClassification: 'UPLOAD_RESPONSE_LOST' }); });
  it('records readback and malformed-response orphan classifications', async () => { const first = await readyFolder(); first.h.graph.missingUploadReadback = true; await first.h.host.upload(upload(first.folder), identity); expect(await first.h.orphans.find('upload-1', 'deal-1', 'document-1')).toMatchObject({ failureClassification: 'UPLOAD_READBACK_FAILED' }); const second = await readyFolder(); second.h.graph.malformedUpload = true; await second.h.host.upload(upload(second.folder), identity); expect(await second.h.orphans.find('upload-1', 'deal-1', 'document-1')).toMatchObject({ failureClassification: 'UPLOAD_RESPONSE_INVALID' }); });
  it.each([
    ['size', (item: GraphDriveItem) => ({ ...item, size: 99 })],
    ['mime', (item: GraphDriveItem) => ({ ...item, file: { mimeType: 'text/plain' } })],
    ['parent', (item: GraphDriveItem) => ({ ...item, parentReference: { ...item.parentReference!, id: 'wrong' } })],
    ['name', (item: GraphDriveItem) => ({ ...item, name: 'renamed.pdf' })],
    ['facet', (item: GraphDriveItem) => ({ ...item, file: undefined })],
  ])('rejects wrong file %s readback', async (_name, mutate) => { const { h, folder } = await readyFolder(); h.graph.malformedUpload = true; const base = fileItem('file-id', 'credit-package.pdf', folder.folderItemId, `${folder.companyFolderPath}/credit-package.pdf`, 3); h.graph.uploadFile = vi.fn(async () => { const item = mutate(base); h.graph.items.set('file-id', item); return item; }); const result = await h.host.upload(upload(folder), identity); expect(!result.ok && result.fileMayExist).toBe(true); });
  it('re-authorizes verifyFolder and rejects a cross-deal request', async () => { const { h, folder } = await readyFolder(); const good = await h.host.verifyFolder({ contractVersion: CONTRACT_VERSION, dealId: 'deal-1', correlationId: 'verify-folder-1', borrowerIdentity: 'borrower-1', folder }, identity); expect(good.ok).toBe(true); const cross = await h.host.verifyFolder({ contractVersion: CONTRACT_VERSION, dealId: 'deal-2', correlationId: 'verify-folder-2', borrowerIdentity: 'borrower-1', folder }, identity); expect(cross.ok).toBe(false); });
});

describe('authenticated HTTP boundary', () => {
  it('rejects client-asserted authorization and malformed binary content', async () => { const h = harness(); await expect(handleAuthenticatedTransportRequest(h.host, { operation: 'ensureFolder', body: { ...requests().ensure, role: 'admin' }, identityContext: identity })).rejects.toThrow('UNTRUSTED_AUTHORIZATION_INPUT'); await expect(handleAuthenticatedTransportRequest(h.host, { operation: 'upload', body: { contentBase64: 'not base64' }, identityContext: identity })).rejects.toThrow('MALFORMED_BINARY_CONTENT'); });
  it('accepts strict base64 and never trusts actor identity from the body', async () => { const { h, folder } = await readyFolder(); const fields: Record<string, unknown> = { ...upload(folder) }; delete fields.content; const body = { ...fields, contentBase64: Buffer.from([1, 2, 3]).toString('base64') }; const response = await handleAuthenticatedTransportRequest(h.host, { operation: 'upload', body, identityContext: identity }); expect(response).toMatchObject({ ok: true, operation: 'upload' }); });
});
