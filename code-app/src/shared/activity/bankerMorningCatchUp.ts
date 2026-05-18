/**
 * Phase 89: thin banker-side adapter over the Phase 88 manager
 * morning-catch-up derivation.
 *
 * The Phase 88 primitive (`deriveManagerMorningCatchUp`) is
 * structurally generic — its input shapes describe "deals + tasks
 * + documents (with status discriminant) + memos" without referring
 * to manager-specific concerns. The banker work queue (Phase 32
 * `loadBankerWorkQueueData`) carries the same conceptual data with
 * a slightly different shape:
 *
 *   - banker deals carry `lastActivityOn` (modifiedon) rather than
 *     `modifiedOn` directly;
 *   - banker documents are pre-bucketed into `outstanding` and
 *     `pendingReviewDocuments` arrays rather than carrying a
 *     client-side `status` discriminant.
 *
 * Phase 89 reshapes that data into the Phase 88 input shape and
 * delegates to `deriveManagerMorningCatchUp` — keeping the rule set
 * in one place so a future change to the rules applies to BOTH
 * surfaces without drift.
 *
 * What this is NOT (mirrors Phase 88's contract):
 *   - Not AI / Copilot / model invocation.
 *   - Not automated execution. The card never clicks an action.
 *   - Not a real-time push surface.
 *   - Not a permission widener — every input row was already in
 *     the banker's authorized pipeline (`loadBankerWorkQueueData`
 *     two-step scope).
 *
 * Banker-specific behavior:
 *   - `assignedBankerName` is always the signed-in banker's name,
 *     so the `missing-assigned-banker` data-quality item Phase 88
 *     surfaces on the manager rollup NEVER fires on the banker
 *     workspace (the banker IS the assigned banker on their own
 *     deals; the check would always pass).
 */

import {
  deriveManagerMorningCatchUp,
  TOP_N_CATCH_UP_ITEMS,
  type ManagerCatchUpItem,
  type ManagerCatchUpKind,
  type ManagerCatchUpPriority,
  type ManagerCatchUpSource,
} from './managerMorningCatchUp';

// Re-export the value-add types under banker-prefixed names so the
// banker card's import surface does not bleed manager naming.
export type BankerCatchUpItem = ManagerCatchUpItem;
export type BankerCatchUpPriority = ManagerCatchUpPriority;
export type BankerCatchUpKind = ManagerCatchUpKind;
export type BankerCatchUpSource = ManagerCatchUpSource;

/** Hard cap on items surfaced by the banker card. Same cap Phase 88
 *  uses on the manager surface so the two feels consistent. */
export const TOP_N_BANKER_CATCH_UP_ITEMS = TOP_N_CATCH_UP_ITEMS;

// ---------------------------------------------------------------------------
// Structural input shapes — mirror BankerWorkQueueData
// (src/banker/workQueueQueries.ts) + PipelineDeal
// (src/banker/dealQueries.ts) by structural typing so this module
// stays under src/shared/ without importing from a role directory
// (Phase 48 isolation).
// ---------------------------------------------------------------------------

export interface BankerCatchUpDealInput {
  id: string;
  name: string;
  stage: string | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  /** Standard Dataverse modifiedon — used as the activity proxy
   *  on the banker rollup surface, exposed by PipelineDeal as
   *  `lastActivityOn`. The adapter forwards it to the Phase 88
   *  primitive's `modifiedOn` field. */
  lastActivityOn: string | undefined;
}

export interface BankerCatchUpTaskInput {
  id: string;
  dealId: string;
  title: string;
  dueDate: string | undefined;
  completed: boolean;
}

export interface BankerCatchUpDocumentInput {
  id: string;
  dealId: string;
  name: string;
  receivedDate: string | undefined;
  reviewer: string | undefined;
}

export interface BankerCatchUpMemoInput {
  id: string;
  dealId: string;
  statusKey: 'draft' | 'final' | 'stale' | undefined;
}

export interface BankerCatchUpInput {
  deals: readonly BankerCatchUpDealInput[];
  tasks: readonly BankerCatchUpTaskInput[];
  /** Documents in the outstanding bucket. The adapter stamps
   *  `status: 'outstanding'` when reshaping for the Phase 88
   *  primitive. */
  outstandingDocuments: readonly BankerCatchUpDocumentInput[];
  /** Documents in the received bucket without a reviewer. The
   *  Phase 88 derivation re-applies the 7-day threshold on
   *  receivedDate to fire pending-review-document. The adapter
   *  stamps `status: 'received'` when reshaping. */
  pendingReviewDocuments: readonly BankerCatchUpDocumentInput[];
  memos: readonly BankerCatchUpMemoInput[];
  /** The signed-in banker's full name. Surfaced as ownerName on
   *  every item so the card can render "Banker: …" meta. Always
   *  defined for the banker workspace (BankerProvider guarantees
   *  it); passed through as the per-deal assigned-banker name to
   *  keep the missing-assigned-banker signal from firing. */
  bankerName: string | undefined;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveBankerMorningCatchUp(
  input: BankerCatchUpInput,
  now: Date,
): BankerCatchUpItem[] {
  return deriveManagerMorningCatchUp(
    {
      deals: input.deals.map((d) => ({
        id: d.id,
        name: d.name,
        stage: d.stage,
        // The banker IS the assigned banker on their own deals. Stamp
        // bankerName on every deal so the missing-assigned-banker
        // signal never fires on the banker workspace — the check
        // would never produce a meaningful item for the banker's own
        // pipeline.
        assignedBankerName: input.bankerName,
        targetCloseDate: d.targetCloseDate,
        stageEntryDate: d.stageEntryDate,
        modifiedOn: d.lastActivityOn,
      })),
      tasks: input.tasks.map((t) => ({
        id: t.id,
        dealId: t.dealId,
        title: t.title,
        dueDate: t.dueDate,
        completed: t.completed,
      })),
      documents: [
        ...input.outstandingDocuments.map((d) => ({
          id: d.id,
          dealId: d.dealId,
          name: d.name,
          receivedDate: d.receivedDate,
          reviewer: d.reviewer,
          status: 'outstanding' as const,
        })),
        ...input.pendingReviewDocuments.map((d) => ({
          id: d.id,
          dealId: d.dealId,
          name: d.name,
          receivedDate: d.receivedDate,
          reviewer: d.reviewer,
          status: 'received' as const,
        })),
      ],
      memos: input.memos.map((m) => ({
        id: m.id,
        dealId: m.dealId,
        statusKey: m.statusKey,
      })),
    },
    now,
  );
}
