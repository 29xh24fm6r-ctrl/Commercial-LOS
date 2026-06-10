/**
 * Phase 144D — drill-through deep-link helpers (pure, no React).
 *
 * Encodes a STABLE LOCAL drill-through target id into a single URL query param so
 * a read-only detail panel can be shared / reopened. These helpers NEVER fetch,
 * navigate outside the current page, authorize data, or treat the param as an
 * instruction — they only sanitize/validate an id and rewrite the query string of
 * the CURRENT location. Availability is always governed by the page's existing
 * authorized data + drill-through registry, not by the URL text.
 */

/** The single query param that carries the active drill-through target id. */
export const DRILL_PARAM = 'drill';

/** Hard cap so a pasted/forged id cannot be an oversized payload. */
export const MAX_TARGET_ID_LENGTH = 128;

/** Safe id charset: letters, numbers, colon, dash, underscore, period only. */
const TARGET_ID_RX = /^[A-Za-z0-9:._-]+$/;

/**
 * Protocol / payload-ish substrings that the charset alone would not catch
 * (colon is allowed, so "javascript:" would otherwise pass). Rejected
 * case-insensitively.
 */
const DENY_SUBSTRINGS = ['javascript:', 'data:', 'vbscript:', 'script', '://'];

/**
 * Returns the id when it is a safe, stable drill-through target id; otherwise
 * null. Pure and deterministic — never throws.
 */
export function sanitizeDrillThroughTargetId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (id.length === 0 || id.length > MAX_TARGET_ID_LENGTH) return null;
  if (!TARGET_ID_RX.test(id)) return null;
  const lower = id.toLowerCase();
  if (DENY_SUBSTRINGS.some((bad) => lower.includes(bad))) return null;
  return id;
}

/** Boolean form of {@link sanitizeDrillThroughTargetId}. */
export function isValidDrillThroughTargetId(id: string | null | undefined): boolean {
  return sanitizeDrillThroughTargetId(id) !== null;
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/** Stable "?a=b&c=d" form (with leading "?", or "" when empty). */
function formatSearch(params: URLSearchParams): string {
  const s = params.toString();
  return s.length === 0 ? '' : `?${s}`;
}

/**
 * Reads and validates the drill-through target id from a search string or
 * URLSearchParams. Returns null when absent or unsafe.
 */
export function parseDrillThroughTargetId(search: string | URLSearchParams): string | null {
  return sanitizeDrillThroughTargetId(toSearchParams(search).get(DRILL_PARAM));
}

/**
 * Returns a new search string with the drill param set to `targetId`, preserving
 * every other param. When `targetId` is unsafe, the drill param is removed rather
 * than written (fail closed).
 */
export function buildDrillThroughSearch(
  currentSearch: string | URLSearchParams,
  targetId: string,
): string {
  const params = toSearchParams(currentSearch);
  const safe = sanitizeDrillThroughTargetId(targetId);
  if (safe === null) {
    params.delete(DRILL_PARAM);
  } else {
    params.set(DRILL_PARAM, safe);
  }
  return formatSearch(params);
}

/** Returns a new search string with the drill param removed, preserving others. */
export function removeDrillThroughParam(currentSearch: string | URLSearchParams): string {
  const params = toSearchParams(currentSearch);
  params.delete(DRILL_PARAM);
  return formatSearch(params);
}

/**
 * Builds a SAME-PAGE relative URL (pathname + rewritten search) with the drill
 * param set. Never includes a protocol/host, so it can only ever be an internal,
 * same-origin deep link — never an external URL.
 */
export function buildDrillThroughUrl(
  currentLocation: { pathname: string; search: string },
  targetId: string,
): string {
  return `${currentLocation.pathname}${buildDrillThroughSearch(currentLocation.search, targetId)}`;
}
