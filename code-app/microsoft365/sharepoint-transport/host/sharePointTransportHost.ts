import { createHash } from 'node:crypto';
import type { AuthenticatedActorResolver } from '../authorization/actorResolver.js';
import type { DealAuthorizationService } from '../authorization/dealAuthorization.js';
import { validateConfiguration } from '../contract/configuration.js';
import {
  CONTRACT_VERSION, TARGET_LIBRARY_ID, TARGET_ROOT_PATH, TARGET_SITE_URL,
  type EnsureFolderRequest, type EnsureFolderResponse, type NormalizedActorIdentity,
  type ServerIdentityContext, type SharePointTransportConfiguration, type SharePointTransportOperation,
  type TransportFailure, type UploadRequest, type UploadResponse, type VerifiedFileReference,
  type VerifiedFolderIdentity, type VerifyFileRequest, type VerifyFileResponse,
  type VerifyFolderRequest, type VerifyFolderResponse,
} from '../contract/types.js';
import { GraphCollisionError, type GraphDriveItem, type SharePointGraphClient } from '../graph/graphClient.js';
import type { IdempotencyKey, IdempotencyLedger } from '../idempotency/idempotencyLedger.js';
import type { OrphanFailureClassification, OrphanReconciliationLedger } from '../orphan-reconciliation/orphanLedger.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const INVALID_NAME = /["*:<>?\\/|]|[. ]$/;
const MIME = /^[\w.+-]+\/[\w.+-]+$/;
const MAX_BYTES = 100 * 1024 * 1024;
type Binding = { borrowerIdentity: string; borrowerLegalName: string };
type AnyResponse = EnsureFolderResponse | UploadResponse | VerifyFolderResponse | VerifyFileResponse;

export interface SharePointTransportHostDependencies {
  readonly configuration?: Partial<SharePointTransportConfiguration>;
  readonly graph: SharePointGraphClient;
  readonly actors: AuthenticatedActorResolver;
  readonly authorization: DealAuthorizationService;
  readonly idempotency: IdempotencyLedger;
  readonly orphans: OrphanReconciliationLedger;
  readonly clock?: () => Date;
}

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (value instanceof Uint8Array) return JSON.stringify({ bytes: value.byteLength, sha256: digest(value) });
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function fail(operation: SharePointTransportOperation, correlationId: string, code: string, reason: string, fileMayExist?: boolean): TransportFailure {
  return { contractVersion: CONTRACT_VERSION, operation, correlationId, ok: false, code, reason, ...(fileMayExist === undefined ? {} : { fileMayExist }) };
}
const validId = (value?: string): value is string => Boolean(value && ID.test(value));
function relativePath(webUrl: string): string | undefined {
  try {
    const actual = new URL(webUrl); const site = new URL(TARGET_SITE_URL);
    if (actual.protocol !== 'https:' || actual.origin !== site.origin) return undefined;
    const path = decodeURIComponent(actual.pathname);
    if (!path.startsWith(site.pathname)) return undefined;
    const relative = path.slice(site.pathname.length);
    return relative.startsWith('/Shared Documents') ? relative.slice('/Shared Documents'.length) || '/' : relative;
  } catch { return undefined; }
}
function exactFolder(item: GraphDriveItem | undefined, id: string | undefined, name: string, parentId: string | undefined, path: string): item is GraphDriveItem {
  return Boolean(item?.folder && item.id && (!id || item.id === id) && item.name === name && (!parentId || item.parentReference?.id === parentId) && relativePath(item.webUrl) === path);
}
function exactFile(item: GraphDriveItem | undefined, id: string | undefined, name: string, parentId: string, path: string, size: number, mimeType: string): item is GraphDriveItem {
  return Boolean(item?.file && item.id && (!id || item.id === id) && item.name === name && item.parentReference?.id === parentId && relativePath(item.webUrl) === path && item.size === size && item.file.mimeType === mimeType);
}

