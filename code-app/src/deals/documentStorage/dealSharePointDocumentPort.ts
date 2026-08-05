import type { DealDocumentUploadFile, DealSharePointFileReference, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';

export interface DealSharePointFolderRequest {
  readonly dealId: string;
  readonly borrowerIdentity: string;
  readonly siteUrl: string;
  readonly libraryName: string;
  readonly annualFolderPath: string;
  readonly companyFolderPath: string;
  readonly actorSystemUserId: string;
  readonly correlationId: string;
}

export type FolderEnsureResult =
  | { readonly ok: true; readonly folder: DealSharePointFolderIdentity; readonly created: boolean }
  | { readonly ok: false; readonly kind: 'configuration_required' | 'unauthorized' | 'collision' | 'failed'; readonly reason: string };

export type SharePointUploadResult =
  | { readonly ok: true; readonly reference: DealSharePointFileReference }
  | { readonly ok: false; readonly kind: 'configuration_required' | 'unauthorized' | 'invalid_file' | 'failed'; readonly reason: string; readonly fileMayExist?: boolean };

export interface DealSharePointDocumentPort {
  ensureFolder(request: DealSharePointFolderRequest): Promise<FolderEnsureResult>;
  upload(input: {
    readonly folder: DealSharePointFolderIdentity;
    readonly dealId: string;
    readonly documentId: string;
    readonly requirementIds: readonly string[];
    readonly actorSystemUserId: string;
    readonly correlationId: string;
    readonly file: DealDocumentUploadFile;
    readonly storedFileName: string;
    readonly replacesDocumentId?: string;
  }): Promise<SharePointUploadResult>;
  verifyFolder(folder: DealSharePointFolderIdentity): Promise<boolean>;
  verifyFile(reference: DealSharePointFileReference): Promise<boolean>;
}

export const unavailableDealSharePointDocumentPort: DealSharePointDocumentPort = {
  async ensureFolder() {
    return { ok: false, kind: 'configuration_required', reason: 'SharePoint Online generated service is not registered for this Code App.' };
  },
  async upload() {
    return { ok: false, kind: 'configuration_required', reason: 'The SharePoint list data source is registered, but a verified binary file transport is not configured.', fileMayExist: false };
  },
  async verifyFolder() { return false; },
  async verifyFile() { return false; },
};
