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
