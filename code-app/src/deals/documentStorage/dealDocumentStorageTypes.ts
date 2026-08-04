export type DealDocumentStorageMode = 'DRY_RUN' | 'LIVE';

export type DealFolderStatus =
  | 'NOT_CREATED'
  | 'CREATING'
  | 'READY'
  | 'UNAVAILABLE'
  | 'CONFIGURATION_REQUIRED'
  | 'FAILED';

export type DealDocumentUploadStatus =
  | 'NOT_UPLOADED'
  | 'UPLOAD_PENDING'
  | 'SHAREPOINT_STORED'
  | 'UPLOAD_FAILED'
  | 'REPLACED'
  | 'REMOVED_BY_GOVERNED_ACTION'
  | 'STORAGE_REFERENCE_INVALID';

export type DealDocumentStorageProvider = 'SHAREPOINT' | 'DATAVERSE_FILE_LEGACY';

export interface DealSharePointFolderIdentity {
  readonly dealId: string;
  readonly borrowerIdentity: string;
  readonly siteUrl: string;
  readonly libraryName: string;
  readonly annualFolderPath: string;
  readonly companyFolderPath: string;
  readonly folderUrl: string;
  readonly folderItemId?: string;
  readonly status: DealFolderStatus;
  readonly createdOn: string;
  readonly createdBy: string;
  readonly lastVerifiedOn: string;
  readonly namingSource: 'BORROWER_LEGAL_NAME' | 'BORROWER_LEGAL_NAME_WITH_DEAL_SUFFIX';
  readonly configurationVersion: string;
}

export interface DealSharePointFileReference {
  readonly documentId: string;
  readonly dealId: string;
  readonly requirementIds: readonly string[];
  readonly storageProvider: 'SHAREPOINT';
  readonly siteUrl: string;
  readonly libraryName: string;
  readonly folderPath: string;
  readonly fileUrl: string;
  readonly itemId: string;
  readonly originalFileName: string;
  readonly storedFileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly uploadStatus: DealDocumentUploadStatus;
  readonly uploadedOn: string;
  readonly uploadedBy: string;
  readonly verifiedOn: string;
  readonly activeVersion: boolean;
  readonly replacesDocumentId?: string;
}

export interface DealDocumentUploadFile {
  readonly originalFileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}
