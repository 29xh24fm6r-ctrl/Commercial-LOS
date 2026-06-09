/**
 * Phase 142E — Servicing MATURITY / RENEWAL / PAYOFF status deriver.
 *
 * PURE, READ-ONLY. Maturity within the policy window routes to review; past
 * maturity (not closed) is attention_required; payoff/exit context routes to
 * payoff review. It generates no payoff statements and modifies no loan status.
 */

import {
  SERVICING_MATURITY_WINDOW_DAYS,
  type ServicingMaturityRenewalStatus,
  type ServicingMaturityRenewalStatusValue,
  type ServicingLifecycleWarning,
} from './servicingLifecycleTypes';

function nowMs(asOf?: string | Date): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string') { const ms = Date.parse(asOf); if (!Number.isNaN(ms)) return ms; }
  return Date.now();
}

export interface DeriveServicingMaturityRenewalInput {
  maturityDate?: string;
  payoffContext?: boolean;
  closedOrInactive?: boolean;
  asOfDate?: string | Date;
}

export function deriveServicingMaturityRenewalStatus(
  input: DeriveServicingMaturityRenewalInput,
): ServicingMaturityRenewalStatus {
  const warnings: ServicingLifecycleWarning[] = [];
  const now = nowMs(input.asOfDate);

  if (input.payoffContext === true) {
    return { status: 'payoff_or_exit_review', maturityDate: input.maturityDate, blockers: [], warnings, nextBestAction: { code: 'review_payoff', label: 'Review payoff / exit readiness (no payoff is generated).' } };
  }
  if (input.closedOrInactive === true) {
    return { status: 'not_applicable', maturityDate: input.maturityDate, blockers: [], warnings, nextBestAction: { code: 'none', label: 'Loan is closed / inactive.' } };
  }
  if (!input.maturityDate || Number.isNaN(Date.parse(input.maturityDate))) {
    return { status: 'unknown_missing_data', blockers: [], warnings, nextBestAction: { code: 'verify_maturity', label: 'Verify the loan maturity date.' } };
  }

  const days = Math.round((Date.parse(input.maturityDate) - now) / (24 * 60 * 60 * 1000));
  let status: ServicingMaturityRenewalStatusValue;
  if (days < 0) {
    status = 'attention_required';
    warnings.push({ code: 'past_maturity', message: 'Loan is past maturity without a closed/inactive status.' });
  } else if (days <= SERVICING_MATURITY_WINDOW_DAYS) {
    status = 'renewal_or_maturity_review';
  } else {
    status = 'active';
  }

  return {
    status, maturityDate: input.maturityDate, daysToMaturity: days, blockers: [], warnings,
    nextBestAction: status === 'active'
      ? { code: 'monitor_maturity', label: 'Continue maturity monitoring (read-only).' }
      : { code: 'review_renewal', label: 'Review renewal / maturity readiness.' },
  };
}
