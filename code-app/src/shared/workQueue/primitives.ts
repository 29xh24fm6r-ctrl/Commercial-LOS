import type { SeverityKey } from '../theme';

/**
 * Phase 35: shared work-queue primitives.
 *
 * Three parallel queues exist today — banker (Phase 32), manager
 * (Phase 33), team (Phase 34) — each with role-specific signal rules,
 * data shapes, and UI copy. This module extracts ONLY the stable
 * shared parts: the severity ladder, day thresholds, calendar-day
 * math, sort comparator, and a small set of UI helpers.
 *
 * Discipline (per the Phase-35 brief guardrail):
 *   - NO generic WorkQueue component, NO universal queue engine.
 *     The three cards remain role-owned. Each role's rules file
 *     keeps its own derivation, item-type enum, and label switch.
 *   - This module imports ONLY from src/shared. It does NOT reach
 *     into banker/manager/team/deals/admin/executive. Role modules
 *     may import from here; the reverse is forbidden.
 *   - No behavior change vs Phase 32/33/34. Each role's tests
 *     continue to exercise their own derivation; new focused tests
 *     here cover the primitives in isolation.
 */

// ---------------------------------------------------------------------------
// Severity ladder + tier ranking
// ---------------------------------------------------------------------------

export type WorkQueueSeverity = 'blocked' | 'overdue' | 'at-risk' | 'upcoming';

/**
 * Rank used to compute sortKey and to compare severities. Higher rank
 * = more urgent. Each tier sits in its own 10_000-wide window so a
 * per-tier day count (e.g. days overdue) cannot bleed into a higher
 * tier through sortKey arithmetic.
 */
export const WORK_QUEUE_TIER_RANK: Record<WorkQueueSeverity, number> = {
  blocked: 4,
  overdue: 3,
  'at-risk': 2,
  upcoming: 1,
};

export const WORK_QUEUE_TIER_WINDOW = 10_000;

export function tierBase(severity: WorkQueueSeverity): number {
  return WORK_QUEUE_TIER_RANK[severity] * WORK_QUEUE_TIER_WINDOW;
}

// ---------------------------------------------------------------------------
// Day thresholds (same across all three role queues; documented once here)
// ---------------------------------------------------------------------------

export const BLOCKED_PAST_CLOSE_DAYS = 7;
export const STALE_STAGE_AT_RISK_DAYS = 30;
export const CLOSING_SOON_DAYS = 14;

/**
 * Phase 54: documents marked received but still lacking a reviewer
 * past this many calendar days surface as "pending review" — an
 * advisory at-risk signal, NOT an approval or workflow state.
 *
 * The signal is conservative by design:
 *   - the schema has no cr664_revieweddate column to anchor against,
 *     so the predicate uses receivedDate as the elapsed-time anchor;
 *   - the wording everywhere is "may require review" / "pending
 *     review" — never "overdue review" or "review failed";
 *   - the signal CLEARS as soon as cr664_reviewer is set on the row,
 *     since that is the only signal the schema offers that a banker
 *     has actually engaged with the document.
 */
export const PENDING_REVIEW_AT_RISK_DAYS = 7;

/**
 * Phase 54 predicate. Returns true when a document checklist row is
 * in the "received but not yet reviewed" state AND has sat there
 * past the threshold.
 *
 * - reviewer non-empty → the row is reviewed; signal is cleared.
 * - no receivedDate → the row is still outstanding; not in scope
 *   for this signal.
 * - receivedDate present + reviewer empty + elapsed >= threshold →
 *   pending review.
 *
 * The uploaded flag is intentionally ignored here. It indicates the
 * upstream channel of arrival; the review timeline is anchored on
 * receivedDate alone.
 */
export function isReceivedDocumentPendingReview(opts: {
  receivedDate: string | undefined;
  reviewer: string | undefined;
  nowMs: number;
  thresholdDays?: number;
}): boolean {
  if (opts.reviewer && opts.reviewer.trim().length > 0) return false;
  if (!opts.receivedDate) return false;
  const days = daysFromNow(opts.receivedDate, opts.nowMs);
  if (days == null) return false;
  // daysFromNow returns negative for past dates (received in the
  // past). The threshold compares against the absolute value.
  const elapsed = Math.abs(days);
  return elapsed >= (opts.thresholdDays ?? PENDING_REVIEW_AT_RISK_DAYS);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Date math
// ---------------------------------------------------------------------------

export function isPastDue(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && ms < nowMs;
}

/**
 * Calendar-day differencing. Normalizes each timestamp to its
 * start-of-UTC-day index before subtracting so the result reads in
 * banker-intuitive whole days regardless of the time-of-day component
 * either timestamp carries. May 13 noon → May 20 midnight = 7 days,
 * not 6.5.
 */
export function daysFromNow(
  iso: string | undefined,
  nowMs: number,
): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const targetDay = Math.floor(ms / MS_PER_DAY);
  const nowDay = Math.floor(nowMs / MS_PER_DAY);
  return targetDay - nowDay;
}