export class SharePointTransportHost {
  private readonly config?: SharePointTransportConfiguration;
  private readonly configurationReasons: readonly string[];
  private readonly clock: () => Date;
  constructor(private readonly dependencies: SharePointTransportHostDependencies) {
    const checked = validateConfiguration(dependencies.configuration);
    this.config = checked.valid ? checked.configuration : undefined;
    this.configurationReasons = checked.valid ? [] : checked.reasons;
    this.clock = dependencies.clock ?? (() => new Date());
  }

  ensureFolder(request: EnsureFolderRequest, identity: ServerIdentityContext): Promise<EnsureFolderResponse> {
    return this.execute('ensureFolder', request, identity, async (config, actor, binding) => {
      const annualPath = `${TARGET_ROOT_PATH}/${request.loanYear} Loans`;
      const companyPath = `${annualPath}/${request.borrowerLegalName}`;
      if (!Number.isInteger(request.loanYear) || request.loanYear < 2000 || request.loanYear > 2200 || !request.borrowerLegalName.trim() || INVALID_NAME.test(request.borrowerLegalName) || request.annualFolderPath !== annualPath || request.companyFolderPath !== companyPath || request.borrowerIdentity !== binding.borrowerIdentity || request.borrowerLegalName !== binding.borrowerLegalName) return fail('ensureFolder', request.correlationId, 'INVALID_FOLDER_BINDING', 'The requested folder identity or path is not the authorized deal binding.');
      const root = await this.verifyTarget(config);
      if (!root) return fail('ensureFolder', request.correlationId, 'TARGET_READBACK_FAILED', 'The pinned SharePoint site, drive, or root could not be verified.');
      const annualName = `${request.loanYear} Loans`;
      let annual = await this.dependencies.graph.findChildByExactName(config.graphDriveId, root.id, annualName);
      if (annual && !exactFolder(annual, undefined, annualName, root.id, annualPath)) return fail('ensureFolder', request.correlationId, 'FOLDER_COLLISION', 'The annual folder name is bound to an unexpected item.');
      if (!annual) {
        try { annual = await this.dependencies.graph.createFolder({ driveId: config.graphDriveId, parentItemId: root.id, name: annualName, conflictBehavior: 'fail' }); }
        catch (error) { return fail('ensureFolder', request.correlationId, error instanceof GraphCollisionError ? 'FOLDER_COLLISION' : 'FOLDER_CREATE_FAILED', 'The annual folder could not be created without collision.'); }
      }
      const annualReadback = await this.dependencies.graph.readItem(config.graphDriveId, annual.id);
      if (!exactFolder(annualReadback, annual.id, annualName, root.id, annualPath)) return fail('ensureFolder', request.correlationId, 'FOLDER_READBACK_FAILED', 'The annual folder failed exact readback verification.');
      let created = false;
      let company = await this.dependencies.graph.findChildByExactName(config.graphDriveId, annual.id, request.borrowerLegalName);
      if (company && !exactFolder(company, undefined, request.borrowerLegalName, annual.id, companyPath)) return fail('ensureFolder', request.correlationId, 'FOLDER_COLLISION', 'The company folder name is bound to an unexpected item.');
      if (!company) {
        try { company = await this.dependencies.graph.createFolder({ driveId: config.graphDriveId, parentItemId: annual.id, name: request.borrowerLegalName, conflictBehavior: 'fail' }); created = true; }
        catch (error) { return fail('ensureFolder', request.correlationId, error instanceof GraphCollisionError ? 'FOLDER_COLLISION' : 'FOLDER_CREATE_FAILED', 'The company folder could not be created without collision.'); }
      }
      const verified = await this.dependencies.graph.readItem(config.graphDriveId, company.id);
      if (!exactFolder(verified, company.id, request.borrowerLegalName, annual.id, companyPath)) return fail('ensureFolder', request.correlationId, 'FOLDER_READBACK_FAILED', 'The company folder failed exact readback verification.');
      const now = this.clock().toISOString();
      const folder: VerifiedFolderIdentity = { dealId: request.dealId, borrowerIdentity: request.borrowerIdentity, siteUrl: TARGET_SITE_URL, libraryId: TARGET_LIBRARY_ID, libraryName: 'Documents', annualFolderPath: annualPath, companyFolderPath: companyPath, folderUrl: verified.webUrl, folderItemId: verified.id, status: 'READY', createdOn: now, createdBy: actor.systemUserId, lastVerifiedOn: now, namingSource: 'BORROWER_LEGAL_NAME', configurationVersion: config.configurationVersion };
      return { contractVersion: CONTRACT_VERSION, operation: 'ensureFolder', correlationId: request.correlationId, ok: true, created, folder };
    });
  }

