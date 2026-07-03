/**
 * Phase PE-9 — Covenant monitoring + annual-review cadence.
 *
 * PURE, deterministic covenant testing from spread financials (DSCR, leverage,
 * min liquidity, tangible net worth, current ratio) with breach / cure / waiver
 * handling and an early-warning "trend to breach" flag when headroom is thin, and
 * a grade-driven review cadence (worse grade → more frequent review) with a
 * due/overdue queue.
 *
 * Discipline: pure, no IO, no clock (caller passes `now`). Ratios computed from
 * real supplied financials; a missing input yields no ratio, not a fabricated one.
 */

export type CovenantType = 'dscr' | 'leverage' | 'min_liquidity' | 'tangible_net_worth' | 'current_ratio';
export type CovenantStatus = 'compliant' | 'at_risk' | 'in_cure' | 'breach' | 'waived' | 'not_available';

export interface SpreadFinancials {
  readonly ebitda?: number;
  readonly totalDebtService?: number;
  readonly totalDebt?: number;
  readonly tangibleNetWorth?: number;
  readonly currentAssets?: number;
  readonly currentLiabilities?: number;
  readonly liquidity?: number;
}

export interface CovenantDefinition {
  readonly type: CovenantType;
  readonly threshold: number;
  /** 'min' = actual must stay ≥ threshold (DSCR); 'max' = actual must stay ≤ threshold (leverage). */
  readonly operator: 'min' | 'max';
  readonly cureDays?: number;
  readonly breachDate?: string;
  readonly waived?: boolean;
  readonly waiverExpires?: string;
}

export interface CovenantResult {
  readonly type: CovenantType;
  readonly actual: number | undefined;
  readonly threshold: number;
  readonly operator: 'min' | 'max';
  readonly status: CovenantStatus;
  readonly headroomPct: number | undefined;
  readonly cureBy?: string;
}

export interface CovenantTestResult {
  readonly results: readonly CovenantResult[];
  readonly breachCount: number;
  readonly atRiskCount: number;
  readonly inCureCount: number;
  readonly worstStatus: CovenantStatus;
}

/** Headroom below which a still-compliant covenant is flagged trend-to-breach, percent. */
const AT_RISK_HEADROOM_PCT = 5;

function num(n: number | undefined | null): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
function ratio(a: number | undefined, b: number | undefined): number | undefined {
  const x = num(a);
  const y = num(b);
  if (x === undefined || y === undefined || y === 0) return undefined;
  return Math.round((x / y) * 1000) / 1000;
}

/** Compute the actual value for a covenant type from the spread financials. */
export function actualForCovenant(type: CovenantType, f: SpreadFinancials): number | undefined {
  switch (type) {
    case 'dscr':
      return ratio(f.ebitda, f.totalDebtService);
    case 'leverage':
      return ratio(f.totalDebt, f.ebitda);
    case 'current_ratio':
      return ratio(f.currentAssets, f.currentLiabilities);
    case 'min_liquidity':
      return num(f.liquidity);
    case 'tangible_net_worth':
      return num(f.tangibleNetWorth);
  }
}

function headroomPct(actual: number, threshold: number, operator: 'min' | 'max'): number {
  if (threshold === 0) return 0;
  const raw = operator === 'min' ? (actual - threshold) / Math.abs(threshold) : (threshold - actual) / Math.abs(threshold);
  return Math.round(raw * 1000) / 10;
}

