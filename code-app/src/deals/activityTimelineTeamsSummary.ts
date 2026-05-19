/**
 * Phase 99: pure formatter that turns the per-deal Activity Timeline
 * into a Teams-safe plain-text digest the banker can copy and paste
 * into Microsoft Teams.
 *
 * Sibling to:
 *   - src/deals/teamsDealSummary.ts (Phase 96 per-deal summary);
 *   - src/shared/activity/catchUpTeamsSummary.ts (Phase 98 morning
 *     catch-up summary);
 *
 * Same no-admin Teams handoff posture:
 *   - No SDK import. No Graph / MSAL / token code. No role-module
 *     import. The function returns a string; the caller copies it.
 *   - The function never writes, sends, or posts. The verbs "sent",
 *     "posted", "delivered", "notified", "synced", "integrated",
 *     "Graph connected" never appear in the output. A static-source
 *     hygiene test pins this.
 *   - The formatter does not touch the Phase 72 per-deal last-visit
 *     marker. Copying the digest changes nothing in the timeline
 *     surface's local state.
 *
 * Conservative copy discipline (Phase 99 brief):
 *   - Output never carries internal audit IDs, cr664_* logical
 *     names, _value lookup suffixes, raw timeline payload JSON,
 *     correlation ids, secrets, tokens, or approval / denial /
 *     decisioning / risk-score / performance-score language. The
 *     caller is expected to pass already-mapped display strings
 *     (eventType + sourceLabel + actor), never raw entity rows.
 */

/**
 * Narrow projection of one timeline event the digest renders. The
 * caller maps from `TimelineEvent` (src/deals/activityQueries.ts) by:
 *   - copying `eventAt`, `title`, `summary`, `eventType`,
 *     `eventSubType` verbatim;
 *   - mapping `relatedEntityType` to a banker-friendly label via the
 *     existing `friendlyEntityLabel` helper;
 *   - stamping the actor as "System" when `isSystemGenerated` and
 *     `actorName` otherwise (with "Unknown user" as the final
 *     fallback so the row never renders bare).
 */
export interface ActivityTimelineTeamsSummaryItem {
  /** ISO timestamp (cr664_eventat). Rendered as YYYY-MM-DD UTC plus
   *  HH:mm UTC for a deterministic, locale-free stamp. */
  eventAt: string;
  /** Banker-facing title (cr664_title). */
  title: string;
  /** Optional one-line summary (cr664_summary). When blank the
   *  formatter omits the trailing "— <summary>" segment on the row. */
  summary: string | undefined;
  /** Human-readable event type (cr664_eventtypename, e.g. "Note",
   *  "Task completed"). Optional. */
  eventType: string | undefined;
  /** Optional sub-type label, when present on the record. */
  eventSubType: string | undefined;
  /** Friendly entity label ("Task", "Document", "Credit memo", …),
   *  already mapped from `cr664_relatedentitytype` by the caller.
   *  Pass `undefined` to omit the source label entirely. */
  sourceLabel: string | undefined;
  /** Display actor — "System" for system-generated events, the
   *  banker's name otherwise. Caller MUST pass a display string;
   *  the formatter does NOT inspect any boolean. */
  actor: string;
  /** Whether the item is newer than the Phase 72 last-visit marker.
   *  Adds a "(new)" suffix on the row when true. */
  isNewSinceLastVisit: boolean;
}

export interface ActivityTimelineTeamsSummaryLastSeen {
  /** True on the user's first visit to this deal's timeline on
   *  this browser (no prior marker recorded). */
  firstVisit: boolean;
  /** Number of items strictly newer than the prior marker. Always
   *  0 when firstVisit is true. */
  newCount: number;
}

export interface ActivityTimelineTeamsSummaryInput {
  /** Friendly deal name (cr664_dealname). The caller is expected to
   *  trim before passing — the formatter does not trim. */
  dealName: string;
  /** Total visible timeline events on the deal — used for the
   *  "N timeline events" headline. May exceed `items.length` when
   *  the caller passed a capped list. */
  totalItemCount: number;
  /** Optional Phase 72 last-visit context. `undefined` → the
   *  formatter omits the since-last-visit line entirely. */
  lastSeen: ActivityTimelineTeamsSummaryLastSeen | undefined;
  /** Sorted (newest-first) items the digest renders. The formatter
   *  caps at ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS but never
   *  reorders. */
  items: readonly ActivityTimelineTeamsSummaryItem[];
  /** Caller-supplied "now", used for the heading's
   *  generated-on date. */
  generatedAt: Date;
}

