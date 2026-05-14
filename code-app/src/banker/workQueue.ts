import type { PipelineDeal } from './dealQueries';
import type {
  BankerWorkQueueData,
  WorkQueueDocumentRow,
  WorkQueueMemoRow,
  WorkQueueTaskRow,
} from './workQueueQueries';
import {
  BLOCKED_PAST_CLOSE_DAYS,
  CLOSING_SOON_DAYS,
  PENDING_REVIEW_AT_RISK_DAYS,
  STALE_STAGE_AT_RISK_DAYS,
  compareWorkQueueItems,
  daysFromNow,
  isPastDue,
  isReceivedDocumentPendingReview,
  tierBase,
  type WorkQueueItemBase,
  type WorkQueueSeverity,
} from '../shared/workQueue/primitives';

/**
 * Phase 32: banker My Work Queue — pure derivation.
 * Phase 35: shared severity/sort/date primitives now live in
 * src/shared/workQueue/primitives.ts; this file keeps banker-specific
 * signal rules + the banker WorkQueueItemType enum + the derivation.
 *
 * Severity ordering (highest to lowest):
 *   blocked  — deal-level true blocker (past target close by
 *              >= BLOCKED_PAST_CLOSE_DAYS)
 *   overdue  — task / document past its due date
 *   at-risk  — past target close (<7d), stale stage, memo review
 *   upcoming — closing within next CLOSING_SOON_DAYS
 */

export type WorkQueueItemType =
  | 'blocked-deal'
  | 'overdue-task'
  | 'overdue-document'
  | 'pending-review-document'
  | 'at-risk-deal'
  | 'memo-review'
  | 'closing-soon';

// Re-export so callers (MyWorkQueue.tsx) can keep importing
// WorkQueueSeverity from './workQueue' without behavior change.
export type { WorkQueueSeverity };

/** Phase 53: carries just enough document metadata for the Command
 *  Center mark-received modal to identify the row and render
 *  honestly (name / due date / last requested). Only populated for
 *  type === 'overdue-document'. */
export interface WorkQueueDocumentMetadata {
  documentId: string;
  documentName: string;
  dueDate: string | undefined;
  requestDate: string | undefined;
}

export interface WorkQueueItem extends WorkQueueItemBase {
  type: WorkQueueItemType;
  dealId: string;
  title: string;
  reason: string;
  dateIso: string | undefined;
  /** Phase 53: populated only on overdue-document rows; lets
   *  MyWorkQueue invoke the Phase 51 markDocumentReceived action
   *  without re-fetching the document. */
  documentMetadata?: WorkQueueDocumentMetadata;
}

export interface DeriveWorkQueueInput {
  data: BankerWorkQueueData;
  now?: Date;
}

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

  // 3. Document-level overdue items (outstanding, past due date).
  for (const d of input.data.outstandingDocuments) {
    if (!isPastDue(d.dueDate, nowMs)) continue;
    const deal = dealById.get(d.dealId);
    if (!deal || deal.isClosed) continue;
    items.push(documentOverdueItem(d, deal, nowMs));
  }

  // 4. Phase 54: documents marked received but still lacking a
  //    reviewer past the at-risk threshold. Advisory signal — not
  //    an approval, not a workflow trigger, just a banker reminder
  //    that this document has sat unreviewed.
  for (const d of input.data.pendingReviewDocuments) {
    if (
      !isReceivedDocumentPendingReview({
        receivedDate: d.receivedDate,
        reviewer: d.reviewer,
        nowMs,
      })
    ) {
      continue;
    }
    const deal = dealById.get(d.dealId);
    if (!deal || deal.isClosed) continue;
    items.push(pendingReviewDocumentItem(d, deal, nowMs));
  }

  items.sort(compareWorkQueueItems);
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
    documentMetadata: {
      documentId: d.id,
      documentName: d.name,
      dueDate: d.dueDate,
      requestDate: d.requestDate,
    },
  };
}

/**
 * Phase 54: pending-review item. Surfaces when a document was
 * marked received but no reviewer has been recorded after
 * PENDING_REVIEW_AT_RISK_DAYS calendar days. Conservative copy:
 * "may require review" — not "overdue review", not "review failed",
 * not "approval pending".
 *
 * The signal clears as soon as cr664_reviewer is populated on the
 * row (the row drops out of pendingReviewDocuments at the loader
 * level, so this function never sees it).
 */
function pendingReviewDocumentItem(
  d: WorkQueueDocumentRow,
  deal: PipelineDeal,
  nowMs: number,
): WorkQueueItem {
  const days = daysFromNow(d.receivedDate, nowMs);
  // daysFromNow returns negative for past anchors (received earlier).
  const elapsedDays = days != null ? Math.abs(days) : PENDING_REVIEW_AT_RISK_DAYS;
  return {
    id: `${d.id}::pending-review-document`,
    type: 'pending-review-document',
    severity: 'at-risk',
    dealId: deal.id,
    dealName: deal.name,
    title: d.name,
    reason: `Received ${elapsedDays} day(s) ago on "${deal.name}" — may require review.`,
    dateIso: d.receivedDate,
    // Older receivedDate → larger elapsed → higher sort priority
    // within the at-risk tier.
    sortKey: tierBase('at-risk') + elapsedDays,
  };
}

