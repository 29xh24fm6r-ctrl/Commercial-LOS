import type { BoardedLoanRow } from '../portfolioBoarding/boardedLoansList';
import type { DualRatingRecord } from './riskRating/dualRiskRating';

export interface PortfolioBookRibbon {
  readonly loanCount: number;
  readonly totalExposure: number;
  readonly criticizedCount: number;
  readonly classifiedCount: number;
  readonly unmappedRatingCount: number;
  readonly watchlistCount: number;
}

export interface PortfolioBookConcentrationRow {
  readonly label: string;
  readonly loanCount: number;
  readonly totalExposure: number;
  readonly sharePct: number;
}

export interface PortfolioBookMaturityBucket {
  readonly label: string;
  readonly loanCount: number;
  readonly totalExposure: number;
}

export interface PortfolioBookTopExposureRow {
  readonly loanId: string;
  readonly loanNumber?: string;
  readonly borrower?: string;
  readonly product?: string;
  readonly riskRating?: string;
  readonly portfolioManager?: string;
  readonly maturityDate?: string;
  readonly status?: string;
  readonly outstanding: number;
  readonly sharePct: number;
}

export interface PortfolioBookSnapshot {
  readonly isEmpty: boolean;
  readonly loans: readonly BoardedLoanRow[];
  readonly commandRibbon: PortfolioBookRibbon;
  /**
   * P2-16 — the exact boarded loans behind `commandRibbon.unmappedRatingCount`: rows that carry a
   * risk-rating string the dual-rating mapping could not resolve to an obligor grade. The count is
   * `unmappedRatingLoans.length` by construction, so the ribbon tile always reconciles with — and can
   * deep-link to — this record set.
   */
  readonly unmappedRatingLoans: readonly BoardedLoanRow[];
  readonly byBorrower: readonly PortfolioBookConcentrationRow[];
  readonly byProduct: readonly PortfolioBookConcentrationRow[];
  readonly byRiskRating: readonly PortfolioBookConcentrationRow[];
  readonly byPortfolioManager: readonly PortfolioBookConcentrationRow[];
  readonly exposureBands: readonly PortfolioBookConcentrationRow[];
  readonly maturityLadder: readonly PortfolioBookMaturityBucket[];
  readonly topExposures: readonly PortfolioBookTopExposureRow[];
}

const EXPOSURE_BANDS: readonly { readonly label: string; readonly min: number; readonly max?: number }[] = [
  { label: '< $500K', min: 0, max: 500_000 },
  { label: '$500K-$1MM', min: 500_000, max: 1_000_000 },
  { label: '$1MM-$5MM', min: 1_000_000, max: 5_000_000 },
  { label: '$5MM-$10MM', min: 5_000_000, max: 10_000_000 },
  { label: '> $10MM', min: 10_000_000 },
];

