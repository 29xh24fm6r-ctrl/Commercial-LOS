/**
 * Phase 142E — Servicing lifecycle STAGE deriver.
 *
 * PURE, READ-ONLY. Derives the lifecycle stage from boarding / annual-review /
 * covenant / exception / maturity context by priority. It infers nothing from
 * borrower name or stale status text and mutates no deal / boarded-loan stage.
 */

import {
  SERVICING_MATURITY_WINDOW_DAYS,
  type ServicingLifecycleStage,
  type ServicingLifecycleInput,
  type ServicingLifecycleBlocker,
  type ServicingLifecycleWarning,
  type ServicingLifecycleNextAction,
} from './servicingLifecycleTypes';

function resolveNowMs(asOf?: string | Date): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string') {
    const ms = Date.parse(asOf);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

export interface ServicingLifecycleStageResult {
  lifecycleStage: ServicingLifecycleStage;
  confidence: 'high' | 'medium' | 'low';
  blockers: readonly ServicingLifecycleBlocker[];
  warnings: readonly ServicingLifecycleWarning[];
  nextBestAction: ServicingLifecycleNextAction;
}

function daysToMaturity(maturityDate: string | undefined, nowMs: number): number | undefined {
  if (!maturityDate) return undefined;
  const ms = Date.parse(maturityDate);
  if (Number.isNaN(ms)) return undefined;
  return Math.round((ms - nowMs) / (24 * 60 * 60 * 1000));
}

export function deriveServicingLifecycleStage(
  input: ServicingLifecycleInput,
): ServicingLifecycleStageResult {
  const nowMs = resolveNowMs(input.asOfDate);
  const blockers: ServicingLifecycleBlocker[] = [];
  const warnings: ServicingLifecycleWarning[] = [];
  const d = daysToMaturity(input.maturityDate, nowMs);

  let lifecycleStage: ServicingLifecycleStage;
  let confidence: 'high' | 'medium' | 'low' = 'high';
  let nextBestAction: ServicingLifecycleNextAction = { code: 'review_lifecycle', label: 'Review the servicing lifecycle (read-only).' };

  if (input.closedOrInactive === true) {
    lifecycleStage = 'closed_or_inactive';
  } else if (input.payoffContext === true) {
    lifecycleStage = 'payoff_or_exit_review';
    nextBestAction = { code: 'review_payoff', label: 'Review payoff / exit readiness (no payoff is generated).' };
  } else if (input.servicingExceptionActive === true) {
    lifecycleStage = 'servicing_exception_remediation';
    nextBestAction = { code: 'remediate_exception', label: 'Remediate the open servicing exception.' };
  } else if (input.covenantExceptionActive === true) {
    lifecycleStage = 'covenant_exception_monitoring';
    nextBestAction = { code: 'review_covenant_exception', label: 'Review the covenant exception (no waiver).' };
  } else if (d !== undefined && d <= SERVICING_MATURITY_WINDOW_DAYS) {
    lifecycleStage = 'renewal_or_maturity_review';
    nextBestAction = { code: 'review_maturity', label: 'Review renewal / maturity readiness.' };
  } else if (input.annualReviewDueStatus === 'due' || input.annualReviewDueStatus === 'past_due') {
    lifecycleStage = 'annual_review_due';
    nextBestAction = { code: 'complete_annual_review', label: 'Complete the annual review.' };
  } else if (input.boardedLoan?.verified === true) {
    lifecycleStage = 'booked_active';
  } else if (input.boardedLoan?.exists === true) {
    lifecycleStage = 'boarded_pending_verification';
    confidence = 'medium';
    nextBestAction = { code: 'verify_boarded_loan', label: 'Verify the boarded-loan SOR evidence.' };
  } else if (input.boardingReadiness === 'incomplete') {
    lifecycleStage = 'boarding_in_progress';
    confidence = 'medium';
    nextBestAction = { code: 'complete_boarding', label: 'Complete the boarding readiness.' };
  } else {
    lifecycleStage = 'unknown_review_required';
    confidence = 'low';
    warnings.push({ code: 'insufficient_context', message: 'Insufficient lifecycle context; routed to review.' });
    nextBestAction = { code: 'gather_context', label: 'Gather boarding / review / maturity context.' };
  }

  return { lifecycleStage, confidence, blockers, warnings, nextBestAction };
}
