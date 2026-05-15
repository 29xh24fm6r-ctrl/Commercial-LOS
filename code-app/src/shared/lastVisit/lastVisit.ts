/**
 * Phase 72: per-deal last-visit marker + activity-since-last-visit
 * derivation.
 *
 * Pure storage helpers + a pure derivation function. The React hook
 * lives in a sibling file (`useLastVisit.ts`) so unit tests can
 * exercise the storage + derivation independently of React.
 *
 * Discipline:
 *   - State lives ONLY in browser localStorage. No Dataverse write,
 *     no audit row, no timeline event, no cross-device sync, no
 *     network call of any kind.
 *   - The marker is per-deal. We do NOT track marker-per-card or
 *     marker-per-tab. A banker who opens the same deal in two tabs
 *     will see the same prior marker in both tabs; the marker
 *     written on close reflects whichever tab last finished
 *     mounting.
 *   - The marker is plain text (millisecond Unix epoch). No PII, no
 *     deal content, no identifying borrower data is stored.
 *   - The derivation is conservative: events whose timestamp is
 *     EXACTLY equal to the prior marker are NOT counted as new
 *     (avoids re-counting the event that triggered the previous
 *     marker write).
 *
 * Cross-device behavior (explicitly NOT supported):
 *   - A banker who reviews a deal on desktop, then opens it on
 *     mobile, will see ALL events on mobile as "new since last
 *     visit" because each browser has its own localStorage.
 *   - This is documented as a limitation, not a bug. The Phase 72
 *     brief explicitly forbids cross-device sync.
 */

/**
 * localStorage key prefix. The deal id is appended to give a
 * per-deal slot. The prefix is namespaced so collision with
 * unrelated app preferences is impossible — and so a future schema
 * for app preferences can grep this prefix to audit storage use.
 */
export const LAST_VISIT_STORAGE_KEY_PREFIX = 'cc:lastVisit:deal:';

/**
 * Delay before the current visit's marker is bumped to "now". The
 * UI uses the PRE-bump value for its "N new since last visit"
 * display; the bump happens after a brief settle so the banker
 * sees the badge before it clears. The next visit starts from the
 * timestamp we write here.
 *
 * 2 seconds — long enough to read the badge, short enough that a
 * "preview" tab switch doesn't lose history.
 */
export const MARKER_UPDATE_DELAY_MS = 2000;

function storageKeyFor(dealId: string): string {
  return `${LAST_VISIT_STORAGE_KEY_PREFIX}${dealId}`;
}

/**
 * Read the prior last-visit marker for a deal from localStorage.
 * Returns `undefined` when:
 *   - localStorage is not available (e.g. SSR / tests without jsdom);
 *   - the key is absent (first visit);
 *   - the stored value cannot be parsed as a positive integer.
 *
 * Never throws — bad values surface as "no prior marker".
 */
export function getLastVisitMs(dealId: string): number | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(storageKeyFor(dealId));
    if (raw == null) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  } catch {
    return undefined;
  }
}

/**
 * Write the last-visit marker for a deal. No-ops on storage
 * unavailability or write errors (private-browsing mode can throw
 * QuotaExceededError; we swallow it because losing a marker is a
 * cosmetic regression, not a correctness problem).
 */
export function setLastVisitMs(dealId: string, ms: number): void {
  if (typeof localStorage === 'undefined') return;
  if (!Number.isFinite(ms) || ms <= 0) return;
  try {
    localStorage.setItem(storageKeyFor(dealId), String(Math.floor(ms)));
  } catch {
    // Storage may be full or disabled (private-browsing). Drop
    // the write silently — the user will see "new since last
    // visit" computed against the prior marker, which is still a
    // useful signal.
  }
}

/**
 * Remove a deal's marker. Exposed for tests + an eventual
 * "Clear last-visit history" admin action (not in Phase 72 scope).
 */
export function clearLastVisitMs(dealId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKeyFor(dealId));
  } catch {
    // Same swallow as setLastVisitMs.
  }
}

// ---------------------------------------------------------------------------
// Pure derivation
// ---------------------------------------------------------------------------

export interface ActivitySinceLastVisitSummary {
  /** Count of events whose timestamp is STRICTLY AFTER the prior
   *  marker. When `priorLastVisitMs` is undefined (first visit),
   *  this is 0 — the badge convention is "first visit, nothing
   *  to compare against." */
  newCount: number;
  /** ISO timestamp of the newest "new" event, or undefined when
   *  there are no new events. */
  latestNewAt: string | undefined;
  /** Pure predicate: returns true when the given event's
   *  timestamp is strictly after the prior marker. */
  isNew(eventAt: string | undefined): boolean;
}

/**
 * Pure derivation. Takes a list of events (each with an `eventAt`
 * ISO string) and the prior last-visit marker; returns the count of
 * new events + a per-event predicate.
 *
 * First visit (priorLastVisitMs === undefined) → newCount=0 and
 * isNew always returns false. The badge convention is "first visit
 * means no comparison surface yet" — the banker sees every event
 * in the timeline (they're all visible), and the NEXT visit's
 * marker will let them see what's new since this view.
 */
export function summarizeActivitySinceLastVisit(
  events: ReadonlyArray<{ id: string; eventAt: string | undefined }>,
  priorLastVisitMs: number | undefined,
): ActivitySinceLastVisitSummary {
  if (priorLastVisitMs === undefined) {
    return {
      newCount: 0,
      latestNewAt: undefined,
      isNew: () => false,
    };
  }
  const newEventMs = new Set<number>();
  let latestNewMs: number | undefined;
  for (const e of events) {
    if (!e.eventAt) continue;
    const ms = Date.parse(e.eventAt);
    if (!Number.isFinite(ms)) continue;
    if (ms > priorLastVisitMs) {
      newEventMs.add(ms);
      if (latestNewMs === undefined || ms > latestNewMs) {
        latestNewMs = ms;
      }
    }
  }
  const latestNewAt =
    latestNewMs === undefined
      ? undefined
      : new Date(latestNewMs).toISOString();
  return {
    newCount: newEventMs.size > 0 ? countNewEvents(events, priorLastVisitMs) : 0,
    latestNewAt,
    isNew(eventAt: string | undefined): boolean {
      if (!eventAt) return false;
      const ms = Date.parse(eventAt);
      if (!Number.isFinite(ms)) return false;
      return ms > priorLastVisitMs;
    },
  };
}

function countNewEvents(
  events: ReadonlyArray<{ eventAt: string | undefined }>,
  priorLastVisitMs: number,
): number {
  let n = 0;
  for (const e of events) {
    if (!e.eventAt) continue;
    const ms = Date.parse(e.eventAt);
    if (!Number.isFinite(ms)) continue;
    if (ms > priorLastVisitMs) n++;
  }
  return n;
}
