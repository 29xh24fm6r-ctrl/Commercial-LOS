import { evaluateStageTransitionPolicy } from './stageTransitionPolicy';
import type { LoanWorkflowState, LoanWorkflowStageId } from './loanWorkflowTypes';
import type { DealDetail } from '../deals/dealQueries';
import { AUTO_STAGE_ADVANCE_ENABLED } from '../deals/dealOriginationFeatureFlags';
import {
  deriveStageExitReadiness,
  evaluateStageExitPolicy,
  type WorkflowRequirementFacts,
} from './loanWorkflowRequirementEngine';
import {
  evaluateCreditApprovalAuthority,
  describeCreditApprovalAuthorityReason,
  type BankerCreditAuthority,
} from './creditApprovalAuthority';

/**
 * Phase 237F — governed stage-advancement write dependency.
 *
 * The certified live-safe stage write path. It ENFORCES evaluateStageTransitionPolicy
 * (approved next stage + readiness not blocked) before any write, updates the deal
 * stage through an INJECTED transport, and emits audit + timeline evidence.
 *
 *   - 2026-07-14 remediation (docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md, findings C2/C3):
 *     this seam now ALSO enforces the shared requirement engine's stricter exit readiness
 *     (evaluateStageExitPolicy/deriveStageExitReadiness — the same engine the UI displays), and,
 *     when exiting CREDIT_APPROVAL, a real credit-authority check (evaluateCreditApprovalAuthority
 *     — approval limit / credit committee membership / override authority, driven by the
 *     cr664_banker fields provisioned in scripts/dataverse/create-banker-credit-authority-fields.ps1).
 *     Both are hard, fail-closed gates: the write path can no longer allow anything the UI itself
 *     would refuse to show as ready.
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
 *
 *   ⚠ ALL of the above is CLIENT-SIDE enforcement only (docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md,
 *     finding C1). Nothing in this repository validates a stage write at the Dataverse layer —
 *     `Cr664_loandealsService.update()` (src/generated/services) accepts any field change from any
 *     caller with ordinary write access to cr664_loandeals, so these gates can be bypassed entirely
 *     by a direct API call. See docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md for the security-role
 *     configuration this write path assumes exists but cannot verify or enforce from code.
 */

export type StageAdvanceOutcome =
  | {
      kind: 'advanced';
      from: LoanWorkflowStageId;
      to: LoanWorkflowStageId;
      /**
       * Only set when `to === 'BOARDED'` and an `onDealBoarded` dependency was
       * injected — the stage advance itself always succeeds independently of
       * this; a boarding failure is reported here honestly, never silently
       * dropped, and never blocks or reverses the already-persisted stage move.
       */
      boardingOutcome?: { ok: boolean; detail: string };
    }
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
/**
 * Best-effort side effect fired only for a verified advance TO the BOARDED
 * stage. Never affects the advance's own outcome — a boarding failure is
 * reported via `StageAdvanceOutcome.advanced.boardingOutcome`, not by
 * failing the transition that already, correctly, persisted.
 */
