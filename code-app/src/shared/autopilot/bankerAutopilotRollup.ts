/**
 * Phase 82: deterministic banker-side rollup over the Phase 80
 * "Next Best Actions" derivation.
 *
 * Calls Phase 80 `deriveNextBestActions` once per deal in the
 * banker's already-authorized pipeline (BankerWorkQueueData),
 * aggregates the priority counts, and ranks the top N deals for the
 * banker Command Center.
 *
 * Compared to the Phase 81 manager rollup, this surface has RICHER
 * input data:
 *
 *   ✓ openTasks (per deal)               — banker work queue carries
 *                                          these; fires overdue-tasks
 *   ✓ outstandingDocuments (per deal)    — fires outstanding-documents
 *   ✓ receivedDocuments (pending-review) — fires pending-review docs
 *   ✓ memos (with statusKey)             — fires draft-memo (low pri)
 *   ✓ deal.targetCloseDate               — fires closing-soon /
 *                                          closing-soon-stale
 *   ✓ deal.stageEntryDate                — fires stage-aging
 *   ✓ deal.lastActivityOn (modifiedon)   — used as the activity proxy
 *                                          (same coarse proxy the
 *                                           manager rollup uses)
 *
 *   ✗ memoConsistencyFindingsCount       — requires per-deal
 *                                          CreditMemoData (memos +
 *                                          sections), which is not
 *                                          loaded by the banker work-
 *                                          queue loader. Passed as 0;
 *                                          memo-consistency-findings
 *                                          signal therefore does not
 *                                          fire on this surface. The
 *                                          banker still sees those
 *                                          findings on the per-deal
 *                                          Phase 80 panel.
 *
 * Net coverage: 7 of 8 Phase 80 signals fire on the banker rollup.
 *
 * What this is NOT (mirrors the Phase 80 + Phase 81 contract):
 *   - Not AI / Copilot / model invocation.
 *   - Not automated execution. The card never clicks an action
 *     button, never creates a task, never sends an email.
 *   - Not a credit decision, not an approval.
 *   - Not a permission widener. The input data is the same banker-
 *     scoped two-step pipeline loaded by `loadBankerWorkQueueData`.
 */

import {
  deriveNextBestActions,
  type AutopilotPriority,
  type NextBestAction,
} from './dealAutopilot';

/** Cap on top-ranked deals surfaced by the banker rollup. Same cap
 *  the manager rollup uses (Phase 81). Keeps the card compact. */
export const TOP_N_BANKER_ROLLUP_DEALS = 5;

// ---------------------------------------------------------------------------
// Structural input shapes — mirror BankerWorkQueueData and the row types
// it carries by structural typing so this module stays under src/shared/
// without importing from a role directory (Phase 48 isolation).
// ---------------------------------------------------------------------------

export interface BankerRollupDealInput {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  /** Standard Dataverse modifiedon — used as the
   *  mostRecentActivityIso proxy on the banker rollup surface,
   *  same as Phase 81's manager rollup. Less precise than the
   *  per-deal Activity Timeline (which only the Phase 80 panel
   *  consumes), but it is the only activity field carried by
   *  the banker pipeline row today. */
  lastActivityOn: string | undefined;
}

export interface BankerRollupTaskInput {
  id: string;
  dealId: string;
  title: string;
  dueDate: string | undefined;
  completed: boolean;
}

export interface BankerRollupDocumentInput {
  id: string;
  dealId: string;
  name: string;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded?: boolean;
}

export interface BankerRollupMemoInput {
  id: string;
  dealId: string;
  statusKey: 'draft' | 'final' | 'stale' | undefined;
}

