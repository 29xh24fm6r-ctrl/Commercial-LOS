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

// Phase 264 (P1) — pagination. This used to be a hard `$top` cap that silently
// truncated any portfolio over 200 loans. It is now a per-request PAGE size:
// `loadBoardedLoans` walks every page via Dataverse skip-token paging until the
// server reports no further page, so a real bank's full boarded-loan book loads
// completely. MAX_PAGES is a pathological-input safety ceiling only (200 * 50 =
// 10,000 rows) — hitting it is reported via `truncated`, never silently dropped.
const PAGE_SIZE = 200;
const MAX_PAGES = 50;

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
  /** PR A remediation — already persisted at boarding time (cr664_termmonths), never read back. */
  readonly termMonths?: number | undefined;
  // Sourced from child entities (cr664_portfolioboardedloancollateral / …guarantor),
  // NOT the main boarded-loan row — see WI-6 (deferred). The main getAll never
  // populates them; they stay undefined until the child read lands.
  readonly collateralType?: string | undefined;
  readonly lienPosition?: string | undefined;
  readonly guaranteeAmount?: number | undefined;
  /** Portfolio-manager display name (from the cr664_PortfolioManager lookup). */
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
  cr664_originalcommitmentamount?: number;
  cr664_bookingdate?: string;
  cr664_closingdate?: string;
  cr664_termmonths?: number;
  // cr664_PortfolioManager is a systemuser LOOKUP: the id is read via
  // `_cr664_portfoliomanager_value` and the display name via that value's
  // `@OData.Community.Display.V1.FormattedValue` annotation. The raw
  // `cr664_portfoliomanager` navigation property is NOT selectable (a $select
  // on it throws Dataverse 0x80060888). `cr664_portfoliomanagername` is a
  // read-only denormalized shadow the live SDK leaves unpopulated.
  _cr664_portfoliomanager_value?: string;
  cr664_portfoliomanagername?: string;
  cr664_extendedloanattributes?: string;
}

const PORTFOLIO_MANAGER_VALUE_COLUMN = '_cr664_portfoliomanager_value';

/**
 * Portfolio-manager display name. Mirrors the deal/team read models: the
 * authoritative label for a lookup lives on the `_<lookup>_value`
 * `@OData.Community.Display.V1.FormattedValue` annotation (the live SDK does
 * not populate the `<lookup>name` shadow field). Falls back to that shadow
 * field, then the raw GUID, so a name shows in "Exposure by manager" rather
 * than "Unassigned" whenever a manager is set.
 */
function portfolioManagerName(r: RawBoardedLoan): string | undefined {
  const raw = r as unknown as Record<string, unknown>;
  const formatted = raw[`${PORTFOLIO_MANAGER_VALUE_COLUMN}@OData.Community.Display.V1.FormattedValue`];
  return (
    (typeof formatted === 'string' && formatted.trim().length > 0 ? formatted.trim() : undefined) ??
    str(r.cr664_portfoliomanagername) ??
    str(r._cr664_portfoliomanager_value)
  );
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
    originalCommitment: numOrNull(r.cr664_originalcommitmentamount) ?? undefined,
    bookingDate: str(r.cr664_bookingdate),
    closingDate: str(r.cr664_closingdate),
    termMonths: numOrNull(r.cr664_termmonths) ?? undefined,
    // collateralType / lienPosition / guaranteeAmount live on child entities —
    // never populated by the main getAll. Left undefined here (WI-6, deferred).
    portfolioManager: portfolioManagerName(r),
    extended: parseExtendedLoanAttributes(r.cr664_extendedloanattributes),
  };
}

/**
 * Core, always-provisioned columns. Every column here is verified to exist on
 * `cr664_portfolioboardedloan` in the generated entity model
 * (Cr664_portfolioboardedloansModel.ts) and is read unconditionally with NO
 * strip-and-retry safety net — so ONLY verified columns may live here. A
 * non-existent column here would fail the entire read closed (0x80060888).
 *
 * WI-1 (PE-WIRE-2): the portfolio-book scalars (past-due, next-review, accrual,
 * booking/closing dates, original commitment) and the portfolio-manager lookup
 * value moved here from the additive bucket. They are all provisioned, and
 * keeping them out of the strip-and-retry bucket means they survive even when
 * the genuinely-optional extended-attributes blob is unprovisioned.
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
  'cr664_pastduedays',
  'cr664_accrualstatus',
  'cr664_nextreviewdate',
  'cr664_originalcommitmentamount',
  'cr664_bookingdate',
  'cr664_closingdate',
  'cr664_termmonths',
  // Lookup value; selecting the raw `cr664_portfoliomanager` nav property is
  // illegal. The `_value` select also carries the FormattedValue name annotation.
  PORTFOLIO_MANAGER_VALUE_COLUMN,
];

/**
 * Additive inputs that may NOT be provisioned yet. Only the extended-attributes
 * JSON blob remains optional (WI-4): it is provisioned separately and written
 * only when EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED is on. A missing-column
 * failure here strips this bucket and retries core-only (fail-closed, never a crash).
 */
