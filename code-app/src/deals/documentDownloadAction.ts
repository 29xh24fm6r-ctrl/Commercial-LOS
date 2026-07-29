import {
  AUDIT_OUTCOME_FAILED,
  AUDIT_OUTCOME_SUCCEEDED,
} from '../shared/governance/auditEnums';
import type {
  ActorChangedByResolution,
  ResolveActorChangedBy,
} from './newDealAuditActorResolver';

export interface DownloadDocumentFileInput {
  readonly documentId: string;
  readonly dealId: string;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly actorEmail: string;
}

export interface DocumentDownloadDeps {
  readonly resolveActorChangedBy: ResolveActorChangedBy;
  downloadBytes(
    documentId: string,
  ): Promise<{ ok: boolean; content?: Uint8Array; error?: string }>;
  emitAudit(input: {
    documentId: string;
    dealId: string;
    fileName: string;
    byteLength: number;
    sha256: string;
    outcome: number;
    failureReason?: string;
    actor: ActorChangedByResolution;
  }): Promise<{ ok: boolean; error?: string }>;
}

export type DownloadDocumentFileOutcome =
  | {
      kind: 'success';
      fileName: string;
      mimeType: string;
      content: Uint8Array;
      sha256: string;
    }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'download-failed'; error: string }
  | { kind: 'audit-failed'; error: string }
  | { kind: 'invalid-input'; reason: string };

export async function sha256Hex(content: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this browser.');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(content).buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function downloadDocumentFile(
  input: DownloadDocumentFileInput,
  deps: DocumentDownloadDeps,
): Promise<DownloadDocumentFileOutcome> {
  if (!input.documentId.trim() || !input.dealId.trim()) {
    return {
      kind: 'invalid-input',
      reason: 'Document and deal identifiers are required.',
    };
  }
  if (!input.fileName.trim()) {
    return { kind: 'invalid-input', reason: 'A stored filename is required.' };
  }

  const actor = await deps.resolveActorChangedBy(input.actorEmail);
  if (!actor.ok || !actor.changedByBind) {
    return {
      kind: 'identity-unresolved',
      reason: actor.reason ?? 'The signed-in user could not be resolved.',
    };
  }

  const downloaded = await deps.downloadBytes(input.documentId);
  if (!downloaded.ok || !downloaded.content) {
    const error = downloaded.error ?? 'The stored file could not be read.';
    void deps.emitAudit({
      documentId: input.documentId,
      dealId: input.dealId,
      fileName: input.fileName,
      byteLength: 0,
      sha256: '',
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: error,
      actor,
    });
    return { kind: 'download-failed', error };
  }

  let sha256: string;
  try {
    sha256 = await sha256Hex(downloaded.content);
  } catch (error: unknown) {
    return {
      kind: 'download-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const audit = await deps.emitAudit({
    documentId: input.documentId,
    dealId: input.dealId,
    fileName: input.fileName,
    byteLength: downloaded.content.byteLength,
    sha256,
    outcome: AUDIT_OUTCOME_SUCCEEDED,
    actor,
  });
  if (!audit.ok) {
    return {
      kind: 'audit-failed',
      error: audit.error ?? 'The document access audit could not be recorded.',
    };
  }

  return {
    kind: 'success',
    fileName: input.fileName,
    mimeType: input.mimeType?.trim() || 'application/octet-stream',
    content: downloaded.content,
    sha256,
  };
}
