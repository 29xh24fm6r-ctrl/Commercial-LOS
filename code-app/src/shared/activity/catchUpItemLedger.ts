/**
 * Phase 91: local-only catch-up item ledger for the Phase 88 manager
 * + Phase 89 banker Morning Catch-Up surfaces.
 *
 * Pure storage helpers. The React hook lives in a sibling file
 * (`useCatchUpItemLedger.ts`) so unit tests can exercise the storage
 * helpers independently of React.
 *
 * Sibling pattern to Phase 83's `suggestionLedger.ts` (autopilot
 * dismiss / opened) — deliberately a separate module:
 *
 *   - Different action enum: Phase 91 uses `'dismissed' | 'snoozed'`.
 *     Phase 83 uses `'opened' | 'dismissed'`. Snooze carries a
 *     required `snoozeUntil` timestamp; opened/dismissed do not.
 *   - Different surface union: Phase 91 covers
 *     `'banker-catch-up' | 'manager-catch-up'`. Phase 83 covers the
 *     four autopilot rollup surfaces.
 *   - Different storage namespace: Phase 91 uses
 *     `cc:catchUpItemLedger:v1`. Phase 83 uses
 *     `cc:autopilotSuggestionLedger:v1`. The two ledgers cannot
 *     collide.
 *
 * Discipline (identical to Phase 83):
 *   - State lives ONLY in browser localStorage. No Dataverse write,
 *     no audit row, no timeline event, no cross-device sync, no
 *     network call of any kind. Inventoried as
 *     LOCAL_ONLY_FLOWS.catch-up-item-ledger.
 *   - "Dismissed" / "Snoozed" are personal, local notes — NOT
 *     business resolution. The underlying catch-up rule still
 *     evaluates on the next render against current records; the
 *     ledger entry only changes how that item is rendered. The card
 *     disclaimer states this verbatim.
 *   - The stored payload contains no PII or borrower content. It
 *     records the deterministic item key, item kind, deal id (if
 *     any), the surface, the action, ISO timestamp, optional
 *     snoozeUntil, and an optional title snapshot.
 *   - Never throws. Malformed / missing storage surfaces as "no
 *     entries" rather than crashing the card.
 */

/** localStorage key. Whole ledger lives in one slot; typical payload
 *  is a few hundred bytes (one entry per dismissed/snoozed item).
 *  Versioned suffix so a future schema change can migrate without
 *  colliding with the old payload. */
export const CATCH_UP_ITEM_LEDGER_STORAGE_KEY = 'cc:catchUpItemLedger:v1';

/** Default snooze window. The catch-up card surfaces "Snooze 24h";
 *  exposed as a constant so a future preference / configuration
 *  layer can override per-user. Kept short so a snoozed item
 *  re-appears within the same workday. */
export const CATCH_UP_DEFAULT_SNOOZE_HOURS = 24;

export type CatchUpLedgerSurface = 'banker-catch-up' | 'manager-catch-up';

export type CatchUpLedgerAction = 'dismissed' | 'snoozed';

export interface CatchUpLedgerEntry {
  /** Deterministic key: `${surface}|${itemKey}`. `itemKey` is the
   *  Phase 88 derivation's `item.id`, which has the shape
   *  `<kind>:<dealId>[:<rowId>]` (e.g. `overdue-task:d-1:t-7`). */
  key: string;
  surface: CatchUpLedgerSurface;
  /** The Phase 88 / Phase 89 derivation's item id verbatim. Used to
   *  match a ledger entry against a freshly-derived item on every
   *  card render. */
  itemKey: string;
  /** The Phase 88 `ManagerCatchUpKind`. Stored so a future analytics
   *  surface can summarize "what kinds get dismissed most" without
   *  parsing the itemKey. The card itself does not branch on it
   *  beyond what the underlying derivation already supplies. */
  itemKind: string;
  /** Deal id when the item is per-deal (almost always). Undefined
   *  reserved for future cross-deal items. */
  dealId: string | undefined;
  action: CatchUpLedgerAction;
  /** ISO timestamp recorded by the caller (the card's `now`). */
  recordedAt: string;
  /** When `action === 'snoozed'`, the ISO timestamp the snooze
   *  expires at. The card filters the item out of the active feed
   *  until this time, then it reappears naturally (no UI action
   *  required). Undefined when `action === 'dismissed'`. */
  snoozeUntil: string | undefined;
  /** Item title at recording time. Cosmetic — the live rendering
   *  uses the current derivation output. */
  titleSnapshot: string | undefined;
}

/** Map of key → entry. JSON-serializable. */
export type CatchUpItemLedger = Record<string, CatchUpLedgerEntry>;

/**
 * Build a deterministic ledger key from surface + itemKey. Exported
 * so tests + UI can resolve the same key the writer used.
 */
export function buildCatchUpLedgerKey(input: {
  surface: CatchUpLedgerSurface;
  itemKey: string;
}): string {
  return `${input.surface}|${input.itemKey}`;
}

/**
 * Read the whole ledger from localStorage. Returns an empty object
 * when storage is unavailable, the slot is missing, or the JSON is
 * malformed. Individual entries that fail the shape check are
 * dropped while well-formed entries survive.
 */
export function loadCatchUpItemLedger(): CatchUpItemLedger {
  if (typeof localStorage === 'undefined') return {};
  let raw: string | null;
  try {
    raw = localStorage.getItem(CATCH_UP_ITEM_LEDGER_STORAGE_KEY);
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
  const out: CatchUpItemLedger = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isCatchUpLedgerEntry(v) && v.key === k) {
      out[k] = v;
    }
  }
  return out;
}

