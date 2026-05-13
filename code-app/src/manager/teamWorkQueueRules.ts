import type { TeamDeal } from './managerQueries';
import type {
  TeamWorkQueueChildren,
  TeamWorkQueueDocumentRow,
  TeamWorkQueueMemoRow,
  TeamWorkQueueTaskRow,
} from './teamWorkQueueQueries';

/**
 * Phase 33: manager-team Work Queue — pure derivation.
 *
 * Structurally similar to the banker queue (Phase 32) but
 * INTENTIONALLY a separate module so the manager workspace never
 * imports banker code. The rules are deliberately simpler than the
 * deal-workspace blockerRules / creditMemoFreshness — this queue
 * surfaces "what needs the team's attention today", not deep cause
 * analysis.
 *
 * Manager-specific signals:
 *   - assignedBanker is included on every item so the manager can
 *     route work without a drill-through into the deal record.
 *   - unassigned-banker fires when a team deal has no assigned
 *     banker on file (manager visibility into routing gaps).
 *
 * Severity tiers (highest to lowest):
 *   blocked  — past target close by >= BLOCKED_PAST_CLOSE_DAYS, OR
 *              unassigned banker on an in-flight deal
 *   overdue  — task or outstanding document past its due date
 *   at-risk  — past target close (< BLOCKED threshold), stale stage,
 *              or memo review needed
 *   upcoming — closing within CLOSING_SOON_DAYS
 */

export type TeamWorkQueueItemType =
  | 'blocked-deal'
  | 'unassigned-banker'
  | 'overdue-task'
  | 'overdue-document'
  | 'at-risk-deal'
  | 'memo-review'
  | 'closing-soon';

export type TeamWorkQueueSeverity = 'blocked' | 'overdue' | 'at-risk' | 'upcoming';

export interface TeamWorkQueueItem {
  id: string;
  type: TeamWorkQueueItemType;
  severity: TeamWorkQueueSeverity;
  dealId: string;
  dealName: string;
  /** Banker assigned to the deal, if any. Surfaced verbatim from
   *  TeamDeal.assignedBankerName. */
  bankerName: string | undefined;
  title: string;
  reason: string;
  dateIso: string | undefined;
  sortKey: number;
}

