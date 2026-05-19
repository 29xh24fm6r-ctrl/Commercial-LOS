/**
 * Phase 88: deterministic "morning catch-up" feed for the Manager
 * Workspace.
 *
 * Turns the Phase 87 manager-scoped child data (team-pipeline deals
 * + open tasks + document checklist rows with status + credit memo
 * status) into a concise, read-only feed of items a manager would
 * scan to get the morning lay-of-the-land: which deals have overdue
 * tasks, which deals just received a document, which deals have
 * stale stage entries, which deals are missing data (no stage, no
 * assigned banker).
 *
 * Complementary to (not duplicative of) Phase 80 / 81 / 82 / 84 /
 * 87 Autopilot:
 *
 *   - Autopilot answers "what should I DO next on this deal?" —
 *     forward-looking action suggestions, one row per deal.
 *   - Morning catch-up answers "what HAPPENED across the team /
 *     what NEEDS attention?" — observation-style feed items,
 *     multiple rows possible per deal, including data-quality
 *     items (missing stage, missing assigned banker) that the
 *     autopilot derivation never surfaced.
 *
 * Phase 48 isolation: this module defines its own structural input
 * shapes and never imports from a role directory. Thresholds are
 * imported from the shared analytics + work-queue primitives so
 * Phase 88 stays coherent with Phase 80's signal thresholds.
 *
 * What this is NOT:
 *   - Not AI / Copilot / model invocation.
 *   - Not automated execution. The card never clicks an action.
 *   - Not a real-time push surface. The feed is derived from the
 *     records the manager data provider already loaded; it refreshes
 *     when the provider refreshes.
 *   - Not a "missed deadline" alert system. Items use observational
 *     phrasing ("X may require review", "Y needs attention") rather
 *     than enforcement claims ("X is non-compliant", "Y failed").
 *   - Not a permission widener. Every input row was already in the
 *     manager's authorized team scope.
 */

import {
  CLOSING_SOON_DAYS,
  STAGE_AGING_AT_RISK_DAYS,
} from '../analytics/derivedAnalytics';
import { countConsistencyFindingsForDeal } from '../creditMemoConsistency/checkCreditMemoConsistency';
import { PENDING_REVIEW_AT_RISK_DAYS } from '../workQueue/primitives';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tasks due within this window appear as "due soon" items
 *  (medium priority). Tasks whose due date is in the past land as
 *  "overdue" (high priority) instead. */
export const TASK_DUE_SOON_DAYS = 3;

/** Documents that flipped to `received` status within this window
 *  appear as "newly received" informational items (low priority).
 *  After this window the row is just an outstanding-or-pending-review
 *  state, not a recent-event item. */
export const NEWLY_RECEIVED_RECENT_DAYS = 3;

/** Stale-activity threshold (deal.modifiedOn older than this →
 *  low-priority "no recent activity" item). Same window Phase 80
 *  uses for its stale-activity signal. */
export const STALE_ACTIVITY_DAYS = 14;

/** Hard cap on items surfaced by the manager card. The brief says
 *  5–8; 8 keeps the card useful for managers with many active
 *  deals without scrolling. */
export const TOP_N_CATCH_UP_ITEMS = 8;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type ManagerCatchUpPriority = 'high' | 'medium' | 'low';

export type ManagerCatchUpKind =
  | 'overdue-task'
  | 'task-due-soon'
  | 'pending-review-document'
  | 'newly-received-document'
  | 'outstanding-documents'
  | 'draft-memo'
  | 'stage-aging'
  | 'closing-soon'
  | 'stale-activity'
  | 'missing-stage'
  | 'missing-assigned-banker'
  | 'memo-consistency-findings';

export type ManagerCatchUpSource = 'task' | 'document' | 'memo' | 'deal';

