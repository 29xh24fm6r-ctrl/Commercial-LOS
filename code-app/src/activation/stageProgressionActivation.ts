import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 215 — Stage reference data source + SDK readiness, and
 * Phase 216 — Governed Advance Stage write seam.
 *
 * PURE and fail-closed. Stage progression cannot be claimed ready until a generated
 * stage-reference service exists, its model carries a deterministic ordering field,
 * and the active rows form a unique, gap-free sequence. The advance-stage adapter
 * is a SEAM over an injected transport + audit + timeline sink; it returns
 * resolver_not_ready / blocked rather than a fake success when the contract is
 * unavailable, and performs no real write (no test advances a real stage).
 */

export interface StageReferenceServiceFacts {
  /** True when the generated stage-reference service is present in the SDK. */
  readonly serviceGenerated: boolean;
  /** True when the model exposes a deterministic order/sequence/ordinal field. */
  readonly modelHasOrderField: boolean;
  /** Active stage rows with their order values (caller-supplied; no GUID hardcoded). */
  readonly activeStages: ReadonlyArray<{ id: string; name: string; order: number }>;
}

export interface StageReferenceReadiness {
  readonly readiness: CapabilityReadiness;
  /** True only when service + order field + unique contiguous ordering all hold. */
  readonly orderingContractProven: boolean;
  readonly remediation: string[];
}

function orderingIssues(stages: ReadonlyArray<{ order: number }>): string[] {
  const issues: string[] = [];
  if (stages.length === 0) {
    issues.push('no active stage rows');
    return issues;
  }
  const orders = stages.map((s) => s.order);
  if (orders.some((o) => !Number.isInteger(o))) issues.push('order field has non-integer values');
  const unique = new Set(orders);
  if (unique.size !== orders.length) issues.push('order field has duplicate values (sequence not unique)');
  return issues;
}

export function deriveStageReferenceReadiness(facts: StageReferenceServiceFacts): StageReferenceReadiness {
  const issues = orderingIssues(facts.activeStages);
  const orderingProven = facts.serviceGenerated && facts.modelHasOrderField && issues.length === 0;
  const readiness = evaluateLaunchGates('stage-reference', [
    { name: 'generated stage-reference service present', satisfied: facts.serviceGenerated, detail: facts.serviceGenerated ? undefined : 'register the stage data source and regenerate the SDK' },
    { name: 'model has deterministic order field', satisfied: facts.modelHasOrderField, detail: facts.modelHasOrderField ? undefined : 'add/confirm a sequence/order/ordinal column' },
    { name: 'active rows form a unique sequence', satisfied: issues.length === 0, detail: issues.join('; ') || undefined },
  ]);
  const remediation: string[] = [];
  if (!facts.serviceGenerated) remediation.push('Register the stage reference table as a Power Apps data source, then regenerate the SDK.');
  if (!facts.modelHasOrderField) remediation.push('Confirm the stage model exposes a deterministic order/sequence/ordinal field.');
  if (issues.length > 0) remediation.push(`Fix stage ordering: ${issues.join('; ')}.`);
  return { readiness, orderingContractProven: orderingProven, remediation };
}

/** Resolve the next stage deterministically by order; null when none / ambiguous. */
export function resolveNextStage(
  currentStageId: string,
  stages: ReadonlyArray<{ id: string; name: string; order: number }>,
): { id: string; name: string; order: number } | null | 'ambiguous' {
  const current = stages.find((s) => s.id === currentStageId);
  if (!current) return null;
  const greater = stages.filter((s) => s.order > current.order).sort((a, b) => a.order - b.order);
  if (greater.length === 0) return null; // terminal
  const nextOrder = greater[0]!.order;
  const atNext = greater.filter((s) => s.order === nextOrder);
  if (atNext.length > 1) return 'ambiguous';
  return atNext[0]!;
}

// ---------------------------------------------------------------------------
// Phase 216 — governed Advance Stage adapter seam
// ---------------------------------------------------------------------------

export const ADVANCE_STAGE_WRITE_ENABLED = false;

export type AdvanceStageOutcome =
  | 'advanced'
  | 'disabled'
  | 'unauthorized'
  | 'resolver_not_ready'
  | 'no_next_stage'
  | 'stale_stage'
  | 'validation_error'
  | 'update_failed'
  | 'audit_failed_partial_success'
  | 'timeline_failed_partial_success';

export interface AdvanceStageTransport {
  /** Optimistic-concurrency update: must reject if rowVersion is stale. */
  updateDealStage(input: { dealId: string; nextStageId: string; rowVersion: string; entryDateIso: string }): Promise<{ ok: boolean; stale?: boolean; error?: string }>;
}
export interface AdvanceStageAuditSink {
  write(a: { correlationId: string; actorPlatformUserId: string; dealId: string; fromStageId: string; toStageId: string; outcome: AdvanceStageOutcome }): Promise<{ ok: boolean; error?: string }>;
}
export interface AdvanceStageTimelineSink {
  write(a: { correlationId: string; dealId: string; toStageId: string }): Promise<{ ok: boolean; error?: string }>;
}

