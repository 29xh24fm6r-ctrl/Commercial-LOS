/**
 * Phase 98: pure formatter that turns a Banker / Manager
 * Morning-Catch-Up feed into a Teams-safe plain-text summary the
 * user can copy and paste into Microsoft Teams.
 *
 * Sibling to:
 *   - src/deals/teamsDealSummary.ts (Phase 96 per-deal summary);
 *   - src/shared/relationship/relationshipContextNote.ts (Phase 97
 *     relationship line);
 * Different surface (catch-up feed instead of one deal), same
 * no-admin Teams handoff posture:
 *   - No SDK import. No Graph / MSAL / token code. No role-module
 *     import. The function returns a string; the caller copies it.
 *   - The function never writes, sends, or posts. The verbs "sent",
 *     "posted", "delivered", "notified", "synced", "integrated",
 *     "Graph connected" never appear in the output. A static-source
 *     hygiene test pins this.
 *   - The formatter does not touch the Phase 90 last-seen marker,
 *     the Phase 91 dismiss / snooze ledger, or the Phase 94
 *     mark-all-seen action. Copying a summary changes nothing in
 *     the catch-up surface's local state.
 *
 * Conservative copy discipline (Phase 98 brief):
 *   - Output never carries internal audit IDs, cr664_* logical
 *     names, raw timeline payloads, full memo text, secrets,
 *     tokens, or approval / denial / decisioning / risk-score /
 *     performance-score language. The caller is expected to pass
 *     already-rendered display strings (item.title + item.reason),
 *     never raw entity rows.
 */

export type CatchUpTeamsSurface = 'banker' | 'manager';

export type CatchUpTeamsItemPriority = 'high' | 'medium' | 'low';

/**
 * Narrow projection of a Phase 88 / 89 catch-up item the Teams
 * summary actually needs. The catch-up primitive's full
 * `ManagerCatchUpItem` carries extra fields (kind, source,
 * occurredAt, derivedAt) the Teams paste doesn't use — keeping the
 * input narrow makes the formatter independent of the primitive
 * shape.
 */
export interface CatchUpTeamsSummaryItem {
  dealId: string;
  dealName: string;
  /** Banker / owner name to render on manager-surface rows. Ignored
   *  on the banker surface (the signed-in banker is the implicit
   *  owner of every row). */
  ownerName: string | undefined;
  priority: CatchUpTeamsItemPriority;
  title: string;
  reason: string;
}

export interface CatchUpTeamsSummaryLastSeen {
  /** True on the user's first visit to this surface on this
   *  browser (no prior marker recorded). Renders the verbatim
   *  "First visit on this browser." line. */
  firstVisit: boolean;
  /** Number of visible items strictly newer than the prior marker.
   *  Always 0 when firstVisit is true. */
  newCount: number;
}

export interface CatchUpTeamsSummaryInput {
  surface: CatchUpTeamsSurface;
  /** Total visible items the card is rendering — already filtered
   *  for snoozed entries by the caller. The Phase 88/89 primitive
   *  caps the underlying list at TOP_N_CATCH_UP_ITEMS (8); the
   *  formatter caps to MAX defensively. */
  visibleItemCount: number;
  /** Optional last-seen context. When undefined the formatter omits
   *  the "Since last visit" line (e.g. the scope is unavailable for
   *  this browser). Matches the Phase 90 unscoped fallback. */
  lastSeen: CatchUpTeamsSummaryLastSeen | undefined;
  /** Sorted, post-filter list of items. The formatter caps to
   *  MAX_ITEMS but never reorders. */
  items: readonly CatchUpTeamsSummaryItem[];
  generatedAt: Date;
}

/** Hard cap on items rendered into the Teams paste. The Phase 88/89
 *  primitive caps at TOP_N_CATCH_UP_ITEMS = 8; this formatter mirrors
 *  the same number so the paste stays scannable. */
export const CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS = 8;

export const CATCH_UP_TEAMS_SUMMARY_DISCLAIMER =
  '— Local copy only. Not posted to Teams. Paste into Teams. ' +
  'You send the message manually. Derived from current records; ' +
  'copying does not mark items seen, dismissed, or snoozed.';

const PRIORITY_LABEL: Record<CatchUpTeamsItemPriority, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export function buildCatchUpTeamsSummary(
  input: CatchUpTeamsSummaryInput,
): string {
  const lines: string[] = [];

  const heading = headingFor(input.surface, input.generatedAt);
  lines.push(heading);
  lines.push('');

  // ----- Count line -------------------------------------------------
  const total = clampCount(input.visibleItemCount);
  lines.push(
    total === 1
      ? '1 visible item.'
      : `${total} visible items.`,
  );

  // ----- Since-last-visit line (optional) --------------------------
  const lastSeen = input.lastSeen;
  if (lastSeen) {
    if (lastSeen.firstVisit) {
      lines.push('First visit on this browser.');
    } else {
      const n = clampCount(lastSeen.newCount);
      if (n === 0) {
        lines.push('No new items since your last visit on this browser.');
      } else if (n === 1) {
        lines.push('1 new item since your last visit on this browser.');
      } else {
        lines.push(`${n} new items since your last visit on this browser.`);
      }
    }
  }

  lines.push('');

  // ----- Top items list --------------------------------------------
  const capped = input.items.slice(0, CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS);
  if (capped.length > 0) {
    lines.push('Top items:');
    for (const item of capped) {
      lines.push(renderItem(item, input.surface));
    }
    lines.push('');
  }

  // ----- Disclaimer -------------------------------------------------
  lines.push(CATCH_UP_TEAMS_SUMMARY_DISCLAIMER);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headingFor(surface: CatchUpTeamsSurface, generatedAt: Date): string {
  const label =
    surface === 'banker'
      ? 'Banker morning catch-up'
      : 'Manager morning catch-up';
  const day = formatDayUtc(generatedAt) ?? '';
  return day.length > 0 ? `${label} — ${day}` : label;
}

function renderItem(
  item: CatchUpTeamsSummaryItem,
  surface: CatchUpTeamsSurface,
): string {
  const dealName = item.dealName.trim();
  const title = item.title.trim();
  const reason = item.reason.trim();

  // Compose: `- [PRIORITY] <dealName> — <title>: <reason>`
  // On manager surface, append `(Banker: <ownerName>)` when present
  // so the manager can see ownership without leaving the paste.
  const head = `- [${PRIORITY_LABEL[item.priority]}] ${dealName}`;
  const body = composeTitleReason(title, reason);

  if (surface === 'manager') {
    const owner = (item.ownerName ?? '').trim();
    if (owner.length > 0) {
      return body.length > 0
        ? `${head} — ${body} (Banker: ${owner})`
        : `${head} (Banker: ${owner})`;
    }
  }

  return body.length > 0 ? `${head} — ${body}` : head;
}

function composeTitleReason(title: string, reason: string): string {
  if (title.length === 0 && reason.length === 0) return '';
  if (title.length === 0) return reason;
  if (reason.length === 0) return title;
  return `${title}: ${reason}`;
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
