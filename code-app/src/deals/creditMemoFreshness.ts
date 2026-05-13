import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData, CreditMemoSummary } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';
import {
  deriveBlockers,
  type BlockerSeverity,
  type BlockersResult,
} from './blockerRules';

/**
 * Phase 26: derived-only credit-memo freshness signal. Pure function;
 * no Dataverse writes, no regeneration, no schema changes. Reads only
 * the same authorized DealDataProvider context everything else uses.
 *
 * Conservative discipline: never claims a memo IS stale server-side
 * (no ArtifactFreshness write here). The kind is 'at-risk' or
 * 'blocked' at most — surfaced with "May be stale" / "Review
 * recommended." copy. The reasons list explains *why*.
 *
 * Severity ladder (max wins):
 *   blocked  — deriveBlockers status === 'blocked'. Memo cannot
 *              be safely trusted while a true blocker is open;
 *              matches the existing blocker severity.
 *   at-risk  — any of: memo schema status === 'stale'; memo predates
 *              current stage entry / activity / overdue tasks /
 *              overdue documents; a final memo exists but newer
 *              deal/task/doc activity is in the ledger.
 *   fresh    — memo exists AND none of the at-risk/blocked
 *              indicators fire.
 *   no-memo  — no memos and no section drafts on file.
 */

export type CreditMemoFreshnessKind = 'no-memo' | 'fresh' | 'at-risk' | 'blocked';

export interface CreditMemoFreshnessReason {
  id: string;
  /** Short, banker-facing reason. Conservative copy: "may be stale",
   *  "review recommended". Never "is stale" / "is invalid". */
  label: string;
  severity: BlockerSeverity;
}

export interface CreditMemoFreshnessResult {
  kind: CreditMemoFreshnessKind;
  /** ISO of the most recent memo save/generation we could find, or
   *  undefined if there's no memo or no usable timestamp. */
  latestSavedAt: string | undefined;
  /** Stable summary text for the CTA region. Always non-empty. */
  ctaText: string;
  reasons: CreditMemoFreshnessReason[];
}

interface DeriveFreshnessInput {
  deal: DealDetail;
  tasks: DealTasksResult | undefined;
  documents: DealDocumentsResult | undefined;
  creditMemo: CreditMemoData | undefined;
  /** Optional. When provided, the freshness check folds in
   *  visibility-scoped timeline events newer than the memo. */
  activity: readonly TimelineEvent[] | undefined;
  /** Pre-computed blockers result. Optional — if omitted we recompute
   *  from deal/tasks/documents so callers can use the function as a
   *  pure utility in tests. */
  blockers?: BlockersResult;
  now?: Date;
}

const CTA_FRESH = 'Memo reflects the current deal record.';
const CTA_NO_MEMO = 'No memo on file yet. Generate a draft preview to start.';
const CTA_AT_RISK = 'May be stale — review recommended.';
const CTA_BLOCKED = 'May be stale — review recommended while the blocker is open.';

