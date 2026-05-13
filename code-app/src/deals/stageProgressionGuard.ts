import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';
import { deriveBlockers, type BlockersResult } from './blockerRules';
import { deriveCreditMemoFreshness } from './creditMemoFreshness';

/**
 * Phase 27: derived-only stage progression eligibility. Pure function;
 * no Dataverse writes, no schema changes, no stage-transition config.
 * It does NOT move the deal — it only reports whether the current
 * data looks Clear, At Risk, or Blocked for a hypothetical forward
 * progression. The write phase for stage movement is deferred.
 *
 * Conservative discipline:
 *   - Copy reads as "appears blocked", "review needed", "eligibility
 *     signal". Never "ineligible", "cannot move", or "fail".
 *   - The "blocked" kind reflects an OBSERVED data condition — not a
 *     credit decision. The next-action guidance is process language:
 *     "Resolve the listed signals before initiating stage movement."
 *   - Stage names are matched case-insensitively to a small set of
 *     well-known phases (underwriting, committee). No new
 *     stage-transition configuration is invented.
 */

export type ProgressionEligibilityStatus = 'clear' | 'at-risk' | 'blocked';

export interface ProgressionReason {
  id: string;
  label: string;
  severity: 'blocked' | 'at-risk';
}

export interface ProgressionEligibilityResult {
  status: ProgressionEligibilityStatus;
  /** The stage name the deal is currently in, as captured on the
   *  deal record. Echoed back so the UI doesn't have to fish it out
   *  of the same context. Undefined if the deal has no stage set. */
  currentStage: string | undefined;
  reasons: ProgressionReason[];
  /** Banker-facing process language. Always non-empty. Never a
   *  decision verb ("approve", "submit", "promote"); only a guide
   *  for the next concrete data action. */
  nextActionGuidance: string;
}

interface DeriveProgressionInput {
  deal: DealDetail;
  tasks: DealTasksResult | undefined;
  documents: DealDocumentsResult | undefined;
  creditMemo: CreditMemoData | undefined;
  activity: readonly TimelineEvent[] | undefined;
  /** Pre-computed blockers result. Optional — derived from
   *  deal/tasks/documents if omitted so callers can use this
   *  function as a pure utility in tests. */
  blockers?: BlockersResult;
  now?: Date;
}

const GUIDANCE_CLEAR =
  'No data signals are currently blocking forward progression. Banker review still required before any stage movement.';
const GUIDANCE_AT_RISK =
  'Review the listed signals. Forward progression appears possible once outstanding items are addressed.';
const GUIDANCE_BLOCKED =
  'Resolve the listed signals before initiating stage movement. This is a data signal — not a credit decision.';

/**
 * Stages that gate progression on a credit memo. A deal currently
 * sitting at one of these stages cannot move forward without at
 * least one memo on file. Match is case-insensitive substring so
 * "Underwriting Review" / "Senior Committee" / etc. are caught.
 */
const MEMO_GATING_STAGE_PATTERNS: readonly RegExp[] = [
  /underwrit/i,
  /committee/i,
];

function stageRequiresMemo(stage: string | undefined): boolean {
  if (!stage) return false;
  return MEMO_GATING_STAGE_PATTERNS.some((p) => p.test(stage));
}

export function deriveStageProgressionEligibility(
  input: DeriveProgressionInput,
): ProgressionEligibilityResult {
  const now = input.now ?? new Date();
  const blockers =
    input.blockers ?? deriveBlockers(input.deal, input.tasks, input.documents, now);
  const reasons: ProgressionReason[] = [];

  // 1 & 2. Mirror DealBlockers' own status. Blocked beats at-risk.
  if (blockers.status === 'blocked') {
    reasons.push({
      id: 'blockers-blocked',
      severity: 'blocked',
      label: 'Deal blockers card reports a blocked condition.',
    });
  } else if (blockers.status === 'at-risk') {
    reasons.push({
      id: 'blockers-at-risk',
      severity: 'at-risk',
      label: 'Deal blockers card reports an at-risk condition.',
    });
  }

  // 3. Memo-gating stage but no memo on file.
  const memos = input.creditMemo?.memos ?? [];
  const sections = input.creditMemo?.sections ?? [];
  const hasMemoOrDraft = memos.length > 0 || sections.length > 0;
  if (stageRequiresMemo(input.deal.stage) && !hasMemoOrDraft) {
    reasons.push({
      id: 'memo-required-missing',
      severity: 'blocked',
      label: `Stage "${input.deal.stage}" gates forward progression on a credit memo, and none is on file.`,
    });
  }

  // 4. Memo may be stale.
  if (hasMemoOrDraft) {
    const freshness = deriveCreditMemoFreshness({
      deal: input.deal,
      tasks: input.tasks,
      documents: input.documents,
      creditMemo: input.creditMemo,
      activity: input.activity,
      blockers,
      now,
    });
    if (freshness.kind === 'blocked' || freshness.kind === 'at-risk') {
      reasons.push({
        id: 'memo-may-be-stale',
        severity: 'at-risk',
        label: 'Credit memo may be stale — review recommended before stage movement.',
      });
    }
  }

  // 5. Outstanding required documents exist.
  if (input.documents) {
    const outstanding = input.documents.outstanding;
    if (outstanding.length > 0) {
      reasons.push({
        id: 'outstanding-documents',
        severity: 'at-risk',
        label: `${outstanding.length} outstanding document${outstanding.length === 1 ? '' : 's'} pending receipt.`,
      });
    }
  }

  // 6. Overdue tasks (open).
  if (input.tasks) {
    const overdueOpen = input.tasks.open.filter((t) => isOverdue(t.dueDate, now));
    if (overdueOpen.length > 0) {
      reasons.push({
        id: 'overdue-tasks',
        severity: 'at-risk',
        label: `${overdueOpen.length} overdue open task${overdueOpen.length === 1 ? '' : 's'}.`,
      });
    }
  }

  if (reasons.length === 0) {
    return {
      status: 'clear',
      currentStage: input.deal.stage,
      reasons: [],
      nextActionGuidance: GUIDANCE_CLEAR,
    };
  }
  const isBlocked = reasons.some((r) => r.severity === 'blocked');
  return {
    status: isBlocked ? 'blocked' : 'at-risk',
    currentStage: input.deal.stage,
    reasons,
    nextActionGuidance: isBlocked ? GUIDANCE_BLOCKED : GUIDANCE_AT_RISK,
  };
}

function isOverdue(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}
