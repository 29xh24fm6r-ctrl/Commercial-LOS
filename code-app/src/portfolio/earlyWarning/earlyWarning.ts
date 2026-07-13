/**
 * Phase PE-10 — Early-warning engine.
 * Phase 264 (P3) — adds portfolio-level concentration + stress-sensitivity signals.
 *
 * A PURE, deterministic engine that scores per-loan risk signals — past-due
 * trend, covenant trending to breach (PE-9), rating downgrade (PE-5), stale
 * financials / ticklers (PE-6), maturity approaching without renewal, deposit
 * decline / overdrafts, sector stress, this loan's share of total portfolio
 * exposure, and stress-test sensitivity (Phase 264) — then dedups them into
 * one prioritized alert per loan with an SLA and assignment. This is the
 * "what needs me now" work queue for the booked book.
 *
 * This is a HEURISTIC composite score (signal scores summed), not a trained
 * predictive model — there is no historical loss/default dataset in this
 * system to train one on, and fabricating one would violate this codebase's
 * no-fabrication discipline. Every signal traces to a concrete, named input.
 *
 * Discipline: pure, no IO, no clock (caller passes `now`). A signal fires only on
 * real supplied evidence; nothing is fabricated.
 */

export type SignalType =
  | 'past_due'
  | 'covenant'
  | 'rating_downgrade'
  | 'stale_financials'
  | 'tickler'
  | 'maturity_no_renewal'
  | 'dda_decline'
  | 'overdraft'
  | 'sector_stress'
  | 'concentration_exposure'
  | 'stress_sensitivity';

export type SignalCategory = 'delinquency' | 'covenant' | 'rating' | 'documentation' | 'maturity' | 'deposit' | 'sector' | 'concentration' | 'stress';
export type SignalPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Phase 264 (P3) — a stress-test engine's pre-computed sensitivity classification
 * for this loan (e.g. from a rate/NOI/collateral shock scenario). Decoupled by
 * design: this module takes a plain enum, not a stress-test engine's types, so
 * the two subsystems stay independent.
 */
export type StressSensitivity = 'low' | 'moderate' | 'high';

export interface EarlyWarningInput {
  readonly loanId: string;
  readonly borrower?: string;
  readonly owner?: string;
  readonly now: string;
  readonly pastDueDays?: number;
  readonly covenantStatus?: 'compliant' | 'at_risk' | 'in_cure' | 'breach' | 'waived' | 'not_available';
  readonly ratingMigration?: 'upgrade' | 'downgrade' | 'affirmed';
  readonly overdueFinancials?: boolean;
  readonly overdueTicklers?: number;
  readonly maturityDate?: string;
  readonly renewalInProgress?: boolean;
  readonly ddaBalanceDeclinePct?: number;
  readonly overdraftCount?: number;
  readonly sectorStress?: boolean;
  readonly sector?: string;
  /** Phase 264 (P3) — this loan's share of total portfolio exposure (0-100). */
  readonly concentrationSharePct?: number;
  /** Phase 264 (P3) — a stress-test engine's sensitivity classification for this loan. */
  readonly stressSensitivity?: StressSensitivity;
}

export interface EarlyWarningSignal {
  readonly type: SignalType;
  readonly category: SignalCategory;
  readonly priority: SignalPriority;
  readonly score: number;
  readonly message: string;
}

export interface EarlyWarningAlert {
  readonly loanId: string;
  readonly borrower?: string;
  readonly owner?: string;
  readonly priority: SignalPriority;
  readonly score: number;
  readonly signals: readonly EarlyWarningSignal[];
  readonly slaDays: number;
  readonly dueDate: string;
}

export interface EarlyWarningQueue {
  readonly alerts: readonly EarlyWarningAlert[];
  readonly signalCount: number;
  readonly criticalCount: number;
  readonly highCount: number;
  readonly byType: readonly { readonly type: SignalType; readonly count: number }[];
}

const PRIORITY_RANK: Record<SignalPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SLA_BY_PRIORITY: Record<SignalPriority, number> = { critical: 3, high: 7, medium: 14, low: 30 };

