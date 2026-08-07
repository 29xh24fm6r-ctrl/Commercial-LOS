import type { DealSharePointFolderRequest } from './dealSharePointDocumentPort';
import type { DealDocumentUploadFile, DealSharePointFolderIdentity } from './dealDocumentStorageTypes';

export interface DealSharePointDryRunEvidence {
  readonly validationOnly: true;
  readonly operation: 'ensureFolder' | 'upload';
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly contentSha256: string;
  readonly targetPath: string;
  readonly completedOn: string;
}
export type DealSharePointDryRunResult =
  | { readonly ok: true; readonly evidence: DealSharePointDryRunEvidence }
  | { readonly ok: false; readonly reason: string; readonly code: string };

export interface DealSharePointDryRunPort {
  validateFolder(request: DealSharePointFolderRequest): Promise<DealSharePointDryRunResult>;
  validateUpload(input: {
    readonly folder: DealSharePointFolderIdentity;
    readonly dealId: string;
    readonly documentId: string;
    readonly actorSystemUserId: string;
    readonly correlationId: string;
    readonly file: DealDocumentUploadFile;
    readonly storedFileName: string;
  }): Promise<DealSharePointDryRunResult>;
}

export const unavailableDealSharePointDryRunPort: DealSharePointDryRunPort = {
  async validateFolder() {
    return { ok: false, code: 'CONFIGURATION_REQUIRED', reason: 'The generated governed DRY_RUN transport is not configured.' };
  },
  async validateUpload() {
    return { ok: false, code: 'CONFIGURATION_REQUIRED', reason: 'The generated governed DRY_RUN transport is not configured.' };
  },
};
