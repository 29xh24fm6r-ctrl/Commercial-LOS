/**
 * Dataverse remediation — governed write for true binary document upload,
 * closing the exact gap docs/PHASE_51_DOCUMENT_UPLOAD_SCOPE.md §7 already
 * planned: "Mark received" (Phase 51, still live and unchanged) stamps
 * cr664_receiveddate with no bytes; this action additionally uploads the
 * file itself, once the schema in
 * scripts/dataverse/create-document-checklist-file-columns.ps1 exists live.
 *
 * Same three-write coordination as every other governed write in this module
 * family (markDocumentReceived/requestDocument):
 *   1. Upload the file to cr664_documentfile (the File column), then update
 *      cr664_originalfilename / cr664_mimetype / cr664_filesizebytes /
 *      cr664_uploadedon / cr664_uploadedby / cr664_uploadstatus=true /
 *      cr664_receiveddate=now in one record update.
 *   2. Emit cr664_AuditEvent (Lifecycle / StatusChange).
 *   3. Emit cr664_DealTimelineEvent (DocumentUploaded).
 *
 * Gated on DOCUMENT_FILE_UPLOAD_ENABLED (default false — see
 * dealOriginationFeatureFlags.ts). Fails closed with `dependency_not_ready`
 * while off, matching checklistWriteDependency.ts's convention exactly.
 *
 * Pure over injected `deps` (SDK-free static graph) — the live wiring lives
 * in documentUploadLiveDeps.ts, mirroring checklistLiveWriteDeps.ts.
 */

import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import type { ActorChangedByResolution, ResolveActorChangedBy } from './newDealAuditActorResolver';
import { isDocumentFileUploadEnabled, type DealOriginationFeatureFlagConfig } from './dealOriginationFeatureFlags';

// Enum constant — locked to the verified schema. The audit event itself is built via
// dealOriginationAudit.ts's buildNewDealAuditPayload (the single canonical builder, already reused
// by checklistLiveWriteDeps.ts), which fixes cr664_eventcategory/cr664_eventtype/cr664_entitytype
// internally — only the timeline event type needs declaring here.
const TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED = 788190010;

/** A file this large is almost certainly a mistake; matches the File column's MaxSizeInKB cap (see the provisioning script). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/** Loan-document content types this action accepts. Matches cr664_documenttype's PDF/Word/Excel/Image categories. */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);

export type UploadDocumentFileOutcome =
  | { kind: 'success' }
  | { kind: 'dependency_not_ready'; detail: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'upload-failed'; error: string }
  | { kind: 'readback-mismatch'; detail: string }
  | { kind: 'governance-partial'; auditError: string | undefined; timelineError: string | undefined }
  | { kind: 'unknown'; message: string };

export interface UploadDocumentFileInput {
  readonly documentId: string;
  readonly documentName: string;
  readonly dealId: string;
  readonly actorEmail: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
  readonly config?: DealOriginationFeatureFlagConfig;
  /** Test-only gate override. Production never sets it (uses config). */
  readonly enabledOverride?: boolean;
}

export interface UploadFileResult {
  readonly ok: boolean;
  readonly error?: string;
}
export interface ReadbackResult {
  readonly ok: boolean;
  readonly originalFileName?: string;
}
export interface WriteResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface DocumentUploadDeps {
  /** Uploads the binary to cr664_documentfile. */
  uploadFile(input: { documentId: string; fileName: string; content: Uint8Array }): Promise<UploadFileResult>;
  /** Sets the metadata columns + uploadstatus + receiveddate in one update. */
  updateMetadata(input: {
    documentId: string;
    originalFileName: string;
    mimeType: string;
    fileSizeBytes: number;
    uploadedOnIso: string;
    uploadedByBind: string | undefined;
    nowIso: string;
  }): Promise<WriteResult>;
  /** Reads back cr664_originalfilename to confirm the write persisted. */
  readback(documentId: string): Promise<ReadbackResult>;
  resolveActorChangedBy: ResolveActorChangedBy;
  emitAudit(payload: {
    documentId: string;
    dealId: string;
    outcome: number;
    failureReason: string | undefined;
    correlationId: string;
    nowIso: string;
    actor: ActorChangedByResolution;
  }): Promise<{ ok: boolean; error?: string }>;
  emitTimeline(payload: {
    documentId: string;
    dealId: string;
    documentName: string;
    fileName: string;
    correlationId: string;
    nowIso: string;
    actor: ActorChangedByResolution;
  }): Promise<{ ok: boolean; error?: string }>;
}

