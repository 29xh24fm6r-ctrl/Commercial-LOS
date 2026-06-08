/**
 * Phase 141A — Borrower soundness assessment.
 *
 * PURE. Concludes a borrower's financial soundness ONLY from evidence. With no
 * financial inputs the status is `insufficient_information` — the engine never
 * infers a borrower is sound without financials.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No fake conclusion. Absent financial inputs → insufficient_information.
 *   - Covenant breach / past-due payment / insurance lapse / risk
 *     deterioration each drive escalation and a risk driver.
 */

import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewSoundnessAssessment,
  AnnualReviewTrend,
} from './annualReviewTypes';

export interface SoundnessInput {
  loan: AnnualReviewLoanSnapshot;
  reviewer?: string;
  reviewedAt?: string;
}

function declining(t: AnnualReviewTrend | undefined): boolean {
  return t === 'declining';
}
function improvingOrStable(t: AnnualReviewTrend | undefined): boolean {
  return t === 'improving' || t === 'stable';
}

export function deriveBorrowerSoundnessAssessment(
  input: SoundnessInput,
): AnnualReviewSoundnessAssessment {
  const { loan } = input;
  const fin = loan.financialInputs;

  const supportingFactors: string[] = [];
  const riskDrivers: string[] = [];
  const missingInputs: string[] = [];
  const recommendedActions: string[] = [];

  // Operational risk drivers (independent of financial trends).
  if (loan.covenantStatus === 'breach') {
    riskDrivers.push('Covenant breach.');
    recommendedActions.push('Escalate covenant breach and obtain waiver or cure plan.');
  }
  if ((loan.pastDueDays ?? 0) > 0) {
    riskDrivers.push(`Past due ${loan.pastDueDays} day(s).`);
    recommendedActions.push('Address delinquency before completing review.');
  }
  if (loan.insuranceStatus === 'expired') {
    riskDrivers.push('Insurance lapse.');
    recommendedActions.push('Obtain current evidence of insurance.');
  }
  const riskDeteriorated =
    loan.priorRiskRating !== undefined &&
    loan.riskRating !== undefined &&
    loan.riskRating !== loan.priorRiskRating &&
    isWorseRating(loan.riskRating, loan.priorRiskRating);
  if (riskDeteriorated) {
    riskDrivers.push(`Risk rating deteriorated from ${loan.priorRiskRating} to ${loan.riskRating}.`);
  }
  const isWatch =
    loan.watchlistFlag === true ||
    (loan.criticizedClassifiedStatus ?? '').trim().length > 0;

  // Financial inputs missing → insufficient information.
  const TREND_KEYS: (keyof NonNullable<typeof fin>)[] = [
    'revenueTrend',
    'profitabilityTrend',
    'liquidityTrend',
    'leverageTrend',
    'debtServiceCoverageTrend',
    'collateralCoverageTrend',
    'guarantorSupportTrend',
  ];
  const presentTrends = fin
    ? TREND_KEYS.filter((k) => fin[k] !== undefined && fin[k] !== 'not_available')
    : [];
  if (presentTrends.length === 0) {
    for (const k of TREND_KEYS) missingInputs.push(k);
    recommendedActions.push('Collect borrower financials before concluding soundness.');
    return {
      status: 'insufficient_information',
      supportingFactors,
      riskDrivers,
      missingInputs,
      recommendedActions,
      watchlistRecommendation: 'not_available',
      escalationRequired: riskDrivers.length > 0,
      reviewer: input.reviewer,
      reviewedAt: input.reviewedAt,
    };
  }

  // Tally financial trend signals.
  let decliningCount = 0;
  for (const k of TREND_KEYS) {
    const t = fin?.[k];
    if (t === undefined || t === 'not_available') {
      missingInputs.push(k);
      continue;
    }
    if (declining(t)) {
      decliningCount += 1;
      riskDrivers.push(`${k} declining.`);
    } else if (improvingOrStable(t)) {
      supportingFactors.push(`${k} ${t}.`);
    }
  }

  let status: AnnualReviewSoundnessAssessment['status'];
  if (decliningCount >= 3 || loan.covenantStatus === 'breach' || (loan.pastDueDays ?? 0) > 0) {
    status = 'deteriorating';
  } else if (decliningCount >= 1 || isWatch || riskDeteriorated) {
    status = 'watch';
  } else {
    status = 'sound';
  }

  const escalationRequired =
    status === 'deteriorating' ||
    loan.covenantStatus === 'breach' ||
    (loan.pastDueDays ?? 0) > 0 ||
    loan.insuranceStatus === 'expired' ||
    riskDeteriorated;

  return {
    status,
    supportingFactors,
    riskDrivers,
    missingInputs,
    recommendedActions,
    watchlistRecommendation:
      status === 'deteriorating' ? 'add' : status === 'sound' && isWatch ? 'remove' : 'maintain',
    escalationRequired,
    reviewer: input.reviewer,
    reviewedAt: input.reviewedAt,
  };
}

/** Heuristic: higher numeric rating string = worse (e.g. 6 worse than 4). */
function isWorseRating(current: string, prior: string): boolean {
  const c = Number(current);
  const p = Number(prior);
  if (Number.isNaN(c) || Number.isNaN(p)) return false;
  return c > p;
}
