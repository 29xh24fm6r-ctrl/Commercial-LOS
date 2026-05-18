// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  buildSuggestionLedgerKey,
  loadSuggestionLedger,
  recordSuggestionAction,
  SUGGESTION_LEDGER_STORAGE_KEY,
} from './suggestionLedger';
import { useSuggestionLedger } from './useSuggestionLedger';

/**
 * Phase 83 — React hook tests for the suggestion ledger.
 *
 * Pins:
 *   - mount reads the existing ledger from localStorage;
 *   - getEntry looks up by surface + suggestion id + deal id;
 *   - recordOpened / recordDismissed write through to localStorage
 *     AND update the in-memory entries map (reactive);
 *   - clear removes an entry from BOTH localStorage and entries map;
 *   - recordDismissed after recordOpened overwrites (last write wins
 *     reaches the in-memory view too);
 *   - missing-storage / SSR safety is exercised by the pure tests;
 *     the hook simply forwards.
 */

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 83 — useSuggestionLedger', () => {
  it('initializes with the entries already in localStorage', () => {
    recordSuggestionAction({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'dismissed',
      now: new Date(),
    });
    const { result } = renderHook(() => useSuggestionLedger());
    expect(Object.keys(result.current.entries).length).toBe(1);
    expect(
      result.current.getEntry({
        surface: 'deal-panel',
        suggestionId: 'overdue-tasks',
        dealId: 'd-1',
      })?.action,
    ).toBe('dismissed');
  });

  it('recordDismissed writes through to localStorage AND updates entries', () => {
    const { result } = renderHook(() => useSuggestionLedger());
    expect(
      result.current.getEntry({
        surface: 'banker-rollup',
        suggestionId: 'stage-aging',
        dealId: 'd-2',
      }),
    ).toBeUndefined();
    act(() => {
      result.current.recordDismissed({
        surface: 'banker-rollup',
        suggestionId: 'stage-aging',
        dealId: 'd-2',
        titleSnapshot: '45 days in current stage',
      });
    });
    // In-memory view updated.
    const entry = result.current.getEntry({
      surface: 'banker-rollup',
      suggestionId: 'stage-aging',
      dealId: 'd-2',
    });
    expect(entry?.action).toBe('dismissed');
    expect(entry?.titleSnapshot).toBe('45 days in current stage');
    // Storage backing updated.
    const fromStorage = loadSuggestionLedger();
    const k = buildSuggestionLedgerKey({
      surface: 'banker-rollup',
      suggestionId: 'stage-aging',
      dealId: 'd-2',
    });
    expect(fromStorage[k]?.action).toBe('dismissed');
  });

  it('recordOpened writes an opened entry on the same key shape', () => {
    const { result } = renderHook(() => useSuggestionLedger());
    act(() => {
      result.current.recordOpened({
        surface: 'manager-rollup',
        suggestionId: 'closing-soon',
        dealId: 'd-3',
      });
    });
    expect(
      result.current.getEntry({
        surface: 'manager-rollup',
        suggestionId: 'closing-soon',
        dealId: 'd-3',
      })?.action,
    ).toBe('opened');
  });

  it('clear removes the entry from BOTH the in-memory map and localStorage', () => {
    const { result } = renderHook(() => useSuggestionLedger());
    act(() => {
      result.current.recordDismissed({
        surface: 'deal-panel',
        suggestionId: 'overdue-tasks',
        dealId: 'd-1',
      });
    });
    const k = buildSuggestionLedgerKey({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
    });
    expect(result.current.entries[k]).toBeDefined();
    act(() => {
      result.current.clear(k);
    });
    expect(result.current.entries[k]).toBeUndefined();
    expect(loadSuggestionLedger()[k]).toBeUndefined();
  });

  it('overwrites an existing entry when the same key is re-recorded', () => {
    const { result } = renderHook(() => useSuggestionLedger());
    act(() => {
      result.current.recordOpened({
        surface: 'deal-panel',
        suggestionId: 'overdue-tasks',
        dealId: 'd-1',
      });
    });
    act(() => {
      result.current.recordDismissed({
        surface: 'deal-panel',
        suggestionId: 'overdue-tasks',
        dealId: 'd-1',
      });
    });
    expect(
      result.current.getEntry({
        surface: 'deal-panel',
        suggestionId: 'overdue-tasks',
        dealId: 'd-1',
      })?.action,
    ).toBe('dismissed');
  });

  it('survives a malformed slot at mount (returns empty entries map)', () => {
    localStorage.setItem(SUGGESTION_LEDGER_STORAGE_KEY, 'not-json{');
    const { result } = renderHook(() => useSuggestionLedger());
    expect(result.current.entries).toEqual({});
  });
});