function isCatchUpLedgerEntry(v: unknown): v is CatchUpLedgerEntry {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.key !== 'string') return false;
  if (
    o.surface !== 'banker-catch-up' &&
    o.surface !== 'manager-catch-up'
  ) {
    return false;
  }
  if (typeof o.itemKey !== 'string') return false;
  if (typeof o.itemKind !== 'string') return false;
  if (o.dealId !== undefined && typeof o.dealId !== 'string') return false;
  if (o.action !== 'dismissed' && o.action !== 'snoozed') return false;
  if (typeof o.recordedAt !== 'string') return false;
  if (o.action === 'snoozed') {
    if (typeof o.snoozeUntil !== 'string') return false;
  } else {
    // 'dismissed' must NOT carry a snoozeUntil; if storage was
    // tampered, drop the entry rather than mix states.
    if (o.snoozeUntil !== undefined) return false;
  }
  if (
    o.titleSnapshot !== undefined &&
    typeof o.titleSnapshot !== 'string'
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
function saveCatchUpItemLedger(ledger: CatchUpItemLedger): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
      JSON.stringify(ledger),
    );
  } catch {
    // Swallow QuotaExceededError + any other write failure.
  }
}

/**
 * Record a `dismissed` action against a catch-up item. Returns the
 * entry that was written. Re-recording the same key (whether the
 * prior action was `dismissed` or `snoozed`) overwrites the entry
 * with the new dismissal — last-write-wins.
 */
export function recordCatchUpItemDismissed(input: {
  surface: CatchUpLedgerSurface;
  itemKey: string;
  itemKind: string;
  dealId: string | undefined;
  titleSnapshot?: string;
  now: Date;
}): CatchUpLedgerEntry {
  const key = buildCatchUpLedgerKey(input);
  const entry: CatchUpLedgerEntry = {
    key,
    surface: input.surface,
    itemKey: input.itemKey,
    itemKind: input.itemKind,
    dealId: input.dealId,
    action: 'dismissed',
    recordedAt: input.now.toISOString(),
    snoozeUntil: undefined,
    titleSnapshot: input.titleSnapshot,
  };
  const ledger = loadCatchUpItemLedger();
  ledger[key] = entry;
  saveCatchUpItemLedger(ledger);
  return entry;
}

/**
 * Record a `snoozed` action against a catch-up item. The caller
 * supplies the `snoozeUntil` date directly (the React hook computes
 * it from `now + CATCH_UP_DEFAULT_SNOOZE_HOURS`). Returns the
 * entry that was written.
 */
export function recordCatchUpItemSnoozed(input: {
  surface: CatchUpLedgerSurface;
  itemKey: string;
  itemKind: string;
  dealId: string | undefined;
  titleSnapshot?: string;
  now: Date;
  snoozeUntil: Date;
}): CatchUpLedgerEntry {
  const key = buildCatchUpLedgerKey(input);
  const entry: CatchUpLedgerEntry = {
    key,
    surface: input.surface,
    itemKey: input.itemKey,
    itemKind: input.itemKind,
    dealId: input.dealId,
    action: 'snoozed',
    recordedAt: input.now.toISOString(),
    snoozeUntil: input.snoozeUntil.toISOString(),
    titleSnapshot: input.titleSnapshot,
  };
  const ledger = loadCatchUpItemLedger();
  ledger[key] = entry;
  saveCatchUpItemLedger(ledger);
  return entry;
}

/** Single-entry getter — convenience over loadAll() + indexing. */
export function getCatchUpLedgerEntry(
  key: string,
): CatchUpLedgerEntry | undefined {
  return loadCatchUpItemLedger()[key];
}

/**
 * Remove an entry. The Restore affordance on dismissed rows calls
 * this so the row re-renders in its default (no ledger note) state.
 */
export function clearCatchUpLedgerEntry(key: string): void {
  if (typeof localStorage === 'undefined') return;
  const ledger = loadCatchUpItemLedger();
  if (key in ledger) {
    delete ledger[key];
    saveCatchUpItemLedger(ledger);
  }
}

/**
 * Wipe the entire ledger. Not exposed in the UI today; useful for
 * tests + a future "Clear local catch-up notes" admin / settings
 * affordance.
 */
export function clearAllCatchUpLedgerEntries(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CATCH_UP_ITEM_LEDGER_STORAGE_KEY);
  } catch {
    // Swallow — local-only feature.
  }
}

// ---------------------------------------------------------------------------
// Pure status predicates
// ---------------------------------------------------------------------------

/**
 * Whether an entry's snooze window is still active at `now`.
 * Returns false for dismissed entries (they have no snoozeUntil).
 * Returns false for snoozed entries whose snoozeUntil has passed —
 * the item should be re-surfaced.
 */
export function isSnoozeActive(
  entry: CatchUpLedgerEntry | undefined,
  now: Date,
): boolean {
  if (!entry) return false;
  if (entry.action !== 'snoozed') return false;
  if (!entry.snoozeUntil) return false;
  const untilMs = Date.parse(entry.snoozeUntil);
  if (!Number.isFinite(untilMs)) return false;
  return untilMs > now.getTime();
}

/**
 * Whether an item is currently in the dismissed state. (Plain enum
 * check; exposed for symmetry with `isSnoozeActive`.)
 */
export function isDismissed(
  entry: CatchUpLedgerEntry | undefined,
): boolean {
  return entry?.action === 'dismissed';
}

/**
 * Build the default snooze-until date from `now`. Centralizes the
 * 24h window so the hook and tests don't drift.
 */
export function defaultSnoozeUntil(now: Date): Date {
  return new Date(
    now.getTime() + CATCH_UP_DEFAULT_SNOOZE_HOURS * 60 * 60 * 1000,
  );
}
