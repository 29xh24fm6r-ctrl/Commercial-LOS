/**
 * Phase 80: deterministic "Next Best Actions" derivation for the
 * Banker Deal Workspace.
 *
 * The Microsoft Vibe scope expects a Deal Autopilot capability. Full
 * AI / automated execution is not available today, so Phase 80 ships
 * the deterministic floor: a pure function that maps already-loaded
 * deal data (deal record + open tasks + outstanding/received documents
 * + memos + activity timeline + pre-computed memo-consistency
 * findings count) to AT MOST three suggested next steps. Each
 * suggestion carries `isAutomated: false` to make the no-automation
 * contract enforceable at the type level.
 *
 * What this is NOT:
 *   - Not AI / Copilot / model invocation.
 *   - Not automated execution. The panel never clicks an action
 *     button, never creates a task, never sends an email, never
 *     advances the stage, never marks a document reviewed.
 *   - Not a credit decision, not an approval, not a guaranteed
 *     prediction.
 *
 * Phase 48 isolation: this module defines its own structural input
 * shapes so src/shared/ never imports from a role directory. The
 * caller (DealAutopilotPanel) hands in already-loaded data; the
 * pure function decides which signals fire.
 */

import {
  CLOSING_SOON_DAYS,
  STAGE_AGING_AT_RISK_DAYS,
} from '../analytics/derivedAnalytics';
import { PENDING_REVIEW_AT_RISK_DAYS } from '../workQueue/primitives';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Stale-activity threshold for the low-priority "no recent activity"
 *  signal. Two weeks matches the Phase 72 closing-soon window so the
 *  same deal that triggers a "closing soon" signal does not also
 *  trigger "stale activity" at a different threshold. */
export const STALE_ACTIVITY_DAYS = 14;
/** Hard cap on surfaced suggestions per the Phase 80 brief. */
export const MAX_NEXT_BEST_ACTIONS = 3;

// ---------------------------------------------------------------------------
// Structural input shapes
// ---------------------------------------------------------------------------

export interface AutopilotDeal {
  id: string;
  name: string;
  stage: string | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
}

export interface AutopilotTask {
  id: string;
  title: string;
  dueDate: string | undefined;
  completed: boolean;
}

export interface AutopilotDocument {
  id: string;
  name: string;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded?: boolean;
}

export interface AutopilotMemo {
  id: string;
  statusKey: 'draft' | 'final' | 'stale' | undefined;
}