  upload(request: UploadRequest, identity: ServerIdentityContext): Promise<UploadResponse> {
    return this.execute('upload', request, identity, async (config, actor, binding) => {
      const folder = request.folder;
      if (request.borrowerIdentity !== binding.borrowerIdentity || folder.dealId !== request.dealId || folder.borrowerIdentity !== request.borrowerIdentity || folder.siteUrl !== TARGET_SITE_URL || folder.libraryId !== TARGET_LIBRARY_ID || !folder.companyFolderPath.startsWith(`${TARGET_ROOT_PATH}/`) || !validId(request.documentId) || !validId(folder.folderItemId) || !request.storedFileName.trim() || INVALID_NAME.test(request.storedFileName) || !MIME.test(request.mimeType) || !(request.content instanceof Uint8Array) || request.content.byteLength < 1 || request.content.byteLength > MAX_BYTES || new Set(request.requirementIds).size !== request.requirementIds.length || request.requirementIds.some((value) => !validId(value))) return fail('upload', request.correlationId, 'INVALID_UPLOAD_BINDING', 'The upload is malformed or is not bound to the authorized deal folder.', false);
      if (!await this.verifyTarget(config)) return fail('upload', request.correlationId, 'TARGET_READBACK_FAILED', 'The pinned SharePoint target could not be verified.', false);
      const folderItem = await this.dependencies.graph.readItem(config.graphDriveId, folder.folderItemId);
      if (!exactFolder(folderItem, folder.folderItemId, folder.companyFolderPath.split('/').at(-1) ?? '', undefined, folder.companyFolderPath)) return fail('upload', request.correlationId, 'FOLDER_READBACK_FAILED', 'The upload folder failed exact readback verification.', false);
      if (await this.dependencies.graph.findChildByExactName(config.graphDriveId, folder.folderItemId, request.storedFileName)) return fail('upload', request.correlationId, 'FILE_COLLISION', 'The exact file name already exists; automatic rename is prohibited.', false);
      let uploaded: GraphDriveItem;
      try { uploaded = await this.dependencies.graph.uploadFile({ driveId: config.graphDriveId, parentItemId: folder.folderItemId, name: request.storedFileName, mimeType: request.mimeType, content: request.content, conflictBehavior: 'fail' }); }
      catch (error) {
        if (error instanceof GraphCollisionError) return fail('upload', request.correlationId, 'FILE_COLLISION', 'The exact file name already exists; automatic rename is prohibited.', false);
        await this.recordOrphan('UPLOAD_RESPONSE_LOST', request, actor);
        return fail('upload', request.correlationId, 'UPLOAD_RESPONSE_LOST', 'The binary upload ended without a verifiable response.', true);
      }
      const verified = uploaded.id ? await this.dependencies.graph.readItem(config.graphDriveId, uploaded.id) : undefined;
      const filePath = `${folder.companyFolderPath}/${request.storedFileName}`;
      if (!verified) { await this.recordOrphan('UPLOAD_READBACK_FAILED', request, actor, uploaded.id); return fail('upload', request.correlationId, 'UPLOAD_READBACK_FAILED', 'The uploaded file could not be read back.', true); }
      if (!exactFile(verified, uploaded.id, request.storedFileName, folder.folderItemId, filePath, request.content.byteLength, request.mimeType)) { await this.recordOrphan('UPLOAD_RESPONSE_INVALID', request, actor, uploaded.id); return fail('upload', request.correlationId, 'UPLOAD_RESPONSE_INVALID', 'The uploaded file failed exact readback verification.', true); }
      const now = this.clock().toISOString();
      const reference: VerifiedFileReference = { documentId: request.documentId, dealId: request.dealId, requirementIds: [...request.requirementIds], storageProvider: 'SHAREPOINT', siteUrl: TARGET_SITE_URL, libraryId: TARGET_LIBRARY_ID, libraryName: 'Documents', folderPath: folder.companyFolderPath, fileUrl: verified.webUrl, itemId: verified.id, originalFileName: request.originalFileName, storedFileName: request.storedFileName, mimeType: request.mimeType, fileSizeBytes: request.content.byteLength, uploadStatus: 'SHAREPOINT_STORED', uploadedOn: now, uploadedBy: actor.systemUserId, verifiedOn: now, activeVersion: true, ...(request.replacesDocumentId ? { replacesDocumentId: request.replacesDocumentId } : {}) };
      return { contractVersion: CONTRACT_VERSION, operation: 'upload', correlationId: request.correlationId, ok: true, reference };
    });
  }

