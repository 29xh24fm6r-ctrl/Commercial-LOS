export const CONTRACT_VERSION = 'ogb-deal-sharepoint/v1' as const;
export const TARGET_SITE_URL = 'https://oldglory22.sharepoint.com/sites/BusinessLending' as const;
export const TARGET_LIBRARY_ID = 'c1a62131-7946-44b9-bb4c-b4637a16f83c' as const;
export const TARGET_ROOT_PATH = '/(a) Loans' as const;

export type SharePointTransportOperation = 'ensureFolder' | 'upload' | 'verifyFolder' | 'verifyFile';

export interface SharePointTransportConfiguration {
  readonly tenantId: string;
  readonly graphSiteId: string;
  readonly graphDriveId: string;
  readonly governedRootItemId?: string;
  readonly verifiedRootPath?: typeof TARGET_ROOT_PATH;
  readonly siteUrl: typeof TARGET_SITE_URL;
  readonly libraryId: typeof TARGET_LIBRARY_ID;
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly connectorIdentity: string;
  readonly runtimeIdentity: string;
  readonly permissionGrantEvidenceId: string;
  readonly configurationVersion: string;
  readonly configurationHash: string;
}

export interface ServerIdentityContext {
  /** Claims supplied by Easy Auth/custom-connector infrastructure, never request JSON. */
  readonly claims: Readonly<Record<string, string | readonly string[]>>;
  readonly connectorIdentity?: string;
}

export interface NormalizedActorIdentity {
  readonly tenantId: string;
  readonly objectId: string;
  readonly systemUserId: string;
  readonly upn?: string;
  readonly identityHash: string;
}

export interface DealAuthorizationBinding {
  readonly dealId: string;
  readonly borrowerIdentity: string;
  readonly borrowerLegalName: string;
  readonly permitted: true;
  readonly evidenceId: string;
}

export interface BaseTransportRequest {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly dealId: string;
  readonly correlationId: string;
}

export interface EnsureFolderRequest extends BaseTransportRequest {
  readonly borrowerIdentity: string;
  readonly borrowerLegalName: string;
  readonly loanYear: number;
  readonly annualFolderPath: string;
  readonly companyFolderPath: string;
}

export interface VerifiedFolderIdentity {
  readonly dealId: string;
  readonly borrowerIdentity: string;
  readonly siteUrl: typeof TARGET_SITE_URL;
  readonly libraryId: typeof TARGET_LIBRARY_ID;
  readonly libraryName: 'Documents';
  readonly annualFolderPath: string;
  readonly companyFolderPath: string;
  readonly folderUrl: string;
  readonly folderItemId: string;
  readonly status: 'READY';
  readonly createdOn: string;
  readonly createdBy: string;
  readonly lastVerifiedOn: string;
  readonly namingSource: 'BORROWER_LEGAL_NAME';
  readonly configurationVersion: string;
}

export interface UploadRequest extends BaseTransportRequest {
  readonly borrowerIdentity: string;
  readonly documentId: string;
  readonly requirementIds: readonly string[];
  readonly folder: VerifiedFolderIdentity;
  readonly storedFileName: string;
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  readonly replacesDocumentId?: string;
}

export interface VerifiedFileReference {
  readonly documentId: string;
  readonly dealId: string;
  readonly requirementIds: readonly string[];
  readonly storageProvider: 'SHAREPOINT';
  readonly siteUrl: typeof TARGET_SITE_URL;
  readonly libraryId: typeof TARGET_LIBRARY_ID;
  readonly libraryName: 'Documents';
  readonly folderPath: string;
  readonly fileUrl: string;
  readonly itemId: string;
  readonly originalFileName: string;
  readonly storedFileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly uploadStatus: 'SHAREPOINT_STORED';
  readonly uploadedOn: string;
  readonly uploadedBy: string;
  readonly verifiedOn: string;
  readonly activeVersion: true;
  readonly replacesDocumentId?: string;
}

export interface VerifyFolderRequest extends BaseTransportRequest {
  readonly borrowerIdentity: string;
  readonly folder: VerifiedFolderIdentity;
}

export interface VerifyFileRequest extends BaseTransportRequest {
  readonly borrowerIdentity: string;
  readonly reference: VerifiedFileReference;
}

export type TransportRequest = EnsureFolderRequest | UploadRequest | VerifyFolderRequest | VerifyFileRequest;

export interface TransportSuccess<T> {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly operation: SharePointTransportOperation;
  readonly correlationId: string;
  readonly ok: true;
  readonly result: T;
}

export interface TransportFailure {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly operation: SharePointTransportOperation;
  readonly correlationId: string;
  readonly ok: false;
  readonly code: string;
  readonly reason: string;
  readonly fileMayExist?: boolean;
}

export type TransportResponse<T> = TransportSuccess<T> | TransportFailure;


export interface EnsureFolderSuccess extends Omit<TransportSuccess<VerifiedFolderIdentity>, 'result'> {
  readonly operation: 'ensureFolder'; readonly created: boolean; readonly folder: VerifiedFolderIdentity;
}
export interface UploadSuccess extends Omit<TransportSuccess<VerifiedFileReference>, 'result'> {
  readonly operation: 'upload'; readonly reference: VerifiedFileReference;
}
export interface VerifyFolderSuccess extends Omit<TransportSuccess<VerifiedFolderIdentity>, 'result'> {
  readonly operation: 'verifyFolder'; readonly exists: true; readonly dealId: string; readonly borrowerIdentity: string; readonly itemId: string; readonly webUrl: string;
}
export interface VerifyFileSuccess extends Omit<TransportSuccess<VerifiedFileReference>, 'result'> {
  readonly operation: 'verifyFile'; readonly exists: true; readonly dealId: string; readonly documentId: string; readonly itemId: string; readonly webUrl: string; readonly folderPath: string; readonly name: string; readonly fileSizeBytes: number; readonly mimeType: string;
}
export type EnsureFolderResponse = EnsureFolderSuccess | TransportFailure;
export type UploadResponse = UploadSuccess | TransportFailure;
export type VerifyFolderResponse = VerifyFolderSuccess | TransportFailure;
export type VerifyFileResponse = VerifyFileSuccess | TransportFailure;