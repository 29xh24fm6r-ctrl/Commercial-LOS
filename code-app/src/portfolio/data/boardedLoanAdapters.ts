import type { BoardedLoanRow } from '../../portfolioBoarding/boardedLoansList';
import type { ReviewQueueLoanInput } from '../covenants/covenantMonitoring';
import type { EarlyWarningInput } from '../earlyWarning/earlyWarning';
import type { LoanReviewCandidate } from '../loanReview/loanReview';
import type { LoanProfitabilityInputs } from '../profitability/loanProfitability';
import type {
  DualRatingInput,
  FacilityInputs,
  ObligorGrade,
  RegulatoryClassification,
} from '../riskRating/dualRiskRating';
import type { WatchlistInput } from '../watchlist/watchlist';

export type PortfolioRatingMap = Readonly<Record<string, ObligorGrade>>;

/**
 * Pending Matt/OGB paper decision: no canonical risk-rating string -> obligor
 * grade map has been ratified. Unmapped ratings are excluded from rating-based
 * portfolio derivations.
 */
export const PORTFOLIO_RATING_MAP: PortfolioRatingMap = Object.freeze({});

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
