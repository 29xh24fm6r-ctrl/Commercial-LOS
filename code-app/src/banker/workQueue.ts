import type { PipelineDeal } from './dealQueries';
import type {
  BankerWorkQueueData,
  WorkQueueDocumentRow,
  WorkQueueMemoRow,
  WorkQueueTaskRow,
} from './workQueueQueries';

/**
 * Phase 32: banker My Work Queue — pure derivation.
 *
 * Builds an ordered list of work items from already-authorized
 * banker-scoped data (deals + open tasks + outstanding documents +
 * memos). No I/O, no shared state. The function deliberately keeps
 * its rules SIMPLER than the deal-workspace blockerRules /
 * creditMemoFreshness — the queue surfaces "what needs the banker's
 * attention today", not the deep cause analysis those cards do.
 *
 * Severity ordering (highest to lowest):
 *   blocked       — deal-level true blocker (past target close by
 *                   >= BLOCKED_PAST_CLOSE_DAYS)
 *   overdue       — task / document past its due date
 *   at-risk       — past target close (<7d), stale stage, memo
 *                   review needed
 *   upcoming      — closing within next CLOSING_SOON_DAYS
 *
 * Sort within tier: most-urgent first (largest overdue days first,
 * nearest closing date first).
 */

export type WorkQueueItemType =
  | 'blocked-deal'
  | 'overdue-task'
  | 'overdue-document'
  | 'at-risk-deal'
  | 'memo-review'
  | 'closing-soon';

export type WorkQueueSeverity = 'blocked' | 'overdue' | 'at-risk' | 'upcoming';

export interface WorkQueueItem {
  id: string;
  type: WorkQueueItemType;
  severity: WorkQueueSeverity;
  dealId: string;
  dealName: string;
  title: string;
  reason: string;
  /** ISO date relevant to the item (due date, target close date,
   *  memo generated date). Optional. */
  dateIso: string | undefined;
  /** Numeric sort key — higher means more urgent. */
  sortKey: number;
}