export interface BankerRollupInput {
  deals: readonly BankerRollupDealInput[];
  /** Open (non-completed) tasks across the banker's deals, keyed
   *  by dealId. The derivation re-buckets these by deal id when
   *  building the per-deal AutopilotInput. */
  tasks: readonly BankerRollupTaskInput[];
  outstandingDocuments: readonly BankerRollupDocumentInput[];
  /** Documents already in the received bucket WITHOUT a reviewer —
   *  the same shape BankerWorkQueueData.pendingReviewDocuments
   *  carries. Phase 80's derivation re-applies the 7-day threshold
   *  on receivedDate so we pass the full list. */
  pendingReviewDocuments: readonly BankerRollupDocumentInput[];
  memos: readonly BankerRollupMemoInput[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface BankerRollupDeal {
  dealId: string;
  dealName: string;
  clientName: string | undefined;
  stage: string | undefined;
  targetCloseDate: string | undefined;
  topSuggestion: NextBestAction;
  suggestionCount: number;
  highestPriority: AutopilotPriority;
}

export interface BankerAutopilotRollup {
  totalDealsScanned: number;
  dealsWithSuggestions: number;
  highPriorityDealCount: number;
  mediumPriorityDealCount: number;
  lowPriorityDealCount: number;
  topDeals: BankerRollupDeal[];
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveBankerAutopilotRollup(
  input: BankerRollupInput,
  now: Date,
): BankerAutopilotRollup {
  // Bucket children by deal id once; the per-deal lookups stay O(1).
  const tasksByDeal = bucketBy(input.tasks, (t) => t.dealId);
  const outDocsByDeal = bucketBy(input.outstandingDocuments, (d) => d.dealId);
  const reviewDocsByDeal = bucketBy(
    input.pendingReviewDocuments,
    (d) => d.dealId,
  );
  const memosByDeal = bucketBy(input.memos, (m) => m.dealId);

  const flagged: BankerRollupDeal[] = [];
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const d of input.deals) {
    const suggestions = deriveNextBestActions(
      {
        deal: {
          id: d.id,
          name: d.name,
          stage: d.stage,
          targetCloseDate: d.targetCloseDate,
          stageEntryDate: d.stageEntryDate,
        },
        openTasks: (tasksByDeal.get(d.id) ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          completed: t.completed,
        })),
        outstandingDocuments: (outDocsByDeal.get(d.id) ?? []).map((doc) => ({
          id: doc.id,
          name: doc.name,
          receivedDate: doc.receivedDate,
          reviewer: doc.reviewer,
          uploaded: doc.uploaded,
        })),
        receivedDocuments: (reviewDocsByDeal.get(d.id) ?? []).map((doc) => ({
          id: doc.id,
          name: doc.name,
          receivedDate: doc.receivedDate,
          reviewer: doc.reviewer,
          uploaded: doc.uploaded,
        })),
        memos: (memosByDeal.get(d.id) ?? []).map((m) => ({
          id: m.id,
          statusKey: m.statusKey,
        })),
        // Memo consistency findings require the full CreditMemoData
        // (memos + sections), not just the WorkQueueMemoRow shape.
        // The banker work-queue loader does not pull sections, so
        // this signal is intentionally silent on the rollup surface.
        // The full check fires on the Phase 80 per-deal panel.
        memoConsistencyFindingsCount: 0,
        mostRecentActivityIso: d.lastActivityOn,
      },
      now,
    );
    if (suggestions.length === 0) continue;
    const top = suggestions[0]!;
    const highestPriority = top.priority;
    if (highestPriority === 'high') highCount++;
    else if (highestPriority === 'medium') mediumCount++;
    else lowCount++;
    flagged.push({
      dealId: d.id,
      dealName: d.name,
      clientName: d.clientName,
      stage: d.stage,
      targetCloseDate: d.targetCloseDate,
      topSuggestion: top,
      suggestionCount: suggestions.length,
      highestPriority,
    });
  }

  flagged.sort(compareRollupDeals);

  return {
    totalDealsScanned: input.deals.length,
    dealsWithSuggestions: flagged.length,
    highPriorityDealCount: highCount,
    mediumPriorityDealCount: mediumCount,
    lowPriorityDealCount: lowCount,
    topDeals: flagged.slice(0, TOP_N_BANKER_ROLLUP_DEALS),
  };
}

// ---------------------------------------------------------------------------
// Sort + helpers
//
// Ranking rules match Phase 81 (manager rollup):
//   1) priority desc (HIGH > MEDIUM > LOW);
//   2) suggestion count desc;
//   3) nearest target close date (missing → far future);
//   4) deal name asc (stable lexicographic fallback).
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<AutopilotPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function compareRollupDeals(a: BankerRollupDeal, b: BankerRollupDeal): number {
  const dp = PRIORITY_RANK[b.highestPriority] - PRIORITY_RANK[a.highestPriority];
  if (dp !== 0) return dp;
  const dc = b.suggestionCount - a.suggestionCount;
  if (dc !== 0) return dc;
  const aMs = parseIso(a.targetCloseDate);
  const bMs = parseIso(b.targetCloseDate);
  const aClose = aMs ?? Number.POSITIVE_INFINITY;
  const bClose = bMs ?? Number.POSITIVE_INFINITY;
  if (aClose !== bClose) return aClose - bClose;
  return a.dealName.localeCompare(b.dealName);
}

function bucketBy<T, K>(
  items: readonly T[],
  keyFn: (t: T) => K,
): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const arr = m.get(k) ?? [];
    arr.push(item);
    m.set(k, arr);
  }
  return m;
}

function parseIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}
