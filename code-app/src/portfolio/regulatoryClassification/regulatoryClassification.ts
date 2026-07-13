import type { DualRatingRecord, RegulatoryClassification } from '../riskRating/dualRiskRating';

/**
 * Phase 264 (P3) — portfolio regulatory-classification pooling engine.
 *
 * A PURE, deterministic aggregation layered on top of already-derived
 * per-loan `DualRatingRecord`s (from the PE-5 dual risk rating engine). It
 * pools loans into the five regulatory classification buckets (Pass /
 * Special Mention / Substandard / Doubtful / Loss), exposure-weights the
 * PD/LGD within each pool, and sums exposure × PD × LGD into an illustrative
 * allowance estimate.
 *
 * NOT A CERTIFIED CECL / ALLL MODEL. This is an internal, illustrative
 * exposure × PD × LGD roll-up using this engine's own internal PD/LGD scale
 * (see `OBLIGOR_SCALE` / `FACILITY_SCALE` in dualRiskRating.ts). It applies:
 *   - no macro / economic-forecast overlay,
 *   - no vintage or cohort loss-history curve,
 *   - no qualitative Q-factor adjustment,
 *   - no reasonable-and-supportable forecast period or reversion.
 * It exists to give a transparent, always-available directional read on
 * where allowance pressure sits across the pools, not a regulatory-filing
 * number. Any consumer surfacing this figure MUST label it illustrative /
 * non-regulatory.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no fetch, no clock, no Math.random(). Deterministic for a
 *     given input array.
 *   - Consumes already-computed ratings only; never recomputes PD/LGD/grade.
 *   - Honest absence: a loan with non-finite or non-positive exposure is
 *     excluded from every sum, but the exclusion is counted
 *     (`excludedLoanCount`), never silently dropped or coerced to zero.
 *   - All five classification pools are always reported, in canonical
 *     order, even when a pool has zero loans — never omit an empty pool.
 *   - No fabricated data: every figure here is a deterministic function of
 *     the caller-supplied `exposure` and the caller-supplied rating's
 *     `pd` / `lgd` / `criticized` / `classified` fields.
 */

/** Canonical pool order — always emitted in full, even when empty. */
export const CLASSIFICATION_POOL_ORDER: readonly RegulatoryClassification[] = Object.freeze([
  'Pass',
  'Special Mention',
  'Substandard',
  'Doubtful',
  'Loss',
]);

export interface ClassificationPoolInput {
  readonly loanId: string | undefined;
  readonly borrowerName: string | undefined;
  /** Outstanding principal / exposure. Must be > 0 and finite to be counted. */
  readonly exposure: number;
  readonly rating: DualRatingRecord;
}

export interface ClassificationPoolStat {
  readonly classification: RegulatoryClassification;
  readonly loanCount: number;
  readonly totalExposure: number;
  /** 0-100, rounded, share of the portfolio's total countable exposure. */
  readonly sharePctOfPortfolio: number;
  /** Exposure-weighted average PD within this pool; 0 when the pool is empty. */
  readonly weightedAveragePd: number;
  /** Exposure-weighted average LGD within this pool; 0 when the pool is empty. */
  readonly weightedAverageLgd: number;
  /** Sum over the pool of (exposure * rating.pd * rating.lgd). */
  readonly estimatedAllowance: number;
}

export interface RegulatoryClassificationSnapshot {
  /** Always all 5 pools, in CLASSIFICATION_POOL_ORDER, even when zero loans. */
  readonly pools: readonly ClassificationPoolStat[];
  readonly totalExposure: number;
  readonly totalEstimatedAllowance: number;
  /** totalEstimatedAllowance / totalExposure * 100, rounded to 2 decimals; undefined when totalExposure is 0. */
  readonly allowanceCoverageRatio: number | undefined;
  readonly criticizedExposure: number;
  readonly criticizedSharePct: number;
  readonly classifiedExposure: number;
  readonly classifiedSharePct: number;
  /** Loans dropped for non-finite / non-positive exposure — reported, never silently vanished. */
  readonly excludedLoanCount: number;
  /** True when there are zero countable loans. */
  readonly isEmpty: boolean;
}