function validateInput(input: UploadDocumentFileInput): string | undefined {
  if (!input.fileName || input.fileName.trim().length === 0) return 'A file name is required.';
  if (!input.mimeType || input.mimeType.trim().length === 0) return 'A file type could not be determined.';
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return `"${input.mimeType}" is not an accepted file type. Accepted: PDF, Word, Excel, JPEG, PNG.`;
  }
  if (input.content.byteLength === 0) return 'The file is empty.';
  if (input.content.byteLength > MAX_UPLOAD_BYTES) {
    return `The file is larger than the ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB limit.`;
  }
  return undefined;
}

export async function uploadDocumentFile(
  input: UploadDocumentFileInput,
  deps?: DocumentUploadDeps,
): Promise<UploadDocumentFileOutcome> {
  const enabled = input.enabledOverride ?? isDocumentFileUploadEnabled(input.config);
  if (!enabled) {
    // Remediation 2026-07-22 (Workstream G) — banker-safe copy; never the raw internal flag name
    // (was "DOCUMENT_FILE_UPLOAD_ENABLED is false; upload stays fail-closed.").
    return {
      kind: 'dependency_not_ready',
      detail: 'Document file upload is not yet enabled in this environment.',
    };
  }
  if (!deps) {
    return { kind: 'dependency_not_ready', detail: 'No live upload dependency injected.' };
  }
  const invalid = validateInput(input);
  if (invalid) return { kind: 'invalid-input', reason: invalid };

  const correlationId = newCorrelationId('du');
  const nowIso = new Date().toISOString();
  const actor = await deps.resolveActorChangedBy(input.actorEmail);

  // Step 1a: upload the binary.
  let uploadResult: UploadFileResult;
  try {
    uploadResult = await deps.uploadFile({ documentId: input.documentId, fileName: input.fileName, content: input.content });
  } catch (err: unknown) {
    uploadResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!uploadResult.ok) {
    void deps.emitAudit({
      documentId: input.documentId,
      dealId: input.dealId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: uploadResult.error ?? 'Unknown upload error',
      correlationId,
      nowIso,
      actor,
    });
    return { kind: 'upload-failed', error: uploadResult.error ?? 'File upload failed' };
  }

  // Step 1b: stamp metadata (only after a successful binary upload — never claim
  // uploadstatus=true for a file that didn't actually land).
  const uploadedByBind = actor.ok ? actor.changedByBind : undefined;
  let metadataResult: WriteResult;
  try {
    metadataResult = await deps.updateMetadata({
      documentId: input.documentId,
      originalFileName: input.fileName,
      mimeType: input.mimeType,
      fileSizeBytes: input.content.byteLength,
      uploadedOnIso: nowIso,
      uploadedByBind,
      nowIso,
    });
  } catch (err: unknown) {
    metadataResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!metadataResult.ok) {
    void deps.emitAudit({
      documentId: input.documentId,
      dealId: input.dealId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: metadataResult.error ?? 'Unknown metadata update error',
      correlationId,
      nowIso,
      actor,
    });
    return { kind: 'upload-failed', error: metadataResult.error ?? 'Metadata update failed after a successful file upload' };
  }

  // Step 1c: readback verification — the file genuinely landed with the
  // expected filename before this is reported as a clean success.
  const readback = await deps.readback(input.documentId);
  if (!readback.ok || readback.originalFileName !== input.fileName) {
    return {
      kind: 'readback-mismatch',
      detail: readback.ok
        ? `Readback filename "${readback.originalFileName ?? '(none)'}" did not match uploaded "${input.fileName}".`
        : 'Readback was unavailable; upload could not be confirmed.',
    };
  }

  // Step 2 + 3: audit + timeline in parallel.
  const [audit, timeline] = await Promise.all([
    deps.emitAudit({
      documentId: input.documentId,
      dealId: input.dealId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      correlationId,
      nowIso,
      actor,
    }),
    deps.emitTimeline({
      documentId: input.documentId,
      dealId: input.dealId,
      documentName: input.documentName,
      fileName: input.fileName,
      correlationId,
      nowIso,
      actor,
    }),
  ]);

  if (audit.error || timeline.error) {
    return { kind: 'governance-partial', auditError: audit.error, timelineError: timeline.error };
  }
  return { kind: 'success' };
}

/** Exported so documentUploadLiveDeps.ts can build a real emitTimeline without re-declaring these enum values. */
export const DOCUMENT_UPLOAD_ENUMS = Object.freeze({
  TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED,
  TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
});

/** Re-exported for the live deps module — see assertChangedByCoreUserBind's own guard. */
export { assertChangedByCoreUserBind };
