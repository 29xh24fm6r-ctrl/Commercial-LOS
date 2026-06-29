/**
 * Phase 259 — boarded-loan list read for the Portfolio workspace.
 *
 * Lists cr664_portfolioboardedloan records (originated-closed and manually
 * boarded existing loans) so they appear in the Portfolio workspace after
 * boarding. Read-only; pure mapper (SDK-free static graph) + live loader.
 */

import { MANUAL_EXISTING_LOAN_BOARDING_SOURCE } from './existingLoanEntryAdapter';

const ROW_CAP = 200;

export interface BoardedLoanRow {
  readonly id: string;
  readonly loanNumber: string | undefined;
  readonly borrower: string | undefined;
  readonly status: string | undefined;
  readonly outstanding: number | undefined;
  readonly riskRating: string | undefined;
  readonly maturityDate: string | undefined;
  readonly watchlist: boolean;
  /** True when this loan was entered via manual existing-loan boarding. */
  readonly manuallyBoarded: boolean;
  readonly boardingSource: string | undefined;
  // Phase 262 — persisted pricing/rate columns (variable-rate control center).
  // Optional: inline-constructed rows (e.g. an optimistic post-board row) omit them.
  readonly interestRateType?: string | undefined;
  readonly index?: string | undefined;
  readonly spread?: number | null | undefined;
  readonly floor?: number | null | undefined;
  readonly ceiling?: number | null | undefined;
}

interface RawBoardedLoan {
  cr664_portfolioboardedloanid?: string;
  cr664_loannumber?: string;
  cr664_borrowerlegalname?: string;
  cr664_loanstatus?: string;
  cr664_currentoutstandingprincipal?: number;
  cr664_currentriskrating?: string;
  cr664_maturitydate?: string;
  cr664_watchlistflag?: boolean;
  cr664_boardingsource?: string;
  cr664_interestratetype?: string;
  cr664_index?: string;
  cr664_spread?: number;
  cr664_floor?: number;
  cr664_ceiling?: number;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function numOrNull(v: unknown): number | null | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

export function mapBoardedLoanRow(r: RawBoardedLoan): BoardedLoanRow {
  const source = str(r.cr664_boardingsource);
  return {
    id: r.cr664_portfolioboardedloanid ?? '',
    loanNumber: str(r.cr664_loannumber),
    borrower: str(r.cr664_borrowerlegalname),
    status: str(r.cr664_loanstatus),
    outstanding: typeof r.cr664_currentoutstandingprincipal === 'number' ? r.cr664_currentoutstandingprincipal : undefined,
    riskRating: str(r.cr664_currentriskrating),
    maturityDate: str(r.cr664_maturitydate),
    watchlist: r.cr664_watchlistflag === true,
    manuallyBoarded: source === MANUAL_EXISTING_LOAN_BOARDING_SOURCE,
    boardingSource: source,
    interestRateType: str(r.cr664_interestratetype),
    index: str(r.cr664_index),
    spread: numOrNull(r.cr664_spread),
    floor: numOrNull(r.cr664_floor),
    ceiling: numOrNull(r.cr664_ceiling),
  };
}

export async function loadBoardedLoans(): Promise<readonly BoardedLoanRow[]> {
  const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
  const res = await Cr664_portfolioboardedloansService.getAll({
    select: [
      'cr664_portfolioboardedloanid',
      'cr664_loannumber',
      'cr664_borrowerlegalname',
      'cr664_loanstatus',
      'cr664_currentoutstandingprincipal',
      'cr664_currentriskrating',
      'cr664_maturitydate',
      'cr664_watchlistflag',
      'cr664_boardingsource',
      'cr664_interestratetype',
      'cr664_index',
      'cr664_spread',
      'cr664_floor',
      'cr664_ceiling',
    ],
    top: ROW_CAP,
  });
  if (!res.success) {
    throw new Error(`Portfolio loans read failed: ${res.error?.message ?? 'non-success'}`);
  }
  return (res.data ?? []).map(mapBoardedLoanRow).filter((r) => r.id.length > 0);
}
