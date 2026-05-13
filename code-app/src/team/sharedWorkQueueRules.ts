import type {
  TeamDealRow,
  TeamDocumentRow,
  TeamMemoRow,
  TeamTaskRow,
} from './teamQueries';
import {
  BLOCKED_PAST_CLOSE_DAYS,
  CLOSING_SOON_DAYS,
  STALE_STAGE_AT_RISK_DAYS,
  compareWorkQueueItems,
  daysFromNow,
  isPastDue,
  tierBase,
  type WorkQueueItemBase,
  type WorkQueueSeverity,
} from '../shared/workQueue/primitives';

/**
 * Phase 34: Team Workspace Shared Work Queue — pure derivation.
 * Phase 35: shared severity/sort/date primitives now live in
 * src/shared/workQueue/primitives.ts; this file keeps team-specific
 * signal rules (notably unassigned-task) + the team item-type enum +
 * the derivation.
 *
 * Team-specific signals:
 *   - ownerName is carried on every item so the team can see who
 *     owns each piece of work without a deal drill-through.
 *   - unassigned-task fires when an open task has no assignee. The
 *     manager queue surfaces unassigned-banker (deal-level routing
 *     gap); the team queue surfaces unassigned-task (work-level
 *     routing gap). Distinct roles, distinct signals.
 */

export type SharedWorkQueueItemType =
  | 'blocked-deal'
  | 'unassigned-task'
  | 'overdue-task'
  | 'overdue-document'
  | 'at-risk-deal'
  | 'memo-review'
  | 'closing-soon';

export type SharedWorkQueueSeverity = WorkQueueSeverity;

export interface SharedWorkQueueItem extends WorkQueueItemBase {
  type: SharedWorkQueueItemType;
  dealId: string;
  /** Owner of the work — task assignee for task items, deal banker
   *  for deal-level items. Surfaced verbatim so the team can route
   *  without a drill-through. */
  ownerName: string | undefined;
  title: string;
  reason: string;
  dateIso: string | undefined;
}

export interface DeriveSharedWorkQueueInput {
  deals: readonly TeamDealRow[];
  tasks: readonly TeamTaskRow[];
  documents: readonly TeamDocumentRow[];
  memos: readonly TeamMemoRow[];
  now?: Date;
}