export interface DeriveWorkQueueInput {
  data: BankerWorkQueueData;
  now?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BLOCKED_PAST_CLOSE_DAYS = 7;
const STALE_STAGE_AT_RISK_DAYS = 30;
const CLOSING_SOON_DAYS = 14;

const TIER_RANK: Record<WorkQueueSeverity, number> = {
  blocked: 4,
  overdue: 3,
  'at-risk': 2,
  upcoming: 1,
};

export function deriveBankerWorkQueue(input: DeriveWorkQueueInput): WorkQueueItem[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const items: WorkQueueItem[] = [];

  const dealById = new Map<string, PipelineDeal>();
  for (const d of input.data.deals) dealById.set(d.id, d);

  // Pre-compute per-deal task/doc/memo lookups so deal-level items
  // can correlate (e.g. "memo review" uses deal blockers as a hint).
  const overdueTasksByDeal = new Map<string, number>();
  for (const t of input.data.tasks) {
    if (t.completed) continue;
    if (isPastDue(t.dueDate, nowMs)) {
      overdueTasksByDeal.set(t.dealId, (overdueTasksByDeal.get(t.dealId) ?? 0) + 1);
    }
  }
  const overdueDocsByDeal = new Map<string, number>();
  for (const d of input.data.outstandingDocuments) {
    if (isPastDue(d.dueDate, nowMs)) {
      overdueDocsByDeal.set(d.dealId, (overdueDocsByDeal.get(d.dealId) ?? 0) + 1);
    }
  }
  const memosByDeal = new Map<string, WorkQueueMemoRow[]>();
  for (const m of input.data.memos) {
    const list = memosByDeal.get(m.dealId) ?? [];
    list.push(m);
    memosByDeal.set(m.dealId, list);
  }

  // 1. Deal-level signals: blocked / at-risk / closing soon / memo review.
  for (const deal of input.data.deals) {
    if (deal.isClosed) continue;
    pushDealSignals({
      deal,
      now,
      nowMs,
      overdueTasks: overdueTasksByDeal.get(deal.id) ?? 0,
      overdueDocs: overdueDocsByDeal.get(deal.id) ?? 0,
      memos: memosByDeal.get(deal.id) ?? [],
      items,
    });
  }

  // 2. Task-level overdue items.
  for (const t of input.data.tasks) {
    if (t.completed) continue;
    if (!isPastDue(t.dueDate, nowMs)) continue;
    const deal = dealById.get(t.dealId);
    if (!deal || deal.isClosed) continue;
    items.push(taskOverdueItem(t, deal, nowMs));
  }

  // 3. Document-level overdue items.
  for (const d of input.data.outstandingDocuments) {
    if (!isPastDue(d.dueDate, nowMs)) continue;
    const deal = dealById.get(d.dealId);
    if (!deal || deal.isClosed) continue;
    items.push(documentOverdueItem(d, deal, nowMs));
  }

  // Sort by sortKey desc (most urgent first). Ties broken by deal
  // name for deterministic ordering across renders.
  items.sort((a, b) => {
    if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
    return a.dealName.localeCompare(b.dealName);
  });
  return items;
}

function pushDealSignals(opts: {
  deal: PipelineDeal;
  now: Date;
  nowMs: number;
  overdueTasks: number;
  overdueDocs: number;
  memos: WorkQueueMemoRow[];
  items: WorkQueueItem[];
}): void {
  const { deal, overdueTasks, overdueDocs, memos, items } = opts;

  // Blocked: past target close by >= BLOCKED_PAST_CLOSE_DAYS.
  const closeDays = daysFromNow(deal.targetCloseDate, opts.nowMs);
  if (closeDays != null && closeDays <= -BLOCKED_PAST_CLOSE_DAYS) {
    const overdueDays = Math.abs(closeDays);
    items.push({
      id: `${deal.id}::blocked-deal`,
      type: 'blocked-deal',
      severity: 'blocked',
      dealId: deal.id,
      dealName: deal.name,
      title: deal.name,
      reason: `Target close was ${overdueDays} days ago and the deal is still open.`,
      dateIso: deal.targetCloseDate,
      sortKey: tierBase('blocked') + overdueDays,
    });
    // A deal that is blocked already counts; do NOT also push at-risk.
  } else if (closeDays != null && closeDays < 0) {
    // Past target close but less than the blocked threshold → at-risk.
    const overdueDays = Math.abs(closeDays);
    items.push({
      id: `${deal.id}::at-risk-past-close`,
      type: 'at-risk-deal',
      severity: 'at-risk',
      dealId: deal.id,
      dealName: deal.name,
      title: deal.name,
      reason: `Target close was ${overdueDays === 0 ? 'today' : `${overdueDays} day(s) ago`}; not yet at the blocked threshold.`,
      dateIso: deal.targetCloseDate,
      sortKey: tierBase('at-risk') + overdueDays,
    });
  }

  // Stale stage (deal sits in the same stage > STALE_STAGE_AT_RISK_DAYS).
  const stageDays = daysFromNow(deal.stageEntryDate, opts.nowMs);
  if (stageDays != null && stageDays < 0) {
    const inStageDays = Math.abs(stageDays);
    if (inStageDays > STALE_STAGE_AT_RISK_DAYS) {
      items.push({
        id: `${deal.id}::stale-stage`,
        type: 'at-risk-deal',
        severity: 'at-risk',
        dealId: deal.id,
        dealName: deal.name,
        title: deal.name,
        reason: `In "${deal.stage ?? 'current stage'}" for ${inStageDays} days (past ${STALE_STAGE_AT_RISK_DAYS}-day at-risk threshold).`,
        dateIso: deal.stageEntryDate,
        sortKey: tierBase('at-risk') + inStageDays / 100, // smaller bump
      });
    }
  }

  // Memo review needed:
  //   - Any memo statusKey === 'stale', OR
  //   - A final memo exists AND the deal has overdue tasks/docs since
  //     the memo was generated.
  const staleMemo = memos.find((m) => m.statusKey === 'stale');
  if (staleMemo) {
    items.push({
      id: `${deal.id}::memo-review-stale`,
      type: 'memo-review',
      severity: 'at-risk',
      dealId: deal.id,
      dealName: deal.name,
      title: deal.name,
      reason: `Memo "${staleMemo.name}" is marked stale in Dataverse — review recommended.`,
      dateIso: staleMemo.modifiedOn ?? staleMemo.generatedAt,
      sortKey: tierBase('at-risk') + 5,
    });
  } else {
    const finalMemo = memos.find((m) => m.statusKey === 'final');
    if (finalMemo && (overdueTasks > 0 || overdueDocs > 0)) {
      items.push({
        id: `${deal.id}::memo-review-newer-events`,
        type: 'memo-review',
        severity: 'at-risk',
        dealId: deal.id,
        dealName: deal.name,
        title: deal.name,
        reason: `Final memo "${finalMemo.name}" on file, but ${overdueTasks} overdue task(s) and ${overdueDocs} overdue document(s) remain.`,
        dateIso: finalMemo.modifiedOn ?? finalMemo.generatedAt,
        sortKey: tierBase('at-risk') + 4,
      });
    }
  }

  // Closing soon: targetCloseDate within next CLOSING_SOON_DAYS and
  // not already counted as blocked / at-risk-past-close.
  if (closeDays != null && closeDays >= 0 && closeDays <= CLOSING_SOON_DAYS) {
    items.push({
      id: `${deal.id}::closing-soon`,
      type: 'closing-soon',
      severity: 'upcoming',
      dealId: deal.id,
      dealName: deal.name,
      title: deal.name,
      reason:
        closeDays === 0
          ? 'Targeted to close today.'
          : `Targeted to close in ${closeDays} day(s).`,
      dateIso: deal.targetCloseDate,
      sortKey: tierBase('upcoming') + (CLOSING_SOON_DAYS - closeDays),
    });
  }
}

function taskOverdueItem(
  t: WorkQueueTaskRow,
  deal: PipelineDeal,
  nowMs: number,
): WorkQueueItem {
  const days = daysFromNow(t.dueDate, nowMs);
  const overdueDays = days != null ? Math.abs(days) : 0;
  return {
    id: `${t.id}::overdue-task`,
    type: 'overdue-task',
    severity: 'overdue',
    dealId: deal.id,
    dealName: deal.name,
    title: t.title,
    reason: `Open task overdue by ${overdueDays} day(s) on "${deal.name}".`,
    dateIso: t.dueDate,
    sortKey: tierBase('overdue') + overdueDays,
  };
}

function documentOverdueItem(
  d: WorkQueueDocumentRow,
  deal: PipelineDeal,
  nowMs: number,
): WorkQueueItem {
  const days = daysFromNow(d.dueDate, nowMs);
  const overdueDays = days != null ? Math.abs(days) : 0;
  return {
    id: `${d.id}::overdue-document`,
    type: 'overdue-document',
    severity: 'overdue',
    dealId: deal.id,
    dealName: deal.name,
    title: d.name,
    reason: `Outstanding document overdue by ${overdueDays} day(s) on "${deal.name}".`,
    dateIso: d.dueDate,
    sortKey: tierBase('overdue') + overdueDays,
  };
}

function tierBase(s: WorkQueueSeverity): number {
  // Each tier gets a 10_000-wide window so per-tier day-counts don't
  // bleed across tiers. A blocked item is always above any overdue
  // item, regardless of how many days the overdue item is past due.
  return TIER_RANK[s] * 10_000;
}

function isPastDue(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && ms < nowMs;
}

function daysFromNow(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  // Calendar-day differencing: normalize each timestamp to its
  // start-of-UTC-day before subtracting. This gives the
  // banker-intuitive day count (May 13 → May 20 = 7 days, not 6.5)
  // regardless of the time of day either timestamp carries.
  const targetDay = Math.floor(ms / MS_PER_DAY);
  const nowDay = Math.floor(nowMs / MS_PER_DAY);
  return targetDay - nowDay;
}