export interface DeriveTeamWorkQueueInput {
  deals: readonly TeamDeal[];
  children: TeamWorkQueueChildren;
  now?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BLOCKED_PAST_CLOSE_DAYS = 7;
const STALE_STAGE_AT_RISK_DAYS = 30;
const CLOSING_SOON_DAYS = 14;

const TIER_RANK: Record<TeamWorkQueueSeverity, number> = {
  blocked: 4,
  overdue: 3,
  'at-risk': 2,
  upcoming: 1,
};

export function deriveTeamWorkQueue(
  input: DeriveTeamWorkQueueInput,
): TeamWorkQueueItem[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const items: TeamWorkQueueItem[] = [];

  const dealById = new Map<string, TeamDeal>();
  for (const d of input.deals) dealById.set(d.id, d);

  const overdueTasksByDeal = new Map<string, number>();
  for (const t of input.children.tasks) {
    if (t.completed) continue;
    if (isPastDue(t.dueDate, nowMs)) {
      overdueTasksByDeal.set(t.dealId, (overdueTasksByDeal.get(t.dealId) ?? 0) + 1);
    }
  }
  const overdueDocsByDeal = new Map<string, number>();
  for (const d of input.children.outstandingDocuments) {
    if (isPastDue(d.dueDate, nowMs)) {
      overdueDocsByDeal.set(d.dealId, (overdueDocsByDeal.get(d.dealId) ?? 0) + 1);
    }
  }
  const memosByDeal = new Map<string, TeamWorkQueueMemoRow[]>();
  for (const m of input.children.memos) {
    const list = memosByDeal.get(m.dealId) ?? [];
    list.push(m);
    memosByDeal.set(m.dealId, list);
  }

  // 1. Deal-level signals.
  for (const deal of input.deals) {
    pushDealSignals({
      deal,
      nowMs,
      overdueTasks: overdueTasksByDeal.get(deal.id) ?? 0,
      overdueDocs: overdueDocsByDeal.get(deal.id) ?? 0,
      memos: memosByDeal.get(deal.id) ?? [],
      items,
    });
  }

  // 2. Task-level overdue items.
  for (const t of input.children.tasks) {
    if (t.completed) continue;
    if (!isPastDue(t.dueDate, nowMs)) continue;
    const deal = dealById.get(t.dealId);
    if (!deal) continue; // orphan — team-scoping safety
    items.push(taskOverdueItem(t, deal, nowMs));
  }

  // 3. Document-level overdue items.
  for (const d of input.children.outstandingDocuments) {
    if (!isPastDue(d.dueDate, nowMs)) continue;
    const deal = dealById.get(d.dealId);
    if (!deal) continue; // orphan — team-scoping safety
    items.push(documentOverdueItem(d, deal, nowMs));
  }

  items.sort((a, b) => {
    if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
    return a.dealName.localeCompare(b.dealName);
  });
  return items;
}

function pushDealSignals(opts: {
  deal: TeamDeal;
  nowMs: number;
  overdueTasks: number;
  overdueDocs: number;
  memos: TeamWorkQueueMemoRow[];
  items: TeamWorkQueueItem[];
}): void {
  const { deal, overdueTasks, overdueDocs, memos, items } = opts;
  const bankerName = deal.assignedBankerName;

  // Manager-specific: unassigned banker on an in-flight team deal.
  if (!deal.assignedBankerId) {
    items.push({
      id: `${deal.id}::unassigned-banker`,
      type: 'unassigned-banker',
      severity: 'blocked',
      dealId: deal.id,
      dealName: deal.name,
      bankerName: undefined,
      title: deal.name,
      reason: 'No banker is currently assigned to this in-flight team deal.',
      dateIso: deal.modifiedOn,
      sortKey: tierBase('blocked') + 500, // bumped above ordinary blocked
    });
  }

  // Past target close: blocked or at-risk depending on overdue days.
  const closeDays = daysFromNow(deal.targetCloseDate, opts.nowMs);
  if (closeDays != null && closeDays <= -BLOCKED_PAST_CLOSE_DAYS) {
    const overdueDays = Math.abs(closeDays);
    items.push({
      id: `${deal.id}::blocked-deal`,
      type: 'blocked-deal',
      severity: 'blocked',
      dealId: deal.id,
      dealName: deal.name,
      bankerName,
      title: deal.name,
      reason: `Target close was ${overdueDays} days ago and the deal is still open.`,
      dateIso: deal.targetCloseDate,
      sortKey: tierBase('blocked') + overdueDays,
    });
  } else if (closeDays != null && closeDays < 0) {
    const overdueDays = Math.abs(closeDays);
    items.push({
      id: `${deal.id}::at-risk-past-close`,
      type: 'at-risk-deal',
      severity: 'at-risk',
      dealId: deal.id,
      dealName: deal.name,
      bankerName,
      title: deal.name,
      reason: `Target close was ${overdueDays === 0 ? 'today' : `${overdueDays} day(s) ago`}; not yet at the blocked threshold.`,
      dateIso: deal.targetCloseDate,
      sortKey: tierBase('at-risk') + overdueDays,
    });
  }

  // Stale stage signal.
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
        bankerName,
        title: deal.name,
        reason: `In "${deal.stage ?? 'current stage'}" for ${inStageDays} days (past ${STALE_STAGE_AT_RISK_DAYS}-day at-risk threshold).`,
        dateIso: deal.stageEntryDate,
        sortKey: tierBase('at-risk') + inStageDays / 100,
      });
    }
  }

  // Memo review needed.
  const staleMemo = memos.find((m) => m.statusKey === 'stale');
  if (staleMemo) {
    items.push({
      id: `${deal.id}::memo-review-stale`,
      type: 'memo-review',
      severity: 'at-risk',
      dealId: deal.id,
      dealName: deal.name,
      bankerName,
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
        bankerName,
        title: deal.name,
        reason: `Final memo "${finalMemo.name}" on file, but ${overdueTasks} overdue task(s) and ${overdueDocs} overdue document(s) remain.`,
        dateIso: finalMemo.modifiedOn ?? finalMemo.generatedAt,
        sortKey: tierBase('at-risk') + 4,
      });
    }
  }

  // Closing soon.
  if (closeDays != null && closeDays >= 0 && closeDays <= CLOSING_SOON_DAYS) {
    items.push({
      id: `${deal.id}::closing-soon`,
      type: 'closing-soon',
      severity: 'upcoming',
      dealId: deal.id,
      dealName: deal.name,
      bankerName,
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
  t: TeamWorkQueueTaskRow,
  deal: TeamDeal,
  nowMs: number,
): TeamWorkQueueItem {
  const days = daysFromNow(t.dueDate, nowMs);
  const overdueDays = days != null ? Math.abs(days) : 0;
  return {
    id: `${t.id}::overdue-task`,
    type: 'overdue-task',
    severity: 'overdue',
    dealId: deal.id,
    dealName: deal.name,
    bankerName: deal.assignedBankerName,
    title: t.title,
    reason: `Open task overdue by ${overdueDays} day(s) on "${deal.name}".`,
    dateIso: t.dueDate,
    sortKey: tierBase('overdue') + overdueDays,
  };
}

function documentOverdueItem(
  d: TeamWorkQueueDocumentRow,
  deal: TeamDeal,
  nowMs: number,
): TeamWorkQueueItem {
  const days = daysFromNow(d.dueDate, nowMs);
  const overdueDays = days != null ? Math.abs(days) : 0;
  return {
    id: `${d.id}::overdue-document`,
    type: 'overdue-document',
    severity: 'overdue',
    dealId: deal.id,
    dealName: deal.name,
    bankerName: deal.assignedBankerName,
    title: d.name,
    reason: `Outstanding document overdue by ${overdueDays} day(s) on "${deal.name}".`,
    dateIso: d.dueDate,
    sortKey: tierBase('overdue') + overdueDays,
  };
}

function tierBase(s: TeamWorkQueueSeverity): number {
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
  // Calendar-day differencing — start-of-UTC-day on each side. Same
  // pattern as the banker queue.
  const targetDay = Math.floor(ms / MS_PER_DAY);
  const nowDay = Math.floor(nowMs / MS_PER_DAY);
  return targetDay - nowDay;
}