// ---------------------------------------------------------------------------
// Sort comparator + base item shape
// ---------------------------------------------------------------------------

/**
 * Minimum shape a queue item needs for sort and counting. Each role's
 * WorkQueueItem extends this with role-specific fields (banker has no
 * extras; manager adds bankerName; team adds ownerName).
 */
export interface WorkQueueItemBase {
  id: string;
  severity: WorkQueueSeverity;
  dealName: string;
  sortKey: number;
}

/**
 * Standard sort comparator: most-urgent first (highest sortKey),
 * deterministic tiebreak by dealName. Reused by all three role
 * derivations.
 */
export function compareWorkQueueItems(
  a: WorkQueueItemBase,
  b: WorkQueueItemBase,
): number {
  if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
  return a.dealName.localeCompare(b.dealName);
}

// ---------------------------------------------------------------------------
// UI helpers (severity color/label, counts, overall badge, date format)
// ---------------------------------------------------------------------------

/**
 * Map work-queue severity to the shared theme's SeverityKey so the
 * Badge / StatusDot components can render consistent colors across
 * all three role queues.
 */
export function severityToKey(s: WorkQueueSeverity): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'overdue') return 'atRisk';
  if (s === 'at-risk') return 'atRisk';
  return 'info';
}

export function severityLabel(s: WorkQueueSeverity): string {
  if (s === 'blocked') return 'Blocked';
  if (s === 'overdue') return 'Overdue';
  if (s === 'at-risk') return 'At risk';
  return 'Upcoming';
}

export interface WorkQueueSeverityCounts {
  blocked: number;
  overdue: number;
  atRisk: number;
  upcoming: number;
  total: number;
}

export function countBySeverity(
  items: readonly { severity: WorkQueueSeverity }[],
): WorkQueueSeverityCounts {
  let blocked = 0;
  let overdue = 0;
  let atRisk = 0;
  let upcoming = 0;
  for (const i of items) {
    if (i.severity === 'blocked') blocked++;
    else if (i.severity === 'overdue') overdue++;
    else if (i.severity === 'at-risk') atRisk++;
    else upcoming++;
  }
  return { blocked, overdue, atRisk, upcoming, total: items.length };
}

export function subtitleForCounts(c: WorkQueueSeverityCounts): string {
  const bits: string[] = [];
  if (c.blocked > 0) bits.push(`${c.blocked} blocked`);
  if (c.overdue > 0) bits.push(`${c.overdue} overdue`);
  if (c.atRisk > 0) bits.push(`${c.atRisk} at risk`);
  if (c.upcoming > 0) bits.push(`${c.upcoming} upcoming`);
  return bits.join(' · ') || `${c.total} work item${c.total === 1 ? '' : 's'}`;
}

export function overallSeverityKey(c: WorkQueueSeverityCounts): SeverityKey {
  if (c.blocked > 0) return 'blocked';
  if (c.overdue > 0 || c.atRisk > 0) return 'atRisk';
  if (c.upcoming > 0) return 'info';
  return 'clear';
}

export function overallBadgeLabel(c: WorkQueueSeverityCounts): string {
  if (c.blocked > 0) return 'Blockers open';
  if (c.overdue > 0) return 'Overdue items';
  if (c.atRisk > 0) return 'Review needed';
  if (c.upcoming > 0) return 'Upcoming';
  return 'Clear';
}

/**
 * Format an ISO date for queue rows. UTC-anchored, en-US, short month
 * + day + year. Used by every role card; lives here so format drift
 * is impossible.
 */
export function formatQueueDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Maximum rows a role queue card renders before showing a "showing
 * N of M" hint. All three role cards used 60; centralizing it keeps
 * the UX consistent if the cap ever moves.
 */
export const MAX_WORK_QUEUE_ROWS = 60;
