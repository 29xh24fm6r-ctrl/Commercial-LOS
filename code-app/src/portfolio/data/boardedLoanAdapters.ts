import type { BoardedLoanRow } from '../../portfolioBoarding/boardedLoansList';
import type { ReviewQueueLoanInput } from '../covenants/covenantMonitoring';
import type { EarlyWarningInput } from '../earlyWarning/earlyWarning';
import type { LoanReviewCandidate } from '../loanReview/loanReview';
import type { LoanProfitabilityInputs } from '../profitability/loanProfitability';
import type {
  DualRatingInput,
  DualRatingRecord,
  FacilityInputs,
  ObligorGrade,
  RegulatoryClassification,
} from '../riskRating/dualRiskRating';
import type { WatchlistInput } from '../watchlist/watchlist';
import {
  classifyBand,
  DEFAULT_SINGLE_NAME_PCT_BANDS,
  DEFAULT_GROUP_PCT_BANDS,
  DEFAULT_SEGMENT_PCT_BANDS,
  PORTFOLIO_LARGE_EXPOSURE_THRESHOLD,
} from '../portfolioRiskEngine';
import type { ClassificationPoolInput } from '../regulatoryClassification/regulatoryClassification';
import type { StressTestLoanInput } from '../stressTesting/stressTesting';
import type { PortfolioBoardPackageRiskInput } from '../boardPackage/portfolioBoardPackage';
import type { PortfolioBookSnapshot } from '../portfolioBookSnapshot';

export type PortfolioRatingMap = Readonly<Record<string, ObligorGrade>>;

/**
 * Phase 264 (P0) — default risk-rating map. No proprietary bank rating scale
 * was supplied, so this reuses the codebase's OWN existing 1–8 obligor scale
 * (`OBLIGOR_SCALE` in `dualRiskRating.ts` — already the canonical source for
 * regulatory classification) as the target, and maps onto it only the digit
 * and label forms that are UNAMBIGUOUS: an exact grade number, an exact
 * OBLIGOR_SCALE label, or a regulatory-classification term that corresponds to
 * exactly one grade in this scale (Special Mention=5, Substandard=6,
 * Doubtful=7, Loss=8). A bare "Pass" is deliberately NOT mapped — it spans
 * grades 1–4 in this scale, so collapsing it to one grade would fabricate
 * precision the source data doesn't have. See PORTFOLIO_RATING_MAP.md for the
 * override path if a bank supplies its own scale. Rows with any other
 * riskRating string keep failing closed: excluded from rating-driven
 * derivations rather than coerced.
 */
export const PORTFOLIO_RATING_MAP: PortfolioRatingMap = Object.freeze({
  '1': 1, '01': 1, 'minimal risk': 1, 'minimal': 1,
  '2': 2, '02': 2, 'modest risk': 2, 'modest': 2,
  '3': 3, '03': 3, 'average risk': 3, 'average': 3,
  '4': 4, '04': 4, 'acceptable risk': 4, 'acceptable': 4,
  '5': 5, '05': 5, 'special mention (watch)': 5, 'special mention': 5, 'watch': 5,
  '6': 6, '06': 6, 'substandard': 6,
  '7': 7, '07': 7, 'doubtful': 7,
  '8': 8, '08': 8, 'loss': 8,
});

function normalizeRatingKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mapRiskRatingToObligorGrade(
  rating: string | undefined,
  ratingMap: PortfolioRatingMap = PORTFOLIO_RATING_MAP,
): ObligorGrade | undefined {
  const key = normalizeRatingKey(rating);
  return key ? ratingMap[key] : undefined;
}

export function toLoanProfitabilityInputs(
  row: BoardedLoanRow,
): LoanProfitabilityInputs | undefined {
  const avgEarningBalance = finiteNumber(row.outstanding);
  const avgLoanRate = finiteNumber(row.extended?.currentNoteRate);
  if (!avgEarningBalance || avgEarningBalance <= 0 || avgLoanRate === undefined) {
    return undefined;
  }
  return {
    loanId: row.id,
    borrowerId: row.borrower,
    productType: row.extended?.product,
    referenceIndex: row.index,
    period: 'current',
    avgEarningBalance,
    avgDrawn: avgEarningBalance,
    avgLoanRate,
    averageSpread: finiteNumber(row.spread),
  };
}

