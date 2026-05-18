import { useCallback, useState } from 'react';
import {
  buildSuggestionLedgerKey,
  clearSuggestionLedgerEntry,
  loadSuggestionLedger,
  recordSuggestionAction,
  type SuggestionLedger,
  type SuggestionLedgerEntry,
  type SuggestionLedgerSurface,
} from './suggestionLedger';

/**
 * Phase 83 — React hook for the local-only suggestion ledger.
 *
 * Reads the ledger once on mount, exposes a reactive view, and
 * forwards record / clear calls to the pure storage helpers in
 * `suggestionLedger.ts`. Each card on the three Autopilot surfaces
 * (Phase 80 deal panel, Phase 81 manager rollup, Phase 82 banker
 * rollup) calls this hook and threads `entries` into per-row state.
 *
 * No new query. No Dataverse. The hook is a thin reactive wrapper
 * around `localStorage` access.
 */

export interface SuggestionLedgerView {
  /** Full map keyed by `buildSuggestionLedgerKey(...)`. */
  entries: SuggestionLedger;
  /** Look up a single entry by surface + suggestion id + deal id. */
  getEntry(input: {
    surface: SuggestionLedgerSurface;
    suggestionId: string;
    dealId: string | undefined;
  }): SuggestionLedgerEntry | undefined;
  recordOpened(input: {
    surface: SuggestionLedgerSurface;
    suggestionId: string;
    dealId: string | undefined;
    titleSnapshot?: string;
  }): void;
  recordDismissed(input: {
    surface: SuggestionLedgerSurface;
    suggestionId: string;
    dealId: string | undefined;
    titleSnapshot?: string;
  }): void;
  /** Remove an entry by key (Restore affordance). */
  clear(key: string): void;
}

export function useSuggestionLedger(): SuggestionLedgerView {
  // Read the slot once on mount. The ledger never auto-refreshes
  // from storage — only the actions the card itself fires update
  // the in-memory view. Two tabs editing the same ledger are
  // honestly out of scope; the brief documents the limitation.
  const [entries, setEntries] = useState<SuggestionLedger>(() =>
    loadSuggestionLedger(),
  );

  const getEntry = useCallback(
    (input: {
      surface: SuggestionLedgerSurface;
      suggestionId: string;
      dealId: string | undefined;
    }): SuggestionLedgerEntry | undefined => {
      return entries[buildSuggestionLedgerKey(input)];
    },
    [entries],
  );

  const recordOpened = useCallback(
    (input: {
      surface: SuggestionLedgerSurface;
      suggestionId: string;
      dealId: string | undefined;
      titleSnapshot?: string;
    }) => {
      const entry = recordSuggestionAction({
        ...input,
        action: 'opened',
        now: new Date(),
      });
      setEntries((prev) => ({ ...prev, [entry.key]: entry }));
    },
    [],
  );

  const recordDismissed = useCallback(
    (input: {
      surface: SuggestionLedgerSurface;
      suggestionId: string;
      dealId: string | undefined;
      titleSnapshot?: string;
    }) => {
      const entry = recordSuggestionAction({
        ...input,
        action: 'dismissed',
        now: new Date(),
      });
      setEntries((prev) => ({ ...prev, [entry.key]: entry }));
    },
    [],
  );

  const clear = useCallback((key: string) => {
    clearSuggestionLedgerEntry(key);
    setEntries((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return { entries, getEntry, recordOpened, recordDismissed, clear };
}