const OPTIONAL_PORTFOLIO_BOOK_SELECT: readonly string[] = [
  EXTENDED_LOAN_ATTRIBUTES_COLUMN,
];

/** Core columns + additive portfolio-book columns (may not be provisioned). */
const EXTENDED_SELECT: readonly string[] = [...CORE_SELECT, ...OPTIONAL_PORTFOLIO_BOOK_SELECT];

/** Test-only: the full projected column set, for the WI-1 select-coverage guard. */
export const EXTENDED_SELECT_FOR_TESTS: readonly string[] = EXTENDED_SELECT;

/**
 * Session-level provisioning state for additive portfolio-book columns.
 * Resolved once per session from real Dataverse entity metadata (see
 * `ExtendedColumnCapabilityReader` below) and cached; `'absent'` means we omit
 * the additive columns from every subsequent `$select` so reads never hit the
 * Dataverse `0x80060888` "could not find a property" failure. Fail-closed:
 * unprovisioned additive columns degrade to core-only, never a crash.
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

/** Result of asking Dataverse what attributes actually exist on the live entity. */
export interface ExtendedColumnCapabilityResult {
  readonly success: boolean;
  /** Logical names of every attribute on the live entity; only set when `success`. */
  readonly attributeLogicalNames?: readonly string[];
}

/**
 * Injected for testability: resolves the LIVE entity's real attribute
 * capability via Dataverse entity metadata — the schema-capability contract
 * that replaces inferring provisioning from a failed read's error-message
 * wording (Phase 264, P1).
 */
export type ExtendedColumnCapabilityReader = () => Promise<ExtendedColumnCapabilityResult>;

/**
 * Resolves provisioning from real entity metadata: `'present'` only when every
 * additive column's logical name is among the live entity's attributes,
 * `'absent'` otherwise — including when the metadata call itself fails
 * (fail-closed; never assume provisioned on an inconclusive answer).
 */
async function resolveExtendedColumnProvisioning(
  checkCapability: ExtendedColumnCapabilityReader,
): Promise<ExtendedColumnProvisioning> {
  const res = await checkCapability();
  if (!res.success || !res.attributeLogicalNames) return 'absent';
  const present = new Set(res.attributeLogicalNames.map((n) => n.toLowerCase()));
  return OPTIONAL_PORTFOLIO_BOOK_SELECT.every((c) => present.has(c.toLowerCase())) ? 'present' : 'absent';
}

/** Minimal shape of a boarded-loan read response (subset of IOperationResult). */
export interface BoardedLoanReadResponse {
  readonly success: boolean;
  readonly data?: readonly RawBoardedLoan[] | null;
  readonly error?: { readonly message?: string } | null;
  /** Server-issued paging token for the next page; absent/undefined means "no more pages". */
  readonly skipToken?: string | null;
}

/**
 * Reader injected for testability: given a `$select` (and, for a page beyond
 * the first, the previous page's `skipToken`), returns the raw response.
 * Existing single-page callers/mocks that only accept `select` remain valid —
 * `skipToken` is an additional trailing parameter they are free to ignore.
 */
export type BoardedLoanReader = (
  select: readonly string[],
  skipToken?: string,
) => Promise<BoardedLoanReadResponse>;

/**
 * DEFENSIVE BACKSTOP ONLY — not the capability contract. If entity metadata
 * said the additive columns were present but the live read still fails the
 * same way (schema-propagation lag, metadata cache staleness), this recognizes
 * the Dataverse `0x80060888` "Could not find a property named ..." error so we
 * can still degrade to core-only rather than crash. It is never consulted
 * unless the metadata-based check above already said `'present'`.
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
 * Provisioning-aware SINGLE-PAGE read core. Resolves provisioning once per
 * session from real entity metadata (`checkCapability`) rather than by
 * parsing a failed read's error text. The reactive error-text check is kept
 * only as a defensive backstop for the rare case live behavior disagrees with
 * metadata — it is never the primary detection path, so a wording change in
 * Dataverse's error text can no longer silently break provisioning detection.
 * Never throws the `0x80060888` missing-property error either way. Returns
 * the mapped rows for this page plus the server's `skipToken` (if any) so a
 * caller can walk further pages.
 */
