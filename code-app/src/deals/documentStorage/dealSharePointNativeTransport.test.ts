import { describe, expect, it, vi } from 'vitest';
import type { DealSharePointFileReference, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';
import {
  createDealSharePointNativeTransport,
  DEAL_SHAREPOINT_TARGET,
  DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION,
  type DealSharePointNativeClient,
  type DealSharePointNativeTransportConfig,
  verifyDealSharePointNativeTransportConfig,
} from './dealSharePointNativeTransport';

const config: DealSharePointNativeTransportConfig = {
  enabled: true,
  contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION,
  ...DEAL_SHAREPOINT_TARGET,
  generatedServiceName: 'GeneratedAfterOperatorRegistration',
  configurationVersion: '1',
  configurationHash: 'a'.repeat(64),
  authenticatedActorResolutionVerified: true,
  serverAuthorizationVerified: true,
  graphReadbackVerified: true,
  orphanReconciliationVerified: true,
};
const folder: DealSharePointFolderIdentity & { libraryId: string } = {
  dealId: 'deal-1', borrowerIdentity: 'borrower-1', siteUrl: DEAL_SHAREPOINT_TARGET.siteUrl,
  libraryId: DEAL_SHAREPOINT_TARGET.libraryId, libraryName: 'Documents', annualFolderPath: '/(a) Loans/2026 Loans',
  companyFolderPath: '/(a) Loans/2026 Loans/Acme LLC',
  folderUrl: 'https://oldglory22.sharepoint.com/sites/BusinessLending/Documents/(a)%20Loans/2026%20Loans/Acme%20LLC',
  folderItemId: 'folder-item-1', status: 'READY', createdOn: '2026-08-04T00:00:00.000Z', createdBy: 'actor-1',
  lastVerifiedOn: '2026-08-04T00:00:00.000Z', namingSource: 'BORROWER_LEGAL_NAME', configurationVersion: '1',
};
const reference: DealSharePointFileReference & { libraryId: string } = {
  documentId: 'document-1', dealId: 'deal-1', requirementIds: ['requirement-1'], storageProvider: 'SHAREPOINT',
  siteUrl: DEAL_SHAREPOINT_TARGET.siteUrl, libraryId: DEAL_SHAREPOINT_TARGET.libraryId, libraryName: 'Documents',
  folderPath: folder.companyFolderPath,
  fileUrl: `${folder.folderUrl}/credit.pdf`, itemId: 'file-item-1', originalFileName: 'credit.pdf', storedFileName: 'credit.pdf',
  mimeType: 'application/pdf', fileSizeBytes: 3, uploadStatus: 'SHAREPOINT_STORED', uploadedOn: '2026-08-04T00:00:00.000Z',
  uploadedBy: 'actor-1', verifiedOn: '2026-08-04T00:00:01.000Z', activeVersion: true,
};
const request = {
  dealId: 'deal-1', borrowerIdentity: 'borrower-1', siteUrl: DEAL_SHAREPOINT_TARGET.siteUrl, libraryName: 'Documents',
  annualFolderPath: folder.annualFolderPath, companyFolderPath: folder.companyFolderPath, actorSystemUserId: 'actor-1', correlationId: 'corr-1',
};
const upload = {
  folder, dealId: 'deal-1', documentId: 'document-1', requirementIds: ['requirement-1'], actorSystemUserId: 'actor-1',
  correlationId: 'corr-2', file: { originalFileName: 'credit.pdf', mimeType: 'application/pdf', content: new Uint8Array([1, 2, 3]) },
  storedFileName: 'credit.pdf',
};

function client(overrides: Partial<DealSharePointNativeClient> = {}): DealSharePointNativeClient {
  return {
    ensureFolder: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'ensureFolder', correlationId: 'corr-1', ok: true, created: true, folder })),
    upload: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'upload', correlationId: 'corr-2', ok: true, reference })),
    verifyFolder: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'verifyFolder', correlationId: 'verify-folder:deal-1', ok: true, exists: true, dealId: 'deal-1', borrowerIdentity: folder.borrowerIdentity, itemId: folder.folderItemId, webUrl: folder.folderUrl })),
    verifyFile: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'verifyFile', correlationId: 'verify-file:deal-1:document-1', ok: true, exists: true, dealId: 'deal-1', documentId: reference.documentId, itemId: reference.itemId, webUrl: reference.fileUrl, folderPath: reference.folderPath, name: reference.storedFileName, fileSizeBytes: reference.fileSizeBytes, mimeType: reference.mimeType })),
    ...overrides,
  };
}

describe('Microsoft-native deal SharePoint transport', () => {
  it('fails configuration closed until every immutable target and verification is present', async () => {
    expect(verifyDealSharePointNativeTransportConfig({ ...config, graphReadbackVerified: false }).ready).toBe(false);
    const native = createDealSharePointNativeTransport({ ...config, enabled: false }, client());
    expect((await native.ensureFolder(request)).ok).toBe(false);
    expect((await native.upload(upload)).ok).toBe(false);
  });

  it('returns only fully verified folder, upload, and readback identities', async () => {
    const native = createDealSharePointNativeTransport(config, client());
    expect(await native.ensureFolder(request)).toEqual({ ok: true, folder, created: true });
    expect(await native.upload(upload)).toEqual({ ok: true, reference });
    expect(await native.verifyFolder(folder)).toBe(true);
    expect(await native.verifyFile(reference)).toBe(true);
  });

  it('is idempotent when the server returns the same verified folder as existing', async () => {
    const transportClient = client({ ensureFolder: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'ensureFolder', correlationId: 'corr-1', ok: true, created: false, folder })) });
    const native = createDealSharePointNativeTransport(config, transportClient);
    expect(await native.ensureFolder(request)).toEqual({ ok: true, folder, created: false });
    expect(await native.ensureFolder(request)).toEqual({ ok: true, folder, created: false });
  });

  it('blocks cross-deal folder and file responses', async () => {
    const native = createDealSharePointNativeTransport(config, client({
      ensureFolder: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'ensureFolder', correlationId: 'corr-1', ok: true, folder: { ...folder, dealId: 'deal-2' } })),
      upload: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'upload', correlationId: 'corr-2', ok: true, reference: { ...reference, dealId: 'deal-2' } })),
    }));
    expect(await native.ensureFolder(request)).toMatchObject({ ok: false, kind: 'collision' });
    expect(await native.upload(upload)).toMatchObject({ ok: false, fileMayExist: true });
  });

  it('rejects malformed responses and never fabricates success', async () => {
    const native = createDealSharePointNativeTransport(config, client({ ensureFolder: vi.fn(async () => ({})), verifyFile: vi.fn(async () => ({ ok: true })) }));
    expect(await native.ensureFolder(request)).toMatchObject({ ok: false, kind: 'failed' });
    expect(await native.verifyFile(reference)).toBe(false);
  });

  it('marks thrown or partial upload failures for orphan reconciliation', async () => {
    const thrown = createDealSharePointNativeTransport(config, client({ upload: vi.fn(async () => { throw new Error('connection ended'); }) }));
    expect(await thrown.upload(upload)).toMatchObject({ ok: false, fileMayExist: true });
    const partial = createDealSharePointNativeTransport(config, client({ upload: vi.fn(async () => ({ contractVersion: DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION, operation: 'upload', correlationId: 'corr-2', ok: false, reason: 'Dataverse readback failed.', fileMayExist: true })) }));
    expect(await partial.upload(upload)).toMatchObject({ ok: false, reason: 'Dataverse readback failed.', fileMayExist: true });
  });
});