export function deriveCreditMemoFreshness(
  input: DeriveFreshnessInput,
): CreditMemoFreshnessResult {
  const now = input.now ?? new Date();
  const latestSavedAt = latestMemoActivity(input.creditMemo);

  // No memo OR no section drafts → no freshness state to report.
  const memos = input.creditMemo?.memos ?? [];
  const sections = input.creditMemo?.sections ?? [];
  if (memos.length === 0 && sections.length === 0) {
    return { kind: 'no-memo', latestSavedAt: undefined, ctaText: CTA_NO_MEMO, reasons: [] };
  }

  const reasons: CreditMemoFreshnessReason[] = [];
  const blockers =
    input.blockers ?? deriveBlockers(input.deal, input.tasks, input.documents, now);

  // 1. Memo schema status is already 'stale'.
  const staleMemo = memos.find((m) => m.statusKey === 'stale');
  if (staleMemo) {
    reasons.push({
      id: 'schema-stale',
      severity: 'at-risk',
      label: `Memo "${staleMemo.name}" is marked stale in Dataverse.`,
    });
  }

  // 2. Memo predates the current stage entry.
  if (latestSavedAt && input.deal.stageEntryDate) {
    if (input.deal.stageEntryDate > latestSavedAt) {
      reasons.push({
        id: 'stage-changed-since-memo',
        severity: 'at-risk',
        label: `Deal entered the "${input.deal.stage ?? 'current stage'}" stage after the memo was last saved.`,
      });
    }
  }

  // 3. Overdue tasks exist.
  if (input.tasks) {
    const overdueTasks = input.tasks.open.filter((t) => isOverdue(t.dueDate, now));
    if (overdueTasks.length > 0) {
      reasons.push({
        id: 'overdue-tasks',
        severity: 'at-risk',
        label: `${overdueTasks.length} overdue open task${overdueTasks.length === 1 ? '' : 's'} not reflected in the memo.`,
      });
    }
  }

  // 4. Outstanding overdue documents exist.
  if (input.documents) {
    const overdueDocs = input.documents.outstanding.filter((d) => isOverdue(d.dueDate, now));
    if (overdueDocs.length > 0) {
      reasons.push({
        id: 'overdue-documents',
        severity: 'at-risk',
        label: `${overdueDocs.length} overdue outstanding document${overdueDocs.length === 1 ? '' : 's'} not reflected in the memo.`,
      });
    }
  }

  // 5. Blocker rules are already flagging the deal.
  if (blockers.status === 'blocked') {
    reasons.push({
      id: 'deal-blocked',
      severity: 'blocked',
      label: 'Deal is currently flagged as Blocked by blocker rules.',
    });
  } else if (blockers.status === 'at-risk' && reasons.length === 0) {
    // Only fold in a generic At Risk reason if nothing more specific
    // already fired — otherwise we'd double-list overdue tasks/docs.
    reasons.push({
      id: 'deal-at-risk',
      severity: 'at-risk',
      label: 'Deal is currently flagged as At Risk by blocker rules.',
    });
  }

  // 6. Final memo with newer deal/task/document activity.
  const finalMemos = memos.filter((m) => m.statusKey === 'final');
  if (finalMemos.length > 0 && latestSavedAt) {
    if (
      hasNewerActivity({
        latestSavedAt,
        deal: input.deal,
        tasks: input.tasks,
        documents: input.documents,
        activity: input.activity,
      })
    ) {
      reasons.push({
        id: 'final-memo-but-newer-events',
        severity: 'at-risk',
        label: 'A final memo is on file, but newer deal, task, document, or timeline events have been recorded since.',
      });
    }
  }

  if (reasons.length === 0) {
    return {
      kind: 'fresh',
      latestSavedAt,
      ctaText: CTA_FRESH,
      reasons: [],
    };
  }

  const isBlocked = reasons.some((r) => r.severity === 'blocked');
  return {
    kind: isBlocked ? 'blocked' : 'at-risk',
    latestSavedAt,
    ctaText: isBlocked ? CTA_BLOCKED : CTA_AT_RISK,
    reasons,
  };
}

function latestMemoActivity(creditMemo: CreditMemoData | undefined): string | undefined {
  if (!creditMemo) return undefined;
  let latest: string | undefined;
  const consider = (iso: string | undefined): void => {
    if (!iso) return;
    if (!latest || iso > latest) latest = iso;
  };
  for (const m of creditMemo.memos) {
    consider(m.modifiedOn);
    consider(m.generatedAt);
  }
  for (const s of creditMemo.sections) {
    consider(s.modifiedOn);
    consider(s.lastGeneratedAt);
  }
  return latest;
}

function isOverdue(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

function hasNewerActivity(opts: {
  latestSavedAt: string;
  deal: DealDetail;
  tasks: DealTasksResult | undefined;
  documents: DealDocumentsResult | undefined;
  activity: readonly TimelineEvent[] | undefined;
}): boolean {
  const cutoff = opts.latestSavedAt;
  // Stage entry counts as a deal change.
  if (opts.deal.stageEntryDate && opts.deal.stageEntryDate > cutoff) return true;
  if (opts.tasks) {
    const all = [...opts.tasks.open, ...opts.tasks.completed];
    if (all.some((t) => t.modifiedOn && t.modifiedOn > cutoff)) return true;
  }
  if (opts.documents) {
    const allDocs = [
      ...opts.documents.outstanding,
      ...opts.documents.received,
      ...opts.documents.reviewed,
    ];
    if (allDocs.some((d) => d.modifiedOn && d.modifiedOn > cutoff)) return true;
  }
  if (opts.activity) {
    if (opts.activity.some((e) => e.eventAt > cutoff)) return true;
  }
  return false;
}

// Re-exported for consumers that want the memo type without a second
// import line.
export type { CreditMemoSummary };
