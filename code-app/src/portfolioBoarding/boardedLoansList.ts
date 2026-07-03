/**
 * Phase 259 — boarded-loan list read for the Portfolio workspace.
 *
 * Lists cr664_portfolioboardedloan records (originated-closed and manually
 * boarded existing loans) so they appear in the Portfolio workspace after
 * boarding. Read-only; pure mapper (SDK-free static graph) + live loader.
 */

import { MANUAL_EXISTING_LOAN_BOARDING_SOURCE } from './existingLoanEntryAdapter';
import {
  EXTENDED_LOAN_ATTRIBUTES_COLUMN,
  parseExtendedLoanAttributes,
  type ExtendedLoanAttributes,
} from './extendedLoanAttributes';

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
  readonly pastDueDays?: number | undefined;
  readonly accrualStatus?: string | undefined;
  readonly nextReviewDate?: string | undefined;
  readonly originalCommitment?: number | undefined;
  readonly bookingDate?: string | undefined;
  readonly closingDate?: string | undefined;
  readonly collateralType?: string | undefined;
  readonly lienPosition?: string | undefined;
  readonly guaranteeAmount?: number | undefined;
  readonly portfolioManager?: string | undefined;
  /** Phase 2 — persisted extended attributes (note rate / reset terms / product / officer …). */
  readonly extended?: ExtendedLoanAttributes | null;
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
  cr664_pastduedays?: number;
  cr664_accrualstatus?: string;
  cr664_nextreviewdate?: string;
  cr664_originalcommitment?: number;
  cr664_bookingdate?: string;
  cr664_closingdate?: string;
  cr664_collateraltype?: string;
  cr664_lienposition?: string;
  cr664_guaranteeamount?: number;
  cr664_portfoliomanager?: string;
  cr664_extendedloanattributes?: string;
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
    pastDueDays: numOrNull(r.cr664_pastduedays) ?? undefined,
    accrualStatus: str(r.cr664_accrualstatus),
    nextReviewDate: str(r.cr664_nextreviewdate),
    originalCommitment: numOrNull(r.cr664_originalcommitment) ?? undefined,
    bookingDate: str(r.cr664_bookingdate),
    closingDate: str(r.cr664_closingdate),
    collateralType: str(r.cr664_collateraltype),
    lienPosition: str(r.cr664_lienposition),
    guaranteeAmount: numOrNull(r.cr664_guaranteeamount) ?? undefined,
    portfolioManager: str(r.cr664_portfoliomanager),
    extended: parseExtendedLoanAttributes(r.cr664_extendedloanattributes),
  };
}

/**
 * Core, always-provisioned columns (Phase 259 + Phase 262 pricing). These have
 * always been present on cr664_portfolioboardedloan and are read unconditionally.
 */
const CORE_SELECT: readonly string[] = [
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
];

/**
 * Additive portfolio-book inputs used by PE-WIRE-1 panels. Older Dataverse
 * environments may not have every read-only column yet.
 */
const OPTIONAL_PORTFOLIO_BOOK_SELECT: readonly string[] = [
  'cr664_pastduedays',
  'cr664_accrualstatus',
  'cr664_nextreviewdate',
  'cr664_originalcommitment',
  'cr664_bookingdate',
  'cr664_closingdate',
  'cr664_collateraltype',
  'cr664_lienposition',
  'cr664_guaranteeamount',
  'cr664_portfoliomanager',
  EXTENDED_LOAN_ATTRIBUTES_COLUMN,
];

/** Core columns + additive portfolio-book columns (may not be provisioned). */
const EXTENDED_SELECT: readonly string[] = [...CORE_SELECT, ...OPTIONAL_PORTFOLIO_BOOK_SELECT];

/**
 * Session-level provisioning state for additive portfolio-book columns. Probed
 * once per session by attempting the read with the columns and caching the
 * result; `'absent'` means we omit them from every subsequent `$select` so
 * reads never re-hit the Dataverse `0x80060888` "could not find a property"
 * failure. Fail-closed: unprovisioned additive columns degrade to core-only,
 * never a crash.
 */
export type ExtendedColumnProvisioning = 'unknown' | 'present' | 'absent';

let extendedColumnProvisioning: ExtendedColumnProvisioning = 'unknown';

/** The current session view of whether additive portfolio-book inputs are provisioned. */
export function getExtendedColumnProvisioning(): ExtendedColumnProvisioning {
  return extendedColumnProvisioning;
}

/** Test-only: reset the per-session probe cache between cases. */
export function resetExtendedColumnProvisioningForTests(): void {
  extendedColumnProvisioning = 'unknown';
}

/** Minimal shape of a boarded-loan read response (subset of IOperationResult). */
export interface BoardedLoanReadResponse {
  readonly success: boolean;
  readonly data?: readonly RawBoardedLoan[] | null;
  readonly error?: { readonly message?: string } | null;
}

/** Reader injected for testability: given a `$select`, returns the raw response. */
export type BoardedLoanReader = (select: readonly string[]) => Promise<BoardedLoanReadResponse>;

/**
 * True when a failed read looks like an additive portfolio-book column is not
 * provisioned — the Dataverse `0x80060888` "Could not find a property named ..."
 * error. Any other failure is surfaced honestly.
 */
function looksLikeMissingExtendedColumn(res: BoardedLoanReadResponse): boolean {
  const msg = (res.error?.message ?? '').toLowerCase();
  if (msg.length === 0) return false;
  return (
    OPTIONAL_PORTFOLIO_BOOK_SELECT.some((column) =>
      msg.includes(column.toLowerCase()),
    ) ||
    (msg.includes('0x80060888') && msg.includes('could not find a property'))
  );
}

/**
 * Provisioning-aware read core. Includes additive portfolio-book columns unless
 * this session already learned they are absent. On a missing-column failure it
 * strips the columns, retries once, and caches `'absent'` for the rest of the
 * session. Never throws the `0x80060888` missing-property error.
 */
export async function loadBoardedLoansWith(read: BoardedLoanReader): Promise<readonly BoardedLoanRow[]> {
  const includeExtended = extendedColumnProvisioning !== 'absent';
  let res = await read(includeExtended ? EXTENDED_SELECT : CORE_SELECT);
  let stripped = false;

  if (!res.success && includeExtended && looksLikeMissingExtendedColumn(res)) {
    extendedColumnProvisioning = 'absent';
    stripped = true;
    res = await read(CORE_SELECT);
  }

  if (!res.success) {
    throw new Error(`Portfolio loans read failed: ${res.error?.message ?? 'non-success'}`);
  }

  // A clean read that actually carried the additive columns proves they are provisioned.
  if (includeExtended && !stripped) {
    extendedColumnProvisioning = 'present';
  }

  return (res.data ?? []).map(mapBoardedLoanRow).filter((r) => r.id.length > 0);
}

export function loadBoardedLoans(): Promise<readonly BoardedLoanRow[]> {
  return loadBoardedLoansWith(async (select) => {
    const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
    const res = await Cr664_portfolioboardedloansService.getAll({ select: [...select], top: ROW_CAP });
    return {
      success: res.success,
      data: res.data as readonly RawBoardedLoan[] | undefined,
      error: res.error,
    };
  });
}