  verifyFolder(request: VerifyFolderRequest, identity: ServerIdentityContext): Promise<VerifyFolderResponse> {
    return this.execute('verifyFolder', request, identity, async (config, _actor, binding) => {
      if (request.borrowerIdentity !== binding.borrowerIdentity || request.folder.dealId !== request.dealId || request.folder.borrowerIdentity !== binding.borrowerIdentity || !await this.verifyTarget(config)) return fail('verifyFolder', request.correlationId, 'FOLDER_BINDING_INVALID', 'The folder is not bound to the authorized deal.');
      const item = await this.dependencies.graph.readItem(config.graphDriveId, request.folder.folderItemId);
      if (!exactFolder(item, request.folder.folderItemId, request.folder.companyFolderPath.split('/').at(-1) ?? '', undefined, request.folder.companyFolderPath)) return fail('verifyFolder', request.correlationId, 'FOLDER_NOT_VERIFIED', 'The folder does not exist at its exact governed identity.');
      return { contractVersion: CONTRACT_VERSION, operation: 'verifyFolder', correlationId: request.correlationId, ok: true, exists: true, dealId: request.dealId, borrowerIdentity: request.borrowerIdentity, itemId: item.id, webUrl: item.webUrl };
    });
  }

  verifyFile(request: VerifyFileRequest, identity: ServerIdentityContext): Promise<VerifyFileResponse> {
    return this.execute('verifyFile', request, identity, async (config, _actor, binding) => {
      const reference = request.reference;
      if (request.borrowerIdentity !== binding.borrowerIdentity || reference.dealId !== request.dealId || !await this.verifyTarget(config)) return fail('verifyFile', request.correlationId, 'FILE_BINDING_INVALID', 'The file is not bound to the authorized deal.');
      const item = await this.dependencies.graph.readItem(config.graphDriveId, reference.itemId);
      const parent = item?.parentReference?.id;
      if (!parent || !exactFile(item, reference.itemId, reference.storedFileName, parent, `${reference.folderPath}/${reference.storedFileName}`, reference.fileSizeBytes, reference.mimeType)) return fail('verifyFile', request.correlationId, 'FILE_NOT_VERIFIED', 'The file does not exist at its exact governed identity.');
      return { contractVersion: CONTRACT_VERSION, operation: 'verifyFile', correlationId: request.correlationId, ok: true, exists: true, dealId: request.dealId, documentId: reference.documentId, itemId: item.id, webUrl: item.webUrl, folderPath: reference.folderPath, name: item.name, fileSizeBytes: item.size, mimeType: item.file?.mimeType ?? '' };
    });
  }

  reportDownstreamMetadataFailure(request: UploadRequest, actor: NormalizedActorIdentity, driveItemId: string): Promise<void> { return this.recordOrphan('DOWNSTREAM_METADATA_FAILED', request, actor, driveItemId); }

