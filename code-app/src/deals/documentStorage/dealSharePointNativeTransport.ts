import type {
  DealSharePointDocumentPort,
  DealSharePointFolderRequest,
  FolderEnsureResult,
  SharePointUploadResult,
} from './dealSharePointDocumentPort';
import type {
  DealSharePointFileReference,
  DealSharePointFolderIdentity,
} from './dealDocumentStorageTypes';

export const DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION = 'ogb-deal-sharepoint/v1';
export const DEAL_SHAREPOINT_TARGET = Object.freeze({
  siteUrl: 'https://oldglory22.sharepoint.com/sites/BusinessLending',
  libraryId: 'c1a62131-7946-44b9-bb4c-b4637a16f83c',
  rootPath: '/(a) Loans',
});

export interface DealSharePointNativeTransportConfig {
  readonly enabled: boolean;
  readonly contractVersion: typeof DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION;
  readonly siteUrl: typeof DEAL_SHAREPOINT_TARGET.siteUrl;
  readonly libraryId: typeof DEAL_SHAREPOINT_TARGET.libraryId;
  readonly rootPath: typeof DEAL_SHAREPOINT_TARGET.rootPath;
  readonly generatedServiceName: string;
  readonly configurationVersion: string;
  readonly configurationHash: string;
  readonly authenticatedActorResolutionVerified: boolean;
  readonly serverAuthorizationVerified: boolean;
  readonly graphReadbackVerified: boolean;
  readonly orphanReconciliationVerified: boolean;
}

export type DealSharePointTransportConfigurationResult =
  | { readonly ready: true; readonly config: DealSharePointNativeTransportConfig }
  | { readonly ready: false; readonly reasons: readonly string[] };

export function verifyDealSharePointNativeTransportConfig(
  config: Partial<DealSharePointNativeTransportConfig> | undefined,
): DealSharePointTransportConfigurationResult {
  const reasons: string[] = [];
  if (!config?.enabled) reasons.push('The native file transport is not enabled.');
  if (config?.contractVersion !== DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION) reasons.push('The transport contract version is not approved.');
  if (config?.siteUrl !== DEAL_SHAREPOINT_TARGET.siteUrl) reasons.push('The SharePoint site is not the approved Business Lending site.');
  if (config?.libraryId !== DEAL_SHAREPOINT_TARGET.libraryId) reasons.push('The SharePoint library ID is not approved.');
  if (config?.rootPath !== DEAL_SHAREPOINT_TARGET.rootPath) reasons.push('The governed loan-file root is not approved.');
  if (!config?.generatedServiceName?.trim()) reasons.push('The generated transport service has not been named after SDK inspection.');
  if (!config?.configurationVersion?.trim()) reasons.push('The transport configuration version is missing.');
  if (!/^[a-f0-9]{64}$/.test(config?.configurationHash ?? '')) reasons.push('The transport configuration hash is missing or malformed.');
  if (!config?.authenticatedActorResolutionVerified) reasons.push('Authenticated actor resolution has not been verified.');
  if (!config?.serverAuthorizationVerified) reasons.push('Server-side deal authorization has not been verified.');
  if (!config?.graphReadbackVerified) reasons.push('Microsoft Graph folder and file readback has not been verified.');
  if (!config?.orphanReconciliationVerified) reasons.push('Orphan-file reconciliation has not been verified.');
  return reasons.length
    ? { ready: false, reasons }
    : { ready: true, config: config as DealSharePointNativeTransportConfig };
}

interface TransportEnvelope {
  readonly contractVersion: string;
  readonly operation: 'ensureFolder' | 'upload' | 'verifyFolder' | 'verifyFile';
  readonly correlationId: string;
  readonly ok: boolean;
  readonly reason?: string;
  readonly fileMayExist?: boolean;
}

export interface EnsureFolderTransportResponse extends TransportEnvelope {
  readonly operation: 'ensureFolder';
  readonly created?: boolean;
  readonly folder?: DealSharePointFolderIdentity & { readonly libraryId: string };
}

export interface UploadTransportResponse extends TransportEnvelope {
  readonly operation: 'upload';
  readonly reference?: DealSharePointFileReference & { readonly libraryId: string };
}

export interface VerifyTransportResponse extends TransportEnvelope {
  readonly operation: 'verifyFolder' | 'verifyFile';
  readonly exists?: boolean;
  readonly dealId?: string;
  readonly borrowerIdentity?: string;
  readonly documentId?: string;
  readonly itemId?: string;
  readonly webUrl?: string;
  readonly folderPath?: string;
  readonly name?: string;
  readonly fileSizeBytes?: number;
  readonly mimeType?: string;
}

/**
 * Semantic client implemented only after an approved Power Automate/custom
 * connector or Azure Function boundary has generated exact operation
 * signatures. It deliberately does not name or call a guessed connector
 * operation.
 */
