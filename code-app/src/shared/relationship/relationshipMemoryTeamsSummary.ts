/**
 * Phase 100: pure formatter that turns a Phase 76 / 77
 * `RelationshipMemoryEntry` into a Teams-safe plain-text relationship
 * snapshot the banker can copy and paste into Microsoft Teams.
 *
 * Sibling to:
 *   - src/deals/teamsDealSummary.ts (Phase 96 per-deal summary);
 *   - src/shared/relationship/relationshipContextNote.ts (Phase 97
 *     one-line cross-deal context);
 *   - src/shared/activity/catchUpTeamsSummary.ts (Phase 98 morning-
 *     catch-up summary);
 *   - src/deals/activityTimelineTeamsSummary.ts (Phase 99 per-deal
 *     activity digest).
 *
 * Same no-admin Teams handoff posture:
 *   - No SDK import. No Graph / MSAL / token code. No role-module
 *     import. The function returns a string; the caller copies it.
 *   - The function never writes, sends, or posts. The verbs "sent",
 *     "posted", "delivered", "notified", "synced", "Teams
 *     integrated", "Graph connected" never appear in the output.
 *   - The formatter does NOT touch the Phase 78 relationship-note
 *     draft state, the Phase 83 Autopilot suggestion ledger, the
 *     Phase 90 last-seen markers, or the Phase 91 dismiss / snooze
 *     ledger. Copying a snapshot changes nothing.
 *
 * Conservative copy discipline (Phase 100 brief):
 *   - Output carries the verbatim Phase 76/77 limitation markers:
 *     "client-name grouped", "may not include all related borrowers",
 *     "not a relationship graph", "not a household linkage", "not a
 *     relationship score".
 *   - Output never claims "full relationship profile", "verified",
 *     "complete history", "household", "official relationship
 *     graph", "AI-generated", "relationship score", "risk score",
 *     "performance score", "Copilot". A source-hygiene test pins
 *     this list.
 *   - Output never echoes internal audit IDs, cr664_* logical names,
 *     _value lookup suffixes, raw timeline payloads, memo body text,
 *     secrets, tokens, or connector state.
 */

import type {
  RelationshipDealSnapshot,
  RelationshipMemoryEntry,
} from './relationshipMemory';

export interface RelationshipMemoryTeamsSummaryInput {
  /** One Phase 76 / 77 aggregate, exactly as returned by
   *  `deriveRelationshipMemory(...)`. The formatter does not
   *  re-derive aggregates — it only renders them. */
  entry: RelationshipMemoryEntry;
  /** Caller-supplied "now". Rendered as a YYYY-MM-DD UTC day so the
   *  string is deterministic and matches Phase 96/97/98/99. */
  generatedAt: Date;
}

/** Hard cap on rendered deal lines. Phase 76 lists "active deals"
 *  per client without a hard cap, but for a Teams paste we keep the
 *  snapshot scannable. Matches the cap used by Phase 96/98/99. */
export const RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS = 8;

export const RELATIONSHIP_MEMORY_TEAMS_SUMMARY_DISCLAIMER =
  '— Local copy only. Not posted to Teams. Paste into Teams. ' +
  'You send the message manually. Derived from visible records; ' +
  'client-name grouped — may not include all related borrowers. ' +
  'Not a relationship graph, not a household linkage, not a ' +
  'relationship score.';

