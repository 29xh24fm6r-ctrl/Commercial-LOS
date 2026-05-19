/**
 * Phase 84: deterministic team-side rollup over the Phase 80
 * "Next Best Actions" derivation.
 *
 * The team workspace's `TeamDataProvider` loads not just deals but
 * also per-deal tasks, documents (with status), and memos. That
 * means team signal coverage matches the Phase 82 BANKER rollup
 * (7 of 8 signals fire) — strictly richer than the Phase 81
 * MANAGER rollup (which only sees deal-record fields).
 *
 * Module shape — Phase 84 defines its own structural input that
 * mirrors the team data shapes, then delegates to the Phase 82
 * banker derivation (`deriveBankerAutopilotRollup`). Re-using the
 * banker derivation keeps the rule set in one place; a future
 * change to the rules applies to both the personal banker rollup
 * AND the team rollup without drift.
 *
 * Signal coverage on the team rollup:
 *   ✓ overdue-tasks (HIGH)
 *   ✓ pending-review-documents (HIGH)
 *   ✓ closing-soon-stale-activity (HIGH)
 *   ✓ closing-soon (MEDIUM)
 *   ✓ stage-aging (MEDIUM)
 *   ✓ outstanding-documents (MEDIUM)
 *   ✓ draft-memo (LOW)
 *   ✓ stale-activity (LOW)
 *   ✗ memo-consistency-findings (MEDIUM) — requires per-deal
 *     CreditMemoData with sections; the team workspace's memo
 *     row only carries status, not sections.
 *
 * What this is NOT (mirrors Phase 80 / 81 / 82 / 83 contract):
 *   - Not AI / Copilot / model invocation.
 *   - Not automated execution.
 *   - Not a credit decision, not an approval.
 *   - Not a permission widener — deals not in
 *     `TeamDataProvider.deals` are not visible here.
 */

import {
  deriveBankerAutopilotRollup,
  type BankerAutopilotRollup,
  type BankerRollupDeal,
  type BankerRollupDocumentInput,
  type BankerRollupMemoSectionInput,
} from './bankerAutopilotRollup';

/** Cap on top-ranked deals surfaced by the team rollup. Same cap as
 *  the manager rollup (Phase 81) and the banker rollup (Phase 82). */
export const TOP_N_TEAM_ROLLUP_DEALS = 5;

// ---------------------------------------------------------------------------
// Structural input shapes — mirror the team workspace data shapes
// (TeamDealRow, TeamTaskRow, TeamDocumentRow, TeamMemoRow) by
// structural typing so this module stays under src/shared/ without
// importing from the team role directory (Phase 48 isolation).
// ---------------------------------------------------------------------------

export interface TeamRollupDealInput {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  /** Standard Dataverse modifiedon, used as the mostRecentActivityIso
   *  proxy — same approach Phase 81 / 82 use. */
  modifiedOn: string | undefined;
  /** Banker the deal is currently assigned to, if any. Shown on the
   *  card so the team member can see ownership without leaving the
   *  workspace. */
  assignedBankerName: string | undefined;
  /** Phase 95: loan amount field the Phase 73 consistency check
   *  reads. Optional. Forwarded into the banker derivation.
   *  `collateralSummary` is intentionally NOT on the team rollup
   *  surface (only DealDetail carries it). */
  amount?: number | undefined;
}

export interface TeamRollupTaskInput {
  id: string;
  /** TeamTaskRow.dealId is `string | undefined`; rows with no dealId
   *  cannot be attributed to a deal and are dropped by the
   *  derivation. */
  dealId: string | undefined;
  title: string;
  dueDate: string | undefined;
  completed: boolean;
}

export interface TeamRollupDocumentInput {
  id: string;
  dealId: string | undefined;
  name: string;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded?: boolean;
  /** TeamDocumentRow already carries a derived 'outstanding' |
   *  'received' | 'reviewed' status, so the team rollup can split
   *  documents into the two buckets Phase 82's banker derivation
   *  expects without re-computing. */
  status: 'outstanding' | 'received' | 'reviewed';
}

