import { newCorrelationId } from '../../shared/governance/correlationId';
import { mapBusinessSafeError } from '../../shared/errors/businessSafeErrorMapping';
import { createActorChangedByResolver, type ResolveActorChangedBy } from '../../deals/newDealAuditActorResolver';
import { evaluateTemplateEligibility } from './closingDocumentEligibility';
import { hashClosingDocumentContent, renderClosingDocumentContent } from './closingDocumentContentRenderer';
import { recordClosingDocumentGenerationAudit, type EmitClosingDocumentAudit } from './closingDocumentAudit';
import { recordClosingDocumentGenerationTimeline, type EmitClosingDocumentTimeline } from './closingDocumentTimeline';
import type { ClosingDocumentStorageDeps } from './closingDocumentStorage';
import type {
  ClosingDocumentFactModel,
  ClosingDocumentGenerationOutcome,
  ClosingDocumentTemplate,
  GeneratedClosingDocumentManifest,
} from './closingDocumentTypes';

/**
 * final-seven-workstreams Workstream 6 — the governed generation pipeline: preview (no
 * authorization required, no write) and final generation (authorized, writes an immutable
 * manifest + audit row). Missing facts and ineligibility ALWAYS block generation, at both steps —
 * `previewClosingDocument` re-derives eligibility itself rather than trusting a caller's earlier
 * check, so a stale eligibility snapshot can never be used to bypass the gate.
 */

export function previewClosingDocument(
  template: ClosingDocumentTemplate,
  facts: ClosingDocumentFactModel,
): ClosingDocumentGenerationOutcome {
  const eligibility = evaluateTemplateEligibility(template, facts);
  if (eligibility.kind !== 'eligible') {
    return { kind: 'blocked_not_eligible', eligibility };
  }
  return { kind: 'preview', renderedContent: renderClosingDocumentContent(template, facts), template };
}

export interface GenerateClosingDocumentInput {
  readonly template: ClosingDocumentTemplate;
  readonly facts: ClosingDocumentFactModel;
  readonly authorized: boolean;
  readonly actorEmail: string;
  /** Set when this generation supersedes a prior manifest (regeneration), never on a first run. */
  readonly supersedesManifestId?: string;
}

export interface GenerateClosingDocumentDeps {
  readonly storage: ClosingDocumentStorageDeps;
  readonly emitAudit: EmitClosingDocumentAudit;
  readonly resolveActorChangedBy?: ResolveActorChangedBy;
  /**
   * Final LOS Completion arc — Workstream K. Optional ONLY so hand-built test doubles predating
   * this workstream keep compiling without edits — an omitted dep is equivalent to "timeline
   * emission unavailable," never fabricated as succeeded. Independent of `emitAudit` above (which
   * remains a documented, deliberate no-op stub at the live call site pending separate build-out —
   * see DealClosingDocumentsPanel.tsx's header) — a timeline emission failure never blocks or
   * reflects the audit's own success/failure.
   */
  readonly emitTimeline?: EmitClosingDocumentTimeline;
}

export async function generateClosingDocument(
  input: GenerateClosingDocumentInput,
  deps: GenerateClosingDocumentDeps,
): Promise<ClosingDocumentGenerationOutcome> {
  if (!input.authorized) {
    return { kind: 'blocked_unauthorized', reason: 'Final closing-document generation requires an authorized actor.' };
  }
  const eligibility = evaluateTemplateEligibility(input.template, input.facts);
  if (eligibility.kind !== 'eligible' || !input.facts.dealId) {
    return { kind: 'blocked_not_eligible', eligibility };
  }

  const correlationId = newCorrelationId('cd');
  const renderedContent = renderClosingDocumentContent(input.template, input.facts);
  const manifest: GeneratedClosingDocumentManifest = {
    manifestId: newCorrelationId('cdm'),
    templateKey: input.template.key,
    templateVersion: input.template.version,
    dealId: input.facts.dealId,
    generatedAtIso: new Date().toISOString(),
    generatedByActorEmail: input.actorEmail,
    contentHash: hashClosingDocumentContent(renderedContent),
    correlationId,
    status: 'final',
    ...(input.supersedesManifestId ? { supersedesManifestId: input.supersedesManifestId } : {}),
  };

  let writeResult;
  try {
    writeResult = await deps.storage.createManifestRecord(manifest, renderedContent);
  } catch (err: unknown) {
    // PR A remediation — a raw transport-failure string, never rendered verbatim.
    const raw = err instanceof Error ? err.message : String(err);
    return { kind: 'write_failed', error: mapBusinessSafeError(raw, correlationId).safeMessage, correlationId };
  }
  if (!writeResult.success) {
    return {
      kind: 'write_failed',
      error: mapBusinessSafeError(writeResult.error ?? 'Manifest storage returned non-success.', correlationId).safeMessage,
      correlationId,
    };
  }

  const resolveActorChangedBy = deps.resolveActorChangedBy ?? createActorChangedByResolver();
  const audit = await recordClosingDocumentGenerationAudit(manifest, resolveActorChangedBy, deps.emitAudit);

  // Final LOS Completion arc — Workstream K. Best-effort, never blocks the outcome or reflects the
  // audit's own success/failure — the manifest write above already succeeded and is authoritative.
  if (deps.emitTimeline) {
    try {
      await recordClosingDocumentGenerationTimeline(manifest, resolveActorChangedBy, deps.emitTimeline);
    } catch {
      // Best-effort — see the comment above.
    }
  }

  return {
    kind: 'generated',
    manifest,
    renderedContent,
    auditRecorded: audit.recorded,
    ...(audit.error ? { auditError: audit.error } : {}),
  };
}

/**
 * Regenerate a document that was already generated once. This is NOT an update — it produces a
 * brand-new manifest (a new id, a new correlation id) and records `supersedesManifestId` pointing
 * at the prior one. The prior manifest itself is never mutated or deleted; callers should treat
 * the most recent non-superseded manifest per template as authoritative (see
 * closingDocumentPackage.ts's `latestManifestsByTemplate`).
 */
export function regenerateClosingDocument(
  input: Omit<GenerateClosingDocumentInput, 'supersedesManifestId'>,
  priorManifest: GeneratedClosingDocumentManifest,
  deps: GenerateClosingDocumentDeps,
): Promise<ClosingDocumentGenerationOutcome> {
  return generateClosingDocument({ ...input, supersedesManifestId: priorManifest.manifestId }, deps);
}