export interface DealSharePointNativeClient {
  ensureFolder(request: DealSharePointFolderRequest & { readonly libraryId: string; readonly contractVersion: string }): Promise<unknown>;
  upload(request: {
    readonly contractVersion: string;
    readonly libraryId: string;
    readonly folder: DealSharePointFolderIdentity;
    readonly dealId: string;
    readonly documentId: string;
    readonly requirementIds: readonly string[];
    readonly actorSystemUserId: string;
    readonly correlationId: string;
    readonly storedFileName: string;
    readonly mimeType: string;
    readonly content: Uint8Array;
    readonly replacesDocumentId?: string;
  }): Promise<unknown>;
  verifyFolder(request: { readonly contractVersion: string; readonly libraryId: string; readonly folder: DealSharePointFolderIdentity; readonly correlationId: string }): Promise<unknown>;
  verifyFile(request: { readonly contractVersion: string; readonly libraryId: string; readonly reference: DealSharePointFileReference; readonly correlationId: string }): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function validEnvelope(value: unknown, operation: TransportEnvelope['operation'], correlationId: string): value is TransportEnvelope {
  const row = record(value);
  return row?.contractVersion === DEAL_SHAREPOINT_TRANSPORT_CONTRACT_VERSION
    && row.operation === operation
    && row.correlationId === correlationId
    && typeof row.ok === 'boolean';
}

function exactTarget(siteUrl: string, path: string): boolean {
  if (siteUrl !== DEAL_SHAREPOINT_TARGET.siteUrl || !path.startsWith(`${DEAL_SHAREPOINT_TARGET.rootPath}/`)) return false;
  try {
    const url = new URL(siteUrl);
    return url.protocol === 'https:' && url.origin === new URL(DEAL_SHAREPOINT_TARGET.siteUrl).origin;
  } catch { return false; }
}

function verifiedWebUrl(value: string, expectedPath: string): boolean {
  try {
    const url = new URL(value);
    const site = new URL(DEAL_SHAREPOINT_TARGET.siteUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return url.protocol === 'https:'
      && url.origin === site.origin
      && decodedPath.startsWith(site.pathname)
      && decodedPath.endsWith(expectedPath);
  } catch { return false; }
}

function failureReason(value: unknown, fallback: string): string {
  const reason = record(value)?.reason;
  return typeof reason === 'string' && reason.trim() ? reason : fallback;
}

function uploadFailure(value: unknown, fallback: string, defaultFileMayExist: boolean): SharePointUploadResult {
  const row = record(value);
  return {
    ok: false,
    kind: 'failed',
    reason: failureReason(value, fallback),
    fileMayExist: typeof row?.fileMayExist === 'boolean' ? row.fileMayExist : defaultFileMayExist,
  };
}

export function createDealSharePointNativeTransport(
  configInput: Partial<DealSharePointNativeTransportConfig> | undefined,
  client: DealSharePointNativeClient,
): DealSharePointDocumentPort {
  const verifiedConfig = verifyDealSharePointNativeTransportConfig(configInput);
  if (!verifiedConfig.ready) {
    const reason = `SharePoint file transport configuration is incomplete: ${verifiedConfig.reasons.join(' ')}`;
    return {
      async ensureFolder() { return { ok: false, kind: 'configuration_required', reason }; },
      async upload() { return { ok: false, kind: 'configuration_required', reason, fileMayExist: false }; },
      async verifyFolder() { return false; },
      async verifyFile() { return false; },
    };
  }
  const config = verifiedConfig.config;

  return {
    async ensureFolder(request): Promise<FolderEnsureResult> {
      if (!exactTarget(request.siteUrl, request.companyFolderPath)
        || request.libraryName !== 'Documents'
        || !request.annualFolderPath.startsWith(`${DEAL_SHAREPOINT_TARGET.rootPath}/`)) {
        return { ok: false, kind: 'configuration_required', reason: 'The folder request is outside the approved SharePoint target.' };
      }
      let value: unknown;
      try {
        value = await client.ensureFolder({ ...request, libraryId: config.libraryId, contractVersion: config.contractVersion });
      } catch {
        return { ok: false, kind: 'failed', reason: 'The SharePoint folder transport failed without a verifiable response.' };
      }
      if (!validEnvelope(value, 'ensureFolder', request.correlationId)) return { ok: false, kind: 'failed', reason: 'The SharePoint folder transport returned a malformed response.' };
      const response = value as EnsureFolderTransportResponse;
      if (!response.ok) return { ok: false, kind: 'failed', reason: failureReason(value, 'The SharePoint folder operation was blocked.') };
      const folder = response.folder;
      if (!folder
        || folder.dealId !== request.dealId
        || folder.borrowerIdentity !== request.borrowerIdentity
        || folder.siteUrl !== config.siteUrl
        || folder.libraryId !== config.libraryId
        || folder.companyFolderPath !== request.companyFolderPath
        || folder.annualFolderPath !== request.annualFolderPath
        || folder.libraryName !== request.libraryName
        || folder.status !== 'READY'
        || !folder.folderItemId
        || !verifiedWebUrl(folder.folderUrl, request.companyFolderPath)) {
        return { ok: false, kind: 'collision', reason: 'SharePoint returned an invalid, unverified, or cross-deal folder identity.' };
      }
      return { ok: true, folder, created: response.created === true };
    },

    async upload(input): Promise<SharePointUploadResult> {
      if (input.folder.dealId !== input.dealId
        || input.folder.siteUrl !== config.siteUrl
        || !exactTarget(input.folder.siteUrl, input.folder.companyFolderPath)
        || !input.folder.folderItemId) {
        return { ok: false, kind: 'unauthorized', reason: 'The upload folder is not the verified folder for this deal.', fileMayExist: false };
      }
      let value: unknown;
      try {
        value = await client.upload({
          contractVersion: config.contractVersion,
          libraryId: config.libraryId,
          folder: input.folder,
          dealId: input.dealId,
          documentId: input.documentId,
          requirementIds: input.requirementIds,
          actorSystemUserId: input.actorSystemUserId,
          correlationId: input.correlationId,
          storedFileName: input.storedFileName,
          mimeType: input.file.mimeType,
          content: input.file.content,
          replacesDocumentId: input.replacesDocumentId,
        });
      } catch {
        return uploadFailure(undefined, 'The binary upload ended without a verifiable response.', true);
      }
      if (!validEnvelope(value, 'upload', input.correlationId)) return uploadFailure(value, 'The binary upload returned a malformed response.', true);
      const response = value as UploadTransportResponse;
      if (!response.ok) return uploadFailure(value, 'The binary upload was blocked.', false);
      const reference = response.reference;
      const expectedUrlPath = `${input.folder.companyFolderPath}/${input.storedFileName}`;
      if (!reference
        || reference.dealId !== input.dealId
        || reference.documentId !== input.documentId
        || reference.siteUrl !== config.siteUrl
        || reference.libraryId !== config.libraryId
        || reference.folderPath !== input.folder.companyFolderPath
        || reference.storedFileName !== input.storedFileName
        || reference.fileSizeBytes !== input.file.content.byteLength
        || reference.mimeType !== input.file.mimeType
        || reference.uploadStatus !== 'SHAREPOINT_STORED'
        || reference.storageProvider !== 'SHAREPOINT'
        || !reference.itemId
        || !verifiedWebUrl(reference.fileUrl, expectedUrlPath)
        || [...reference.requirementIds].sort().join('|') !== [...input.requirementIds].sort().join('|')) {
        return uploadFailure(value, 'SharePoint returned an invalid, unverified, or cross-deal file reference.', true);
      }
      return { ok: true, reference };
    },

    async verifyFolder(folder): Promise<boolean> {
      if (folder.siteUrl !== config.siteUrl || !folder.folderItemId || !exactTarget(folder.siteUrl, folder.companyFolderPath)) return false;
      try {
        const value = await client.verifyFolder({ contractVersion: config.contractVersion, libraryId: config.libraryId, folder, correlationId: `verify-folder:${folder.dealId}` });
        if (!validEnvelope(value, 'verifyFolder', `verify-folder:${folder.dealId}`)) return false;
        const response = value as VerifyTransportResponse;
        return response.ok === true && response.exists === true && response.dealId === folder.dealId
          && response.borrowerIdentity === folder.borrowerIdentity
          && response.itemId === folder.folderItemId && typeof response.webUrl === 'string'
          && verifiedWebUrl(response.webUrl, folder.companyFolderPath);
      } catch { return false; }
    },

    async verifyFile(reference): Promise<boolean> {
      if (reference.siteUrl !== config.siteUrl || !reference.itemId || !exactTarget(reference.siteUrl, reference.folderPath)) return false;
      try {
        const correlationId = `verify-file:${reference.dealId}:${reference.documentId}`;
        const value = await client.verifyFile({ contractVersion: config.contractVersion, libraryId: config.libraryId, reference, correlationId });
        if (!validEnvelope(value, 'verifyFile', correlationId)) return false;
        const response = value as VerifyTransportResponse;
        return response.ok === true && response.exists === true && response.dealId === reference.dealId
          && response.documentId === reference.documentId
          && response.itemId === reference.itemId && typeof response.webUrl === 'string'
          && response.folderPath === reference.folderPath
          && response.name === reference.storedFileName
          && response.fileSizeBytes === reference.fileSizeBytes
          && response.mimeType === reference.mimeType
          && verifiedWebUrl(response.webUrl, `${reference.folderPath}/${reference.storedFileName}`);
      } catch { return false; }
    },
  };
}