/**
 * Pool an array of (exposure, dual-rating) pairs into the five regulatory
 * classification buckets and derive an illustrative allowance estimate.
 * See the module header for the full non-regulatory disclaimer.
 */
export function deriveRegulatoryClassificationSnapshot(
  loans: readonly ClassificationPoolInput[],
): RegulatoryClassificationSnapshot {
  type PoolAcc = {
    loanCount: number;
    totalExposure: number;
    pdExposureSum: number;
    lgdExposureSum: number;
    estimatedAllowance: number;
  };

  const acc = new Map<RegulatoryClassification, PoolAcc>();
  for (const c of CLASSIFICATION_POOL_ORDER) {
    acc.set(c, { loanCount: 0, totalExposure: 0, pdExposureSum: 0, lgdExposureSum: 0, estimatedAllowance: 0 });
  }

  let totalExposure = 0;
  let totalEstimatedAllowance = 0;
  let criticizedExposure = 0;
  let classifiedExposure = 0;
  let excludedLoanCount = 0;
  let countableLoanCount = 0;

  for (const loan of loans) {
    if (!Number.isFinite(loan.exposure) || loan.exposure <= 0) {
      excludedLoanCount += 1;
      continue;
    }

    countableLoanCount += 1;
    const exposure = loan.exposure;
    const { pd, lgd, classification, criticized, classified } = loan.rating;
    const allowance = exposure * pd * lgd;

    const bucket = acc.get(classification);
    if (bucket) {
      bucket.loanCount += 1;
      bucket.totalExposure += exposure;
      bucket.pdExposureSum += pd * exposure;
      bucket.lgdExposureSum += lgd * exposure;
      bucket.estimatedAllowance += allowance;
    }

    totalExposure += exposure;
    totalEstimatedAllowance += allowance;
    if (criticized) criticizedExposure += exposure;
    if (classified) classifiedExposure += exposure;
  }

  const pools: ClassificationPoolStat[] = CLASSIFICATION_POOL_ORDER.map((classification) => {
    const bucket = acc.get(classification) ?? {
      loanCount: 0,
      totalExposure: 0,
      pdExposureSum: 0,
      lgdExposureSum: 0,
      estimatedAllowance: 0,
    };
    return {
      classification,
      loanCount: bucket.loanCount,
      totalExposure: bucket.totalExposure,
      sharePctOfPortfolio: sharePct(bucket.totalExposure, totalExposure),
      weightedAveragePd: weightedAverage(bucket.pdExposureSum, bucket.totalExposure),
      weightedAverageLgd: weightedAverage(bucket.lgdExposureSum, bucket.totalExposure),
      estimatedAllowance: bucket.estimatedAllowance,
    };
  });

  return {
    pools,
    totalExposure,
    totalEstimatedAllowance,
    allowanceCoverageRatio: ratioPct(totalEstimatedAllowance, totalExposure),
    criticizedExposure,
    criticizedSharePct: sharePct(criticizedExposure, totalExposure),
    classifiedExposure,
    classifiedSharePct: sharePct(classifiedExposure, totalExposure),
    excludedLoanCount,
    isEmpty: countableLoanCount === 0,
  };
}

// ---------------------------------------------------------------------------
// Small local helpers (deliberately not imported from portfolioRiskEngine —
// this module has zero cross-portfolio-engine dependencies besides the
// rating types).
// ---------------------------------------------------------------------------

/** 0-100, rounded; 0 when total is non-positive (guards divide-by-zero). */
function sharePct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

/** Exposure-weighted average; 0 when the pool has no countable exposure. */
function weightedAverage(weightedSum: number, totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  return weightedSum / totalWeight;
}

/** Percent ratio rounded to 2 decimals; undefined when total is non-positive. */
function ratioPct(value: number, total: number): number | undefined {
  if (total <= 0) return undefined;
  return Math.round((value / total) * 10000) / 100;
}
