/**
 * Phase 93: local browser-only manager banker-filter preference.
 *
 * Pure storage + validation helpers. The React provider in
 * `ManagerBankerFilter.tsx` reads these on mount and writes them on
 * every selection change.
 *
 * Sibling to Phase 90's `catchUpLastSeen.ts` and Phase 91's
 * `catchUpItemLedger.ts` — same LOCAL_ONLY discipline, separate
 * storage namespace, separate keying:
 *
 *   - Storage slot: `cc:managerFilterSelection:v1` (single slot,
 *     map keyed by scope id).
 *   - Scope id: `manager:<bankerId>:<teamId>` — matches Phase 90's
 *     last-seen marker shape so the two preferences move together
 *     across (manager, team) combos.
 *
 * Discipline (identical to Phase 90 / 91):
 *   - State lives ONLY in browser localStorage. No Dataverse write,
 *     no audit row, no timeline event, no cross-device sync, no
 *     network call.
 *   - The stored payload contains the filter selection and a
 *     timestamp — no PII, no deal content, no pipeline data.
 *   - Never throws. Malformed / missing storage surfaces as "no
 *     preference; default to All team" rather than crashing.
 *   - This is NOT an official manager profile setting. It is a view
 *     convenience, scoped to one browser. The doc and the rendered
 *     UI explicitly disclaim sync / profile / official-setting
 *     framing.
 */

import type {
  ManagerBankerFilterOption,
  ManagerBankerFilterSelection,
} from './ManagerBankerFilter';

/** Single localStorage slot. The whole preference map (one entry
 *  per scope id) lives inside it. Versioned suffix lets a future
 *  schema change migrate without colliding. */
export const MANAGER_FILTER_PREFERENCE_STORAGE_KEY =
  'cc:managerFilterSelection:v1';

// ---------------------------------------------------------------------------
// Scope keying
// ---------------------------------------------------------------------------

export interface ManagerFilterPreferenceScopeInput {
  /** Stable user id (cr664_bankerid of the signed-in manager).
   *  Required. */
  userId: string | undefined;
  /** Required for the manager scope: the manager's team id. When
   *  undefined the preference cannot be persisted; the helper
   *  returns null and the provider falls back to in-memory only. */
  teamId: string | undefined;
}

/**
 * Build the per-(manager, team) scope id. Returns null when the
 * identity is incomplete — the caller must NOT persist in that
 * case (silent fall-back to in-memory-only is the right behavior).
 *
 * Whitespace-only values count as missing.
 */
export function buildManagerFilterPreferenceScope(
  input: ManagerFilterPreferenceScopeInput,
): string | null {
  const userId = (input.userId ?? '').trim();
  if (!userId) return null;
  const teamId = (input.teamId ?? '').trim();
  if (!teamId) return null;
  return `manager:${userId}:${teamId}`;
}

// ---------------------------------------------------------------------------
// Stored shape
// ---------------------------------------------------------------------------

/**
 * The stored shape. Mirrors `ManagerBankerFilterSelection` shape
 * exactly so validation can be a near-no-op when the saved
 * selection is still valid. `bankerName` is stored as a snapshot so
 * a future "Restored selection: Alice" toast can show a label even
 * before options re-load.
 */
export interface ManagerFilterPreferenceEntry {
  /** Echo of the scope id this entry belongs to. Defensive — used
   *  to drop tampered entries whose map key disagrees with the
   *  embedded scope. */
  scopeId: string;
  kind: 'all' | 'banker' | 'unassigned';
  /** Defined only when `kind === 'banker'` AND the banker had a
   *  stable id at save time. Name-fallback selections persist
   *  `undefined` here and rely on `bankerName` for restore. */
  bankerId: string | undefined;
  /** Defined only when `kind === 'banker'`. Cosmetic + used as a
   *  name-fallback restore key when bankerId is undefined. */
  bankerName: string | undefined;
  /** ISO timestamp the preference was written. Not surfaced in UI
   *  today; useful for a future "Cleared after N days" admin
   *  affordance. */
  recordedAt: string;
}

/** Map keyed by scope id (manager:<userId>:<teamId>). */
export type ManagerFilterPreferenceMap = Record<
  string,
  ManagerFilterPreferenceEntry
>;

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/**
 * Load the whole preference map. Returns `{}` on any failure
 * (missing slot, malformed JSON, wrong root type). Individual
 * entries that fail the shape check are dropped while well-formed
 * entries survive.
 */
export function loadManagerFilterPreferences(): ManagerFilterPreferenceMap {
  if (typeof localStorage === 'undefined') return {};
  let raw: string | null;
  try {
    raw = localStorage.getItem(MANAGER_FILTER_PREFERENCE_STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw == null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const out: ManagerFilterPreferenceMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isPreferenceEntry(v) && v.scopeId === k) {
      out[k] = v;
    }
  }
  return out;
}

