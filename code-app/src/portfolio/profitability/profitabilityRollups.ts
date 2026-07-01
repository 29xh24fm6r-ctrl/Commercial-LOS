/**
 * Phase PE-4 — relationship + portfolio profitability rollups.
 *
 * Pure aggregations over per-loan `LoanProfitability` results (from
 * deriveLoanProfitability): the whole-relationship view ("compete or walk
 * away") and the portfolio view (weighted-average ROE, ROE distribution, and
 * the low-ROE / negative-contribution outliers dragging the book).
 *
 * Discipline: pure, deterministic, no IO. ROE is capital-weighted (not a naive
 * average of ratios). Nothing is fabricated — loans with no allocated capital
 * simply do not contribute to the weighted ROE.
 */

import type { LoanProfitability, ProfitabilityStatus } from './loanProfitability';

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function pct(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Relationship rollup
// ---------------------------------------------------------------------------

export interface RelationshipProfitability {
  readonly relationshipId?: string;
  readonly relationshipName?: string;
  readonly loanCount: number;
  /** Loans with sufficient real inputs to be rated. */
  readonly ratedLoanCount: number;
  readonly grossRevenue: number;
  readonly netInterestIncome: number;
  readonly totalFeeIncome: number;
  readonly otherIncome: number;
  readonly totalAllocatedCosts: number;
  readonly creditProvision: number;
  readonly contributionMargin: number;
  readonly allocatedCapital: number;
  readonly afterTaxProfit: number;
  /** Capital-weighted whole-relationship ROE, percent; undefined with no capital. */
  readonly roe: number | undefined;
  readonly raroc: number | undefined;
  readonly status: ProfitabilityStatus;
}

export function deriveRelationshipProfitability(
  loans: readonly LoanProfitability[],
  opts: { relationshipId?: string; relationshipName?: string; targetRoe?: number } = {},
): RelationshipProfitability {
  let grossRevenue = 0;
  let netInterestIncome = 0;
  let totalFeeIncome = 0;
  let otherIncome = 0;
  let totalAllocatedCosts = 0;
  let creditProvision = 0;
  let contributionMargin = 0;
  let allocatedCapital = 0;
  let afterTaxProfit = 0;
  let ratedLoanCount = 0;

  for (const l of loans) {
    grossRevenue += l.grossRevenue;
    netInterestIncome += l.netInterestIncome;
    totalFeeIncome += l.totalFeeIncome;
    otherIncome += l.otherIncome;
    totalAllocatedCosts += l.totalAllocatedCosts;
    creditProvision += l.creditProvision;
    contributionMargin += l.contributionMargin;
    allocatedCapital += l.allocatedCapital;
    afterTaxProfit += l.components.afterTaxProfit;
    if (l.sufficientInputs) ratedLoanCount += 1;
  }

  const roe = allocatedCapital > 0 ? pct((afterTaxProfit / allocatedCapital) * 100) : undefined;

  return {
    relationshipId: opts.relationshipId,
    relationshipName: opts.relationshipName,
    loanCount: loans.length,
    ratedLoanCount,
    grossRevenue: money(grossRevenue),
    netInterestIncome: money(netInterestIncome),
    totalFeeIncome: money(totalFeeIncome),
    otherIncome: money(otherIncome),
    totalAllocatedCosts: money(totalAllocatedCosts),
    creditProvision: money(creditProvision),
    contributionMargin: money(contributionMargin),
    allocatedCapital: money(allocatedCapital),
    afterTaxProfit: money(afterTaxProfit),
    roe,
    raroc: roe,
    status: statusFor(ratedLoanCount === 0, money(contributionMargin), roe, opts.targetRoe),
  };
}

// ---------------------------------------------------------------------------
// Portfolio rollup
// ---------------------------------------------------------------------------

export interface RoeBucket {
  readonly label: string;
  readonly count: number;
}

export interface ProfitabilityOutlier {
  readonly loanId?: string;
  readonly borrowerId?: string;
  readonly productType?: string;
  readonly roe: number | undefined;
  readonly contributionMargin: number;
  readonly status: ProfitabilityStatus;
}

export interface PortfolioProfitability {
  readonly loanCount: number;
  readonly ratedLoanCount: number;
  readonly grossRevenue: number;
  readonly contributionMargin: number;
  readonly allocatedCapital: number;
  readonly afterTaxProfit: number;
  /** Capital-weighted portfolio ROE, percent; undefined with no capital. */
  readonly weightedAvgRoe: number | undefined;
  readonly negativeContributionCount: number;
  readonly distribution: readonly RoeBucket[];
  /** Loans dragging the book: negative contribution or ROE below the threshold. */
  readonly lowRoeOutliers: readonly ProfitabilityOutlier[];
}

/** Fixed ROE distribution bands (percent). */
function bucketLabel(roe: number | undefined): string {
  if (roe === undefined) return 'Unrated';
  if (roe < 0) return 'Negative';
  if (roe < 8) return '0–8%';
  if (roe < 12) return '8–12%';
  if (roe < 15) return '12–15%';
  return '15%+';
}

const BUCKET_ORDER: readonly string[] = ['Negative', '0–8%', '8–12%', '12–15%', '15%+', 'Unrated'];

export function derivePortfolioProfitability(
  loans: readonly LoanProfitability[],
  opts: { lowRoeThreshold?: number; maxOutliers?: number } = {},
): PortfolioProfitability {
  const threshold = typeof opts.lowRoeThreshold === 'number' ? opts.lowRoeThreshold : 10;
  const maxOutliers = typeof opts.maxOutliers === 'number' ? opts.maxOutliers : 10;

  let grossRevenue = 0;
  let contributionMargin = 0;
  let allocatedCapital = 0;
  let afterTaxProfit = 0;
  let ratedLoanCount = 0;
  let negativeContributionCount = 0;

  const counts = new Map<string, number>();
  for (const label of BUCKET_ORDER) counts.set(label, 0);

  for (const l of loans) {
    grossRevenue += l.grossRevenue;
    contributionMargin += l.contributionMargin;
    allocatedCapital += l.allocatedCapital;
    afterTaxProfit += l.components.afterTaxProfit;
    if (l.sufficientInputs) ratedLoanCount += 1;
    if (l.contributionMargin < 0) negativeContributionCount += 1;
    const label = bucketLabel(l.roe);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const weightedAvgRoe = allocatedCapital > 0 ? pct((afterTaxProfit / allocatedCapital) * 100) : undefined;

  const outliers = loans
    .filter(
      (l) =>
        l.sufficientInputs &&
        (l.contributionMargin < 0 || (l.roe !== undefined && l.roe < threshold)),
    )
    .map<ProfitabilityOutlier>((l) => ({
      loanId: l.loanId,
      borrowerId: l.borrowerId,
      productType: l.productType,
      roe: l.roe,
      contributionMargin: l.contributionMargin,
      status: l.status,
    }))
    .sort((a, b) => outlierSortKey(a) - outlierSortKey(b))
    .slice(0, maxOutliers);

  return {
    loanCount: loans.length,
    ratedLoanCount,
    grossRevenue: money(grossRevenue),
    contributionMargin: money(contributionMargin),
    allocatedCapital: money(allocatedCapital),
    afterTaxProfit: money(afterTaxProfit),
    weightedAvgRoe,
    negativeContributionCount,
    distribution: BUCKET_ORDER.map((label) => ({ label, count: counts.get(label) ?? 0 })),
    lowRoeOutliers: outliers,
  };
}

/** Worst-first ordering: negative-contribution loans, then lowest ROE. */
function outlierSortKey(o: ProfitabilityOutlier): number {
  if (o.roe !== undefined) return o.roe;
  return o.contributionMargin < 0 ? -Infinity : Infinity;
}

function statusFor(
  insufficient: boolean,
  contributionMargin: number,
  roe: number | undefined,
  targetRoe: number | undefined,
): ProfitabilityStatus {
  if (insufficient) return 'insufficient_inputs';
  if (contributionMargin < 0) return 'negative_contribution';
  if (roe === undefined) return 'unrated';
  if (typeof targetRoe !== 'number' || !Number.isFinite(targetRoe) || targetRoe <= 0) return 'unrated';
  if (roe >= targetRoe) return 'above_target';
  if (roe >= targetRoe * 0.8) return 'near_target';
  return 'below_target';
}