export interface ManagerCatchUpItem {
  /** Stable, deterministic id: `<kind>:<dealId>[:<rowId>]`. Lets the
   *  card key React lists and lets tests assert membership without
   *  relying on render order. */
  id: string;
  dealId: string;
  dealName: string;
  ownerName: string | undefined;
  kind: ManagerCatchUpKind;
  priority: ManagerCatchUpPriority;
  /** Short, scannable item title (e.g. "Overdue task" + summary). */
  title: string;
  /** One-sentence reason explaining WHY this item appears. Uses
   *  conservative observational phrasing — "X may require review",
   *  "X needs attention" — never "X failed" or "X is non-compliant". */
  reason: string;
  /** ISO timestamp anchored to whichever record event spawned the
   *  item (task due date, doc received date, deal modifiedOn for
   *  always-on items). May be undefined when no anchor exists. */
  occurredAt: string | undefined;
  /** ISO timestamp the derivation ran (the caller's `now`). Lets the
   *  card surface "N hours ago" relative-time strings without
   *  re-deriving. */
  derivedAt: string;
  source: ManagerCatchUpSource;
}

// ---------------------------------------------------------------------------
// Structural input shapes — mirror the Phase 87 manager-scoped row
// types (src/manager/managerQueries.ts TeamScopedTask / TeamScopedDocument
// / TeamScopedMemo + TeamDeal) by structural typing so this module
// stays under src/shared/ without importing from src/manager/
// (Phase 48 isolation).
// ---------------------------------------------------------------------------

export interface ManagerCatchUpDealInput {
  id: string;
  name: string;
  stage: string | undefined;
  assignedBankerName: string | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  /** Standard Dataverse modifiedon — used as the activity proxy. */
  modifiedOn: string | undefined;
  /** Phase 95 — optional. Client name, loan amount, and collateral
   *  summary are the structured deal fields the Phase 73 consistency
   *  check compares against the saved memo draft. Optional so all
   *  pre-Phase-95 callers (manager workspace included) continue to
   *  compile unchanged; when omitted, the memo-consistency item
   *  cannot fire because the check has nothing to compare. */
  clientName?: string | undefined;
  amount?: number | undefined;
  collateralSummary?: string | undefined;
}

export interface ManagerCatchUpTaskInput {
  id: string;
  /** Rows with no dealId cannot be attributed; dropped by the
   *  derivation. */
  dealId: string | undefined;
  title: string;
  dueDate: string | undefined;
  completed: boolean;
}

export interface ManagerCatchUpDocumentInput {
  id: string;
  dealId: string | undefined;
  name: string;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  /** Pre-derived bucket (Phase 84/87 contract). */
  status: 'outstanding' | 'received' | 'reviewed';
}

export interface ManagerCatchUpMemoInput {
  id: string;
  dealId: string | undefined;
  statusKey: 'draft' | 'final' | 'stale' | undefined;
  /** Phase 95 — optional memo text preview. Forwarded into the
   *  Phase 73 consistency check. Optional so pre-Phase-95 callers
   *  continue to compile unchanged. */
  textPreview?: string | undefined;
}

/**
 * Phase 95: per-deal memo section row used by the Phase 73
 * consistency check. Mirrors `CreditMemoSectionItem` by structural
 * typing — labels + previews only, no structural HTML.
 */
export interface ManagerCatchUpMemoSectionInput {
  id: string;
  dealId: string | undefined;
  sectionLabel: string;
  textPreview: string | undefined;
}