function num(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}
function priorityForScore(score: number): SignalPriority {
  return score >= 90 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
}
function signal(type: SignalType, category: SignalCategory, score: number, message: string): EarlyWarningSignal {
  return { type, category, priority: priorityForScore(score), score, message };
}
function daysUntil(now: string, date: string): number {
  return Math.round((Date.parse(date) - Date.parse(now)) / 86_400_000);
}
function addDays(iso: string, days: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** Evaluate every signal rule for one loan (only firing rules are returned). */
export function deriveLoanSignals(input: EarlyWarningInput): readonly EarlyWarningSignal[] {
  const out: EarlyWarningSignal[] = [];
  const pd = num(input.pastDueDays);
  if (pd >= 90) out.push(signal('past_due', 'delinquency', 100, `${pd} days past due`));
  else if (pd >= 60) out.push(signal('past_due', 'delinquency', 70, `${pd} days past due`));
  else if (pd >= 30) out.push(signal('past_due', 'delinquency', 45, `${pd} days past due`));
  else if (pd >= 15) out.push(signal('past_due', 'delinquency', 25, `${pd} days past due`));

  switch (input.covenantStatus) {
    case 'breach':
      out.push(signal('covenant', 'covenant', 90, 'Covenant in breach'));
      break;
    case 'in_cure':
      out.push(signal('covenant', 'covenant', 60, 'Covenant breach in cure period'));
      break;
    case 'at_risk':
      out.push(signal('covenant', 'covenant', 40, 'Covenant trending to breach'));
      break;
  }

  if (input.ratingMigration === 'downgrade') out.push(signal('rating_downgrade', 'rating', 60, 'Risk rating downgraded'));
  if (input.overdueFinancials) out.push(signal('stale_financials', 'documentation', 35, 'Current financials past due'));
  if (num(input.overdueTicklers) > 0) out.push(signal('tickler', 'documentation', Math.min(40, 15 + num(input.overdueTicklers) * 5), `${num(input.overdueTicklers)} overdue tickler(s)`));

  if (input.maturityDate && input.renewalInProgress !== true) {
    const d = daysUntil(input.now, input.maturityDate);
    if (d >= 0 && d <= 30) out.push(signal('maturity_no_renewal', 'maturity', 55, `Matures in ${d}d with no renewal in progress`));
    else if (d > 30 && d <= 90) out.push(signal('maturity_no_renewal', 'maturity', 35, `Matures in ${d}d with no renewal in progress`));
    else if (d < 0) out.push(signal('maturity_no_renewal', 'maturity', 80, `Matured ${-d}d ago with no renewal`));
  }

  if (num(input.ddaBalanceDeclinePct) >= 25) out.push(signal('dda_decline', 'deposit', 35, `Deposit balance down ${num(input.ddaBalanceDeclinePct)}%`));
  const od = num(input.overdraftCount);
  if (od >= 3) out.push(signal('overdraft', 'deposit', 35, `${od} recent overdrafts`));
  else if (od >= 1) out.push(signal('overdraft', 'deposit', 20, `${od} recent overdraft(s)`));

  if (input.sectorStress) out.push(signal('sector_stress', 'sector', 30, `Sector stress${input.sector ? `: ${input.sector}` : ''}`));

  const share = num(input.concentrationSharePct);
  if (share >= 10) out.push(signal('concentration_exposure', 'concentration', 50, `${share}% of total portfolio exposure`));
  else if (share >= 5) out.push(signal('concentration_exposure', 'concentration', 30, `${share}% of total portfolio exposure`));
  else if (share >= 2) out.push(signal('concentration_exposure', 'concentration', 15, `${share}% of total portfolio exposure`));

  if (input.stressSensitivity === 'high') out.push(signal('stress_sensitivity', 'stress', 55, 'High sensitivity to stress-test scenario'));
  else if (input.stressSensitivity === 'moderate') out.push(signal('stress_sensitivity', 'stress', 30, 'Moderate sensitivity to stress-test scenario'));

  return out.sort((a, b) => b.score - a.score);
}

/** Score, dedup, and prioritize signals into one alert per loan. */
export function deriveEarlyWarningQueue(inputs: readonly EarlyWarningInput[]): EarlyWarningQueue {
  const alerts: EarlyWarningAlert[] = [];
  const typeCounts = new Map<SignalType, number>();
  let signalCount = 0;

  for (const input of inputs) {
    const signals = deriveLoanSignals(input);
    if (signals.length === 0) continue;
    signalCount += signals.length;
    for (const s of signals) typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1);

    const score = signals.reduce((sum, s) => sum + s.score, 0);
    const priority = signals.reduce<SignalPriority>((p, s) => (PRIORITY_RANK[s.priority] < PRIORITY_RANK[p] ? s.priority : p), 'low');
    const slaDays = SLA_BY_PRIORITY[priority];

    alerts.push({
      loanId: input.loanId,
      borrower: input.borrower,
      owner: input.owner,
      priority,
      score,
      signals,
      slaDays,
      dueDate: addDays(input.now, slaDays),
    });
  }

  alerts.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.score - a.score || a.loanId.localeCompare(b.loanId));

  return {
    alerts,
    signalCount,
    criticalCount: alerts.filter((a) => a.priority === 'critical').length,
    highCount: alerts.filter((a) => a.priority === 'high').length,
    byType: [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  };
}