export function toDualRatingInput(
  row: BoardedLoanRow,
  ratingMap: PortfolioRatingMap = PORTFOLIO_RATING_MAP,
  now = '1970-01-01T00:00:00.000Z',
): DualRatingInput | undefined {
  const obligorGrade = mapRiskRatingToObligorGrade(row.riskRating, ratingMap);
  if (obligorGrade === undefined) return undefined;

  const exposure = finiteNumber(row.outstanding);
  const guaranteeAmount = finiteNumber(row.guaranteeAmount);
  const facility: FacilityInputs | undefined =
    row.collateralType || guaranteeAmount !== undefined || row.lienPosition
      ? {
          secured: Boolean(row.collateralType || guaranteeAmount !== undefined),
          collateralValue: guaranteeAmount,
          exposure,
          lienPosition: row.lienPosition,
          structureSupport: guaranteeAmount !== undefined ? 'strong' : 'standard',
        }
      : undefined;

  return {
    loanId: row.id,
    effectiveDate: row.nextReviewDate ?? row.bookingDate ?? now,
    obligorGrade,
    facility,
    ead: exposure,
    drivers: row.riskRating ? [`Boarded risk rating: ${row.riskRating}`] : undefined,
  };
}

export function toEarlyWarningInput(
  row: BoardedLoanRow,
  now: string,
): EarlyWarningInput {
  return {
    loanId: row.id,
    borrower: row.borrower,
    owner: row.portfolioManager,
    now,
    pastDueDays: finiteNumber(row.pastDueDays),
    maturityDate: row.maturityDate,
  };
}

export function toWatchlistInput(
  row: BoardedLoanRow,
  classification?: RegulatoryClassification,
): WatchlistInput {
  return {
    loanId: row.id,
    borrower: row.borrower,
    exposure: finiteNumber(row.outstanding),
    classification,
    watchFlag: row.watchlist,
    openedDate: row.bookingDate ?? row.closingDate,
  };
}

export function toReviewQueueLoanInput(
  row: BoardedLoanRow,
  obligorGrade?: ObligorGrade,
): ReviewQueueLoanInput {
  return {
    loanId: row.id,
    grade: obligorGrade,
    lastReviewDate: row.nextReviewDate,
  };
}

export function toLoanReviewCandidate(
  row: BoardedLoanRow,
  obligorGrade?: ObligorGrade,
  exceptionCount = 0,
): LoanReviewCandidate {
  return {
    loanId: row.id,
    exposure: finiteNumber(row.outstanding),
    obligorGrade,
    exceptionCount,
    segment: row.extended?.product ?? row.status,
    originatingBanker: row.portfolioManager,
    lastReviewedDate: row.nextReviewDate,
  };
}

/**
 * Phase 264 (P3) — pairs each already-computed dual rating record with its
 * loan's exposure/borrower for the regulatory-classification pooling engine.
 * A rating with no matching loan (should not happen, but never assumed) is
 * paired with exposure 0 and an undefined borrower rather than dropped —
 * the pooling engine itself excludes non-positive exposure honestly.
 */
export function toClassificationPoolInputs(
  loans: readonly BoardedLoanRow[],
  ratings: readonly DualRatingRecord[],
): ClassificationPoolInput[] {
  const loanById = new Map(loans.map((row) => [row.id, row]));
  return ratings
    .filter((rating): rating is DualRatingRecord & { loanId: string } => rating.loanId !== undefined)
    .map((rating) => {
      const loan = loanById.get(rating.loanId);
      return {
        loanId: rating.loanId,
        borrowerName: loan?.borrower,
        exposure: finiteNumber(loan?.outstanding) ?? 0,
        rating,
      };
    });
}

