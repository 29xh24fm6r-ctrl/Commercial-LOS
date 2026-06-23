import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 223 — Document upload schema gate + governed upload adapter seam.
 *
 * PURE and fail-closed. Upload requires a File column on the document checklist
 * table; if the File column/upload target is missing, upload stays blocked with
 * exact diagnostics. The adapter validates type/size, requires a target item +
 * authorized actor, uploads via an injected transport, and only updates metadata
 * (marks received) AFTER the upload succeeds — a failed upload NEVER marks
 * received. No test uploads a real file.
 */

export const DOCUMENT_UPLOAD_ENABLED = false;

export interface DocumentUploadSchemaFacts {
  /** True when the document checklist table has a File column / upload target. */
  readonly fileColumnPresent: boolean;
  /** True when the SDK upload method can target the record. */
  readonly uploadMethodAvailable: boolean;
}

export function deriveDocumentUploadSchemaGate(facts: DocumentUploadSchemaFacts): { readiness: CapabilityReadiness; uploadTargetReady: boolean; remediation: string[] } {
  const readiness = evaluateLaunchGates('document-upload-schema', [
    { name: 'File column present on document checklist table', satisfied: facts.fileColumnPresent, detail: facts.fileColumnPresent ? undefined : 'add a File column and regenerate the SDK' },
    { name: 'SDK upload method available', satisfied: facts.uploadMethodAvailable, detail: facts.uploadMethodAvailable ? undefined : 'regenerate the SDK so an upload method targets the record' },
  ]);
  const remediation: string[] = [];
  if (!facts.fileColumnPresent) remediation.push('Add a File column to the document checklist table and register/update the data source.');
  if (!facts.uploadMethodAvailable) remediation.push('Regenerate the SDK so the upload method can target the document record.');
  return { readiness, uploadTargetReady: facts.fileColumnPresent && facts.uploadMethodAvailable, remediation };
}

export type DocumentUploadOutcome =
  | 'uploaded'
  | 'disabled'
  | 'unauthorized'
  | 'missing_file'
  | 'invalid_file_type'
  | 'file_too_large'
  | 'target_not_found'
  | 'upload_failed'
  | 'metadata_failed_partial_success'
  | 'audit_failed_partial_success';

export interface DocumentUploadTransport {
  upload(targetItemId: string, file: { name: string; sizeBytes: number; contentType: string }): Promise<{ ok: boolean; fileId?: string; error?: string }>;
  markReceived(targetItemId: string, fileId: string): Promise<{ ok: boolean; error?: string }>;
}
export interface DocumentUploadAuditSink {
  write(a: { correlationId: string; targetItemId: string; fileId: string | null; outcome: DocumentUploadOutcome }): Promise<{ ok: boolean; error?: string }>;
}

export interface DocumentUploadInput {
  readonly enabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly uploadTargetReady: boolean;
  readonly correlationId: string;
  readonly targetItemId: string;
  readonly targetItemExists: boolean;
  readonly file: { name: string; sizeBytes: number; contentType: string } | null;
  readonly allowedContentTypes: ReadonlyArray<string>;
  readonly maxSizeBytes: number;
  readonly transport?: DocumentUploadTransport;
  readonly auditSink?: DocumentUploadAuditSink;
}

export interface DocumentUploadResult {
  readonly outcome: DocumentUploadOutcome;
  readonly fileId: string | null;
  readonly markedReceived: boolean;
  readonly correlationId: string;
  readonly blockedReason: string | null;
}

export async function uploadDocument(input: DocumentUploadInput): Promise<DocumentUploadResult> {
  const r = (outcome: DocumentUploadOutcome, blockedReason: string | null, opts: { fileId?: string | null; markedReceived?: boolean } = {}): DocumentUploadResult => ({
    outcome, fileId: opts.fileId ?? null, markedReceived: opts.markedReceived ?? false, correlationId: input.correlationId, blockedReason,
  });

  if ((input.enabled ?? DOCUMENT_UPLOAD_ENABLED) !== true || input.uploadTargetReady !== true || !input.transport || !input.auditSink) {
    return r('disabled', 'Document upload is disabled or the upload target/transport is not ready.');
  }
  if (input.actorAuthorized !== true) return r('unauthorized', 'Actor is not authorized to upload documents.');
  if (!input.file) return r('missing_file', 'No file supplied.');
  if (!input.allowedContentTypes.includes(input.file.contentType)) return r('invalid_file_type', `File type ${input.file.contentType} is not allowed.`);
  if (input.file.sizeBytes > input.maxSizeBytes) return r('file_too_large', `File exceeds ${input.maxSizeBytes} bytes.`);
  if (input.targetItemExists !== true) return r('target_not_found', 'Target document checklist item not found.');

  const up = await input.transport.upload(input.targetItemId, input.file);
  if (!up.ok || !up.fileId) return r('upload_failed', up.error ?? 'upload failed');
  const fileId = up.fileId;

  // Metadata (mark received) only AFTER a successful upload. A metadata failure is a
  // partial success — the file is uploaded but NOT marked received.
  const meta = await input.transport.markReceived(input.targetItemId, fileId);
  if (!meta.ok) {
    await input.auditSink.write({ correlationId: input.correlationId, targetItemId: input.targetItemId, fileId, outcome: 'metadata_failed_partial_success' });
    return r('metadata_failed_partial_success', 'File uploaded but marking received failed.', { fileId, markedReceived: false });
  }

  const audit = await input.auditSink.write({ correlationId: input.correlationId, targetItemId: input.targetItemId, fileId, outcome: 'uploaded' });
  if (!audit.ok) return r('audit_failed_partial_success', 'File uploaded + marked received but audit failed.', { fileId, markedReceived: true });

  return r('uploaded', null, { fileId, markedReceived: true });
}

export function deriveDocumentUploadActivation(input: {
  schema: DocumentUploadSchemaFacts;
  enabled?: boolean;
  actorAuthorized: boolean;
  auditWired: boolean;
  evidence: SmokeEvidenceRegistryInput;
}): CapabilityReadiness {
  const gate = deriveDocumentUploadSchemaGate(input.schema);
  const smoke = deriveCapabilitySmokeReadiness(input.evidence).find((r) => r.capability === 'document-upload')!;
  return evaluateLaunchGates('document-upload', [
    { name: 'upload target ready (File column + SDK method)', satisfied: gate.uploadTargetReady, detail: gate.remediation.join('; ') || undefined },
    { name: 'DOCUMENT_UPLOAD_ENABLED', satisfied: (input.enabled ?? DOCUMENT_UPLOAD_ENABLED) === true },
    { name: 'actor authorized', satisfied: input.actorAuthorized === true },
    { name: 'audit wired', satisfied: input.auditWired === true },
    { name: 'upload smoke passed + rollback verified', satisfied: !smoke.blocksGo, detail: smoke.blockReason ?? undefined },
  ]);
}
