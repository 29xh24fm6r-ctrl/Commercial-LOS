import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 221 Ã¢â‚¬â€ Deterministic checklist generation + governed write seam.
 *
 * PURE and fail-closed. Checklist items are produced by DETERMINISTIC rules over
 * product/stage inputs Ã¢â‚¬â€ never AI-generated, never fabricated. Missing product /
 * stage / schema blocks generation. A preview is produced first and the written
 * items must equal the preview. Duplicate generation fails closed unless an
 * explicit override is supplied. Phase 228B enables the governed checklist write seam; runtime still requires authorized actor, preview confirmation, transport, audit sink, and duplicate protection.
 */

// Phase 256B: the governed checklist write seam is enabled together with
// DOCUMENT_CHECKLIST_GENERATION_ENABLED after the GO checklist smoke. Runtime still requires
// an authorized actor, preview confirmation, transport, audit sink, and duplicate protection.
export const CHECKLIST_WRITE_ENABLED = true;

export interface ChecklistRule {
  readonly key: string;
  readonly label: string;
  /** Products this rule applies to; empty = all products. */
  readonly products?: ReadonlyArray<string>;
  /** Stages this rule applies to; empty = all stages. */
  readonly stages?: ReadonlyArray<string>;
}

export interface ChecklistGenerationContext {
  readonly product: string | null;
  readonly stage: string | null;
  readonly schemaVerified: boolean;
  readonly rules: ReadonlyArray<ChecklistRule>;
}

export interface ChecklistItem {
  readonly key: string;
  readonly label: string;
}

export type ChecklistPreview =
  | { readonly status: 'ready'; readonly items: ChecklistItem[] }
  | { readonly status: 'blocked'; readonly blockers: string[]; readonly items: [] };

/** Deterministic: filter rules by product+stage, sort by key for a stable preview. */
export function generateChecklistPreview(ctx: ChecklistGenerationContext): ChecklistPreview {
  const blockers: string[] = [];
  if (!ctx.product) blockers.push('missing product');
  if (!ctx.stage) blockers.push('missing stage');
  if (!ctx.schemaVerified) blockers.push('checklist schema not verified');
  if (blockers.length > 0) return { status: 'blocked', blockers, items: [] };

  const items = ctx.rules
    .filter((r) => (r.products?.length ? r.products.includes(ctx.product!) : true))
    .filter((r) => (r.stages?.length ? r.stages.includes(ctx.stage!) : true))
    .map((r) => ({ key: r.key, label: r.label }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { status: 'ready', items };
}

export type ChecklistWriteOutcome =
  | 'written'
  | 'disabled'
  | 'unauthorized'
  | 'blocked_generation'
  | 'duplicate_blocked'
  | 'preview_mismatch'
  | 'write_failed'
  | 'audit_failed_partial_success'
  | 'timeline_failed_partial_success';

export interface ChecklistWriteTransport {
  createItems(dealId: string, items: ReadonlyArray<ChecklistItem>): Promise<{ ok: boolean; error?: string }>;
}
export interface ChecklistAuditSink {
  write(a: { correlationId: string; dealId: string; itemCount: number; outcome: ChecklistWriteOutcome }): Promise<{ ok: boolean; error?: string }>;
}
export interface ChecklistTimelineSink {
  write(a: { correlationId: string; dealId: string; itemCount: number }): Promise<{ ok: boolean; error?: string }>;
}

export interface ChecklistWriteInput {
  readonly enabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly correlationId: string;
  readonly dealId: string;
  readonly context: ChecklistGenerationContext;
  /** The exact preview the operator confirmed Ã¢â‚¬â€ written items must match it. */
  readonly confirmedPreviewKeys: ReadonlyArray<string>;
  /** True when a checklist already exists for this deal. */
  readonly existingChecklistPresent: boolean;
  /** Explicit override required to regenerate over an existing checklist. */
  readonly overrideDuplicate?: boolean;
  readonly transport?: ChecklistWriteTransport;
  readonly auditSink?: ChecklistAuditSink;
  readonly timelineSink?: ChecklistTimelineSink;
}

export interface ChecklistWriteResult {
  readonly outcome: ChecklistWriteOutcome;
  readonly itemCount: number;
  readonly correlationId: string;
  readonly blockedReason: string | null;
}

export async function generateAndWriteChecklist(input: ChecklistWriteInput): Promise<ChecklistWriteResult> {
  const r = (outcome: ChecklistWriteOutcome, blockedReason: string | null, itemCount = 0): ChecklistWriteResult => ({
    outcome, itemCount, correlationId: input.correlationId, blockedReason,
  });

  if ((input.enabled ?? CHECKLIST_WRITE_ENABLED) !== true) return r('disabled', 'CHECKLIST_WRITE_ENABLED is false.');
  if (input.actorAuthorized !== true) return r('unauthorized', 'Actor is not authorized to write checklists.');

  const preview = generateChecklistPreview(input.context);
  if (preview.status === 'blocked') return r('blocked_generation', preview.blockers.join('; '));

  if (input.existingChecklistPresent && input.overrideDuplicate !== true) {
    return r('duplicate_blocked', 'A checklist already exists; explicit override required to regenerate.');
  }

  // The written items MUST equal the confirmed preview (deterministic, no drift).
  const previewKeys = preview.items.map((i) => i.key).sort();
  const confirmed = [...input.confirmedPreviewKeys].sort();
  if (previewKeys.length !== confirmed.length || previewKeys.some((k, i) => k !== confirmed[i])) {
    return r('preview_mismatch', 'Generated items do not match the confirmed preview.');
  }

  if (!input.transport || !input.auditSink) return r('blocked_generation', 'transport/audit sink unavailable.');

  const w = await input.transport.createItems(input.dealId, preview.items);
  if (!w.ok) return r('write_failed', w.error ?? 'checklist write failed', preview.items.length);

  const a = await input.auditSink.write({ correlationId: input.correlationId, dealId: input.dealId, itemCount: preview.items.length, outcome: 'written' });
  if (!a.ok) return r('audit_failed_partial_success', 'Checklist written but audit failed.', preview.items.length);

  if (input.timelineSink) {
    const t = await input.timelineSink.write({ correlationId: input.correlationId, dealId: input.dealId, itemCount: preview.items.length });
    if (!t.ok) return r('timeline_failed_partial_success', 'Checklist written + audited but timeline failed.', preview.items.length);
  }
  return r('written', null, preview.items.length);
}

export function deriveChecklistActivation(input: {
  context: ChecklistGenerationContext;
  writeEnabled?: boolean;
  actorAuthorized: boolean;
  auditWired: boolean;
  evidence: SmokeEvidenceRegistryInput;
}): CapabilityReadiness {
  const preview = generateChecklistPreview(input.context);
  const smoke = deriveCapabilitySmokeReadiness(input.evidence).find((r) => r.capability === 'checklist-generation')!;
  return evaluateLaunchGates('checklist-generation', [
    { name: 'deterministic generation ready', satisfied: preview.status === 'ready', detail: preview.status === 'blocked' ? preview.blockers.join('; ') : undefined },
    { name: 'CHECKLIST_WRITE_ENABLED', satisfied: (input.writeEnabled ?? CHECKLIST_WRITE_ENABLED) === true },
    { name: 'actor authorized', satisfied: input.actorAuthorized === true },
    { name: 'audit wired', satisfied: input.auditWired === true },
    { name: 'checklist smoke passed + rollback verified', satisfied: !smoke.blocksGo, detail: smoke.blockReason ?? undefined },
  ]);
}