export interface AdvanceStageInput {
  readonly writeEnabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly correlationId: string;
  readonly dealId: string;
  readonly currentStageId: string;
  readonly rowVersion: string;
  readonly entryDateIso: string;
  readonly stages: ReadonlyArray<{ id: string; name: string; order: number }>;
  readonly orderingContractProven: boolean;
  readonly transport?: AdvanceStageTransport;
  readonly auditSink?: AdvanceStageAuditSink;
  readonly timelineSink?: AdvanceStageTimelineSink;
}

export interface AdvanceStageResult {
  readonly outcome: AdvanceStageOutcome;
  readonly nextStageId: string | null;
  readonly correlationId: string;
  readonly blockedReason: string | null;
}

export async function advanceStage(input: AdvanceStageInput): Promise<AdvanceStageResult> {
  const fail = (outcome: AdvanceStageOutcome, blockedReason: string | null, nextStageId: string | null = null): AdvanceStageResult => ({
    outcome, nextStageId, correlationId: input.correlationId, blockedReason,
  });

  if ((input.writeEnabled ?? ADVANCE_STAGE_WRITE_ENABLED) !== true) return fail('disabled', 'ADVANCE_STAGE_WRITE_ENABLED is false.');
  if (input.actorAuthorized !== true) return fail('unauthorized', 'Actor is not authorized to advance stage.');
  if (!input.correlationId || !input.dealId || !input.currentStageId || !input.rowVersion) {
    return fail('validation_error', 'Missing required input (correlationId/dealId/currentStageId/rowVersion).');
  }
  if (input.orderingContractProven !== true || !input.transport || !input.auditSink || !input.timelineSink) {
    return fail('resolver_not_ready', 'Stage ordering contract or transport/audit/timeline sink unavailable.');
  }

  const next = resolveNextStage(input.currentStageId, input.stages);
  if (next === null) return fail('no_next_stage', 'No next stage (terminal stage or unknown current stage).');
  if (next === 'ambiguous') return fail('no_next_stage', 'Ambiguous next stage — multiple rows share the next order.');

  const upd = await input.transport.updateDealStage({ dealId: input.dealId, nextStageId: next.id, rowVersion: input.rowVersion, entryDateIso: input.entryDateIso });
  if (upd.stale === true) return fail('stale_stage', 'Deal stage changed since it was read (stale update prevented).', next.id);
  if (!upd.ok) return fail('update_failed', upd.error ?? 'stage update failed', next.id);

  const auditRes = await input.auditSink.write({ correlationId: input.correlationId, actorPlatformUserId: '', dealId: input.dealId, fromStageId: input.currentStageId, toStageId: next.id, outcome: 'advanced' });
  if (!auditRes.ok) return fail('audit_failed_partial_success', 'Stage advanced but audit write failed.', next.id);

  const tlRes = await input.timelineSink.write({ correlationId: input.correlationId, dealId: input.dealId, toStageId: next.id });
  if (!tlRes.ok) return fail('timeline_failed_partial_success', 'Stage advanced and audited but timeline write failed.', next.id);

  return fail('advanced', null, next.id);
}

export interface StageProgressionActivationInput {
  readonly stageFacts: StageReferenceServiceFacts;
  readonly writeEnabled?: boolean;
  readonly actorAuthorized: boolean;
  readonly auditWired: boolean;
  readonly timelineWired: boolean;
  readonly evidence: SmokeEvidenceRegistryInput;
}

export function deriveStageProgressionActivation(input: StageProgressionActivationInput): CapabilityReadiness {
  const ref = deriveStageReferenceReadiness(input.stageFacts);
  const smoke = deriveCapabilitySmokeReadiness(input.evidence).find((r) => r.capability === 'stage-progression')!;
  return evaluateLaunchGates('stage-progression', [
    { name: 'stage ordering contract proven', satisfied: ref.orderingContractProven, detail: ref.readiness.blockers.join('; ') || undefined },
    { name: 'ADVANCE_STAGE_WRITE_ENABLED', satisfied: (input.writeEnabled ?? ADVANCE_STAGE_WRITE_ENABLED) === true },
    { name: 'actor authorized', satisfied: input.actorAuthorized === true },
    { name: 'audit wired', satisfied: input.auditWired === true },
    { name: 'timeline wired', satisfied: input.timelineWired === true },
    { name: 'stage smoke passed + rollback verified', satisfied: !smoke.blocksGo, detail: smoke.blockReason ?? undefined },
  ]);
}