/**
 * Phase 264 (P3) — boarded loans -> stress-test engine input. `collateralValue`
 * is always undefined: collateral value lives on child entities not yet read
 * by the main boarded-loan query (WI-6, deferred) — genuinely unknown, never
 * fabricated. The stress engine already treats an undefined collateral value
 * as "collateral-shock impact not computable" rather than guessing.
 */
export function toStressTestLoanInputs(
  loans: readonly BoardedLoanRow[],
): StressTestLoanInput[] {
  return loans.map((row) => ({
    loanId: row.id,
    borrowerName: row.borrower,
    exposure: finiteNumber(row.outstanding) ?? 0,
    interestRateType: row.interestRateType,
    currentSpreadPct: finiteNumber(row.spread),
    collateralValue: undefined,
  }));
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Phase 264 (P3) — adapts the boarded book's own concentration rollup
 * (`PortfolioBookSnapshot`) into the board package's risk/concentration
 * input. The deal-pipeline risk engine (`portfolioRiskEngine.ts`) cannot be
 * reused directly here: boarded loans and pre-close deals are different data
 * models (no `ManagerVMRow` exists for a boarded loan). "Unknown
 * borrower"/"Unknown product"/"Unassigned" buckets are excluded from the
 * concentration figures (mirroring the deal-pipeline engine's `isUnknown`
 * exclusion) so an absence-of-data bucket is never reported as a real
 * concentration finding. No risk-finding engine exists yet for boarded loans
 * (the deal-pipeline findings need per-deal document/task counts that boarded
 * loans don't track), so `findings` is honestly empty, never fabricated.
 */
export function toBoardPackageRiskInput(
  snapshot: PortfolioBookSnapshot,
): PortfolioBoardPackageRiskInput {
  const knownBorrowers = snapshot.byBorrower.filter((r) => r.label !== 'Unknown borrower');
  const knownProducts = snapshot.byProduct.filter((r) => r.label !== 'Unknown product');
  const knownManagers = snapshot.byPortfolioManager.filter((r) => r.label !== 'Unassigned');

  const singleName = knownBorrowers[0];
  const top5Pct = clampPct(knownBorrowers.slice(0, 5).reduce((sum, r) => sum + r.sharePct, 0));
  const topProduct = knownProducts[0];
  const topManager = knownManagers[0];

  const totalExposure = snapshot.commandRibbon.totalExposure;
  const dealsAboveThresholdCount = snapshot.loans.filter((row) => {
    const outstanding = finiteNumber(row.outstanding);
    return outstanding !== undefined && outstanding >= PORTFOLIO_LARGE_EXPOSURE_THRESHOLD;
  }).length;

  return {
    exposure: {
      totalExposure,
      largestExposure: snapshot.topExposures[0]?.outstanding,
      dealsAboveThresholdCount,
    },
    concentration: {
      singleNamePct: singleName?.sharePct ?? 0,
      singleNameClient: singleName?.label,
      singleNameBand: classifyBand(singleName?.sharePct ?? 0, DEFAULT_SINGLE_NAME_PCT_BANDS),
      top5Pct,
      top5Band: classifyBand(top5Pct, DEFAULT_GROUP_PCT_BANDS),
      topProductPct: topProduct?.sharePct ?? 0,
      topProductLabel: topProduct?.label,
      topProductBand: classifyBand(topProduct?.sharePct ?? 0, DEFAULT_SEGMENT_PCT_BANDS),
      // The boarded book tracks a portfolio MANAGER (who owns the relationship
      // post-boarding), not an originating banker — the closest available
      // analogous "who's concentrated here" dimension.
      topBankerPct: topManager?.sharePct ?? 0,
      topBankerLabel: topManager?.label,
      topBankerBand: classifyBand(topManager?.sharePct ?? 0, DEFAULT_SEGMENT_PCT_BANDS),
    },
    findings: [],
  };
}
