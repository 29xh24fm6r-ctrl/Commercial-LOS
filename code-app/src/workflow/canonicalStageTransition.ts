/**
 * Stage Advancement — canonical stage transition engine (Phase 4).
 *
 * The schema-pipeline counterpart to the Phase 237F internal-readiness engine. It governs the four
 * transition kinds over the canonical stage pipeline (resolved by stageOrderingContract):
 *
 *   - ADVANCE  : current → nextStage(current). Requires a resolvable next stage AND the current
 *                stage's exit gate satisfied AND an authorized actor. No auto-advance — the caller
 *                (an explicit human action) requests it.
 *   - RETURN   : current → an earlier stage. Requires a valid prior stage + reason + authorization.
 *   - DECLINE  : terminal. Requires authorization + a structured decline reason. Sets status
 *                DECLINED and an adverse-action-PENDING marker. NEVER sends anything; never fabricates
 *                a credit decision — it records that an authorized human declined.
 *   - WITHDRAW : terminal (borrower-initiated). Requires authorization + a reason. Sets WITHDRAWN.
 *
 * FAIL-CLOSED throughout: unknown/missing data denies the transition. AUTO_STAGE_ADVANCE_ENABLED is
 * now ARMED (true, as of WF-1A) — the remaining reason RETURN/DECLINE/WITHDRAW stay preview-only is
 * that StageWorkflowControl.tsx (the UI for this engine) is not mounted in any live workspace, not
 * the flag. ADVANCE itself is live via a separate surface (DealStageProgressionCard.tsx). No write
 * happens here until an operator injects a live transport AND mounts the control. Every executed
 * transition is a governed write: policy guard → update → READBACK proof →
 * audit + timeline + correlation id → typed outcome union with honest partial states (never a fake
 * success).
 *
 * WFLOW-C/D/E: after a successful transport write the change is PROVEN by a Dataverse readback
 * (re-read the persisted stage reference and/or status reference). A readback miss/unavailability
 * surfaces as `readback_failed` — the transition is NOT reported as `transitioned` unless
 * persistence is confirmed. This mirrors the ADVANCE-path readback proof (WFLOW-B).
 */

import { AUTO_STAGE_ADVANCE_ENABLED } from '../deals/dealOriginationFeatureFlags';
import type { CanonicalStageCode, StageOrderingResult } from './stageOrderingContract';
import type { StageGateResult } from './stageGateContract';

export type StageTransitionKind = 'ADVANCE' | 'RETURN' | 'DECLINE' | 'WITHDRAW';

export type DealStatusCode = 'OPEN' | 'ON_HOLD' | 'DECLINED' | 'WITHDRAWN' | 'BOARDED';

const TERMINAL_STATUSES: ReadonlySet<DealStatusCode> = new Set(['DECLINED', 'WITHDRAWN', 'BOARDED']);

export interface StructuredDeclineReason {
  /** A structured adverse-action reason code (ratified set is operator-owned). */
  readonly code: string;
  readonly detail?: string;
}

export interface CanonicalTransitionRequest {
  readonly kind: StageTransitionKind;
  readonly currentStage: CanonicalStageCode;
  readonly currentStatus: DealStatusCode;
  /** RETURN target (must be an earlier stage). */
  readonly targetStage?: CanonicalStageCode;
  /** Free-text reason — required for RETURN and WITHDRAW. */
  readonly reason?: string;
  /** Structured reason — required for DECLINE. */
  readonly declineReason?: StructuredDeclineReason;
}

export interface EvaluateCanonicalTransitionInput {
  readonly request: CanonicalTransitionRequest;
  readonly ordering: StageOrderingResult;
  /** Required for ADVANCE: the current stage's exit gate evaluation. */
  readonly exitGate?: StageGateResult;
  readonly authorized: boolean;
}

