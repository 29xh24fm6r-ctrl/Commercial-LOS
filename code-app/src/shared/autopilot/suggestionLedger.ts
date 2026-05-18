/**
 * Phase 83: local-only suggestion ledger for the Phase 80/81/82
 * Autopilot Lite surfaces.
 *
 * Pure storage helpers. The React hook lives in a sibling file
 * (`useSuggestionLedger.ts`) so unit tests can exercise the storage
 * helpers independently of React.
 *
 * Discipline:
 *   - State lives ONLY in browser localStorage. No Dataverse write,
 *     no audit row, no timeline event, no cross-device sync, no
 *     network call of any kind. Inventoried as
 *     LOCAL_ONLY_FLOWS.autopilot-suggestion-ledger.
 *   - "Dismissed" is a personal, local note, NOT business
 *     resolution. The underlying suggestion rule still fires on the
 *     next render; the ledger entry only changes how that
 *     suggestion is rendered. The card disclaimer states this
 *     verbatim.
 *   - The stored payload contains no PII or borrower content. It
 *     records the deterministic suggestion id, the deal id (if any),
 *     the surface, the action, the ISO timestamp, and an optional
 *     title snapshot (cosmetic only — the visible suggestion title
 *     can differ from the snapshot when the rule fires again).
 *   - Never throws. Malformed / missing storage surfaces as "no
 *     entries" rather than crashing the card.
 */

/** localStorage key. The whole ledger lives in one slot — typical
 *  payload is a few hundred bytes (one entry per dismissed
 *  suggestion). Versioned suffix so a future schema change can
 *  migrate without colliding with the old payload. */
export const SUGGESTION_LEDGER_STORAGE_KEY =
  'cc:autopilotSuggestionLedger:v1';

export type SuggestionLedgerAction = 'opened' | 'dismissed';

export type SuggestionLedgerSurface =
  | 'deal-panel'
  | 'banker-rollup'
  | 'manager-rollup'
  | 'team-rollup';

export interface SuggestionLedgerEntry {
  /** Deterministic key (surface|dealId|suggestionId). */
  key: string;
  surface: SuggestionLedgerSurface;
  /** Phase 80 NextBestAction.id — e.g. "overdue-tasks". */
  suggestionId: string;
  /** Deal id when the surface is per-deal or rollup. May be
   *  undefined for future cross-deal suggestions. */
  dealId: string | undefined;
  action: SuggestionLedgerAction;
  /** ISO timestamp recorded by the caller. */
  recordedAt: string;
  /** Suggestion title at recording time. Cosmetic — the live
   *  rendering uses the current rule output. */
  titleSnapshot: string | undefined;
}

/** Map of key → entry. JSON-serializable. */
export type SuggestionLedger = Record<string, SuggestionLedgerEntry>;

/**
 * Build a deterministic ledger key from surface + dealId +
 * suggestionId. Exported so tests + UI can resolve the same key
 * the writer used.
 */
export function buildSuggestionLedgerKey(input: {
  surface: SuggestionLedgerSurface;
  suggestionId: string;
  dealId: string | undefined;
}): string {
  return `${input.surface}|${input.dealId ?? ''}|${input.suggestionId}`;
}

/**
 * Read the whole ledger from localStorage. Returns an empty object
 * when storage is unavailable, the slot is missing, or the JSON is
 * malformed.
 */
export function loadSuggestionLedger(): SuggestionLedger {
  if (typeof localStorage === 'undefined') return {};
  let raw: string | null;
  try {
    raw = localStorage.getItem(SUGGESTION_LEDGER_STORAGE_KEY);
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
  const out: SuggestionLedger = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isLedgerEntry(v) && v.key === k) {
      out[k] = v;
    }
  }
  return out;
}

function isLedgerEntry(v: unknown): v is SuggestionLedgerEntry {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.key !== 'string') return false;
  if (typeof o.surface !== 'string') return false;
  if (typeof o.suggestionId !== 'string') return false;
  if (o.dealId !== undefined && typeof o.dealId !== 'string') return false;
  if (o.action !== 'opened' && o.action !== 'dismissed') return false;
  if (typeof o.recordedAt !== 'string') return false;
  if (
    o.titleSnapshot !== undefined &&
    typeof o.titleSnapshot !== 'string'
  ) {
    return false;
  }
  if (
    o.surface !== 'deal-panel' &&
    o.surface !== 'banker-rollup' &&
    o.surface !== 'manager-rollup' &&
    o.surface !== 'team-rollup'
  ) {
    return false;
  }
  return true;
}

/**
 * Write the whole ledger back. No-ops if storage is unavailable.
 * Catch-and-ignore on QuotaExceededError etc. — the ledger is
 * advisory; a write failure should not surface as a card error.
 */
function saveSuggestionLedger(ledger: SuggestionLedger): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      SUGGESTION_LEDGER_STORAGE_KEY,
      JSON.stringify(ledger),
    );
  } catch {
    // Swallow QuotaExceededError + any other write failure. The
    // ledger is advisory; cards still function.
  }
}

/**
 * Record an action against a suggestion. Returns the entry that
 * was written. Used by both the auto-open path (when the banker
 * clicks the action button) and the explicit dismiss path.
 */
export function recordSuggestionAction(input: {
  surface: SuggestionLedgerSurface;
  suggestionId: string;
  dealId: string | undefined;
  action: SuggestionLedgerAction;
  titleSnapshot?: string;
  now: Date;
}): SuggestionLedgerEntry {
  const key = buildSuggestionLedgerKey(input);
  const entry: SuggestionLedgerEntry = {
    key,
    surface: input.surface,
    suggestionId: input.suggestionId,
    dealId: input.dealId,
    action: input.action,
    recordedAt: input.now.toISOString(),
    titleSnapshot: input.titleSnapshot,
  };
  const ledger = loadSuggestionLedger();
  ledger[key] = entry;
  saveSuggestionLedger(ledger);
  return entry;
}

/**
 * Look up a single entry by its key. Convenience over loadAll() +
 * indexing.
 */
export function getSuggestionLedgerEntry(
  key: string,
): SuggestionLedgerEntry | undefined {
  return loadSuggestionLedger()[key];
}

/**
 * Remove an entry. The Restore affordance calls this so the row
 * re-renders in its default (no ledger note) state.
 */
export function clearSuggestionLedgerEntry(key: string): void {
  if (typeof localStorage === 'undefined') return;
  const ledger = loadSuggestionLedger();
  if (key in ledger) {
    delete ledger[key];
    saveSuggestionLedger(ledger);
  }
}

/**
 * Wipe the entire ledger. Not exposed in the UI today; useful for
 * tests + future "Clear local autopilot notes" admin / settings
 * affordance.
 */
export function clearAllSuggestionLedgerEntries(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SUGGESTION_LEDGER_STORAGE_KEY);
  } catch {
    // Swallow — local-only feature, never surfaces an error.
  }
}
