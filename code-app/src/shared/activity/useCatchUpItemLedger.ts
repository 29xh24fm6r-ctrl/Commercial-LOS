import { useCallback, useState } from 'react';
import {
  buildCatchUpLedgerKey,
  clearCatchUpLedgerEntry,
  defaultSnoozeUntil,
  isDismissed,
  isSnoozeActive,
  loadCatchUpItemLedger,
  recordCatchUpItemDismissed,
  recordCatchUpItemSnoozed,
  type CatchUpItemLedger,
  type CatchUpLedgerEntry,
  type CatchUpLedgerSurface,
} from './catchUpItemLedger';

/**
 * Phase 91 — React hook for the local-only catch-up item ledger.
 *
 * Reads the ledger once on mount, exposes a reactive view, and
 * forwards record / clear calls to the pure storage helpers in
 * `catchUpItemLedger.ts`. Each Morning Catch-Up card (Phase 88
 * manager + Phase 89 banker) calls this hook and threads `entries`
 * + the `isDismissedItem` / `isSnoozedItem` predicates into per-row
 * state.
 *
 * No new query. No Dataverse. The hook is a thin reactive wrapper
 * around `localStorage` access.
 */

export interface UseCatchUpItemLedgerView {
  /** Full map keyed by `buildCatchUpLedgerKey(...)`. */
  entries: CatchUpItemLedger;
  /** Look up a single entry by surface + itemKey. */
  getEntry(input: {
    surface: CatchUpLedgerSurface;
    itemKey: string;
  }): CatchUpLedgerEntry | undefined;
  /** True iff there is a `dismissed` entry for the item. */
  isDismissedItem(input: {
    surface: CatchUpLedgerSurface;
    itemKey: string;
  }): boolean;
  /** True iff there is a `snoozed` entry for the item AND the
   *  snooze window is still active relative to `now` (default
   *  Date.now()). */
  isSnoozedItem(
    input: { surface: CatchUpLedgerSurface; itemKey: string },
    now?: Date,
  ): boolean;
  recordDismissed(input: {
    surface: CatchUpLedgerSurface;
    itemKey: string;
    itemKind: string;
    dealId: string | undefined;
    titleSnapshot?: string;
  }): void;
  /** Snooze the item for the default 24h window. The caller passes
   *  no explicit until-date; the hook computes it from `Date.now()
   *  + CATCH_UP_DEFAULT_SNOOZE_HOURS`. */
  recordSnoozed(input: {
    surface: CatchUpLedgerSurface;
    itemKey: string;
    itemKind: string;
    dealId: string | undefined;
    titleSnapshot?: string;
  }): void;
  /** Remove an entry by key (Restore affordance OR
   *  end-of-snooze cleanup). */
  clear(key: string): void;
}

export function useCatchUpItemLedger(): UseCatchUpItemLedgerView {
  // Read the slot once on mount. The ledger never auto-refreshes
  // from storage — only the actions the card itself fires update
  // the in-memory view. Two tabs editing the same ledger are
  // honestly out of scope (matches Phase 83 contract).
  const [entries, setEntries] = useState<CatchUpItemLedger>(() =>
    loadCatchUpItemLedger(),
  );

  const getEntry = useCallback(
    (input: {
      surface: CatchUpLedgerSurface;
      itemKey: string;
    }): CatchUpLedgerEntry | undefined => {
      return entries[buildCatchUpLedgerKey(input)];
    },
    [entries],
  );

  const isDismissedItem = useCallback(
    (input: { surface: CatchUpLedgerSurface; itemKey: string }): boolean => {
      return isDismissed(entries[buildCatchUpLedgerKey(input)]);
    },
    [entries],
  );

  const isSnoozedItem = useCallback(
    (
      input: { surface: CatchUpLedgerSurface; itemKey: string },
      now?: Date,
    ): boolean => {
      return isSnoozeActive(
        entries[buildCatchUpLedgerKey(input)],
        now ?? new Date(),
      );
    },
    [entries],
  );

  const recordDismissed = useCallback(
    (input: {
      surface: CatchUpLedgerSurface;
      itemKey: string;
      itemKind: string;
      dealId: string | undefined;
      titleSnapshot?: string;
    }) => {
      const entry = recordCatchUpItemDismissed({
        ...input,
        now: new Date(),
      });
      setEntries((prev) => ({ ...prev, [entry.key]: entry }));
    },
    [],
  );

  const recordSnoozed = useCallback(
    (input: {
      surface: CatchUpLedgerSurface;
      itemKey: string;
      itemKind: string;
      dealId: string | undefined;
      titleSnapshot?: string;
    }) => {
      const now = new Date();
      const entry = recordCatchUpItemSnoozed({
        ...input,
        now,
        snoozeUntil: defaultSnoozeUntil(now),
      });
      setEntries((prev) => ({ ...prev, [entry.key]: entry }));
    },
    [],
  );

  const clear = useCallback((key: string) => {
    clearCatchUpLedgerEntry(key);
    setEntries((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return {
    entries,
    getEntry,
    isDismissedItem,
    isSnoozedItem,
    recordDismissed,
    recordSnoozed,
    clear,
  };
}