export function deriveSharedWorkQueue(
  input: DeriveSharedWorkQueueInput,
): SharedWorkQueueItem[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const items: SharedWorkQueueItem[] = [];

  const dealById = new Map<string, TeamDealRow>();
  for (const d of input.deals) dealById.set(d.id, d);

  const overdueTasksByDeal = new Map<string, number>();
  for (const t of input.tasks) {
    if (t.completed) continue;
    if (isPastDue(t.dueDate, nowMs)) {
      const dealId = t.dealId ?? '';
      overdueTasksByDeal.set(dealId, (overdueTasksByDeal.get(dealId) ?? 0) + 1);
    }
  }
  const overdueDocsByDeal = new Map<string, number>();
  for (const d of input.documents) {
    if (d.status !== 'outstanding') continue;
    if (isPastDue(d.dueDate, nowMs)) {
      const dealId = d.dealId ?? '';
      overdueDocsByDeal.set(dealId, (overdueDocsByDeal.get(dealId) ?? 0) + 1);
    }
  }
  const memosByDeal = new Map<string, TeamMemoRow[]>();
  for (const m of input.memos) {
    const dealId = m.dealId ?? '';
    if (!dealId) continue;
    const list = memosByDeal.get(dealId) ?? [];
    list.push(m);
    memosByDeal.set(dealId, list);
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

  // 2. Task-level overdue + unassigned items.
  for (const t of input.tasks) {
    if (t.completed) continue;
    const deal = t.dealId ? dealById.get(t.dealId) : undefined;
    if (!deal) continue; // orphan — team-scoping safety
    if (isPastDue(t.dueDate, nowMs)) {
      items.push(taskOverdueItem(t, deal, nowMs));
    }
    if (!t.assigneeName || t.assigneeName.trim().length === 0) {
      items.push(taskUnassignedItem(t, deal));
    }
  }

  // 3. Document-level overdue items (outstanding only).
  for (const d of input.documents) {
    if (d.status !== 'outstanding') continue;
    if (!isPastDue(d.dueDate, nowMs)) continue;
    const deal = d.dealId ? dealById.get(d.dealId) : undefined;
    if (!deal) continue;
    items.push(documentOverdueItem(d, deal, nowMs));
  }

  items.sort(compareWorkQueueItems);
  return items;
}

function pushDealSignals(opts: {
  deal: TeamDealRow;
  nowMs: number;
  overdueTasks: number;
  overdueDocs: number;
  memos: TeamMemoRow[];
  items: SharedWorkQueueItem[];
}): void {
  const { deal, overdueTasks, overdueDocs, memos, items } = opts;
  const ownerName = deal.assignedBankerName;

  const closeDays = daysFromNow(deal.targetCloseDate, opts.nowMs);
  if (closeDays != null && closeDays <= -BLOCKED_PAST_CLOSE_DAYS) {
    const overdueDays = Math.abs(closeDays);
    items.push({
      id: `${deal.id}::blocked-deal`,
      type: 'blocked-deal',
      severity: 'blocked',
      dealId: deal.id,
      dealName: deal.name,
      ownerName,
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
      ownerName,
      title: deal.name,
      reason: `Target close was ${overdueDays === 0 ? 'today' : `${overdueDays} day(s) ago`}; not yet at the blocked threshold.`,
      dateIso: deal.targetCloseDate,
      sortKey: tierBase('at-risk') + overdueDays,
    });
  }

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
        ownerName,
        title: deal.name,
        reason: `In "${deal.stage ?? 'current stage'}" for ${inStageDays} days (past ${STALE_STAGE_AT_RISK_DAYS}-day at-risk threshold).`,
        dateIso: deal.stageEntryDate,
        sortKey: tierBase('at-risk') + inStageDays / 100,
      });
    }
  }

  const staleMemo = memos.find((m) => m.statusKey === 'stale');
  if (staleMemo) {
    items.push({
      id: `${deal.id}::memo-review-stale`,
      type: 'memo-review',
      severity: 'at-risk',
      dealId: deal.id,
      dealName: deal.name,
      ownerName,
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
        ownerName,
        title: deal.name,
        reason: `Final memo "${finalMemo.name}" on file, but ${overdueTasks} overdue task(s) and ${overdueDocs} overdue document(s) remain.`,
        dateIso: finalMemo.modifiedOn ?? finalMemo.generatedAt,
        sortKey: tierBase('at-risk') + 4,
      });
    }
  }

  if (closeDays != null && closeDays >= 0 && closeDays <= CLOSING_SOON_DAYS) {
    items.push({
      id: `${deal.id}::closing-soon`,
      type: 'closing-soon',
      severity: 'upcoming',
      dealId: deal.id,
      dealName: deal.name,
      ownerName,
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
  t: TeamTaskRow,
  deal: TeamDealRow,
  nowMs: number,
): SharedWorkQueueItem {
  const days = daysFromNow(t.dueDate, nowMs);
  const overdueDays = days != null ? Math.abs(days) : 0;
  return {
    id: `${t.id}::overdue-task`,
    type: 'overdue-task',
    severity: 'overdue',
    dealId: deal.id,
    dealName: deal.name,
    ownerName: t.assigneeName ?? deal.assignedBankerName,
    title: t.title,
    reason: `Open task overdue by ${overdueDays} day(s) on "${deal.name}".`,
    dateIso: t.dueDate,
    sortKey: tierBase('overdue') + overdueDays,
  };
}

function taskUnassignedItem(t: TeamTaskRow, deal: TeamDealRow): SharedWorkQueueItem {
  return {
    id: `${t.id}::unassigned-task`,
    type: 'unassigned-task',
    severity: 'blocked',
    dealId: deal.id,
    dealName: deal.name,
    ownerName: undefined,
    title: t.title,
    reason: `Open task has no assignee on "${deal.name}". Route to a banker on the team.`,
    dateIso: t.dueDate,
    sortKey: tierBase('blocked') + 200, // above ordinary blocked-deal, below none-set
  };
}

function documentOverdueItem(
  d: TeamDocumentRow,
  deal: TeamDealRow,
  nowMs: number,
): SharedWorkQueueItem {
  const days = daysFromNow(d.dueDate, nowMs);
  const overdueDays = days != null ? Math.abs(days) : 0;
  return {
    id: `${d.id}::overdue-document`,
    type: 'overdue-document',
    severity: 'overdue',
    dealId: deal.id,
    dealName: deal.name,
    ownerName: deal.assignedBankerName,
    title: d.name,
    reason: `Outstanding document overdue by ${overdueDays} day(s) on "${deal.name}".`,
    dateIso: d.dueDate,
    sortKey: tierBase('overdue') + overdueDays,
  };
}