  private async execute<T extends AnyResponse>(operation: SharePointTransportOperation, request: { contractVersion: string; dealId: string; correlationId: string }, identity: ServerIdentityContext, action: (config: SharePointTransportConfiguration, actor: NormalizedActorIdentity, binding: Binding) => Promise<T>): Promise<T | TransportFailure> {
    if (!this.config) return fail(operation, request.correlationId ?? '', 'CONFIGURATION_REQUIRED', `SharePoint transport configuration is incomplete: ${this.configurationReasons.join(' ')}`);
    if (request.contractVersion !== CONTRACT_VERSION || !validId(request.dealId) || !validId(request.correlationId)) return fail(operation, request.correlationId ?? '', 'REQUEST_INVALID', 'The request contract, deal ID, or correlation ID is invalid.');
    if (identity.connectorIdentity !== this.config.connectorIdentity) return fail(operation, request.correlationId, 'CONNECTOR_IDENTITY_MISMATCH', 'The authenticated connector identity does not match the certified configuration.');
    let actor: NormalizedActorIdentity;
    try { actor = await this.dependencies.actors.resolve(identity); } catch { return fail(operation, request.correlationId, 'ACTOR_RESOLUTION_FAILED', 'The authenticated actor could not be resolved server-side.'); }
    let binding: Awaited<ReturnType<DealAuthorizationService['authorize']>>;
    try { binding = await this.dependencies.authorization.authorize({ actor, dealId: request.dealId, operation }); }
    catch { return fail(operation, request.correlationId, 'AUTHORIZATION_UNAVAILABLE', 'Deal authorization was unavailable and the operation was blocked.'); }
    if (!binding?.permitted || binding.dealId !== request.dealId || !binding.borrowerIdentity?.trim() || !binding.borrowerLegalName?.trim() || !binding.evidenceId?.trim()) return fail(operation, request.correlationId, 'UNAUTHORIZED', 'The authenticated actor is not authorized for this deal and operation.');
    const key: IdempotencyKey = { contractVersion: CONTRACT_VERSION, operation, dealId: request.dealId, correlationId: request.correlationId };
    const payloadHash = digest(canonical(request));
    const begun = await this.dependencies.idempotency.begin<T | TransportFailure>(key, payloadHash);
    if (begun.state === 'replay') return begun.result;
    if (begun.state === 'collision') return fail(operation, request.correlationId, 'IDEMPOTENCY_COLLISION', 'The correlation ID was already used with a different payload.');
    if (begun.state === 'in_progress') return fail(operation, request.correlationId, 'IDEMPOTENCY_IN_PROGRESS', 'The same operation is already in progress.');
    try { const response = await action(this.config, actor, binding); await this.dependencies.idempotency.complete(key, payloadHash, response); return response; }
    catch { await this.dependencies.idempotency.abandon(key, payloadHash); return fail(operation, request.correlationId, 'FAIL_CLOSED', 'The SharePoint operation failed without verified evidence.'); }
  }

  private async verifyTarget(config: SharePointTransportConfiguration): Promise<GraphDriveItem | undefined> {
    const site = await this.dependencies.graph.readSite(config.graphSiteId);
    if (!site || site.id !== config.graphSiteId || site.webUrl !== TARGET_SITE_URL) return undefined;
    const drive = await this.dependencies.graph.readDrive(config.graphDriveId);
    if (!drive || drive.id !== config.graphDriveId || drive.listId !== TARGET_LIBRARY_ID || !config.governedRootItemId) return undefined;
    const root = await this.dependencies.graph.readItem(config.graphDriveId, config.governedRootItemId);
    return exactFolder(root, config.governedRootItemId, '(a) Loans', undefined, TARGET_ROOT_PATH) ? root : undefined;
  }
  private async recordOrphan(classification: OrphanFailureClassification, request: UploadRequest, actor: NormalizedActorIdentity, driveItemId?: string): Promise<void> {
    await this.dependencies.orphans.record({ correlationId: request.correlationId, dealId: request.dealId, documentId: request.documentId, requirementIds: request.requirementIds, driveItemId, expectedFolderId: request.folder.folderItemId, expectedFolderPath: request.folder.companyFolderPath, expectedFilename: request.storedFileName, actor, failureClassification: classification });
  }
}