function exposure(row: BoardedLoanRow): number {
  return typeof row.outstanding === 'number' && Number.isFinite(row.outstanding)
    ? Math.max(0, row.outstanding)
    : 0;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function concentration(
  rows: readonly BoardedLoanRow[],
  totalExposure: number,
  labelFor: (row: BoardedLoanRow) => string,
): readonly PortfolioBookConcentrationRow[] {
  const grouped = new Map<string, { loanCount: number; totalExposure: number }>();
  for (const row of rows) {
    const label = labelFor(row);
    const current = grouped.get(label) ?? { loanCount: 0, totalExposure: 0 };
    grouped.set(label, {
      loanCount: current.loanCount + 1,
      totalExposure: current.totalExposure + exposure(row),
    });
  }
  return [...grouped.entries()]
    .map(([label, value]) => ({
      label,
      loanCount: value.loanCount,
      totalExposure: value.totalExposure,
      sharePct: pct(value.totalExposure, totalExposure),
    }))
    .sort((a, b) => b.totalExposure - a.totalExposure || a.label.localeCompare(b.label));
}

function exposureBand(row: BoardedLoanRow): string {
  const amount = exposure(row);
  return EXPOSURE_BANDS.find((band) => amount >= band.min && (band.max === undefined || amount < band.max))?.label ?? '< $500K';
}

function daysUntil(date: string | undefined, now: string): number | undefined {
  if (!date) return undefined;
  const due = Date.parse(date);
  const asOf = Date.parse(now);
  if (!Number.isFinite(due) || !Number.isFinite(asOf)) return undefined;
  return Math.ceil((due - asOf) / 86_400_000);
}

function maturityLabel(row: BoardedLoanRow, now: string): string {
  const days = daysUntil(row.maturityDate, now);
  if (days === undefined) return 'Unknown maturity';
  if (days < 0) return 'Past due/matured';
  if (days <= 30) return '0-30d';
  if (days <= 90) return '31-90d';
  if (days <= 180) return '91-180d';
  if (days <= 365) return '181-365d';
  return '>365d';
}

function maturityLadder(
  rows: readonly BoardedLoanRow[],
  now: string,
): readonly PortfolioBookMaturityBucket[] {
  const order = ['Past due/matured', '0-30d', '31-90d', '91-180d', '181-365d', '>365d', 'Unknown maturity'];
  const grouped = new Map<string, { loanCount: number; totalExposure: number }>();
  for (const label of order) grouped.set(label, { loanCount: 0, totalExposure: 0 });
  for (const row of rows) {
    const label = maturityLabel(row, now);
    const current = grouped.get(label) ?? { loanCount: 0, totalExposure: 0 };
    grouped.set(label, {
      loanCount: current.loanCount + 1,
      totalExposure: current.totalExposure + exposure(row),
    });
  }
  return order.map((label) => ({ label, ...(grouped.get(label) ?? { loanCount: 0, totalExposure: 0 }) }));
}

export function derivePortfolioBookSnapshot(
  loans: readonly BoardedLoanRow[],
  ratings: readonly DualRatingRecord[] = [],
  now = '1970-01-01T00:00:00.000Z',
): PortfolioBookSnapshot {
  const totalExposure = loans.reduce((sum, row) => sum + exposure(row), 0);
  const ratedLoanIds = new Set(ratings.map((rating) => rating.loanId).filter(Boolean));
  const criticizedCount = ratings.filter((rating) => rating.obligorGrade >= 5).length;
  const classifiedCount = ratings.filter((rating) => rating.obligorGrade >= 6).length;
  // P2-16 — one predicate feeds both the count and the drill-through list, so they can never diverge.
  const unmappedRatingLoans = loans.filter((row) => !ratedLoanIds.has(row.id));

  return {
    isEmpty: loans.length === 0,
    loans,
    unmappedRatingLoans,
    commandRibbon: {
      loanCount: loans.length,
      totalExposure,
      criticizedCount,
      classifiedCount,
      unmappedRatingCount: unmappedRatingLoans.length,
      watchlistCount: loans.filter((row) => row.watchlist).length,
    },
    byBorrower: concentration(loans, totalExposure, (row) => row.borrower ?? 'Unknown borrower'),
    byProduct: concentration(loans, totalExposure, (row) => row.extended?.product ?? 'Unknown product'),
    byRiskRating: concentration(loans, totalExposure, (row) => row.riskRating ?? 'Unknown risk rating'),
    byPortfolioManager: concentration(loans, totalExposure, (row) => row.portfolioManager ?? 'Unassigned'),
    exposureBands: concentration(loans, totalExposure, exposureBand),
    maturityLadder: maturityLadder(loans, now),
    topExposures: [...loans]
      .sort((a, b) => exposure(b) - exposure(a) || a.id.localeCompare(b.id))
      .slice(0, 10)
      .map((row) => ({
        loanId: row.id,
        loanNumber: row.loanNumber,
        borrower: row.borrower,
        product: row.extended?.product,
        riskRating: row.riskRating,
        portfolioManager: row.portfolioManager,
        maturityDate: row.maturityDate,
        status: row.status,
        outstanding: exposure(row),
        sharePct: pct(exposure(row), totalExposure),
      })),
  };
}