export interface StageAdvanceOnDealBoarded {
  run(deal: DealDetail): Promise<{ ok: boolean; detail: string }>;
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
  /**
   * The same deal/task/document/credit-memo facts the UI already evaluates through the shared
   * requirement engine. REQUIRED so this seam can enforce the identical, stricter exit policy the
   * UI displays — closing the gap where the write path previously allowed transitions the UI's own
   * "governed exit criteria" list showed as unmet (e.g. a document merely received, not reviewed).
   */
  readonly facts: WorkflowRequirementFacts;
  /**
   * The advancing actor's cr664_banker credit-authority fields (approval limit / credit committee
   * membership / override authority) — see creditApprovalAuthority.ts. Undefined means no banker
   * record was found/resolved for the actor and fails closed on CREDIT_APPROVAL exit.
   */
  readonly advancingBankerAuthority?: BankerCreditAuthority;
  /**
   * PR 106 — the advancing actor's OWN cr664_banker record id (cr664_bankerid), for self-approval
   * prevention (see creditApprovalAuthority.ts). Undefined means the check has no opinion (it does
   * not deny — it does not fabricate either enforcement or a pass; see that module's doc comment).
   */
  readonly advancingActorBankerId?: string;
  /**
   * cr664_loanrequestprofile.cr664_requestedamount, when a live read path supplies it (see the
   * "known gap" note in governedRequestedAmount.ts — no live caller supplies this yet). Undefined
   * is safe: the amount-conflict cross-check simply has nothing to compare against.
   */
  readonly requestProfileAmount?: number;
  readonly transport?: StageAdvanceTransport;
  readonly auditSink?: StageAdvanceAuditSink;
  readonly timelineSink?: StageAdvanceTimelineSink;
  /** Fired only when the verified advance's target is BOARDED. Optional — absent means no auto-boarding attempt is made. */
  readonly onDealBoarded?: StageAdvanceOnDealBoarded;
}

export async function advanceWorkflowStage(input: StageAdvanceInput): Promise<StageAdvanceOutcome> {
  const enabled = input.enabled ?? Boolean(AUTO_STAGE_ADVANCE_ENABLED);
  // Remediation 2026-07-22 (Workstream G) — banker-safe copy; never the raw internal flag name.
  if (!enabled) return { kind: 'disabled', detail: 'Stage advancement is not enabled yet; no change was made to the deal.' };
  if (input.authorized !== true) return { kind: 'unauthorized', detail: 'Actor is not authorized to advance the workflow stage.' };

  // HARD policy guard — no write unless the transition is approved + readiness ok.
  const policy = evaluateStageTransitionPolicy(input.workflow, input.requestedNextStageId);
  if (!policy.allowed) {
    return { kind: 'blocked', reason: policy.reason, blockers: policy.blockers };
  }

  // HARD requirement-engine guard — the same governed exit criteria the UI displays. Closes the
  // gap where this seam previously allowed a transition the UI's own requirement list showed as
  // unmet (e.g. Underwriting documents received-but-not-reviewed).
  const enginePolicy = evaluateStageExitPolicy(deriveStageExitReadiness(policy.from, input.facts));
  if (!enginePolicy.allowed) {
    return {
      kind: 'blocked',
      reason: enginePolicy.reason,
      // The specific per-item reason (e.g. "received but not yet reviewed"), not just the generic
      // uiCopy label — this is a write-seam diagnostic, not the UI's requirements list.
      blockers: enginePolicy.blocking.map((b) => b.reason || b.uiCopy),
    };
  }

  // HARD credit-authority guard — CREDIT_APPROVAL exit only. See creditApprovalAuthority.ts.
  if (policy.from === 'CREDIT_APPROVAL') {
    const authority = evaluateCreditApprovalAuthority({
      actorResolved: input.authorized,
      banker: input.advancingBankerAuthority,
      dealAmount: input.facts.deal.amount,
      requestProfileAmount: input.requestProfileAmount,
      advancingActorBankerId: input.advancingActorBankerId,
      originatingBankerId: input.facts.deal.assignedBankerId,
    });
    if (!authority.allowed) {
      return {
        kind: 'blocked',
        reason: describeCreditApprovalAuthorityReason(authority.reasonCode),
        blockers: [describeCreditApprovalAuthorityReason(authority.reasonCode)],
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

  // Auto-board: best-effort, never reverses or blocks the already-persisted advance.
  if (policy.to === 'BOARDED' && input.onDealBoarded) {
    let boardingOutcome: { ok: boolean; detail: string };
    try {
      boardingOutcome = await input.onDealBoarded.run(input.facts.deal);
    } catch (err: unknown) {
      boardingOutcome = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
    return { kind: 'advanced', from: policy.from, to: policy.to, boardingOutcome };
  }

  return { kind: 'advanced', from: policy.from, to: policy.to };
}
