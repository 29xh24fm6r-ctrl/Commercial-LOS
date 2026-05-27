/**
 * Phase 75: banker-side personal activity derivation.
 *
 * Pure, deterministic, single-banker counterpart to Phase 71's
 * derivePerBankerActivity (which produces a per-banker table for
 * managers / team members). Phase 75 takes the data the banker work
 * queue already loads (active deals + open tasks + outstanding
 * documents + pending-review documents + memos) and folds it into
 * one summary the banker sees on their own command center.
 *
 * What this is:
 *   - A workload/attention snapshot derived from current records.
 *   - Numeric counts + currency totals only.
 *   - Honest gap fields: when a deal lacks an amount or a stage-entry
 *     date, the gap is surfaced separately so the visible figures
 *     are interpretable.
 *
 * What this is NOT (Phase 75 brief; matches Phase 71 discipline):
 *   - Not a score.
 *   - Not a ranking.
 *   - Not a predictive claim.
 *   - Not an AI output.
 *   - Not a performance evaluation or compensation metric.
 *   - Not a credit-decision claim.
 *
 * No SDK import. No clock outside the caller-supplied `now`. No new
 * Dataverse query is introduced by this module — it consumes the
 * BankerWorkQueueData shape that loadBankerWorkQueueData already
 * produces.
 */

import {
  CLOSING_SOON_DAYS,
  STAGE_AGING_AT_RISK_DAYS,
} from './derivedAnalytics';
import { PENDING_REVIEW_AT_RISK_DAYS } from '../workQueue/primitives';

/**
 * Phase 119 — restored original Banker Workspace dashboard tiles.
 * Last-activity staleness threshold matches the original product's
 * "Stale 14d+" KPI tile label. Independent from STAGE_AGING_AT_RISK_DAYS
 * (30 days against stage-entry) — this one anchors against modifiedon.
 *
 * Phase 120 — exported so the PersonalPipeline per-row stale badge
 * shares the same threshold as the KPI tile (consistency invariant:
 * if a tile says "1 stale", the pipeline shows exactly one badged row).
 */
export const STALE_ACTIVITY_DAYS = 14;

/**
 * Phase 119 — canonical stage label the original product's
 * "In Underwriting" KPI tile counted against. Matched
 * case-insensitively so live-env variations like "Underwriting" /
 * "underwriting" / "UNDERWRITING" all count.
 */
const UNDERWRITING_STAGE_LABEL = 'underwriting';

// ---------------------------------------------------------------------------
// Structural input shapes — both `BankerWorkQueueData` from
// src/banker/workQueueQueries.ts AND its nested row types satisfy
// these. Defining them here lets the analytics module stay isolated
// from role modules (Phase 48 invariant); the banker workspace simply
// passes its data through.
// ---------------------------------------------------------------------------
export interface PersonalActivityDeal {
  amount: number | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  /** Phase 119: deal stage name (denormalized from cr664_StageReference
   *  via the Dataverse *name convention). Used by the In-Underwriting
   *  count. */
  stage: string | undefined;
  /** Phase 119: last activity timestamp (modifiedon). Used by the
   *  Stale 14d+ count. */
  lastActivityOn: string | undefined;
}

export interface PersonalActivityTask {
  dueDate: string | undefined;
}

export interface PersonalActivityDocument {
  receivedDate: string | undefined;
  uploaded?: boolean;
  /** Phase 119: needed by the Urgent-items count to recognize overdue
   *  outstanding documents. Optional so existing callers structurally
   *  compatible without this field still type-check. */
  dueDate?: string | undefined;
}

export interface PersonalActivityMemo {
  statusKey: 'draft' | 'final' | 'stale' | undefined;
}

