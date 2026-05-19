/**
 * Phase 81 → Phase 87: deterministic manager-side rollup over the
 * Phase 80 "Next Best Actions" derivation.
 *
 * Phase 81 shipped this rollup with deal-record fields only —
 * teamPipeline (TeamDeal[]) carried no per-deal tasks / documents /
 * memos, so the per-deal call to `deriveNextBestActions` passed
 * empty arrays for those collections and only 4 of 8 signals fired
 * on the manager surface.
 *
 * Phase 87 closes the signal-coverage gap by accepting manager-
 * authorized child data (tasks / documents with status / memos)
 * loaded through ManagerDataProvider's new slots. The new inputs are
 * **optional** to preserve every Phase 81 caller — if a caller still
 * passes only `{ deals: [...] }`, the rollup behaves exactly as it
 * did under Phase 81. When the new collections are supplied, the
 * derivation buckets them by dealId and feeds the real per-deal
 * collections into the Phase 80 derivation.
 *
 * Signal coverage after Phase 87:
 *
 *   ✓ closing-soon-stale-activity (HIGH)
 *   ✓ closing-soon              (MEDIUM)
 *   ✓ stage-aging               (MEDIUM)
 *   ✓ stale-activity            (LOW)        — existing under Phase 81
 *   ✓ overdue-tasks             (HIGH)       — Phase 87
 *   ✓ pending-review-documents  (HIGH)       — Phase 87
 *   ✓ outstanding-documents     (MEDIUM)     — Phase 87
 *   ✓ draft-memo                (LOW)        — Phase 87
 *   ✗ memo-consistency-findings (MEDIUM)     — still silenced. Requires
 *     per-deal CreditMemoData with sections; the manager memo loader
 *     pulls status only. Same gap the banker/team rollups carry.
 *
 * Net: 7 of 8 Phase 80 signals fire on the Phase 87 manager rollup —
 * matching the banker (Phase 82) and team (Phase 84) rollups.
 *
 * What this is NOT (mirrors the Phase 80 / 81 contract):
 *   - Not AI / Copilot / model invocation.
 *   - Not automated execution. The card never clicks an action
 *     button, never creates a task, never sends an email.
 *   - Not a credit decision, not an approval.
 *   - Not a permission widener — the input is the manager's
 *     authorized team pipeline + the team-scoped child rows loaded
 *     through `cr664_Deal/_cr664_team_value eq <teamId>`. Deals
 *     outside the manager's team are not visible here.
 */

import {
  deriveNextBestActions,
  type AutopilotPriority,
  type NextBestAction,
} from './dealAutopilot';
import { countConsistencyFindingsForDeal } from '../creditMemoConsistency/checkCreditMemoConsistency';

/** Cap on top-ranked deals surfaced by the rollup. The brief allows
 *  5 or 10; 5 keeps the card visually compact without scrolling. */
export const TOP_N_ROLLUP_DEALS = 5;

// ---------------------------------------------------------------------------
// Structural input shapes — mirrors TeamDeal (manager/managerQueries.ts) +
// TeamDealRow (team/teamQueries.ts) by structural typing so this module
// stays under src/shared/ without importing from a role directory
// (Phase 48 isolation).
// ---------------------------------------------------------------------------

export interface ManagerRollupDealInput {
  id: string;
  name: string;
  stage: string | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  /** Standard Dataverse modifiedon — used as the
   *  mostRecentActivityIso proxy on the manager surface. Less
   *  precise than the per-deal Activity Timeline, but it is the
   *  only activity signal carried by team-pipeline records today. */
  modifiedOn: string | undefined;
  assignedBankerName: string | undefined;
  /** Phase 95: optional client name + loan amount the consistency
   *  check reads. `clientName` is already present on TeamDeal;
   *  `amount` is too. Both are passed through structurally so the
   *  Phase 73 checker can run per deal. Optional so pre-Phase 95
   *  callers (every existing test) continue to compile. */
  clientName?: string | undefined;
  amount?: number | undefined;
  /** Phase 95: not available on manager-scoped TeamDeal (only on
   *  per-deal DealDetail). Passed as undefined; the collateral
   *  check stays silent on the manager rollup. */
  collateralSummary?: string | undefined;
}

// Phase 87: manager-scoped child rows. Match the team-side row shapes
// by structural typing (same lookups, same fields) so this module
// does not need to import from src/manager/ or src/team/. The team-
// scoped server-side filter that loads these rows is described in
// `src/manager/managerQueries.ts` (loadManagerTeamTasks / Documents /
// Memos), which deliberately duplicates the team workspace's filter
// pattern to keep the two role data layers isolated (Phase 48).

export interface ManagerRollupTaskInput {
  id: string;
  /** Rows with no dealId cannot be attributed to a deal; the
   *  derivation drops them. */
  dealId: string | undefined;
  title: string;
  dueDate: string | undefined;
  completed: boolean;
}

export interface ManagerRollupDocumentInput {
  id: string;
  dealId: string | undefined;
  name: string;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded?: boolean;
  /** Pre-derived status discriminant. The derivation splits
   *  'outstanding' into Phase 80's outstandingDocuments bucket and
   *  'received' into Phase 80's receivedDocuments bucket; 'reviewed'
   *  rows are dropped because the Phase 80 pending-review filter
   *  already requires "no reviewer" and the rule does not re-fire on
   *  rows that already have one. */
  status: 'outstanding' | 'received' | 'reviewed';
}

export interface ManagerRollupMemoInput {
  id: string;
  dealId: string | undefined;
  statusKey: 'draft' | 'final' | 'stale' | undefined;
  /** Phase 95: memo text preview (capped at the same 240-char
   *  preview the Phase 80 panel uses). Optional. */
  textPreview?: string | undefined;
}