export type CanonicalTransitionPolicy =
  | {
      readonly allowed: true;
      readonly kind: StageTransitionKind;
      readonly from: CanonicalStageCode;
      readonly to?: CanonicalStageCode;
      readonly nextStatus: DealStatusCode;
      readonly adverseActionPending: boolean;
    }
  | {
      readonly allowed: false;
      readonly code: 'unauthorized' | 'blocked';
      readonly reason: string;
      readonly blockers: readonly string[];
    };

function deny(
  code: 'unauthorized' | 'blocked',
  reason: string,
  blockers: readonly string[] = [],
): CanonicalTransitionPolicy {
  return { allowed: false, code, reason, blockers };
}

/**
 * Pure transition policy. Fail-closed; resolves the kind and enforces ordering + gate + reason +
 * authorization. Never writes.
 */
export function evaluateCanonicalStageTransition(
  input: EvaluateCanonicalTransitionInput,
): CanonicalTransitionPolicy {
  const { request, ordering, exitGate, authorized } = input;
  const { kind, currentStage, currentStatus } = request;

  if (!authorized) return deny('unauthorized', 'Actor is not authorized for this stage transition.');

  // A deal already in a terminal disposition cannot transition further.
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return deny('blocked', `Deal is in terminal status ${currentStatus}; no further transitions are allowed.`);
  }

  if (ordering.status !== 'ready') {
    return deny('blocked', 'Stage ordering is not available (stages not seeded).', ordering.reasons);
  }
  if (!ordering.stageByCode(currentStage)) {
    return deny('blocked', `Current stage ${currentStage} is not a known canonical stage.`);
  }

  switch (kind) {
    case 'ADVANCE': {
      const next = ordering.nextStage(currentStage);
      if (!next) {
        return deny('blocked', `No next stage from ${currentStage} (it is terminal).`);
      }
      if (!exitGate) {
        return deny('blocked', 'Exit-gate evaluation was not supplied; advancement stays fail-closed.');
      }
      if (exitGate.stage !== currentStage) {
        return deny('blocked', `Exit-gate evaluation is for ${exitGate.stage}, not the current stage ${currentStage}.`);
      }
      if (!exitGate.satisfied) {
        const blockers = exitGate.requirements.filter((r) => !r.met).map((r) => r.label);
        return deny('blocked', `Exit gate for ${currentStage} is not satisfied.`, blockers);
      }
      const nextStatus: DealStatusCode = next.terminal ? 'BOARDED' : 'OPEN';
      return { allowed: true, kind, from: currentStage, to: next.code, nextStatus, adverseActionPending: false };
    }
    case 'RETURN': {
      const target = request.targetStage;
      if (!target) return deny('blocked', 'Return requires a target stage.');
      const priors = ordering.priorStages(currentStage).map((s) => s.code);
      if (!priors.includes(target)) {
        return deny('blocked', `${target} is not an earlier stage than ${currentStage}.`, [`valid return targets: ${priors.join(', ') || '(none)'}`]);
      }
      if (!request.reason || request.reason.trim().length === 0) {
        return deny('blocked', 'Return requires a reason.');
      }
      return { allowed: true, kind, from: currentStage, to: target, nextStatus: 'OPEN', adverseActionPending: false };
    }
    case 'DECLINE': {
      if (ordering.isTerminal(currentStage)) {
        return deny('blocked', `Cannot decline from the terminal stage ${currentStage}.`);
      }
      if (!request.declineReason || request.declineReason.code.trim().length === 0) {
        return deny('blocked', 'Decline requires a structured reason code.');
      }
      // Terminal disposition; flags adverse-action handling. No stage change, no send.
      return { allowed: true, kind, from: currentStage, nextStatus: 'DECLINED', adverseActionPending: true };
    }
    case 'WITHDRAW': {
      if (ordering.isTerminal(currentStage)) {
        return deny('blocked', `Cannot withdraw from the terminal stage ${currentStage}.`);
      }
      if (!request.reason || request.reason.trim().length === 0) {
        return deny('blocked', 'Withdraw requires a reason.');
      }
      return { allowed: true, kind, from: currentStage, nextStatus: 'WITHDRAWN', adverseActionPending: false };
    }
    default: {
      return deny('blocked', `Unknown transition kind.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Governed write — injected transport/audit/timeline; default-off; fail-closed.
// ---------------------------------------------------------------------------

export type CanonicalTransitionOutcome =
  | {
      readonly kind: 'transitioned';
      readonly transition: StageTransitionKind;
      readonly from: CanonicalStageCode;
      readonly to?: CanonicalStageCode;
      readonly status: DealStatusCode;
      readonly adverseActionPending: boolean;
    }
  | { readonly kind: 'disabled'; readonly detail: string }
  | { readonly kind: 'unauthorized'; readonly detail: string }
  | { readonly kind: 'blocked'; readonly reason: string; readonly blockers: readonly string[] }
  | { readonly kind: 'dependency_not_ready'; readonly detail: string }
  | { readonly kind: 'update_failed'; readonly detail: string }
  | { readonly kind: 'readback_failed'; readonly detail: string }
  | { readonly kind: 'audit_failed_partial_success'; readonly detail: string }
  | { readonly kind: 'timeline_failed_partial_success'; readonly detail: string };

export interface CanonicalStageTransport {
  applyTransition(input: {
    dealId: string;
    transition: StageTransitionKind;
    fromStage: CanonicalStageCode;
    toStage?: CanonicalStageCode;
    newStatus: DealStatusCode;
    reasonCode?: string;
    reasonText?: string;
    entryDateIso: string;
  }): Promise<{ ok: boolean; error?: string }>;
  /**
   * WFLOW-C/D/E — re-read the deal AFTER the transition and prove it persisted:
   *  - stage-move transitions (a `expectedToStage` is supplied) confirm the deal's
   *    stage reference now resolves to `expectedToStage` and `cr664_stageentrydate`
   *    is present;
   *  - status-changing transitions (`expectedStatus` is not 'OPEN') confirm the
   *    deal's status reference now resolves to `expectedStatus`.
   * `ok:false` = the readback read itself was unavailable; `matched:false` = the
   * persisted value does not match. Either withholds the `transitioned` verdict.
   */
  readbackTransition(input: {
    dealId: string;
    transition: StageTransitionKind;
    expectedToStage?: CanonicalStageCode;
    expectedStatus: DealStatusCode;
    expectedEntryDateIso: string;
  }): Promise<{ ok: boolean; matched: boolean; detail?: string }>;
}

export interface CanonicalAuditSink {
  write(audit: {
    correlationId: string;
    dealId: string;
    transition: StageTransitionKind;
    fromStage: CanonicalStageCode;
    toStage?: CanonicalStageCode;
    newStatus: DealStatusCode;
    outcome: CanonicalTransitionOutcome['kind'];
    adverseActionPending: boolean;
    /** The governed reason for the transition (RETURN/WITHDRAW free-text; DECLINE code+detail). */
    reasonCode?: string;
    reasonText?: string;
  }): Promise<{ ok: boolean; error?: string }>;
}

export interface CanonicalTimelineSink {
  write(event: {
    correlationId: string;
    dealId: string;
    transition: StageTransitionKind;
    toStage?: CanonicalStageCode;
    newStatus: DealStatusCode;
  }): Promise<{ ok: boolean; error?: string }>;
}

export interface ExecuteCanonicalTransitionInput extends EvaluateCanonicalTransitionInput {
  /** Defaults to AUTO_STAGE_ADVANCE_ENABLED (false). */
  readonly enabled?: boolean;
  readonly dealId: string;
  readonly correlationId: string;
  readonly entryDateIso: string;
  readonly transport?: CanonicalStageTransport;
  readonly auditSink?: CanonicalAuditSink;
  readonly timelineSink?: CanonicalTimelineSink;
}

export async function executeCanonicalStageTransition(
  input: ExecuteCanonicalTransitionInput,
): Promise<CanonicalTransitionOutcome> {
  const enabled = input.enabled ?? Boolean(AUTO_STAGE_ADVANCE_ENABLED);
  if (!enabled) {
    return { kind: 'disabled', detail: 'AUTO_STAGE_ADVANCE_ENABLED is false; stage transitions stay fail-closed.' };
  }

  const policy = evaluateCanonicalStageTransition(input);
  if (!policy.allowed) {
    if (policy.code === 'unauthorized') return { kind: 'unauthorized', detail: policy.reason };
    return { kind: 'blocked', reason: policy.reason, blockers: policy.blockers };
  }

  if (!input.transport || !input.auditSink || !input.timelineSink) {
    return { kind: 'dependency_not_ready', detail: 'No live transport/audit/timeline sink is injected.' };
  }
  if (!input.dealId || !input.correlationId) {
    return { kind: 'update_failed', detail: 'Missing dealId or correlationId.' };
  }

  const reasonCode = input.request.declineReason?.code;
  const reasonText = input.request.declineReason?.detail ?? input.request.reason;

  const upd = await input.transport.applyTransition({
    dealId: input.dealId,
    transition: policy.kind,
    fromStage: policy.from,
    toStage: policy.to,
    newStatus: policy.nextStatus,
    reasonCode,
    reasonText,
    entryDateIso: input.entryDateIso,
  });
  if (!upd.ok) {
    await input.auditSink.write({
      correlationId: input.correlationId, dealId: input.dealId, transition: policy.kind,
      fromStage: policy.from, toStage: policy.to, newStatus: policy.nextStatus,
      outcome: 'update_failed', adverseActionPending: policy.adverseActionPending, reasonCode, reasonText,
    });
    return { kind: 'update_failed', detail: upd.error ?? 'stage_transition_update_failed' };
  }

  // WFLOW-C/D/E — PROVE the transition persisted before claiming success. A readback
  // miss or unavailability is an honest failure (a best-effort failed audit is recorded).
  const rb = await input.transport.readbackTransition({
    dealId: input.dealId,
    transition: policy.kind,
    expectedToStage: policy.to,
    expectedStatus: policy.nextStatus,
    expectedEntryDateIso: input.entryDateIso,
  });
  if (!rb.ok || !rb.matched) {
    await input.auditSink.write({
      correlationId: input.correlationId, dealId: input.dealId, transition: policy.kind,
      fromStage: policy.from, toStage: policy.to, newStatus: policy.nextStatus,
      outcome: 'readback_failed', adverseActionPending: policy.adverseActionPending, reasonCode, reasonText,
    });
    return {
      kind: 'readback_failed',
      detail: rb.detail ?? (rb.ok
        ? `Transition readback did not confirm the ${policy.kind} on deal ${input.dealId}; persistence is unverified.`
        : 'Transition readback was unavailable; persistence could not be confirmed.'),
    };
  }

  const audit = await input.auditSink.write({
    correlationId: input.correlationId, dealId: input.dealId, transition: policy.kind,
    fromStage: policy.from, toStage: policy.to, newStatus: policy.nextStatus,
    outcome: 'transitioned', adverseActionPending: policy.adverseActionPending, reasonCode, reasonText,
  });
  if (!audit.ok) {
    return { kind: 'audit_failed_partial_success', detail: 'Transition applied but the audit write failed.' };
  }

  const timeline = await input.timelineSink.write({
    correlationId: input.correlationId, dealId: input.dealId, transition: policy.kind,
    toStage: policy.to, newStatus: policy.nextStatus,
  });
  if (!timeline.ok) {
    return { kind: 'timeline_failed_partial_success', detail: 'Transition applied and audited but the timeline write failed.' };
  }

  return {
    kind: 'transitioned',
    transition: policy.kind,
    from: policy.from,
    to: policy.to,
    status: policy.nextStatus,
    adverseActionPending: policy.adverseActionPending,
  };
}