export interface PersonalActivityInput {
  deals: readonly PersonalActivityDeal[];
  tasks: readonly PersonalActivityTask[];
  outstandingDocuments: readonly PersonalActivityDocument[];
  pendingReviewDocuments: readonly PersonalActivityDocument[];
  memos: readonly PersonalActivityMemo[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export interface BankerPersonalActivity {
  // ----- Pipeline shape -----
  /** Count of the banker's active deals (statecode = 0, not terminal). */
  activeDeals: number;
  /** Sum of amount across active deals. Deals with no parseable
   *  amount are skipped here and surfaced via dealsMissingAmount. */
  totalAmount: number;
  /** Count of active deals with no parseable amount. */
  dealsMissingAmount: number;

  // ----- Time-sensitive deal signals -----
  /** Active deals whose target close date falls within
   *  CLOSING_SOON_DAYS from `now`. */
  closingSoonCount: number;
  /** Active deals whose target close date is in the past (overdue
   *  to close). */
  pastTargetCloseCount: number;
  /** Active deals at or past STAGE_AGING_AT_RISK_DAYS days in
   *  current stage. */
  stageAtRiskCount: number;
  /** Active deals where stage-entry date is missing or unparseable.
   *  Surfaced honestly so the consumer can communicate the gap. */
  missingStageEntryDateCount: number;

  // ----- Work items -----
  /** Open tasks across the banker's active deals. */
  openTaskCount: number;
  /** Open tasks whose due date is in the past. Subset of
   *  openTaskCount. */
  overdueTaskCount: number;

  // ----- Document attention -----
  /** Documents on the banker's active deals that have not been
   *  requested-and-received yet (no receivedDate, not uploaded). */
  outstandingDocumentCount: number;
  /** Received documents that have sat unreviewed past the
   *  PENDING_REVIEW_AT_RISK_DAYS threshold. */
  pendingReviewDocumentCount: number;

  // ----- Memos -----
  /** Credit memos in 'draft' status across the banker's active deals.
   *  No completion / approval claim — just the open-draft count. */
  draftMemoCount: number;

  // ----- Phase 119: restored original Banker Workspace dashboard tiles -----
  /** Active deals whose stage name matches the canonical "Underwriting"
   *  label (case-insensitive). Zero when the live env has no deal in
   *  that stage — honest, never fabricated. */
  inUnderwritingCount: number;
  /** Active deals whose lastActivityOn is older than STALE_ACTIVITY_DAYS.
   *  Deals with no parseable lastActivityOn are skipped honestly (not
   *  silently counted as stale). */
  staleActivityCount: number;
  /** Count of urgent items requiring attention right now:
   *   - overdue tasks (open, dueDate in the past)
   *   - overdue outstanding documents (no receivedDate, dueDate in the past)
   *   - deals past their target close date
   *  The three sub-counts are intentionally summed — a deal can have
   *  multiple overdue items and each one contributes one urgency unit. */
  urgentItemCount: number;
}

export function deriveBankerPersonalActivity(
  data: PersonalActivityInput,
  now: Date,
): BankerPersonalActivity {
  const nowMs = now.getTime();

  const deals = data.deals;
  const activeDeals = deals.length;

  let totalAmount = 0;
  let dealsMissingAmount = 0;
  let closingSoonCount = 0;
  let pastTargetCloseCount = 0;
  let stageAtRiskCount = 0;
  let missingStageEntryDateCount = 0;
  let inUnderwritingCount = 0;
  let staleActivityCount = 0;

  for (const d of deals) {
    accumulateDealSignals(d, nowMs, (signal) => {
      switch (signal.kind) {
        case 'amount-present':
          totalAmount += signal.amount;
          break;
        case 'amount-missing':
          dealsMissingAmount++;
          break;
        case 'closing-soon':
          closingSoonCount++;
          break;
        case 'past-target-close':
          pastTargetCloseCount++;
          break;
        case 'stage-at-risk':
          stageAtRiskCount++;
          break;
        case 'stage-entry-missing':
          missingStageEntryDateCount++;
          break;
      }
    });
    if (typeof d.stage === 'string' &&
        d.stage.trim().toLowerCase() === UNDERWRITING_STAGE_LABEL) {
      inUnderwritingCount++;
    }
    const activityMs = parseIso(d.lastActivityOn);
    if (activityMs != null) {
      const daysSinceActivity = Math.floor((nowMs - activityMs) / MS_PER_DAY);
      if (daysSinceActivity >= STALE_ACTIVITY_DAYS) {
        staleActivityCount++;
      }
    }
  }

  const openTaskCount = data.tasks.length;
  const overdueTaskCount = countOverdueTasks(data.tasks, nowMs);

  const outstandingDocumentCount = data.outstandingDocuments.length;
  const overdueOutstandingDocumentCount = countOverdueOutstandingDocuments(
    data.outstandingDocuments,
    nowMs,
  );
  const pendingReviewDocumentCount = countPendingReviewDocuments(
    data.pendingReviewDocuments,
    nowMs,
  );

  const draftMemoCount = data.memos.filter(
    (m) => m.statusKey === 'draft',
  ).length;

  const urgentItemCount =
    overdueTaskCount + overdueOutstandingDocumentCount + pastTargetCloseCount;

  return {
    activeDeals,
    totalAmount,
    dealsMissingAmount,
    closingSoonCount,
    pastTargetCloseCount,
    stageAtRiskCount,
    missingStageEntryDateCount,
    openTaskCount,
    overdueTaskCount,
    outstandingDocumentCount,
    pendingReviewDocumentCount,
    draftMemoCount,
    inUnderwritingCount,
    staleActivityCount,
    urgentItemCount,
  };
}

function countOverdueOutstandingDocuments(
  docs: readonly PersonalActivityDocument[],
  nowMs: number,
): number {
  let n = 0;
  for (const d of docs) {
    if (d.receivedDate) continue;
    const due = parseIso(d.dueDate);
    if (due != null && due < nowMs) n++;
  }
  return n;
}

type DealSignal =
  | { kind: 'amount-present'; amount: number }
  | { kind: 'amount-missing' }
  | { kind: 'closing-soon' }
  | { kind: 'past-target-close' }
  | { kind: 'stage-at-risk' }
  | { kind: 'stage-entry-missing' };

function accumulateDealSignals(
  d: PersonalActivityDeal,
  nowMs: number,
  emit: (s: DealSignal) => void,
): void {
  if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
    emit({ kind: 'amount-present', amount: d.amount });
  } else {
    emit({ kind: 'amount-missing' });
  }

  const targetMs = parseIso(d.targetCloseDate);
  if (targetMs != null) {
    const daysUntilClose = Math.floor((targetMs - nowMs) / MS_PER_DAY);
    if (daysUntilClose < 0) {
      emit({ kind: 'past-target-close' });
    } else if (daysUntilClose <= CLOSING_SOON_DAYS) {
      emit({ kind: 'closing-soon' });
    }
  }

  const stageEntryMs = parseIso(d.stageEntryDate);
  if (stageEntryMs == null) {
    emit({ kind: 'stage-entry-missing' });
    return;
  }
  const daysInStage = Math.floor((nowMs - stageEntryMs) / MS_PER_DAY);
  // Negative (stage entry in the future) is nonsensical for the
  // analytics; count as a gap so the visible figure is honest.
  if (daysInStage < 0) {
    emit({ kind: 'stage-entry-missing' });
    return;
  }
  if (daysInStage >= STAGE_AGING_AT_RISK_DAYS) {
    emit({ kind: 'stage-at-risk' });
  }
}

function countOverdueTasks(
  tasks: readonly PersonalActivityTask[],
  nowMs: number,
): number {
  let n = 0;
  for (const t of tasks) {
    const due = parseIso(t.dueDate);
    if (due != null && due < nowMs) n++;
  }
  return n;
}

function countPendingReviewDocuments(
  docs: readonly PersonalActivityDocument[],
  nowMs: number,
): number {
  let n = 0;
  for (const d of docs) {
    // The pending-review bucket from loadBankerWorkQueueData has
    // already filtered: no reviewer, receivedDate present OR
    // uploaded. We add the at-risk threshold so the count matches
    // the work-queue's "needs review" semantics.
    const receivedMs = parseIso(d.receivedDate);
    if (receivedMs == null) continue;
    const daysSince = Math.floor((nowMs - receivedMs) / MS_PER_DAY);
    if (daysSince >= PENDING_REVIEW_AT_RISK_DAYS) n++;
  }
  return n;
}