export interface TeamRollupMemoInput {
  id: string;
  dealId: string | undefined;
  statusKey: 'draft' | 'final' | 'stale' | undefined;
  /** Phase 95: memo text preview. Optional. */
  textPreview?: string | undefined;
}

/**
 * Phase 95: per-deal memo section row used by the consistency
 * check. Structurally identical to the manager / banker rollup
 * section input shape.
 */
export interface TeamRollupMemoSectionInput {
  id: string;
  dealId: string | undefined;
  sectionLabel: string;
  textPreview: string | undefined;
}

export interface TeamRollupInput {
  deals: readonly TeamRollupDealInput[];
  tasks: readonly TeamRollupTaskInput[];
  documents: readonly TeamRollupDocumentInput[];
  memos: readonly TeamRollupMemoInput[];
  /** Phase 95 — optional. When supplied the team rollup forwards
   *  memo sections (and memo `textPreview`) to the banker
   *  derivation, which runs the Phase 73 consistency check per
   *  deal. When omitted, behavior matches Phase 84. */
  memoSections?: readonly TeamRollupMemoSectionInput[];
}

/** Per-row output — alias of the Phase 82 banker row, since both
 *  surfaces produce the same shape. */
export type TeamRollupDeal = BankerRollupDeal;

/** Rollup output — alias of the Phase 82 banker rollup output. */
export type TeamAutopilotRollup = BankerAutopilotRollup;

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveTeamAutopilotRollup(
  input: TeamRollupInput,
  now: Date,
): TeamAutopilotRollup {
  // Split team documents into the two buckets the Phase 82 banker
  // derivation expects:
  //   - outstanding: status === 'outstanding'
  //   - pendingReview: status === 'received' (the 7d threshold is
  //     re-applied inside the Phase 80 derivation;
  //     status === 'reviewed' rows are excluded because the rule no
  //     longer fires after a reviewer is on the record).
  const outstandingDocuments: BankerRollupDocumentInput[] = [];
  const pendingReviewDocuments: BankerRollupDocumentInput[] = [];
  for (const d of input.documents) {
    if (!d.dealId) continue;
    const shape: BankerRollupDocumentInput = {
      id: d.id,
      dealId: d.dealId,
      name: d.name,
      receivedDate: d.receivedDate,
      reviewer: d.reviewer,
      uploaded: d.uploaded,
    };
    if (d.status === 'outstanding') {
      outstandingDocuments.push(shape);
    } else if (d.status === 'received') {
      pendingReviewDocuments.push(shape);
    }
    // 'reviewed' rows: the Phase 80 derivation's pending-review
    // signal already filters on no-reviewer, so passing them through
    // would be wasted work. Skip.
  }

  // Phase 95: reshape optional memo sections for the banker derivation.
  // The team workspace stores section rows with `dealId: string | undefined`
  // (matching TeamMemoSectionRow), so rows without a dealId cannot be
  // attributed to a deal and are dropped — same approach taken for tasks
  // and memos above.
  const memoSections: BankerRollupMemoSectionInput[] = (input.memoSections ?? [])
    .filter((s) => s.dealId != null)
    .map((s) => ({
      id: s.id,
      dealId: s.dealId!,
      sectionLabel: s.sectionLabel,
      textPreview: s.textPreview,
    }));

  return deriveBankerAutopilotRollup(
    {
      deals: input.deals.map((d) => ({
        id: d.id,
        name: d.name,
        clientName: d.clientName,
        stage: d.stage,
        targetCloseDate: d.targetCloseDate,
        stageEntryDate: d.stageEntryDate,
        lastActivityOn: d.modifiedOn,
        amount: d.amount,
      })),
      tasks: input.tasks
        .filter((t) => t.dealId != null)
        .map((t) => ({
          id: t.id,
          dealId: t.dealId!,
          title: t.title,
          dueDate: t.dueDate,
          completed: t.completed,
        })),
      outstandingDocuments,
      pendingReviewDocuments,
      memos: input.memos
        .filter((m) => m.dealId != null)
        .map((m) => ({
          id: m.id,
          dealId: m.dealId!,
          statusKey: m.statusKey,
          textPreview: m.textPreview,
        })),
      memoSections,
    },
    now,
  );
}
