/**
 * Phase 76: deterministic relationship-memory derivation.
 *
 * Groups the banker's already-loaded deal + child-record set by
 * client name (the only client-identity field that exists on the
 * deal record today — `cr664_clientname`) and surfaces a per-client
 * snapshot the banker can use to prepare for a borrower interaction:
 *   - deals carried for that client (name + stage + amount + target
 *     close + last activity);
 *   - aggregate attention counts (open asks, overdue tasks, pending-
 *     review documents, closing-soon, stage-at-risk, draft memos);
 *   - timeline anchors (most-recent-activity, nearest-upcoming-close).
 *
 * What this is NOT (Phase 76 brief discipline):
 *   - Not a relationship graph. There is no `cr664_borrower` foreign
 *     key on the deal; grouping is by normalized client-name only. Two
 *     deals naming the borrower differently appear as separate
 *     entries — this limitation is surfaced in the card and in
 *     docs/PHASE_76_RELATIONSHIP_MEMORY_LITE.md.
 *   - Not an AI / Copilot / predictive surface.
 *   - Not a relationship score or risk score.
 *   - Not a verified household / entity linkage.
 *   - Not cross-borrower deduplication.
 *   - No connector integration (Teams / Outlook). All data is
 *     local-to-Dataverse and already-authorized for the calling
 *     banker.
 *
 * Phase 48 isolation: this module lives under src/shared/ and defines
 * its input shapes structurally so it does not import from any role
 * directory. The banker workspace passes BankerWorkQueueData, which
 * satisfies RelationshipMemoryInput via structural typing.
 */

import {
  CLOSING_SOON_DAYS,
  STAGE_AGING_AT_RISK_DAYS,
} from '../analytics/derivedAnalytics';
import { PENDING_REVIEW_AT_RISK_DAYS } from '../workQueue/primitives';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// Structural input shapes
// ---------------------------------------------------------------------------

export interface RelationshipDealInput {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  amount: number | undefined;
  targetCloseDate: string | undefined;
  lastActivityOn: string | undefined;
  stageEntryDate: string | undefined;
}

export interface RelationshipTaskInput {
  dealId: string;
  dueDate: string | undefined;
}

export interface RelationshipDocumentInput {
  dealId: string;
  /** Only relevant for the pending-review bucket. The outstanding
   *  bucket has no receivedDate semantics in this module — every
   *  outstanding row counts as one open ask. */
  receivedDate?: string | undefined;
}

export interface RelationshipMemoInput {
  dealId: string;
  statusKey: 'draft' | 'final' | 'stale' | undefined;
}

