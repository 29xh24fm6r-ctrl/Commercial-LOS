/**
 * Phase 90: per-user last-seen markers for the morning catch-up
 * feeds (Phase 88 manager + Phase 89 banker).
 *
 * Pure storage helpers + a pure derivation function. The React hook
 * lives in a sibling file (`useCatchUpLastSeen.ts`).
 *
 * Sibling to Phase 72's `lastVisit.ts` per-deal marker — same
 * LOCAL_ONLY discipline, different scope:
 *
 *   - Phase 72 marker key:  `cc:lastVisit:deal:<dealId>`
 *   - Phase 90 marker key:  `cc:lastVisit:catchUp:<scopeId>` where
 *     `<scopeId>` is `banker:<bankerId>` OR
 *     `manager:<bankerId>:<teamId>`.
 *
 * Discipline (identical to Phase 72):
 *   - State lives ONLY in browser localStorage. No Dataverse write,
 *     no audit row, no timeline event, no notification delivery, no
 *     cross-device sync, no network call.
 *   - The marker is per-user-per-surface. A banker who also has a
 *     manager workspace sees two distinct markers because the
 *     surface segment differs.
 *   - The marker is plain text (millisecond Unix epoch). No PII, no
 *     deal content, no identifying borrower data is stored.
 *   - "New" is determined by strict greater-than comparison against
 *     the prior marker. Items whose anchor timestamp is EXACTLY
 *     equal to the prior marker are NOT counted as new.
 *   - Items with NO `occurredAt`, or whose `occurredAt` is in the
 *     FUTURE relative to `now`, are never counted as new. Future-
 *     anchored items (e.g. closing-soon based on a future
 *     targetCloseDate) are observation items that always re-fire
 *     while the deal stays in the matching window; treating them
 *     as "new since last visit" would be misleading.
 *
 * Cross-device behavior (explicitly NOT supported):
 *   - A user who views the workspace on desktop then opens it on
 *     mobile will see EVERY current catch-up item as "new" on
 *     mobile, because each browser has its own localStorage.
 *   - The catch-up feed's underlying deterministic items are
 *     identical across devices; only the "new since" overlay is
 *     local.
 *
 * What this is NOT (mirrors Phase 88's contract):
 *   - Not a notification surface. The badge shows COUNT only — no
 *     push, no Teams card, no Outlook send.
 *   - Not an unread state. The marker is a viewing convenience; it
 *     does not represent enforcement, compliance, or any official
 *     "acknowledged" record.
 *   - Not synced across devices, sessions, or users.
 *   - Not a Dataverse write surface. No `Cr664_*Service` call.
 */

/**
 * localStorage key prefix. The scope id (banker:<bankerId> OR
 * manager:<bankerId>:<teamId>) is appended to give a per-user-per-
 * surface slot. The prefix is namespaced so collision with the
 * Phase 72 per-deal markers is impossible — the trailing `catchUp:`
 * segment disambiguates the two slots in the shared `cc:lastVisit:`
 * namespace.
 */
export const CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX = 'cc:lastVisit:catchUp:';

/**
 * Delay before the current visit's marker is bumped to "now". Same
 * 2-second settle Phase 72 uses — long enough to read the badge,
 * short enough that a tab switch doesn't lose history.
 */
export const CATCH_UP_MARKER_UPDATE_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Scope keying
//
// banker:  `banker:<bankerId>`
// manager: `manager:<bankerId>:<teamId>`
//
// `bankerId` is `cr664_bankerid` — the stable per-user PK already
// resolved by `useBanker()` (banker workspace) or
// `loadManagerIdentity()` (manager workspace). `teamId` for the
// manager scope is the `cr664_teamid` resolved by the same loader.
// ---------------------------------------------------------------------------

export type CatchUpSurface = 'banker' | 'manager';

export interface CatchUpScopeInput {
  surface: CatchUpSurface;
  /** Stable user id (cr664_bankerid). Required — when undefined the
   *  caller falls back to no-marker / first-visit-style behavior. */
  userId: string | undefined;
  /** Required for `surface === 'manager'`. When undefined on the
   *  manager surface the scope cannot be built and the caller falls
   *  back to first-visit-style behavior. Ignored on the banker
   *  surface. */
  teamId?: string | undefined;
}

export interface CatchUpScope {
  /** The composed storage-key segment. The full storage key is
   *  `CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX + scopeId`. */
  scopeId: string;
  surface: CatchUpSurface;
}

/**
 * Build a stable scope id from the caller's identity. Returns null
 * when the identity is incomplete (no userId; or manager with no
 * teamId). The caller MUST handle the null case explicitly — the
 * card should show first-visit copy + skip the marker write.
 *
 * Empty / whitespace strings count as missing.
 */