function addDays(iso: string, days: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

const STATUS_SEVERITY: Record<CovenantStatus, number> = {
  breach: 0,
  in_cure: 1,
  at_risk: 2,
  waived: 3,
  not_available: 4,
  compliant: 5,
};

export function deriveCovenantTests(
  financials: SpreadFinancials,
  covenants: readonly CovenantDefinition[],
  now: string,
): CovenantTestResult {
  const results = covenants.map<CovenantResult>((c) => {
    const actual = actualForCovenant(c.type, financials);

    if (actual === undefined) {
      return { type: c.type, actual: undefined, threshold: c.threshold, operator: c.operator, status: 'not_available', headroomPct: undefined };
    }

    const compliant = c.operator === 'min' ? actual >= c.threshold : actual <= c.threshold;
    const hp = headroomPct(actual, c.threshold, c.operator);

    if (c.waived && (!c.waiverExpires || Date.parse(c.waiverExpires) >= Date.parse(now))) {
      return { type: c.type, actual, threshold: c.threshold, operator: c.operator, status: 'waived', headroomPct: hp };
    }

    if (!compliant) {
      const cureBy = c.cureDays && c.breachDate ? addDays(c.breachDate, c.cureDays) : undefined;
      const inCure = Boolean(cureBy) && Date.parse(now) <= Date.parse(cureBy!);
      return { type: c.type, actual, threshold: c.threshold, operator: c.operator, status: inCure ? 'in_cure' : 'breach', headroomPct: hp, cureBy };
    }

    const status: CovenantStatus = hp <= AT_RISK_HEADROOM_PCT ? 'at_risk' : 'compliant';
    return { type: c.type, actual, threshold: c.threshold, operator: c.operator, status, headroomPct: hp };
  });

  const worstStatus = results.reduce<CovenantStatus>(
    (worst, r) => (STATUS_SEVERITY[r.status] < STATUS_SEVERITY[worst] ? r.status : worst),
    'compliant',
  );

  return {
    results,
    breachCount: results.filter((r) => r.status === 'breach').length,
    atRiskCount: results.filter((r) => r.status === 'at_risk').length,
    inCureCount: results.filter((r) => r.status === 'in_cure').length,
    worstStatus,
  };
}

// ---------------------------------------------------------------------------
// Review cadence by grade + review queue
// ---------------------------------------------------------------------------

/** Months between reviews, driven by the loan grade (worse grade → more often). */
export function deriveReviewCadence(grade: number | undefined): number {
  const g = num(grade) ?? 4;
  if (g >= 7) return 1;
  if (g >= 6) return 3;
  if (g >= 5) return 6;
  return 12;
}

export type ReviewDueStatus = 'current' | 'due_soon' | 'overdue';

export interface ReviewQueueLoanInput {
  readonly loanId: string;
  readonly grade?: number;
  readonly lastReviewDate?: string;
}

export interface ReviewQueueEntry {
  readonly loanId: string;
  readonly grade: number | undefined;
  readonly cadenceMonths: number;
  readonly nextReviewDate: string | undefined;
  readonly status: ReviewDueStatus;
  readonly daysUntilDue: number | undefined;
}

const DUE_SOON_DAYS = 30;

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function deriveReviewQueue(loans: readonly ReviewQueueLoanInput[], now: string): {
  entries: readonly ReviewQueueEntry[];
  overdue: number;
  dueSoon: number;
} {
  const entries = loans.map<ReviewQueueEntry>((l) => {
    const cadenceMonths = deriveReviewCadence(l.grade);
    const nextReviewDate = l.lastReviewDate ? addMonths(l.lastReviewDate, cadenceMonths) : undefined;
    let status: ReviewDueStatus;
    let daysUntilDue: number | undefined;
    if (nextReviewDate) {
      daysUntilDue = Math.round((Date.parse(nextReviewDate) - Date.parse(now)) / 86_400_000);
      status = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= DUE_SOON_DAYS ? 'due_soon' : 'current';
    } else {
      // No prior review recorded → treat as overdue (a review is owed).
      status = 'overdue';
    }
    return { loanId: l.loanId, grade: l.grade, cadenceMonths, nextReviewDate, status, daysUntilDue };
  });

  const order: Record<ReviewDueStatus, number> = { overdue: 0, due_soon: 1, current: 2 };
  const sorted = [...entries].sort((a, b) => order[a.status] - order[b.status] || (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));

  return {
    entries: sorted,
    overdue: entries.filter((e) => e.status === 'overdue').length,
    dueSoon: entries.filter((e) => e.status === 'due_soon').length,
  };
}