export interface AutopilotInput {
  deal: AutopilotDeal;
  /** Open (not completed) tasks on this deal. */
  openTasks: readonly AutopilotTask[];
  /** Documents in the outstanding bucket (not yet received). */
  outstandingDocuments: readonly AutopilotDocument[];
  /** Documents in the received bucket. Pending-review derivation
   *  filters this list against PENDING_REVIEW_AT_RISK_DAYS. */
  receivedDocuments: readonly AutopilotDocument[];
  /** Credit memos loaded on this deal (any status). */
  memos: readonly AutopilotMemo[];
  /** Phase 73 consistency check findings count, pre-computed by the
   *  caller. Passing the integer rather than re-running the check
   *  keeps this module independent of the consistency-check module
   *  and DealDetail/CreditMemoData shapes. */
  memoConsistencyFindingsCount: number;
  /** ISO timestamp of the most recent timeline event on this deal,
   *  or undefined if no events exist. */
  mostRecentActivityIso: string | undefined;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export type AutopilotPriority = 'high' | 'medium' | 'low';

export type AutopilotTargetSurface =
  | 'documents'
  | 'tasks'
  | 'credit-memo'
  | 'borrower-communication'
  | 'activity-timeline'
  | 'stage-progression';

export interface NextBestAction {
  id: string;
  priority: AutopilotPriority;
  title: string;
  reason: string;
  suggestedActionLabel: string;
  targetSurface: AutopilotTargetSurface;
  /** Plain-string descriptions of the input fields this suggestion
   *  derived from. Surfaced by the UI in a "why" tooltip / aria-
   *  describedby so the banker can verify the basis. */
  sourceSignals: readonly string[];
  /** Phase 80 contract: every Next Best Action is a SUGGESTION the
   *  banker chooses to act on. Nothing happens automatically. The
   *  literal `false` makes the no-automation pledge enforceable at
   *  the type level — a future caller cannot accidentally flip it. */
  isAutomated: false;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveNextBestActions(
  input: AutopilotInput,
  now: Date,
): NextBestAction[] {
  const nowMs = now.getTime();
  const candidates: NextBestAction[] = [];

  // High-priority: overdue tasks
  const overdueTasks = input.openTasks.filter((t) => {
    if (t.completed) return false;
    const due = parseIso(t.dueDate);
    return due != null && due < nowMs;
  });
  if (overdueTasks.length > 0) {
    candidates.push({
      id: 'overdue-tasks',
      priority: 'high',
      title:
        overdueTasks.length === 1
          ? '1 overdue task'
          : `${overdueTasks.length} overdue tasks`,
      reason:
        overdueTasks.length === 1
          ? 'One open task is past its due date.'
          : `${overdueTasks.length} open tasks are past their due dates.`,
      suggestedActionLabel: 'Open Tasks',
      targetSurface: 'tasks',
      sourceSignals: ['openTasks.dueDate'],
      isAutomated: false,
    });
  }

  // High-priority: documents may require review (received >= 7d ago,
  // no reviewer)
  const pendingReview = input.receivedDocuments.filter((d) => {
    if (d.reviewer && d.reviewer.trim().length > 0) return false;
    const recMs = parseIso(d.receivedDate);
    if (recMs == null) return false;
    const daysSince = Math.floor((nowMs - recMs) / MS_PER_DAY);
    return daysSince >= PENDING_REVIEW_AT_RISK_DAYS;
  });
  if (pendingReview.length > 0) {
    candidates.push({
      id: 'pending-review-documents',
      priority: 'high',
      title:
        pendingReview.length === 1
          ? '1 document may require review'
          : `${pendingReview.length} documents may require review`,
      reason: `Received ${PENDING_REVIEW_AT_RISK_DAYS}+ days ago without a reviewer on the record.`,
      suggestedActionLabel: 'Open Documents',
      targetSurface: 'documents',
      sourceSignals: [
        'receivedDocuments.receivedDate',
        'receivedDocuments.reviewer',
      ],
      isAutomated: false,
    });
  }

  // Closing-soon signal: split into HIGH when activity is also stale,
  // MEDIUM otherwise.
  const targetMs = parseIso(input.deal.targetCloseDate);
  let closingSoon = false;
  let daysUntilClose = Number.POSITIVE_INFINITY;
  if (targetMs != null) {
    const days = Math.floor((targetMs - nowMs) / MS_PER_DAY);
    if (days >= 0 && days <= CLOSING_SOON_DAYS) {
      closingSoon = true;
      daysUntilClose = days;
    }
  }
  const lastActivityMs = parseIso(input.mostRecentActivityIso);
  const daysSinceActivity =
    lastActivityMs != null
      ? Math.floor((nowMs - lastActivityMs) / MS_PER_DAY)
      : Number.POSITIVE_INFINITY;

  if (closingSoon && daysSinceActivity > 7) {
    const daysLabel = pluralizeDays(daysUntilClose);
    const reason =
      lastActivityMs != null
        ? `Target close is ${daysLabel} away and no timeline events were recorded in the last ${daysSinceActivity} day${daysSinceActivity === 1 ? '' : 's'}.`
        : `Target close is ${daysLabel} away and no timeline events are on record for this deal.`;
    candidates.push({
      id: 'closing-soon-stale-activity',
      priority: 'high',
      title: `Closes in ${daysLabel} and recent activity is light`,
      reason,
      suggestedActionLabel: 'Review activity & contact borrower',
      targetSurface: 'borrower-communication',
      sourceSignals: ['deal.targetCloseDate', 'mostRecentActivityIso'],
      isAutomated: false,
    });
  } else if (closingSoon) {
    candidates.push({
      id: 'closing-soon',
      priority: 'medium',
      title: `Closes in ${pluralizeDays(daysUntilClose)}`,
      reason: `Target close date is within ${CLOSING_SOON_DAYS} days. Confirm tasks + documents are on track.`,
      suggestedActionLabel: 'Open Tasks',
      targetSurface: 'tasks',
      sourceSignals: ['deal.targetCloseDate'],
      isAutomated: false,
    });
  }

  // Medium-priority: stage at-risk
  const stageEntryMs = parseIso(input.deal.stageEntryDate);
  if (stageEntryMs != null) {
    const daysInStage = Math.floor((nowMs - stageEntryMs) / MS_PER_DAY);
    if (daysInStage >= STAGE_AGING_AT_RISK_DAYS) {
      candidates.push({
        id: 'stage-aging',
        priority: 'medium',
        title: `${daysInStage} days in current stage`,
        reason: input.deal.stage
          ? `Deal has been in "${input.deal.stage}" for ${daysInStage} days. Review for blockers or stalled work.`
          : `Deal has been in its current stage for ${daysInStage} days. Review for blockers or stalled work.`,
        suggestedActionLabel: 'Open Tasks',
        targetSurface: 'tasks',
        sourceSignals: ['deal.stageEntryDate'],
        isAutomated: false,
      });
    }
  }

  // Medium-priority: outstanding documents
  if (input.outstandingDocuments.length > 0) {
    const n = input.outstandingDocuments.length;
    candidates.push({
      id: 'outstanding-documents',
      priority: 'medium',
      title:
        n === 1
          ? '1 outstanding document'
          : `${n} outstanding documents`,
      reason:
        n === 1
          ? '1 document has not been received from the borrower yet.'
          : `${n} documents have not been received from the borrower yet.`,
      suggestedActionLabel: 'Open Documents',
      targetSurface: 'documents',
      sourceSignals: ['outstandingDocuments.length'],
      isAutomated: false,
    });
  }

  // Medium-priority: memo consistency findings
  if (input.memoConsistencyFindingsCount > 0) {
    const n = input.memoConsistencyFindingsCount;
    candidates.push({
      id: 'memo-consistency-findings',
      priority: 'medium',
      title:
        n === 1
          ? '1 memo consistency finding'
          : `${n} memo consistency findings`,
      reason:
        'Deterministic check found differences between the saved memo draft and structured deal fields. Banker review recommended.',
      suggestedActionLabel: 'Open Credit Memo',
      targetSurface: 'credit-memo',
      sourceSignals: ['memoConsistencyFindingsCount'],
      isAutomated: false,
    });
  }

  // Low-priority: draft memo (only when no consistency findings — the
  // findings signal is the more specific call to action).
  const draftMemoCount = input.memos.filter(
    (m) => m.statusKey === 'draft',
  ).length;
  if (draftMemoCount > 0 && input.memoConsistencyFindingsCount === 0) {
    candidates.push({
      id: 'draft-memo',
      priority: 'low',
      title:
        draftMemoCount === 1
          ? 'Draft credit memo on this deal'
          : `${draftMemoCount} draft credit memos on this deal`,
      reason:
        'A memo draft is saved. Consistency check is clean against current structured fields. Review and finalize when ready.',
      suggestedActionLabel: 'Open Credit Memo',
      targetSurface: 'credit-memo',
      sourceSignals: ['memos.statusKey'],
      isAutomated: false,
    });
  }

  // Low-priority: stale activity (only when not already flagged by
  // closing-soon-stale-activity — that signal is more specific).
  if (daysSinceActivity > STALE_ACTIVITY_DAYS && !closingSoon) {
    candidates.push({
      id: 'stale-activity',
      priority: 'low',
      title:
        lastActivityMs != null
          ? `No timeline activity in ${daysSinceActivity} days`
          : 'No timeline activity on record',
      reason:
        lastActivityMs != null
          ? `Most recent timeline event was ${daysSinceActivity} days ago. Consider a borrower check-in.`
          : 'No timeline events have been recorded on this deal. Consider a borrower check-in.',
      suggestedActionLabel: 'Open Borrower Communication',
      targetSurface: 'borrower-communication',
      sourceSignals: ['mostRecentActivityIso'],
      isAutomated: false,
    });
  }

  // Sort by priority desc; within a priority, preserve insertion
  // order (which already encodes a stable secondary ordering — most
  // operationally urgent signals first).
  const priorityRank: Record<AutopilotPriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  // Stable sort: pair each candidate with its insertion index so ties
  // break by insertion order regardless of sort algorithm.
  return candidates
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => {
      const dp = priorityRank[b.c.priority] - priorityRank[a.c.priority];
      if (dp !== 0) return dp;
      return a.idx - b.idx;
    })
    .map(({ c }) => c)
    .slice(0, MAX_NEXT_BEST_ACTIONS);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function pluralizeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}