export function buildCatchUpScope(
  input: CatchUpScopeInput,
): CatchUpScope | null {
  const userId = (input.userId ?? '').trim();
  if (!userId) return null;
  if (input.surface === 'banker') {
    return { scopeId: `banker:${userId}`, surface: 'banker' };
  }
  if (input.surface === 'manager') {
    const teamId = (input.teamId ?? '').trim();
    if (!teamId) return null;
    return {
      scopeId: `manager:${userId}:${teamId}`,
      surface: 'manager',
    };
  }
  return null;
}

function storageKeyFor(scopeId: string): string {
  return `${CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX}${scopeId}`;
}

/**
 * Read the prior last-seen marker for a scope from localStorage.
 * Returns `undefined` on first visit, missing storage, or bad value.
 * Never throws.
 */
export function getCatchUpLastSeenMs(scopeId: string): number | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(storageKeyFor(scopeId));
    if (raw == null) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  } catch {
    return undefined;
  }
}

/**
 * Write the last-seen marker for a scope. No-ops on storage
 * unavailability or write errors (private-browsing mode can throw
 * QuotaExceededError; we swallow because losing a marker is a
 * cosmetic regression, not a correctness problem).
 */
export function setCatchUpLastSeenMs(scopeId: string, ms: number): void {
  if (typeof localStorage === 'undefined') return;
  if (!Number.isFinite(ms) || ms <= 0) return;
  try {
    localStorage.setItem(storageKeyFor(scopeId), String(Math.floor(ms)));
  } catch {
    // Same swallow as Phase 72's setLastVisitMs.
  }
}

/**
 * Remove a scope's marker. Exposed for tests and an eventual
 * "Clear catch-up history" admin action.
 */
export function clearCatchUpLastSeenMs(scopeId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKeyFor(scopeId));
  } catch {
    // Same swallow as Phase 72.
  }
}

// ---------------------------------------------------------------------------
// Pure derivation
// ---------------------------------------------------------------------------

export interface CatchUpSinceLastSeenSummary {
  /** Count of items whose `occurredAt` is STRICTLY AFTER the prior
   *  marker AND in the past (<= now). Items with no `occurredAt`,
   *  or with a future `occurredAt`, are excluded. When
   *  `priorLastSeenMs` is undefined (first visit) this is 0. */
  newCount: number;
  /** True when the scope had no prior marker — i.e., this is the
   *  user's first visit on this browser. The card surfaces this
   *  distinctly from "zero new since last visit". */
  isFirstVisit: boolean;
  /** Pure predicate: returns true when the item's anchor timestamp
   *  is strictly after the prior marker AND in the past. */
  isNew(occurredAt: string | undefined): boolean;
}

/**
 * Pure derivation. Takes a list of catch-up items (each with an
 * `occurredAt` ISO string) and the prior marker + `now`; returns
 * the count of items that are "new since last seen" + a per-item
 * predicate.
 *
 * First visit (priorLastSeenMs === undefined) → newCount = 0,
 * isFirstVisit = true, isNew always returns false. The card
 * convention is "first visit means no comparison surface yet" —
 * every item is visible (it's all surfaced in the feed); the NEXT
 * visit's marker will let the user see what's new since this view.
 */
export function summarizeCatchUpSinceLastSeen(
  items: ReadonlyArray<{ id: string; occurredAt: string | undefined }>,
  priorLastSeenMs: number | undefined,
  now: Date,
): CatchUpSinceLastSeenSummary {
  const nowMs = now.getTime();
  if (priorLastSeenMs === undefined) {
    return {
      newCount: 0,
      isFirstVisit: true,
      isNew: () => false,
    };
  }
  let count = 0;
  for (const item of items) {
    if (isItemNew(item.occurredAt, priorLastSeenMs, nowMs)) count++;
  }
  return {
    newCount: count,
    isFirstVisit: false,
    isNew(occurredAt: string | undefined): boolean {
      return isItemNew(occurredAt, priorLastSeenMs, nowMs);
    },
  };
}

function isItemNew(
  occurredAt: string | undefined,
  priorLastSeenMs: number,
  nowMs: number,
): boolean {
  if (!occurredAt) return false;
  const ms = Date.parse(occurredAt);
  if (!Number.isFinite(ms)) return false;
  // Strict greater-than: an item with anchor exactly equal to the
  // prior marker is NOT new (avoids re-counting the item that
  // triggered the previous marker write).
  if (ms <= priorLastSeenMs) return false;
  // Future-anchored items (closing-soon, task-due-soon) are never
  // "new since last visit" — they are forward-looking observations
  // that re-fire as long as the deal stays in the matching window.
  // Treating them as "new" would mislead the user into thinking
  // something CHANGED, when in fact the deal is just still in the
  // closing window. The strict `<= nowMs` check filters them out.
  if (ms > nowMs) return false;
  return true;
}