/**
 * Phase 95: per-deal memo section row used by the consistency
 * check. Mirrors `CreditMemoSectionItem` structurally so the
 * shared module doesn't import from `src/deals/`.
 */
export interface ManagerRollupMemoSectionInput {
  id: string;
  dealId: string | undefined;
  sectionLabel: string;
  textPreview: string | undefined;
}

export interface ManagerRollupInput {
  deals: readonly ManagerRollupDealInput[];
  /** Phase 87 — optional. Empty / missing collections preserve the
   *  Phase 81 behavior (deal-record signals only). When supplied,
   *  the derivation fires the four additional signals listed in the
   *  module docblock. */
  tasks?: readonly ManagerRollupTaskInput[];
  documents?: readonly ManagerRollupDocumentInput[];
  memos?: readonly ManagerRollupMemoInput[];
  /** Phase 95 — optional. When supplied, the derivation runs the
   *  Phase 73 consistency check per deal and unlocks the eighth
   *  signal (memo-consistency-findings) on the manager rollup.
   *  When omitted, the count stays 0 and the signal is silent —
   *  exact pre-Phase 95 behavior. */
  memoSections?: readonly ManagerRollupMemoSectionInput[];
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface ManagerRollupDeal {
  dealId: string;
  dealName: string;
  stage: string | undefined;
  assignedBankerName: string | undefined;
  targetCloseDate: string | undefined;
  /** The single highest-priority NextBestAction on the deal. Used by
   *  the manager card to show "one line per deal" without revealing
   *  the full Phase 80 suggestion list for every deal. */
  topSuggestion: NextBestAction;
  /** Count of all suggestions surfaced for this deal (after Phase 80
   *  cap). Helps the manager scan for "many things going on". */
  suggestionCount: number;
  highestPriority: AutopilotPriority;
}

export interface ManagerAutopilotRollup {
  /** Total deals scanned. Same as teamPipeline.length. */
  totalDealsScanned: number;
  /** Number of deals whose deriveNextBestActions returned at least
   *  one suggestion. */
  dealsWithSuggestions: number;
  highPriorityDealCount: number;
  mediumPriorityDealCount: number;
  lowPriorityDealCount: number;
  /** Top-ranked deals to display. Capped at TOP_N_ROLLUP_DEALS. */
  topDeals: ManagerRollupDeal[];
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveManagerAutopilotRollup(
  input: ManagerRollupInput,
  now: Date,
): ManagerAutopilotRollup {
  // Phase 87: bucket children by deal id once. Orphan rows (no
  // dealId) are dropped — the manager rollup never invents a parent
  // for a row that arrived without one.
  const tasksByDeal = bucketBy(input.tasks ?? [], (t) => t.dealId);
  const outDocsByDeal = bucketBy(
    (input.documents ?? []).filter((d) => d.status === 'outstanding'),
    (d) => d.dealId,
  );
  const pendingReviewDocsByDeal = bucketBy(
    (input.documents ?? []).filter((d) => d.status === 'received'),
    (d) => d.dealId,
  );
  // 'reviewed' documents are intentionally dropped — Phase 80's
  // pending-review signal already filters on "no reviewer" and the
  // rule does not re-fire on rows that already carry one.
  const memosByDeal = bucketBy(input.memos ?? [], (m) => m.dealId);
  // Phase 95: bucket memo sections by deal so the per-deal
  // consistency check has both halves of the haystack.
  const sectionsByDeal = bucketBy(
    input.memoSections ?? [],
    (s) => s.dealId,
  );

  const flagged: ManagerRollupDeal[] = [];
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
        receivedDocuments: (pendingReviewDocsByDeal.get(d.id) ?? []).map(
          (doc) => ({
            id: doc.id,
            name: doc.name,
            receivedDate: doc.receivedDate,
            reviewer: doc.reviewer,
            uploaded: doc.uploaded,
          }),
        ),
        memos: (memosByDeal.get(d.id) ?? []).map((m) => ({
          id: m.id,
          statusKey: m.statusKey,
        })),
        // Phase 95: when the caller supplies memo sections (Phase
        // 95 wired loader: `loadManagerTeamMemoSections`) AND memo
        // `textPreview`, run the Phase 73 consistency check per
        // deal and pass the findings count into the autopilot
        // signal evaluation. When sections are absent (every
        // pre-Phase-95 test) the count stays 0 — exact previous
        // behavior, no test churn.
        memoConsistencyFindingsCount: countConsistencyFindingsForDeal(
          {
            name: d.name,
            clientName: d.clientName,
            stage: d.stage,
            amount: d.amount,
            collateralSummary: d.collateralSummary,
          },
          (memosByDeal.get(d.id) ?? []).map((m) => ({
            textPreview: m.textPreview,
          })),
          (sectionsByDeal.get(d.id) ?? []).map((s) => ({
            sectionLabel: s.sectionLabel,
            textPreview: s.textPreview,
          })),
        ),
        mostRecentActivityIso: d.modifiedOn,
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
      stage: d.stage,
      assignedBankerName: d.assignedBankerName,
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
    topDeals: flagged.slice(0, TOP_N_ROLLUP_DEALS),
  };
}

// ---------------------------------------------------------------------------
// Sort
//
// Ranking rules:
//   1) priority desc (HIGH > MEDIUM > LOW);
//   2) suggestion count desc;
//   3) nearest target close date (missing → far future);
//   4) deal name asc (stable lexicographic fallback so the rollup
//      stays deterministic when two deals tie on every prior key).
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<AutopilotPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function compareRollupDeals(a: ManagerRollupDeal, b: ManagerRollupDeal): number {
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
    if (k == null) continue;
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