export interface ManagerCatchUpInput {
  deals: readonly ManagerCatchUpDealInput[];
  tasks: readonly ManagerCatchUpTaskInput[];
  documents: readonly ManagerCatchUpDocumentInput[];
  memos: readonly ManagerCatchUpMemoInput[];
  /** Phase 95 — optional. When supplied, the catch-up derivation
   *  runs the Phase 73 consistency check per deal and emits a
   *  memo-consistency-findings item when the check returns one or
   *  more findings. When omitted, behavior matches Phase 88. */
  memoSections?: readonly ManagerCatchUpMemoSectionInput[];
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function deriveManagerMorningCatchUp(
  input: ManagerCatchUpInput,
  now: Date,
): ManagerCatchUpItem[] {
  const dealById = new Map<string, ManagerCatchUpDealInput>();
  for (const d of input.deals) dealById.set(d.id, d);

  const items: ManagerCatchUpItem[] = [];
  const derivedAt = now.toISOString();
  const nowMs = now.getTime();

  // ----- task-driven items ---------------------------------------
  for (const t of input.tasks) {
    if (!t.dealId || t.completed) continue;
    const deal = dealById.get(t.dealId);
    if (!deal) continue;
    const dueMs = parseIsoMs(t.dueDate);
    if (dueMs == null) continue;
    const diffDays = Math.floor((dueMs - nowMs) / MS_PER_DAY);
    if (diffDays < 0) {
      const daysOverdue = Math.abs(diffDays);
      items.push(makeItem({
        id: `overdue-task:${deal.id}:${t.id}`,
        deal,
        kind: 'overdue-task',
        priority: 'high',
        title: 'Overdue task',
        reason: `Task "${t.title}" was due ${daysAgoLabel(daysOverdue)}; may require review.`,
        occurredAt: t.dueDate,
        source: 'task',
        derivedAt,
      }));
    } else if (diffDays <= TASK_DUE_SOON_DAYS) {
      items.push(makeItem({
        id: `task-due-soon:${deal.id}:${t.id}`,
        deal,
        kind: 'task-due-soon',
        priority: 'medium',
        title: 'Task due soon',
        reason: `Task "${t.title}" is due ${daysAheadLabel(diffDays)}; needs attention.`,
        occurredAt: t.dueDate,
        source: 'task',
        derivedAt,
      }));
    }
  }

  // ----- document-driven items -----------------------------------
  // Group documents by deal for the per-deal outstanding-documents
  // aggregate. Per-row items (pending-review, newly-received) are
  // emitted directly.
  const outstandingCountByDeal = new Map<string, number>();
  for (const doc of input.documents) {
    if (!doc.dealId) continue;
    const deal = dealById.get(doc.dealId);
    if (!deal) continue;

    if (doc.status === 'outstanding') {
      outstandingCountByDeal.set(
        deal.id,
        (outstandingCountByDeal.get(deal.id) ?? 0) + 1,
      );
    } else if (doc.status === 'received') {
      const receivedMs = parseIsoMs(doc.receivedDate);
      const hasReviewer = !!(doc.reviewer && doc.reviewer.trim().length > 0);
      if (!hasReviewer && receivedMs != null) {
        const daysSinceReceived = Math.floor((nowMs - receivedMs) / MS_PER_DAY);
        if (daysSinceReceived >= PENDING_REVIEW_AT_RISK_DAYS) {
          items.push(makeItem({
            id: `pending-review-document:${deal.id}:${doc.id}`,
            deal,
            kind: 'pending-review-document',
            priority: 'high',
            title: 'Document may require review',
            reason: `Document "${doc.name}" was received ${daysAgoLabel(daysSinceReceived)} and has no reviewer recorded.`,
            occurredAt: doc.receivedDate,
            source: 'document',
            derivedAt,
          }));
          continue;
        }
        if (daysSinceReceived >= 0 && daysSinceReceived <= NEWLY_RECEIVED_RECENT_DAYS) {
          items.push(makeItem({
            id: `newly-received-document:${deal.id}:${doc.id}`,
            deal,
            kind: 'newly-received-document',
            priority: 'low',
            title: 'Newly received document',
            reason: `Document "${doc.name}" was received ${daysAgoLabel(daysSinceReceived)}; awaiting review.`,
            occurredAt: doc.receivedDate,
            source: 'document',
            derivedAt,
          }));
        }
      } else if (
        !hasReviewer &&
        receivedMs == null
      ) {
        // Received bucket but no receivedDate — surface as informational
        // newly-received so the manager knows a row flipped without a
        // recorded timestamp. Lowest priority.
        items.push(makeItem({
          id: `newly-received-document:${deal.id}:${doc.id}`,
          deal,
          kind: 'newly-received-document',
          priority: 'low',
          title: 'Newly received document',
          reason: `Document "${doc.name}" is in the received bucket; awaiting review.`,
          occurredAt: undefined,
          source: 'document',
          derivedAt,
        }));
      }
    }
    // 'reviewed' status produces no catch-up item — the row is
    // resolved from the manager's catch-up perspective.
  }

  for (const [dealId, count] of outstandingCountByDeal) {
    const deal = dealById.get(dealId);
    if (!deal) continue;
    items.push(makeItem({
      id: `outstanding-documents:${deal.id}`,
      deal,
      kind: 'outstanding-documents',
      priority: 'medium',
      title: 'Outstanding documents',
      reason: `${count} document${count === 1 ? '' : 's'} outstanding on this deal; needs attention.`,
      occurredAt: deal.modifiedOn,
      source: 'document',
      derivedAt,
    }));
  }

  // ----- memo-driven items ---------------------------------------
  // Deal-level: any memo with statusKey='draft' surfaces one
  // draft-memo item per deal.
  const draftMemoDeals = new Set<string>();
  for (const m of input.memos) {
    if (!m.dealId) continue;
    if (m.statusKey === 'draft' && !draftMemoDeals.has(m.dealId)) {
      const deal = dealById.get(m.dealId);
      if (!deal) continue;
      draftMemoDeals.add(m.dealId);
      items.push(makeItem({
        id: `draft-memo:${deal.id}`,
        deal,
        kind: 'draft-memo',
        priority: 'low',
        title: 'Draft memo present',
        reason: `A credit memo is in draft status on this deal; may require review.`,
        occurredAt: deal.modifiedOn,
        source: 'memo',
        derivedAt,
      }));
    }
  }

  // ----- Phase 95: memo-consistency-findings ---------------------
  // For each deal with memo content (memo textPreview OR per-deal
  // sections), run the Phase 73 deterministic consistency check
  // against the deal's structured fields and surface one item per
  // deal when findings > 0. MEDIUM priority — same severity as the
  // memo-consistency-findings signal Phase 80 emits on Deal
  // Autopilot. Reuses Phase 73 logic via
  // countConsistencyFindingsForDeal so the rule set stays in one
  // place.
  const memosByDeal = new Map<string, ManagerCatchUpMemoInput[]>();
  for (const m of input.memos) {
    if (!m.dealId) continue;
    const arr = memosByDeal.get(m.dealId) ?? [];
    arr.push(m);
    memosByDeal.set(m.dealId, arr);
  }
  const sectionsByDeal = new Map<string, ManagerCatchUpMemoSectionInput[]>();
  for (const s of input.memoSections ?? []) {
    if (!s.dealId) continue;
    const arr = sectionsByDeal.get(s.dealId) ?? [];
    arr.push(s);
    sectionsByDeal.set(s.dealId, arr);
  }
  for (const deal of input.deals) {
    const dealMemos = memosByDeal.get(deal.id) ?? [];
    const dealSections = sectionsByDeal.get(deal.id) ?? [];
    if (dealMemos.length === 0 && dealSections.length === 0) continue;
    const findingsCount = countConsistencyFindingsForDeal(
      {
        name: deal.name,
        clientName: deal.clientName,
        stage: deal.stage,
        amount: deal.amount,
        collateralSummary: deal.collateralSummary,
      },
      dealMemos.map((m) => ({ textPreview: m.textPreview })),
      dealSections.map((s) => ({
        sectionLabel: s.sectionLabel,
        textPreview: s.textPreview,
      })),
    );
    if (findingsCount === 0) continue;
    items.push(makeItem({
      id: `memo-consistency-findings:${deal.id}`,
      deal,
      kind: 'memo-consistency-findings',
      priority: 'medium',
      title:
        findingsCount === 1
          ? 'Memo consistency finding'
          : `${findingsCount} memo consistency findings`,
      reason:
        'Deterministic check found differences between the saved memo draft and structured deal fields; banker review recommended.',
      occurredAt: deal.modifiedOn,
      source: 'memo',
      derivedAt,
    }));
  }

  // ----- deal-driven items ---------------------------------------
  for (const deal of input.deals) {
    // closing-soon
    const closeMs = parseIsoMs(deal.targetCloseDate);
    if (closeMs != null) {
      const daysUntilClose = Math.floor((closeMs - nowMs) / MS_PER_DAY);
      if (daysUntilClose >= 0 && daysUntilClose <= CLOSING_SOON_DAYS) {
        items.push(makeItem({
          id: `closing-soon:${deal.id}`,
          deal,
          kind: 'closing-soon',
          priority: 'high',
          title: 'Closing soon',
          reason: `Target close is ${daysAheadLabel(daysUntilClose)}; needs attention.`,
          occurredAt: deal.targetCloseDate,
          source: 'deal',
          derivedAt,
        }));
      }
    }

    // stage-aging
    const stageEntryMs = parseIsoMs(deal.stageEntryDate);
    if (stageEntryMs != null) {
      const daysInStage = Math.floor((nowMs - stageEntryMs) / MS_PER_DAY);
      if (daysInStage >= STAGE_AGING_AT_RISK_DAYS) {
        items.push(makeItem({
          id: `stage-aging:${deal.id}`,
          deal,
          kind: 'stage-aging',
          priority: 'medium',
          title: 'Stage aging',
          reason: `Deal has been in its current stage ${daysAgoLabel(daysInStage, 'for')}; may require review.`,
          occurredAt: deal.stageEntryDate,
          source: 'deal',
          derivedAt,
        }));
      }
    }

    // stale-activity (modifiedOn proxy)
    const modifiedMs = parseIsoMs(deal.modifiedOn);
    if (modifiedMs != null) {
      const daysStale = Math.floor((nowMs - modifiedMs) / MS_PER_DAY);
      if (daysStale >= STALE_ACTIVITY_DAYS) {
        items.push(makeItem({
          id: `stale-activity:${deal.id}`,
          deal,
          kind: 'stale-activity',
          priority: 'low',
          title: 'No recent activity',
          reason: `Last recorded change was ${daysAgoLabel(daysStale)}; may require review.`,
          occurredAt: deal.modifiedOn,
          source: 'deal',
          derivedAt,
        }));
      }
    }

    // missing-stage (data quality)
    if (!deal.stage || deal.stage.trim().length === 0) {
      items.push(makeItem({
        id: `missing-stage:${deal.id}`,
        deal,
        kind: 'missing-stage',
        priority: 'medium',
        title: 'Stage not set',
        reason: 'Deal has no stage recorded; needs attention.',
        occurredAt: deal.modifiedOn,
        source: 'deal',
        derivedAt,
      }));
    }

    // missing-assigned-banker (data quality)
    if (!deal.assignedBankerName || deal.assignedBankerName.trim().length === 0) {
      items.push(makeItem({
        id: `missing-assigned-banker:${deal.id}`,
        deal,
        kind: 'missing-assigned-banker',
        priority: 'medium',
        title: 'No assigned banker',
        reason: 'Deal has no assigned banker recorded; needs attention.',
        occurredAt: deal.modifiedOn,
        source: 'deal',
        derivedAt,
      }));
    }
  }

  items.sort(compareCatchUpItems);
  return items.slice(0, TOP_N_CATCH_UP_ITEMS);
}

// ---------------------------------------------------------------------------
// Sort + helpers
//
// Ranking rules:
//   1) priority desc (HIGH > MEDIUM > LOW);
//   2) occurredAt desc (most recent past first; missing → far past
//      so always-on items sort below time-anchored ones within a
//      priority tier);
//   3) deal name asc (stable lexicographic fallback so the feed
//      stays deterministic when items tie on every prior key).
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<ManagerCatchUpPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function compareCatchUpItems(
  a: ManagerCatchUpItem,
  b: ManagerCatchUpItem,
): number {
  const dp = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (dp !== 0) return dp;
  const aMs = parseIsoMs(a.occurredAt) ?? Number.NEGATIVE_INFINITY;
  const bMs = parseIsoMs(b.occurredAt) ?? Number.NEGATIVE_INFINITY;
  if (aMs !== bMs) return bMs - aMs;
  return a.dealName.localeCompare(b.dealName);
}

function makeItem(args: {
  id: string;
  deal: ManagerCatchUpDealInput;
  kind: ManagerCatchUpKind;
  priority: ManagerCatchUpPriority;
  title: string;
  reason: string;
  occurredAt: string | undefined;
  source: ManagerCatchUpSource;
  derivedAt: string;
}): ManagerCatchUpItem {
  return {
    id: args.id,
    dealId: args.deal.id,
    dealName: args.deal.name,
    ownerName: args.deal.assignedBankerName,
    kind: args.kind,
    priority: args.priority,
    title: args.title,
    reason: args.reason,
    occurredAt: args.occurredAt,
    derivedAt: args.derivedAt,
    source: args.source,
  };
}

function parseIsoMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function daysAgoLabel(days: number, prefix = ''): string {
  if (days <= 0) return prefix ? `${prefix} today` : 'today';
  const unit = days === 1 ? 'day' : 'days';
  return prefix ? `${prefix} ${days} ${unit}` : `${days} ${unit} ago`;
}

function daysAheadLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