/** Hard cap on rendered events. Matches the per-deal Phase 80 panel's
 *  top-3 disposition + the Phase 88/89 catch-up cap of 8. */
export const ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS = 8;

export const ACTIVITY_TIMELINE_TEAMS_SUMMARY_DISCLAIMER =
  '— Local copy only. Not posted to Teams. Paste into Teams. ' +
  'You send the message manually. Derived from current records; ' +
  'copying does not mark activity seen or change deal status.';

export function buildActivityTimelineTeamsSummary(
  input: ActivityTimelineTeamsSummaryInput,
): string {
  const lines: string[] = [];

  const heading = headingFor(input.dealName, input.generatedAt);
  lines.push(heading);
  lines.push('');

  // ----- Count line ----------------------------------------------
  const total = clampCount(input.totalItemCount);
  lines.push(
    total === 1
      ? '1 timeline event.'
      : `${total} timeline events.`,
  );

  // ----- Since-last-visit line (optional) ------------------------
  const lastSeen = input.lastSeen;
  if (lastSeen) {
    if (lastSeen.firstVisit) {
      lines.push('First visit on this browser.');
    } else {
      const n = clampCount(lastSeen.newCount);
      if (n === 0) {
        lines.push(
          'No new activity since your last visit on this browser.',
        );
      } else if (n === 1) {
        lines.push(
          '1 new activity item since your last visit on this browser.',
        );
      } else {
        lines.push(
          `${n} new activity items since your last visit on this browser.`,
        );
      }
    }
  }

  lines.push('');

  // ----- Recent activity list ------------------------------------
  const capped = input.items.slice(
    0,
    ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS,
  );
  if (capped.length > 0) {
    lines.push('Recent activity:');
    for (const item of capped) {
      lines.push(renderItem(item));
    }
    lines.push('');
  }

  // ----- Disclaimer ----------------------------------------------
  lines.push(ACTIVITY_TIMELINE_TEAMS_SUMMARY_DISCLAIMER);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headingFor(dealName: string, generatedAt: Date): string {
  const name = dealName.trim();
  const day = formatDayUtc(generatedAt) ?? '';
  const left = name.length > 0
    ? `${name} — activity digest`
    : 'Activity digest';
  return day.length > 0 ? `${left} — ${day}` : left;
}

function renderItem(item: ActivityTimelineTeamsSummaryItem): string {
  // Per-row format:
  //   - <YYYY-MM-DD HH:mm UTC> · <Event type[/SubType]>: <Title>
  //     [— <summary>] (<sourceLabel> · by <actor>)[ · new]
  const when = formatWhenUtc(item.eventAt) ?? 'unknown time';

  const typeParts: string[] = [];
  const eventType = (item.eventType ?? '').trim();
  const eventSubType = (item.eventSubType ?? '').trim();
  if (eventType.length > 0) typeParts.push(eventType);
  if (eventSubType.length > 0) typeParts.push(eventSubType);
  const typeLabel = typeParts.length > 0 ? typeParts.join(' / ') : undefined;

  const title = item.title.trim();
  const headBody = typeLabel && title.length > 0
    ? `${typeLabel}: ${title}`
    : typeLabel ?? title;

  const summary = (item.summary ?? '').trim();
  const summaryBody =
    summary.length > 0 ? ` — ${summary}` : '';

  const metaParts: string[] = [];
  const source = (item.sourceLabel ?? '').trim();
  if (source.length > 0) metaParts.push(source);
  const actor = item.actor.trim();
  if (actor.length > 0) metaParts.push(`by ${actor}`);
  const meta = metaParts.length > 0 ? ` (${metaParts.join(' · ')})` : '';

  const newSuffix = item.isNewSinceLastVisit ? ' · new' : '';

  return `- ${when} · ${headBody || '(no title)'}${summaryBody}${meta}${newSuffix}`;
}

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

function formatWhenUtc(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}
