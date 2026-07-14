import { evaluateStageTransitionPolicy } from './stageTransitionPolicy';
import type { LoanWorkflowState, LoanWorkflowStageId } from './loanWorkflowTypes';
import { AUTO_STAGE_ADVANCE_ENABLED } from '../deals/dealOriginationFeatureFlags';
import {
  deriveStageExitReadiness,
  evaluateStageExitPolicy,
  type WorkflowRequirementFacts,
} from './loanWorkflowRequirementEngine';

/**
 * Phase 237F — governed stage-advancement write dependency.
 *
 * The certified live-safe stage write path. It ENFORCES evaluateStageTransitionPolicy
 * (approved next stage + readiness not blocked) before any write, updates the deal
 * stage through an INJECTED transport, and emits audit + timeline evidence.
 *
 *   - Gated on AUTO_STAGE_ADVANCE_ENABLED, which is ARMED (true) as of the WF-1A phase — this is a
 *     LIVE write path (DealStageProgressionCard.tsx supplies the live transport). Fail-closed if the
 *     flag were ever unset.
 *   - No write happens unless the policy allows the transition; blockers fail closed.
 *   - Injected transport/audit/timeline (no SDK in the static graph) — unit-testable in isolation,
 *     and a real write once an operator wires the live transport, which is already the case in
 *     production (buildLiveStageAdvanceDeps.ts).
 *   - A transport failure surfaces as update_failed (never fake success). Audit /
 *     timeline failures after a successful stage write are honest partial successes.
 *   - WFLOW-B: after a successful update the stage write is PROVEN by a Dataverse
 *     readback (re-read cr664_StageReference + cr664_stageentrydate). A readback
 *     miss/unavailability surfaces as `readback_failed` — the move is NOT reported
 *     as advanced unless persistence is confirmed.
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
  | { kind: 'readback_failed'; detail: string }
  | { kind: 'audit_failed_partial_success'; detail: string }
  | { kind: 'timeline_failed_partial_success'; detail: string };

export interface StageAdvanceTransport {
  updateDealStage(input: {
    dealId: string;
    fromStageId: LoanWorkflowStageId;
    toStageId: LoanWorkflowStageId;
    entryDateIso: string;
  }): Promise<{ ok: boolean; error?: string }>;
  /**
   * WFLOW-B — re-read the deal AFTER the update and prove the stage reference now
   * resolves to `expectedStageId` and `cr664_stageentrydate` is present. `ok:false`
   * = the readback read itself was unavailable; `matched:false` = the persisted
   * value does not match. Either withholds the `advanced` verdict.
   */
  readbackDealStage(input: {
    dealId: string;
    expectedStageId: LoanWorkflowStageId;
    expectedEntryDateIso: string;
  }): Promise<{ ok: boolean; matched: boolean; detail?: string }>;
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
  /**
   * ARC Phase 3 — the same fact set (deal + tasks + documents + creditMemo) the requirement
   * engine's stricter exit-readiness check (evaluateStageExitPolicy/deriveStageExitReadiness)
   * consumes. OPTIONAL for backward compatibility with any caller that hasn't been updated to
   * supply it: when absent, this seam behaves exactly as before (legacy policy only). When
   * present, the write seam becomes the single source of truth for the stricter gate too,
   * instead of relying on the caller (today, only DealStageProgressionCard.tsx) to have already
   * re-checked it client-side before calling this function. Closes a defense-in-depth gap: any
   * future caller of advanceWorkflowStage that supplies facts gets the SAME fail-closed guarantee
   * the UI button already enforces, not just the shallower legacy policy.
   */
  readonly facts?: WorkflowRequirementFacts;
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

  // ARC Phase 3 — the stricter requirement-engine guard, when facts are supplied. Tracked
  // requirements the engine considers blocking must ALSO be clear, not just the legacy policy's
  // shallower checks (e.g. Underwriting's analysis documents must be REVIEWED, not merely
  // received). Untracked deep facts never block here (they surface as "future", matching the UI).
  if (input.facts) {
    const enginePolicy = evaluateStageExitPolicy(
      deriveStageExitReadiness(input.workflow.currentStage.id, input.facts),
    );
    if (!enginePolicy.allowed) {
      return {
        kind: 'blocked',
        reason: enginePolicy.reason,
        blockers: enginePolicy.blocking.map((b) => b.uiCopy),
      };
    }
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

  // WFLOW-B — PROVE the write persisted before claiming success. A readback miss
  // or unavailability is an honest failure (a best-effort failed audit is recorded).
  const rb = await input.transport.readbackDealStage({
    dealId: input.dealId,
    expectedStageId: policy.to,
    expectedEntryDateIso: input.entryDateIso,
  });
  if (!rb.ok || !rb.matched) {
    await input.auditSink.write({ correlationId: input.correlationId, dealId: input.dealId, fromStageId: policy.from, toStageId: policy.to, outcome: 'readback_failed' });
    return {
      kind: 'readback_failed',
      detail: rb.detail ?? (rb.ok
        ? `Stage readback did not confirm the move to ${policy.to}; persistence is unverified.`
        : 'Stage readback was unavailable; persistence could not be confirmed.'),
    };
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