async function readBoardedLoanPage(
  read: BoardedLoanReader,
  checkCapability: ExtendedColumnCapabilityReader,
  skipToken?: string,
): Promise<{ readonly rows: readonly BoardedLoanRow[]; readonly nextSkipToken: string | undefined }> {
  if (extendedColumnProvisioning === 'unknown') {
    extendedColumnProvisioning = await resolveExtendedColumnProvisioning(checkCapability);
  }

  const includeExtended = extendedColumnProvisioning !== 'absent';
  let res = await read(includeExtended ? EXTENDED_SELECT : CORE_SELECT, skipToken);

  if (!res.success && includeExtended && looksLikeMissingExtendedColumn(res)) {
    extendedColumnProvisioning = 'absent';
    res = await read(CORE_SELECT, skipToken);
  }

  if (!res.success) {
    throw new Error(`Portfolio loans read failed: ${res.error?.message ?? 'non-success'}`);
  }

  return {
    rows: (res.data ?? []).map(mapBoardedLoanRow).filter((r) => r.id.length > 0),
    nextSkipToken: res.skipToken ?? undefined,
  };
}

/**
 * Provisioning-aware read of a SINGLE page. Kept as its own export (same
 * behavior/shape as before) because it is the unit the provisioning tests
 * exercise directly, one page at a time.
 */
export async function loadBoardedLoansWith(
  read: BoardedLoanReader,
  checkCapability: ExtendedColumnCapabilityReader,
): Promise<readonly BoardedLoanRow[]> {
  return (await readBoardedLoanPage(read, checkCapability)).rows;
}

export interface BoardedLoansLoadResult {
  readonly rows: readonly BoardedLoanRow[];
  /** True only if MAX_PAGES was exhausted and the server reported a further page — never a silent drop below that. */
  readonly truncated: boolean;
}

/**
 * Walks every page (via Dataverse skip-token paging) until the server reports
 * no further page, or the MAX_PAGES safety ceiling is hit. Replaces the old
 * `$top=200` hard cap: a real portfolio's full boarded-loan book loads in full.
 */
export async function loadAllBoardedLoansWith(
  read: BoardedLoanReader,
  checkCapability: ExtendedColumnCapabilityReader,
): Promise<BoardedLoansLoadResult> {
  const rows: BoardedLoanRow[] = [];
  let skipToken: string | undefined;
  let pageCount = 0;
  do {
    const page = await readBoardedLoanPage(read, checkCapability, skipToken);
    rows.push(...page.rows);
    skipToken = page.nextSkipToken;
    pageCount += 1;
  } while (skipToken && pageCount < MAX_PAGES);
  return { rows, truncated: Boolean(skipToken) };
}

function liveBoardedLoanReader(): BoardedLoanReader {
  return async (select, skipToken) => {
    const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
    const res = await Cr664_portfolioboardedloansService.getAll({
      select: [...select],
      // Admin → Loan Removal (portfolioLoanRemovalWrite.ts) flips statecode to
      // Inactive on a removed loan; exclude it here so the portfolio board
      // reflects removals without a separate "show removed" leak.
      filter: 'statecode eq 0',
      maxPageSize: PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    });
    return {
      success: res.success,
      data: res.data as readonly RawBoardedLoan[] | undefined,
      error: res.error,
      skipToken: res.skipToken,
    };
  };
}

/**
 * Live schema-capability check: asks Dataverse entity metadata for every
 * attribute logical name on `cr664_portfolioboardedloan`. This is the real
 * capability contract — provisioning is decided from what the live entity
 * actually has, never from parsing an error message.
 */
function liveExtendedColumnCapabilityReader(): ExtendedColumnCapabilityReader {
  return async () => {
    const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
    const res = await Cr664_portfolioboardedloansService.getMetadata({ schema: { columns: 'all' } });
    const attributes = res.data?.Attributes;
    if (!res.success || !attributes) return { success: false };
    return { success: true, attributeLogicalNames: attributes.map((a) => a.LogicalName) };
  };
}

/** Back-compat shape most callers want: every boarded loan, fully paged. */
export async function loadBoardedLoans(): Promise<readonly BoardedLoanRow[]> {
  return (await loadAllBoardedLoansWith(liveBoardedLoanReader(), liveExtendedColumnCapabilityReader())).rows;
}

/** Same load, plus the `truncated` signal for callers that want to surface it. */
export function loadBoardedLoansWithMeta(): Promise<BoardedLoansLoadResult> {
  return loadAllBoardedLoansWith(liveBoardedLoanReader(), liveExtendedColumnCapabilityReader());
}
