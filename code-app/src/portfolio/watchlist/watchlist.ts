/**
 * Phase PE-7 — Problem credit / watchlist workflow.
 *
 * A PURE, deterministic engine that assembles the watchlist from criticized
 * ratings (PE-5) and manual watch flags, tracks per-loan action plans and
 * workout / OREO status, groups the board by classification with aging, and
 * measures the criticized / classified trend against a prior snapshot.
 *
 * Discipline: pure, no IO, no clock (caller passes `now`). Nothing fabricated —
 * a loan is on the watchlist only when it is genuinely criticized or flagged.
 */

import type { RegulatoryClassification } from '../riskRating/dualRiskRating';

export type ActionPlanStatus = 'open' | 'in_progress' | 'complete';

export interface ActionPlan {
  readonly owner?: string;
  readonly dueDate?: string;
  readonly status: ActionPlanStatus;
  readonly nextStep?: string;
}

export interface WatchlistInput {
  readonly loanId: string;
  readonly borrower?: string;
  readonly exposure?: number;
  /** Regulatory classification from the dual rating (Pass means not classified). */
  readonly classification?: RegulatoryClassification;
  /** Manual watch flag set by the banker/credit admin. */
  readonly watchFlag?: boolean;
  /** When the credit was first flagged / criticized (for aging). */
  readonly openedDate?: string;
  readonly actionPlan?: ActionPlan;
  readonly workoutStatus?: string;
  readonly oreoStatus?: string;
  readonly impairmentAmount?: number;
}

export interface WatchlistEntry {
  readonly loanId: string;
  readonly borrower?: string;
  readonly exposure: number;
  readonly classification: RegulatoryClassification | 'Watch';
  readonly watchReason: string;
  readonly criticized: boolean;
  readonly classified: boolean;
  readonly agedDays: number | undefined;
  readonly actionPlan?: ActionPlan;
  readonly actionPlanOverdue: boolean;
  readonly workoutStatus?: string;
  readonly oreoStatus?: string;
  readonly impairmentAmount?: number;
}

export interface WatchlistGroup {
  readonly classification: WatchlistEntry['classification'];
  readonly count: number;
  readonly exposure: number;
}

export interface WatchlistBoard {
  readonly entries: readonly WatchlistEntry[];
  readonly totalExposure: number;
  readonly criticizedCount: number;
  readonly classifiedCount: number;
  readonly actionPlansOverdue: number;
  readonly groups: readonly WatchlistGroup[];
}

const GROUP_ORDER: readonly WatchlistEntry['classification'][] = [
  'Watch',
  'Special Mention',
  'Substandard',
  'Doubtful',
  'Loss',
];

function num(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function daysBetween(fromIso: string | undefined, toIso: string): number | undefined {
  if (!fromIso) return undefined;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return undefined;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

const CLASSIFIED = new Set<RegulatoryClassification>(['Substandard', 'Doubtful', 'Loss']);

/** Assemble the watchlist board from criticized ratings + manual watch flags. */
export function deriveWatchlist(inputs: readonly WatchlistInput[], now: string): WatchlistBoard {
  const entries: WatchlistEntry[] = [];

  for (const i of inputs) {
    const criticizedByRating = i.classification != null && i.classification !== 'Pass';
    const onWatch = criticizedByRating || i.watchFlag === true;
    if (!onWatch) continue;

    const classification: WatchlistEntry['classification'] = criticizedByRating ? i.classification! : 'Watch';
    const classified = i.classification != null && CLASSIFIED.has(i.classification);
    const actionPlanOverdue =
      Boolean(i.actionPlan) &&
      i.actionPlan!.status !== 'complete' &&
      typeof i.actionPlan!.dueDate === 'string' &&
      Date.parse(i.actionPlan!.dueDate) < Date.parse(now);

    entries.push({
      loanId: i.loanId,
      borrower: i.borrower,
      exposure: num(i.exposure),
      classification,
      watchReason: criticizedByRating ? `Classified ${i.classification}` : 'Manual watch flag',
      criticized: true,
      classified,
      agedDays: daysBetween(i.openedDate, now),
      actionPlan: i.actionPlan,
      actionPlanOverdue,
      workoutStatus: i.workoutStatus,
      oreoStatus: i.oreoStatus,
      impairmentAmount: i.impairmentAmount,
    });
  }

  // Sort worst classification first, then largest exposure, then oldest.
  entries.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(b.classification) - GROUP_ORDER.indexOf(a.classification) ||
      b.exposure - a.exposure ||
      (b.agedDays ?? 0) - (a.agedDays ?? 0),
  );

  // Board groups read worst classification first.
  const groups = [...GROUP_ORDER]
    .reverse()
    .map((classification) => {
      const g = entries.filter((e) => e.classification === classification);
      return { classification, count: g.length, exposure: g.reduce((s, e) => s + e.exposure, 0) };
    })
    .filter((g) => g.count > 0);

  return {
    entries,
    totalExposure: entries.reduce((s, e) => s + e.exposure, 0),
    criticizedCount: entries.length,
    classifiedCount: entries.filter((e) => e.classified).length,
    actionPlansOverdue: entries.filter((e) => e.actionPlanOverdue).length,
    groups,
  };
}

export interface CriticizedClassifiedTrend {
  readonly criticizedDelta: number;
  readonly classifiedDelta: number;
  readonly exposureDelta: number;
  readonly direction: 'improving' | 'deteriorating' | 'flat';
}

/** Compare a prior snapshot to the current board (a rising trend deteriorates). */
export function deriveCriticizedClassifiedTrend(
  prior: { criticizedCount: number; classifiedCount: number; totalExposure: number },
  current: WatchlistBoard,
): CriticizedClassifiedTrend {
  const criticizedDelta = current.criticizedCount - prior.criticizedCount;
  const classifiedDelta = current.classifiedCount - prior.classifiedCount;
  const exposureDelta = current.totalExposure - prior.totalExposure;
  const direction = classifiedDelta > 0 || criticizedDelta > 0 ? 'deteriorating' : classifiedDelta < 0 || criticizedDelta < 0 ? 'improving' : 'flat';
  return { criticizedDelta, classifiedDelta, exposureDelta, direction };
}
