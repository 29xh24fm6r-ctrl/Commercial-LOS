import { evaluateStageTransitionPolicy } from './stageTransitionPolicy';
import type { LoanWorkflowState, LoanWorkflowStageId } from './loanWorkflowTypes';
import { AUTO_STAGE_ADVANCE_ENABLED } from '../deals/dealOriginationFeatureFlags';

/**
 * Phase 237F — governed stage-advancement write dependency.
 *
 * The certified live-safe stage write path. It ENFORCES evaluateStageTransitionPolicy
 * (approved next stage + readiness not blocked) before any write, updates the deal
 * stage through an INJECTED transport, and emits audit + timeline evidence.
 *
 *   - DEFAULT-OFF (AUTO_STAGE_ADVANCE_ENABLED) and fail-closed.
 *   - No write happens unless the policy allows the transition; blockers fail closed.
 *   - Injected transport/audit/timeline (no SDK in the static graph) — unit-testable,
 *     no real write until an operator wires the live transport AND enables the gate.
 *   - A transport failure surfaces as update_failed (never fake success). Audit /
 *     timeline failures after a successful stage write are honest partial successes.
 *   - There is NO auto-advance: the caller (an explicit banker action) supplies the
 *     requested next stage; this adapter only writes the explicitly requested move.
 */

export type StageAdvanceOutcome =
  | { kind: 'advanced'; from: LoanWorkflowStageId; to: LoanWorkflowStageId }
  | { kind: 'disabled'; detail: string }
  | { kind: 'unauthorized'; detail: string }
  | { kind: 'blocked'; reason: string; blockers: readonly string[] }
  | { kind: 'dependency_not_ready'; detail: string }
  | { kind: 'update_failed'; detail: string }
  | { kind: 'audit_failed_partial_success'; detail: string }
  | { kind: 'timeline_failed_partial_success'; detail: string };

export interface StageAdvanceTransport {
  updateDealStage(input: {
    dealId: string;
    fromStageId: LoanWorkflowStageId;
    toStageId: LoanWorkflowStageId;
    entryDateIso: string;
  }): Promise<{ ok: boolean; error?: string }>;
}
export interface StageAdvanceAuditSink {
  write(audit: {
    correlationId: string;
    dealId: string;
    fromStageId: LoanWorkflowStageId;
    toStageId: LoanWorkflowStageId;
    outcome: StageAdvanceOutcome['kind'];
  }): Promise<{ ok: boolean; error?: string }>;
}
export interface StageAdvanceTimelineSink {
  write(event: { correlationId: string; dealId: string; toStageId: LoanWorkflowStageId }): Promise<{ ok: boolean; error?: string }>;
}

export interface StageAdvanceInput {
  /** Defaults to AUTO_STAGE_ADVANCE_ENABLED (false). */
  readonly enabled?: boolean;
  readonly authorized: boolean;
  readonly dealId: string;
  readonly correlationId: string;
  readonly entryDateIso: string;
  readonly workflow: LoanWorkflowState;
  /** The explicitly-requested next stage (from a banker action — never inferred). */
  readonly requestedNextStageId: LoanWorkflowStageId | undefined;
  readonly transport?: StageAdvanceTransport;
  readonly auditSink?: StageAdvanceAuditSink;
  readonly timelineSink?: StageAdvanceTimelineSink;
}

export async function advanceWorkflowStage(input: StageAdvanceInput): Promise<StageAdvanceOutcome> {
  const enabled = input.enabled ?? Boolean(AUTO_STAGE_ADVANCE_ENABLED);
  if (!enabled) return { kind: 'disabled', detail: 'AUTO_STAGE_ADVANCE_ENABLED is false; stage advancement stays fail-closed.' };
  if (input.authorized !== true) return { kind: 'unauthorized', detail: 'Actor is not authorized to advance the workflow stage.' };

  // HARD policy guard — no write unless the transition is approved + readiness ok.
  const policy = evaluateStageTransitionPolicy(input.workflow, input.requestedNextStageId);
  if (!policy.allowed) {
    return { kind: 'blocked', reason: policy.reason, blockers: policy.blockers };
  }

  if (!input.transport || !input.auditSink || !input.timelineSink) {
    return { kind: 'dependency_not_ready', detail: 'No live stage transport/audit/timeline sink is injected.' };
  }
  if (!input.dealId || !input.correlationId) {
    return { kind: 'update_failed', detail: 'Missing dealId or correlationId.' };
  }

  const upd = await input.transport.updateDealStage({
    dealId: input.dealId,
    fromStageId: policy.from,
    toStageId: policy.to,
    entryDateIso: input.entryDateIso,
  });
  if (!upd.ok) {
    await input.auditSink.write({ correlationId: input.correlationId, dealId: input.dealId, fromStageId: policy.from, toStageId: policy.to, outcome: 'update_failed' });
    return { kind: 'update_failed', detail: upd.error ?? 'stage_update_failed' };
  }

  const audit = await input.auditSink.write({ correlationId: input.correlationId, dealId: input.dealId, fromStageId: policy.from, toStageId: policy.to, outcome: 'advanced' });
  if (!audit.ok) {
    return { kind: 'audit_failed_partial_success', detail: 'Stage advanced but the audit write failed.' };
  }

  const timeline = await input.timelineSink.write({ correlationId: input.correlationId, dealId: input.dealId, toStageId: policy.to });
  if (!timeline.ok) {
    return { kind: 'timeline_failed_partial_success', detail: 'Stage advanced and audited but the timeline write failed.' };
  }

  return { kind: 'advanced', from: policy.from, to: policy.to };
}