export function buildRelationshipMemoryTeamsSummary(
  input: RelationshipMemoryTeamsSummaryInput,
): string {
  const { entry, generatedAt } = input;
  const lines: string[] = [];

  // ----- Heading + grouping marker --------------------------------
  const displayName = entry.isClientNameMissing
    ? '(no borrower name on record)'
    : entry.clientNameDisplay.trim() || '(no borrower name on record)';
  const day = formatDayUtc(generatedAt) ?? '';
  const heading =
    day.length > 0
      ? `Relationship snapshot — ${displayName} — ${day}`
      : `Relationship snapshot — ${displayName}`;
  lines.push(heading);
  lines.push('Client-name grouped.');
  lines.push('');

  // ----- Top-line counts ------------------------------------------
  const activeCount = clampCount(entry.activeDealCount);
  const dealWord = activeCount === 1 ? 'deal' : 'deals';
  const headline: string[] = [`${activeCount} active ${dealWord}`];
  const pipelineLabel = formatPipelineAmount(
    entry.totalAmount,
    entry.dealsMissingAmount,
  );
  if (pipelineLabel) headline.push(pipelineLabel);
  lines.push(headline.join(' · '));
  lines.push('');

  // ----- Timeline anchors -----------------------------------------
  const lastActivity = formatActivityLine(
    entry.mostRecentActivityIso,
    generatedAt,
  );
  if (lastActivity) lines.push(lastActivity);
  const nearestClose = formatNearestCloseLine(
    entry.nearestUpcomingCloseIso,
    generatedAt,
  );
  if (nearestClose) lines.push(nearestClose);
  if (lastActivity || nearestClose) lines.push('');

  // ----- Asks block (conditional — omit when all zero) ------------
  const askParts: string[] = [];
  const openDocs = clampCount(entry.outstandingDocumentCount);
  const openTasks = clampCount(entry.openTaskCount);
  const overdueTasks = clampCount(entry.overdueTaskCount);
  if (openDocs > 0) {
    askParts.push(
      `${openDocs} open document ${openDocs === 1 ? 'request' : 'requests'}`,
    );
  }
  if (openTasks > 0) {
    const head = `${openTasks} open ${openTasks === 1 ? 'task' : 'tasks'}`;
    askParts.push(
      overdueTasks > 0 ? `${head} (${overdueTasks} overdue)` : head,
    );
  }
  if (askParts.length > 0) {
    lines.push('Asks:');
    for (const part of askParts) lines.push(`- ${part}`);
    lines.push('');
  }

  // ----- Attention block (conditional) ----------------------------
  const attentionParts: string[] = [];
  const pendingReview = clampCount(entry.pendingReviewDocumentCount);
  const closingSoon = clampCount(entry.closingSoonCount);
  const stageAtRisk = clampCount(entry.stageAtRiskCount);
  const draftMemos = clampCount(entry.draftMemoCount);
  if (pendingReview > 0) {
    attentionParts.push(
      `${pendingReview} document${pendingReview === 1 ? '' : 's'} may require review`,
    );
  }
  if (closingSoon > 0) {
    attentionParts.push(`${closingSoon} closing soon`);
  }
  if (stageAtRisk > 0) {
    attentionParts.push(`${stageAtRisk} stage attention`);
  }
  if (draftMemos > 0) {
    attentionParts.push(
      `${draftMemos} draft memo${draftMemos === 1 ? '' : 's'}`,
    );
  }
  if (attentionParts.length > 0) {
    lines.push('Attention:');
    for (const part of attentionParts) lines.push(`- ${part}`);
    lines.push('');
  }

  // ----- Active deals (capped, dealName + stage) ------------------
  const capped = entry.deals.slice(
    0,
    RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS,
  );
  if (capped.length > 0) {
    lines.push('Active deals:');
    for (const d of capped) lines.push(`- ${formatDealLine(d)}`);
    if (entry.deals.length > capped.length) {
      const extra = entry.deals.length - capped.length;
      lines.push(`- … and ${extra} more`);
    }
    lines.push('');
  }

  // ----- Verbatim disclaimer --------------------------------------
  lines.push(RELATIONSHIP_MEMORY_TEAMS_SUMMARY_DISCLAIMER);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return Math.floor(n);
}

function formatDayUtc(date: Date): string | undefined {
  if (Number.isNaN(date.getTime())) return undefined;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatPipelineAmount(
  totalAmount: number,
  dealsMissingAmount: number,
): string | undefined {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return undefined;
  const rounded = Math.round(totalAmount);
  const withSeparators = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const missingNote =
    dealsMissingAmount > 0
      ? ` (${clampCount(dealsMissingAmount)} missing $)`
      : '';
  return `Pipeline $${withSeparators}${missingNote}`;
}

function formatActivityLine(
  iso: string | undefined,
  generatedAt: Date,
): string | undefined {
  if (!iso) return undefined;
  const days = daysBetweenPastIso(iso, generatedAt);
  if (days == null) return undefined;
  if (days <= 0) return 'Last activity: today.';
  return days === 1
    ? 'Last activity: 1 day ago.'
    : `Last activity: ${days} days ago.`;
}

function formatNearestCloseLine(
  iso: string | undefined,
  generatedAt: Date,
): string | undefined {
  if (!iso) return undefined;
  const day = formatDayUtc(new Date(iso));
  if (!day) return undefined;
  const days = daysBetweenFutureIso(iso, generatedAt);
  if (days == null) return `Nearest upcoming close: ${day}.`;
  if (days <= 0) return `Nearest upcoming close: today (${day}).`;
  return days === 1
    ? `Nearest upcoming close: tomorrow (${day}).`
    : `Nearest upcoming close: in ${days} days (${day}).`;
}

function daysBetweenPastIso(
  iso: string,
  generatedAt: Date,
): number | undefined {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return undefined;
  const diff = generatedAt.getTime() - ms;
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function daysBetweenFutureIso(
  iso: string,
  generatedAt: Date,
): number | undefined {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return undefined;
  const diff = ms - generatedAt.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function formatDealLine(deal: RelationshipDealSnapshot): string {
  const name = deal.dealName.trim();
  const stage = (deal.stage ?? '').trim();
  const namePart = name.length > 0 ? name : '(unnamed deal)';
  return stage.length > 0 ? `${namePart} — ${stage}` : namePart;
}
