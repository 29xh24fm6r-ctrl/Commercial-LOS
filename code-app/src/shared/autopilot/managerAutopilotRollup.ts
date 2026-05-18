/**
 * Phase 81: deterministic manager-side rollup over the Phase 80
 * "Next Best Actions" derivation.
 *
 * Calls the Phase 80 `deriveNextBestActions` once per deal in the
 * manager's already-authorized team pipeline, aggregates the
 * priority counts, and ranks the top N deals for the manager card.
 *
 * IMPORTANT — signal coverage on the manager surface:
 *
 *   The manager workspace's `teamPipeline` (TeamDeal[]) carries
 *   deal-record fields only — targetCloseDate, stageEntryDate,
 *   modifiedOn, etc. It does NOT carry per-deal open tasks,
 *   outstanding documents, received documents, or credit memos.
 *
 *   Therefore, the per-deal call to deriveNextBestActions passes
 *   empty arrays for those collections and `deal.modifiedOn` as the
 *   mostRecentActivityIso proxy. Five of the eight Phase 80 signals
 *   are silenced on the manager surface (overdue-tasks,
 *   pending-review-documents, outstanding-documents,
 *   memo-consistency-findings, draft-memo). The three that fire are:
 *     - closing-soon-stale-activity (HIGH)
 *     - closing-soon (MEDIUM)
 *     - stage-aging (MEDIUM)
 *     - stale-activity (LOW)
 *
 *   This limitation is honestly surfaced by the card disclaimer and
 *   documented in docs/PHASE_81_MANAGER_AUTOPILOT_ROLLUP.md. A
 *   future phase could load manager-scoped child data and broaden
 *   the coverage; Phase 81 ships the deal-record floor.
 *
 * What this is NOT (mirrors the Phase 80 contract):
 *   - Not AI / Copilot / model invocation.
 *   - Not automated execution. The card never clicks an action
 *     button, never creates a task, never sends an email.
 *   - Not a credit decision, not an approval.
 *   - Not a permission widener — deals not in `teamPipeline` are
 *     not visible here; the manager's authorization scope is the
 *     authoritative boundary.
 */

import {
  deriveNextBestActions,
  type AutopilotPriority,
  type NextBestAction,
} from './dealAutopilot';

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
}

export interface ManagerRollupInput {
  deals: readonly ManagerRollupDealInput[];
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
        openTasks: [],
        outstandingDocuments: [],
        receivedDocuments: [],
        memos: [],
        memoConsistencyFindingsCount: 0,
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

function parseIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}