export interface RelationshipMemoryInput {
  deals: readonly RelationshipDealInput[];
  tasks: readonly RelationshipTaskInput[];
  outstandingDocuments: readonly RelationshipDocumentInput[];
  pendingReviewDocuments: readonly RelationshipDocumentInput[];
  memos: readonly RelationshipMemoInput[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface RelationshipDealSnapshot {
  dealId: string;
  dealName: string;
  stage: string | undefined;
  targetCloseDate: string | undefined;
  amount: number | undefined;
  lastActivityOn: string | undefined;
}

export interface RelationshipMemoryEntry {
  /** Display name as it appears on the deal record (trimmed). Empty
   *  string when no deal in the group carries a clientName. The UI
   *  uses `isClientNameMissing` to swap in a "(no borrower name on
   *  record)" placeholder. */
  clientNameDisplay: string;
  /** Normalized grouping key (trim + collapse whitespace + lowercase).
   *  Internal; do not render. The constant `MISSING_CLIENT_NAME_KEY`
   *  is reserved for the missing-name group. */
  clientNameKey: string;
  isClientNameMissing: boolean;

  /** Per-deal snapshots, sorted by nearest upcoming close first (then
   *  by deal name). */
  deals: RelationshipDealSnapshot[];
  activeDealCount: number;
  totalAmount: number;
  dealsMissingAmount: number;

  // ----- Attention totals across this client's deals -----
  openTaskCount: number;
  overdueTaskCount: number;
  outstandingDocumentCount: number;
  pendingReviewDocumentCount: number;
  draftMemoCount: number;
  closingSoonCount: number;
  stageAtRiskCount: number;

  // ----- Timeline anchors -----
  mostRecentActivityIso: string | undefined;
  nearestUpcomingCloseIso: string | undefined;
}

export const MISSING_CLIENT_NAME_KEY = '__no-borrower-name-on-record__';

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveRelationshipMemory(
  input: RelationshipMemoryInput,
  now: Date,
): RelationshipMemoryEntry[] {
  const nowMs = now.getTime();

  const tasksByDeal = bucketBy(input.tasks, (t) => t.dealId);
  const outDocsByDeal = bucketBy(input.outstandingDocuments, (d) => d.dealId);
  const reviewDocsByDeal = bucketBy(
    input.pendingReviewDocuments,
    (d) => d.dealId,
  );
  const memosByDeal = bucketBy(input.memos, (m) => m.dealId);

  const groups = new Map<string, RelationshipDealInput[]>();
  for (const d of input.deals) {
    const key = normalizeClientName(d.clientName);
    const existing = groups.get(key) ?? [];
    existing.push(d);
    groups.set(key, existing);
  }

  const entries: RelationshipMemoryEntry[] = [];
  for (const [key, dealList] of groups) {
    const firstNamedDeal = dealList.find(
      (d) => d.clientName != null && d.clientName.trim().length > 0,
    );
    const clientNameDisplay = firstNamedDeal?.clientName?.trim() ?? '';
    const isClientNameMissing = key === MISSING_CLIENT_NAME_KEY;

    const snapshots: RelationshipDealSnapshot[] = dealList.map((d) => ({
      dealId: d.id,
      dealName: d.name,
      stage: d.stage,
      targetCloseDate: d.targetCloseDate,
      amount: d.amount,
      lastActivityOn: d.lastActivityOn,
    }));
    snapshots.sort((a, b) => {
      const aMs = parseIso(a.targetCloseDate);
      const bMs = parseIso(b.targetCloseDate);
      const aFuture =
        aMs != null && aMs >= nowMs ? aMs : Number.POSITIVE_INFINITY;
      const bFuture =
        bMs != null && bMs >= nowMs ? bMs : Number.POSITIVE_INFINITY;
      if (aFuture !== bFuture) return aFuture - bFuture;
      return a.dealName.localeCompare(b.dealName);
    });

    let totalAmount = 0;
    let dealsMissingAmount = 0;
    let openTaskCount = 0;
    let overdueTaskCount = 0;
    let outstandingDocumentCount = 0;
    let pendingReviewDocumentCount = 0;
    let draftMemoCount = 0;
    let closingSoonCount = 0;
    let stageAtRiskCount = 0;
    let mostRecentActivityMs: number | null = null;
    let nearestUpcomingCloseMs: number | null = null;

    for (const d of dealList) {
      if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
        totalAmount += d.amount;
      } else {
        dealsMissingAmount++;
      }
      const targetMs = parseIso(d.targetCloseDate);
      if (targetMs != null && targetMs >= nowMs) {
        const days = Math.floor((targetMs - nowMs) / MS_PER_DAY);
        if (days <= CLOSING_SOON_DAYS) closingSoonCount++;
        if (
          nearestUpcomingCloseMs == null ||
          targetMs < nearestUpcomingCloseMs
        ) {
          nearestUpcomingCloseMs = targetMs;
        }
      }
      const stageEntryMs = parseIso(d.stageEntryDate);
      if (stageEntryMs != null) {
        const daysInStage = Math.floor((nowMs - stageEntryMs) / MS_PER_DAY);
        if (daysInStage >= STAGE_AGING_AT_RISK_DAYS) stageAtRiskCount++;
      }
      const lastActMs = parseIso(d.lastActivityOn);
      if (lastActMs != null) {
        if (mostRecentActivityMs == null || lastActMs > mostRecentActivityMs) {
          mostRecentActivityMs = lastActMs;
        }
      }

      const tasks = tasksByDeal.get(d.id) ?? [];
      openTaskCount += tasks.length;
      for (const t of tasks) {
        const due = parseIso(t.dueDate);
        if (due != null && due < nowMs) overdueTaskCount++;
      }
      const outDocs = outDocsByDeal.get(d.id) ?? [];
      outstandingDocumentCount += outDocs.length;
      const revDocs = reviewDocsByDeal.get(d.id) ?? [];
      for (const rd of revDocs) {
        const recMs = parseIso(rd.receivedDate);
        if (recMs == null) continue;
        const daysSince = Math.floor((nowMs - recMs) / MS_PER_DAY);
        if (daysSince >= PENDING_REVIEW_AT_RISK_DAYS) {
          pendingReviewDocumentCount++;
        }
      }
      const memos = memosByDeal.get(d.id) ?? [];
      draftMemoCount += memos.filter((m) => m.statusKey === 'draft').length;
    }

    entries.push({
      clientNameDisplay,
      clientNameKey: key,
      isClientNameMissing,
      deals: snapshots,
      activeDealCount: snapshots.length,
      totalAmount,
      dealsMissingAmount,
      openTaskCount,
      overdueTaskCount,
      outstandingDocumentCount,
      pendingReviewDocumentCount,
      draftMemoCount,
      closingSoonCount,
      stageAtRiskCount,
      mostRecentActivityIso: msToIso(mostRecentActivityMs),
      nearestUpcomingCloseIso: msToIso(nearestUpcomingCloseMs),
    });
  }

  entries.sort((a, b) => {
    const aAttn = attentionOrdering(a);
    const bAttn = attentionOrdering(b);
    if (aAttn !== bAttn) return bAttn - aAttn;
    const aAct = parseIso(a.mostRecentActivityIso);
    const bAct = parseIso(b.mostRecentActivityIso);
    const aActV = aAct ?? Number.NEGATIVE_INFINITY;
    const bActV = bAct ?? Number.NEGATIVE_INFINITY;
    if (aActV !== bActV) return bActV - aActV;
    // Tie-break: missing-name clients go LAST.
    if (a.isClientNameMissing !== b.isClientNameMissing) {
      return a.isClientNameMissing ? 1 : -1;
    }
    return a.clientNameDisplay.localeCompare(b.clientNameDisplay);
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Phase 77 — cross-deal context helper.
//
// Given a deal id + clientName already loaded by the Deal Workspace, this
// function asks: "of the banker's other already-authorized deals, which
// belong to the same client name, and what aggregate attention signals do
// they carry?". The current deal is excluded from the result by id so its
// own counts never leak into the cross-deal aggregates.
//
// Three result shapes:
//   - 'no-client-name'   : the current deal has no clientName on record;
//                          the card renders a conservative empty-state.
//   - 'no-other-deals'   : the client name resolves to a known group,
//                          but the only deal in it is the current one.
//   - 'has-other-deals'  : the matching RelationshipMemoryEntry — with
//                          the current deal already removed and the
//                          aggregates recomputed against the remaining
//                          deals only.
//
// Implementation note: the function filters the current deal out of the
// input and re-runs the existing derivation. Re-running keeps the
// aggregates honest (they reflect ONLY other deals) without duplicating
// the derivation logic.
// ---------------------------------------------------------------------------

export type CrossDealContextResult =
  | { kind: 'no-client-name' }
  | { kind: 'no-other-deals'; clientNameDisplay: string }
  | { kind: 'has-other-deals'; entry: RelationshipMemoryEntry };

export function deriveCrossDealContext(
  input: RelationshipMemoryInput,
  currentDealId: string,
  currentClientName: string | undefined,
  now: Date,
): CrossDealContextResult {
  const targetKey = normalizeClientName(currentClientName);
  if (targetKey === MISSING_CLIENT_NAME_KEY) {
    return { kind: 'no-client-name' };
  }

  // Filter the current deal out of the input. Child collections
  // (tasks / documents / memos) are keyed by dealId; removing the
  // current deal from `input.deals` naturally drops its children from
  // every per-deal aggregate inside deriveRelationshipMemory.
  const filtered: RelationshipMemoryInput = {
    deals: input.deals.filter((d) => d.id !== currentDealId),
    tasks: input.tasks,
    outstandingDocuments: input.outstandingDocuments,
    pendingReviewDocuments: input.pendingReviewDocuments,
    memos: input.memos,
  };
  const entries = deriveRelationshipMemory(filtered, now);
  const match = entries.find((e) => e.clientNameKey === targetKey);
  if (!match || match.activeDealCount === 0) {
    const display = currentClientName?.trim() ?? '';
    return { kind: 'no-other-deals', clientNameDisplay: display };
  }
  return { kind: 'has-other-deals', entry: match };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeClientName(name: string | undefined): string {
  if (name == null) return MISSING_CLIENT_NAME_KEY;
  const collapsed = name.trim().replace(/\s+/g, ' ').toLowerCase();
  if (collapsed.length === 0) return MISSING_CLIENT_NAME_KEY;
  return collapsed;
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

function msToIso(ms: number | null): string | undefined {
  if (ms == null) return undefined;
  return new Date(ms).toISOString();
}

/**
 * Deterministic ordering helper. NOT a relationship / risk
 * judgment surfaced to the banker — it never leaves this module. The
 * sort puts overdue tasks + pending review at the top so the most
 * time-sensitive relationships get the user's eye first.
 */
function attentionOrdering(e: RelationshipMemoryEntry): number {
  return (
    e.overdueTaskCount * 8 +
    e.pendingReviewDocumentCount * 6 +
    e.closingSoonCount * 4 +
    e.stageAtRiskCount * 3 +
    e.outstandingDocumentCount * 1
  );
}
