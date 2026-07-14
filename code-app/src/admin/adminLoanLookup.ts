/**
 * Read-only search/lookup queries backing the Admin → Loan Removal panel.
 *
 * Finds a pipeline deal or portfolio-boarded loan by id or by a text search
 * (name / loan number / borrower), and lists the ones an admin has already
 * removed (so the panel can offer Reinstate). READ ONLY — this module never
 * calls create/update/delete.
 */

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SEARCH_TOP = 15;
const REMOVED_TOP = 25;

function isGuid(v: string): boolean {
  return GUID_RE.test(v.trim().replace(/[{}]/g, ''));
}

function escapeODataString(v: string): string {
  return v.replace(/'/g, "''");
}

export interface DealSearchRow {
  readonly id: string;
  readonly name: string;
  readonly statusName: string | undefined;
  readonly closed: boolean;
  readonly active: boolean;
}

export interface LookupResult<T> {
  readonly success: boolean;
  readonly rows?: readonly T[];
  readonly error?: string;
}

const DEAL_SEARCH_SELECT = [
  'cr664_loandealid',
  'cr664_dealname',
  'cr664_statusreferencename',
  'cr664_stagereferencename',
  'cr664_closedflag',
  'statecode',
];

interface RawDealSearchRow {
  cr664_loandealid?: string;
  cr664_dealname?: string;
  cr664_statusreferencename?: string;
  cr664_stagereferencename?: string;
  cr664_closedflag?: boolean;
  statecode?: number;
}

function mapDealSearchRow(raw: RawDealSearchRow): DealSearchRow {
  return {
    id: raw.cr664_loandealid ?? '',
    name: typeof raw.cr664_dealname === 'string' ? raw.cr664_dealname : '(unnamed deal)',
    statusName: typeof raw.cr664_statusreferencename === 'string' ? raw.cr664_statusreferencename : undefined,
    closed: raw.cr664_closedflag === true,
    active: raw.statecode !== 1,
  };
}

/** Search pipeline deals by id (exact) or dealname (contains). Active + inactive both returned. */
export async function searchDeals(query: string): Promise<LookupResult<DealSearchRow>> {
  const q = query.trim();
  if (q.length === 0) return { success: true, rows: [] };
  try {
    const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
    const filter = isGuid(q)
      ? `cr664_loandealid eq ${q.replace(/[{}]/g, '')}`
      : `contains(cr664_dealname,'${escapeODataString(q)}')`;
    const res = await Cr664_loandealsService.getAll({ select: DEAL_SEARCH_SELECT, filter, top: SEARCH_TOP });
    if (!res.success) return { success: false, error: res.error?.message ?? 'Deal search failed.' };
    return { success: true, rows: (res.data ?? []).map((r) => mapDealSearchRow(r as unknown as RawDealSearchRow)) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The deals an admin has already withdrawn — the Reinstate list. */
export async function listRemovedDeals(): Promise<LookupResult<DealSearchRow>> {
  try {
    const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
    const res = await Cr664_loandealsService.getAll({
      select: DEAL_SEARCH_SELECT,
      filter: `cr664_statusreferencename eq 'Withdrawn'`,
      top: REMOVED_TOP,
    });
    if (!res.success) return { success: false, error: res.error?.message ?? 'Could not load removed deals.' };
    return { success: true, rows: (res.data ?? []).map((r) => mapDealSearchRow(r as unknown as RawDealSearchRow)) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface PortfolioLoanSearchRow {
  readonly id: string;
  readonly name: string;
  readonly loanNumber: string | undefined;
  readonly borrowerName: string | undefined;
  readonly loanStatus: string | undefined;
  readonly active: boolean;
}

const PORTFOLIO_LOAN_SEARCH_SELECT = [
  'cr664_portfolioboardedloanid',
  'cr664_name',
  'cr664_loannumber',
  'cr664_borrowerlegalname',
  'cr664_loanstatus',
  'statecode',
];

interface RawPortfolioLoanSearchRow {
  cr664_portfolioboardedloanid?: string;
  cr664_name?: string;
  cr664_loannumber?: string;
  cr664_borrowerlegalname?: string;
  cr664_loanstatus?: string;
  statecode?: number;
}

function mapPortfolioLoanSearchRow(raw: RawPortfolioLoanSearchRow): PortfolioLoanSearchRow {
  return {
    id: raw.cr664_portfolioboardedloanid ?? '',
    name: typeof raw.cr664_name === 'string' ? raw.cr664_name : '(unnamed loan)',
    loanNumber: typeof raw.cr664_loannumber === 'string' ? raw.cr664_loannumber : undefined,
    borrowerName: typeof raw.cr664_borrowerlegalname === 'string' ? raw.cr664_borrowerlegalname : undefined,
    loanStatus: typeof raw.cr664_loanstatus === 'string' ? raw.cr664_loanstatus : undefined,
    active: raw.statecode !== 1,
  };
}

/** Search portfolio loans by id (exact) or name/loan number/borrower (contains). */
export async function searchPortfolioLoans(query: string): Promise<LookupResult<PortfolioLoanSearchRow>> {
  const q = query.trim();
  if (q.length === 0) return { success: true, rows: [] };
  try {
    const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
    const filter = isGuid(q)
      ? `cr664_portfolioboardedloanid eq ${q.replace(/[{}]/g, '')}`
      : `contains(cr664_name,'${escapeODataString(q)}') or contains(cr664_loannumber,'${escapeODataString(q)}') or contains(cr664_borrowerlegalname,'${escapeODataString(q)}')`;
    const res = await Cr664_portfolioboardedloansService.getAll({ select: PORTFOLIO_LOAN_SEARCH_SELECT, filter, top: SEARCH_TOP });
    if (!res.success) return { success: false, error: res.error?.message ?? 'Portfolio loan search failed.' };
    return { success: true, rows: (res.data ?? []).map((r) => mapPortfolioLoanSearchRow(r as unknown as RawPortfolioLoanSearchRow)) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The portfolio loans an admin has already removed — the Reinstate list. */
export async function listRemovedPortfolioLoans(): Promise<LookupResult<PortfolioLoanSearchRow>> {
  try {
    const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
    const res = await Cr664_portfolioboardedloansService.getAll({
      select: PORTFOLIO_LOAN_SEARCH_SELECT,
      filter: 'statecode eq 1',
      top: REMOVED_TOP,
    });
    if (!res.success) return { success: false, error: res.error?.message ?? 'Could not load removed portfolio loans.' };
    return { success: true, rows: (res.data ?? []).map((r) => mapPortfolioLoanSearchRow(r as unknown as RawPortfolioLoanSearchRow)) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
