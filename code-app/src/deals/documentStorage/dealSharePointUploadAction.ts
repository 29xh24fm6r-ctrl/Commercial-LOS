import type { DealSharePointDocumentPort } from './dealSharePointDocumentPort';
import { sanitizeSharePointFileName } from './dealSharePointFolderPath';
import type { DealDocumentStorageMode, DealDocumentUploadFile, DealSharePointFolderIdentity, DealSharePointFileReference } from './dealDocumentStorageTypes';
import type { DealSharePointDryRunEvidence, DealSharePointDryRunPort } from './dealSharePointDryRunPort';

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png']);

export interface DealDocumentMetadataPort {
  persistPending(input: { dealId: string; documentId: string; requirementIds: readonly string[]; correlationId: string }): Promise<void>;
  persistStored(reference: DealSharePointFileReference, correlationId: string): Promise<void>;
  persistFailed(input: { dealId: string; documentId: string; correlationId: string; reason: string }): Promise<void>;
  emitAudit(input: { dealId: string; documentId: string; correlationId: string; event: string; detail: string }): Promise<void>;
  emitTimeline(input: { dealId: string; documentId: string; correlationId: string; detail: string }): Promise<void>;
}

export type DealSharePointUploadOutcome =
  | { readonly kind: 'stored'; readonly reference: DealSharePointFileReference }
  | { readonly kind: 'dry_run'; readonly reason: string; readonly evidence: DealSharePointDryRunEvidence }
  | { readonly kind: 'blocked'; readonly reason: string; readonly fileMayExist: boolean };

export async function uploadDealDocumentToSharePoint(input: {
  readonly mode: DealDocumentStorageMode;
  readonly authorized: boolean;
  readonly actorSystemUserId: string | undefined;
  readonly dealId: string;
  readonly documentId: string;
  readonly requirementIds: readonly string[];
  readonly folder: DealSharePointFolderIdentity;
  readonly file: DealDocumentUploadFile;
  readonly correlationId: string;
  readonly replacesDocumentId?: string;
  readonly replacedReference?: DealSharePointFileReference;
  readonly uploadKind?: 'REQUIREMENT' | 'ADDITIONAL';
}, deps: { readonly storage: DealSharePointDocumentPort; readonly metadata: DealDocumentMetadataPort; readonly dryRun?: DealSharePointDryRunPort }): Promise<DealSharePointUploadOutcome> {
  if (!input.authorized || !input.actorSystemUserId) return { kind: 'blocked', reason: 'Authenticated deal access is required.', fileMayExist: false };
  if (input.folder.dealId !== input.dealId) return { kind: 'blocked', reason: 'The SharePoint folder does not belong to this deal.', fileMayExist: false };
  if ((input.uploadKind ?? 'REQUIREMENT') === 'REQUIREMENT' && !input.requirementIds.length) return { kind: 'blocked', reason: 'At least one explicit requirement mapping is required.', fileMayExist: false };
  if (input.replacesDocumentId && (!input.replacedReference || input.replacedReference.documentId !== input.replacesDocumentId || input.replacedReference.dealId !== input.dealId || !input.replacedReference.activeVersion)) return { kind: 'blocked', reason: 'The active prior file could not be verified for this deal.', fileMayExist: false };
  if (!input.file.content.length || input.file.content.length > MAX_BYTES || !ALLOWED_MIME.has(input.file.mimeType)) {
    return { kind: 'blocked', reason: 'The selected file type or size is not permitted.', fileMayExist: false };
  }
  let storedFileName: string;
  try { storedFileName = sanitizeSharePointFileName(input.file.originalFileName); }
  catch (error) { return { kind: 'blocked', reason: error instanceof Error ? error.message : 'Invalid filename.', fileMayExist: false }; }
  if (input.mode === 'DRY_RUN') {
    if (!deps.dryRun) return { kind: 'blocked', reason: 'The governed DRY_RUN transport is not configured.', fileMayExist: false };
    const result = await deps.dryRun.validateUpload({
      folder: input.folder, dealId: input.dealId, documentId: input.documentId,
      actorSystemUserId: input.actorSystemUserId, correlationId: input.correlationId,
      file: input.file, storedFileName,
    });
    return result.ok
      ? { kind: 'dry_run', reason: 'Validation completed; no file was uploaded and no document requirement was satisfied.', evidence: result.evidence }
      : { kind: 'blocked', reason: result.reason, fileMayExist: false };
  }
  if (input.folder.status !== 'READY') return { kind: 'blocked', reason: 'The persisted SharePoint loan folder is not ready.', fileMayExist: false };

  await deps.metadata.persistPending({ dealId: input.dealId, documentId: input.documentId, requirementIds: input.requirementIds, correlationId: input.correlationId });
  const result = await deps.storage.upload({ folder: input.folder, dealId: input.dealId, documentId: input.documentId, requirementIds: input.requirementIds, actorSystemUserId: input.actorSystemUserId, correlationId: input.correlationId, file: input.file, storedFileName, replacesDocumentId: input.replacesDocumentId });
  if (!result.ok) {
    await deps.metadata.persistFailed({ dealId: input.dealId, documentId: input.documentId, correlationId: input.correlationId, reason: result.reason });
    await deps.metadata.emitAudit({ dealId: input.dealId, documentId: input.documentId, correlationId: input.correlationId, event: 'DealDocumentSharePointUploadFailed', detail: result.reason });
    return { kind: 'blocked', reason: result.reason, fileMayExist: result.fileMayExist === true };
  }
  const expectedMappings = [...input.requirementIds].sort().join('|');
  const actualMappings = [...result.reference.requirementIds].sort().join('|');
  if (result.reference.dealId !== input.dealId || result.reference.storageProvider !== 'SHAREPOINT' || result.reference.uploadStatus !== 'SHAREPOINT_STORED' || !result.reference.fileUrl || !result.reference.itemId || expectedMappings !== actualMappings) {
    await deps.metadata.persistFailed({ dealId: input.dealId, documentId: input.documentId, correlationId: input.correlationId, reason: 'SharePoint returned an invalid or cross-deal reference.' });
    return { kind: 'blocked', reason: 'SharePoint returned an invalid or cross-deal reference.', fileMayExist: true };
  }
  if (!(await deps.storage.verifyFile(result.reference))) {
    await deps.metadata.persistFailed({ dealId: input.dealId, documentId: input.documentId, correlationId: input.correlationId, reason: 'SharePoint file verification failed.' });
    return { kind: 'blocked', reason: 'SharePoint file verification failed.', fileMayExist: true };
  }
  try {
    await deps.metadata.persistStored(result.reference, input.correlationId);
  } catch {
    return { kind: 'blocked', reason: 'The file exists in SharePoint but Dataverse metadata persistence failed; the requirement remains unsatisfied.', fileMayExist: true };
  }
  await deps.metadata.emitAudit({ dealId: input.dealId, documentId: input.documentId, correlationId: input.correlationId, event: input.replacesDocumentId ? 'DealDocumentReplaced' : 'DealDocumentSharePointStored', detail: storedFileName + ' stored and verified.' });
  await deps.metadata.emitTimeline({ dealId: input.dealId, documentId: input.documentId, correlationId: input.correlationId, detail: storedFileName + ' stored in the governed SharePoint loan folder.' });
  return { kind: 'stored', reference: result.reference };
}