function isPreferenceEntry(v: unknown): v is ManagerFilterPreferenceEntry {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.scopeId !== 'string') return false;
  if (o.kind !== 'all' && o.kind !== 'banker' && o.kind !== 'unassigned') {
    return false;
  }
  if (o.bankerId !== undefined && typeof o.bankerId !== 'string') return false;
  if (o.bankerName !== undefined && typeof o.bankerName !== 'string') return false;
  if (typeof o.recordedAt !== 'string') return false;
  // Cross-field invariants:
  if (o.kind === 'banker') {
    // At least ONE of bankerId / bankerName must be present.
    if (!o.bankerId && !o.bankerName) return false;
  } else {
    // 'all' / 'unassigned' must NOT carry banker fields. Dropping
    // mixed-state tamper matches Phase 91's loader posture.
    if (o.bankerId !== undefined) return false;
    if (o.bankerName !== undefined) return false;
  }
  return true;
}

/** Single-entry getter — convenience over loadAll() + indexing. */
export function getManagerFilterPreference(
  scopeId: string,
): ManagerFilterPreferenceEntry | undefined {
  return loadManagerFilterPreferences()[scopeId];
}

/**
 * Save the preference for a scope. No-ops on storage unavailability
 * or write errors (private-browsing mode can throw QuotaExceeded;
 * we swallow because losing a preference is a cosmetic regression,
 * not a correctness issue).
 */
export function saveManagerFilterPreference(
  scopeId: string,
  selection: ManagerBankerFilterSelection,
  now: Date,
): void {
  if (typeof localStorage === 'undefined') return;
  const entry = buildEntry(scopeId, selection, now);
  const map = loadManagerFilterPreferences();
  map[scopeId] = entry;
  try {
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    // Swallow — local-only, advisory.
  }
}

function buildEntry(
  scopeId: string,
  selection: ManagerBankerFilterSelection,
  now: Date,
): ManagerFilterPreferenceEntry {
  const recordedAt = now.toISOString();
  if (selection.kind === 'all') {
    return {
      scopeId,
      kind: 'all',
      bankerId: undefined,
      bankerName: undefined,
      recordedAt,
    };
  }
  if (selection.kind === 'unassigned') {
    return {
      scopeId,
      kind: 'unassigned',
      bankerId: undefined,
      bankerName: undefined,
      recordedAt,
    };
  }
  return {
    scopeId,
    kind: 'banker',
    bankerId: selection.id,
    bankerName: selection.name,
    recordedAt,
  };
}

/** Remove a scope's preference entry. */
export function clearManagerFilterPreference(scopeId: string): void {
  if (typeof localStorage === 'undefined') return;
  const map = loadManagerFilterPreferences();
  if (!(scopeId in map)) return;
  delete map[scopeId];
  try {
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    // Swallow.
  }
}

// ---------------------------------------------------------------------------
// Validation against current options
// ---------------------------------------------------------------------------

/**
 * Pure: turn a stored preference into a selection that is GUARANTEED
 * to match one of the current Phase 92 filter options.
 *
 * Behaviors:
 *   - undefined preference (first visit) → 'all'.
 *   - 'all' → 'all' (always valid).
 *   - 'banker' with a stable id present in options → restore as is.
 *   - 'banker' without id but with a name matching an options entry
 *     (case-insensitive) → restore the matching option's selection
 *     so id-fallback paths re-attach cleanly.
 *   - 'banker' with no matching option → 'all' (stale).
 *   - 'unassigned' when an unassigned option exists → 'unassigned'.
 *   - 'unassigned' when no unassigned option exists → 'all' (stale).
 *
 * The validator does NOT touch storage. The provider is responsible
 * for clearing stale entries if it wants to.
 */
export function validateRestoredPreference(
  stored: ManagerFilterPreferenceEntry | undefined,
  options: readonly ManagerBankerFilterOption[],
): ManagerBankerFilterSelection {
  if (!stored) return { kind: 'all' };
  if (stored.kind === 'all') return { kind: 'all' };
  if (stored.kind === 'unassigned') {
    const hasUnassigned = options.some(
      (o) => o.selection.kind === 'unassigned',
    );
    return hasUnassigned ? { kind: 'unassigned' } : { kind: 'all' };
  }
  // 'banker' — match by id when present, then by case-insensitive
  // name.
  if (stored.bankerId) {
    const byId = options.find(
      (o) =>
        o.selection.kind === 'banker' && o.selection.id === stored.bankerId,
    );
    if (byId) return byId.selection;
  }
  if (stored.bankerName) {
    const target = stored.bankerName.trim().toLowerCase();
    const byName = options.find(
      (o) =>
        o.selection.kind === 'banker' &&
        o.selection.name.trim().toLowerCase() === target,
    );
    if (byName) return byName.selection;
  }
  return { kind: 'all' };
}
