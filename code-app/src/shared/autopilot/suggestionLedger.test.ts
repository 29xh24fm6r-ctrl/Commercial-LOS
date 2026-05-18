// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildSuggestionLedgerKey,
  clearAllSuggestionLedgerEntries,
  clearSuggestionLedgerEntry,
  getSuggestionLedgerEntry,
  loadSuggestionLedger,
  recordSuggestionAction,
  SUGGESTION_LEDGER_STORAGE_KEY,
  type SuggestionLedgerEntry,
} from './suggestionLedger';

/**
 * Phase 83 — local-only suggestion ledger tests.
 *
 * Pins:
 *   - buildSuggestionLedgerKey is deterministic + encodes surface,
 *     dealId, suggestionId;
 *   - recordSuggestionAction writes an entry to localStorage and
 *     returns the entry shape;
 *   - getSuggestionLedgerEntry reads the entry back;
 *   - clearSuggestionLedgerEntry removes only the targeted entry;
 *   - clearAllSuggestionLedgerEntries wipes the slot;
 *   - loadSuggestionLedger handles malformed JSON / wrong shape /
 *     non-string slots gracefully (returns empty map; never throws);
 *   - re-record with the same key overwrites (last write wins);
 *   - module hygiene: no SDK / role / AI vocabulary in source.
 */

const NOW = new Date('2026-05-18T15:34:00Z');

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 83 — buildSuggestionLedgerKey', () => {
  it('encodes surface, dealId, and suggestionId in a stable order', () => {
    expect(
      buildSuggestionLedgerKey({
        surface: 'deal-panel',
        suggestionId: 'overdue-tasks',
        dealId: 'd-1',
      }),
    ).toBe('deal-panel|d-1|overdue-tasks');
  });

  it('encodes a missing dealId as the empty middle segment', () => {
    expect(
      buildSuggestionLedgerKey({
        surface: 'banker-rollup',
        suggestionId: 'stage-aging',
        dealId: undefined,
      }),
    ).toBe('banker-rollup||stage-aging');
  });

  it('produces different keys for the same suggestion id on different surfaces', () => {
    const a = buildSuggestionLedgerKey({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
    });
    const b = buildSuggestionLedgerKey({
      surface: 'banker-rollup',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
    });
    expect(a).not.toBe(b);
  });
});

describe('Phase 83 — recordSuggestionAction + getSuggestionLedgerEntry', () => {
  it('records a dismissed entry and reads it back', () => {
    const entry = recordSuggestionAction({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'dismissed',
      titleSnapshot: '1 overdue task',
      now: NOW,
    });
    expect(entry.key).toBe('deal-panel|d-1|overdue-tasks');
    expect(entry.action).toBe('dismissed');
    expect(entry.recordedAt).toBe(NOW.toISOString());
    expect(entry.titleSnapshot).toBe('1 overdue task');

    const fetched = getSuggestionLedgerEntry(entry.key);
    expect(fetched).toEqual(entry);
  });

  it('records an opened entry on a different key', () => {
    const a = recordSuggestionAction({
      surface: 'banker-rollup',
      suggestionId: 'stage-aging',
      dealId: 'd-2',
      action: 'opened',
      now: NOW,
    });
    const b = recordSuggestionAction({
      surface: 'banker-rollup',
      suggestionId: 'pending-review-documents',
      dealId: 'd-2',
      action: 'dismissed',
      now: NOW,
    });
    expect(a.key).not.toBe(b.key);
    expect(getSuggestionLedgerEntry(a.key)?.action).toBe('opened');
    expect(getSuggestionLedgerEntry(b.key)?.action).toBe('dismissed');
  });

  it('overwrites an existing entry on re-record (last write wins)', () => {
    recordSuggestionAction({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'opened',
      now: new Date('2026-05-17T10:00:00Z'),
    });
    const second = recordSuggestionAction({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'dismissed',
      now: NOW,
    });
    expect(getSuggestionLedgerEntry(second.key)).toEqual(second);
  });

  it('accepts undefined dealId (cross-deal future suggestion)', () => {
    const entry = recordSuggestionAction({
      surface: 'manager-rollup',
      suggestionId: 'some-future-cross-deal-suggestion',
      dealId: undefined,
      action: 'dismissed',
      now: NOW,
    });
    expect(entry.dealId).toBeUndefined();
    expect(entry.key).toBe(
      'manager-rollup||some-future-cross-deal-suggestion',
    );
  });
});

describe('Phase 83 — clear helpers', () => {
  it('clearSuggestionLedgerEntry removes only the targeted key', () => {
    const a = recordSuggestionAction({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'dismissed',
      now: NOW,
    });
    const b = recordSuggestionAction({
      surface: 'deal-panel',
      suggestionId: 'pending-review-documents',
      dealId: 'd-1',
      action: 'dismissed',
      now: NOW,
    });
    clearSuggestionLedgerEntry(a.key);
    expect(getSuggestionLedgerEntry(a.key)).toBeUndefined();
    expect(getSuggestionLedgerEntry(b.key)).toBeDefined();
  });

  it('clearSuggestionLedgerEntry no-ops when the key is absent', () => {
    expect(() =>
      clearSuggestionLedgerEntry('deal-panel|missing|x'),
    ).not.toThrow();
  });

  it('clearAllSuggestionLedgerEntries wipes every entry', () => {
    recordSuggestionAction({
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'dismissed',
      now: NOW,
    });
    recordSuggestionAction({
      surface: 'banker-rollup',
      suggestionId: 'stage-aging',
      dealId: 'd-2',
      action: 'opened',
      now: NOW,
    });
    clearAllSuggestionLedgerEntries();
    expect(loadSuggestionLedger()).toEqual({});
  });
});

describe('Phase 83 — loadSuggestionLedger fault tolerance', () => {
  it('returns an empty map when the slot is missing', () => {
    expect(loadSuggestionLedger()).toEqual({});
  });

  it('returns an empty map when the slot contains malformed JSON', () => {
    localStorage.setItem(SUGGESTION_LEDGER_STORAGE_KEY, 'not-json{{');
    expect(loadSuggestionLedger()).toEqual({});
  });

  it('returns an empty map when the slot contains a JSON array (wrong root type)', () => {
    localStorage.setItem(SUGGESTION_LEDGER_STORAGE_KEY, '[]');
    expect(loadSuggestionLedger()).toEqual({});
  });

  it('drops individual malformed entries while keeping the well-formed ones', () => {
    const goodEntry: SuggestionLedgerEntry = {
      key: 'deal-panel|d-1|overdue-tasks',
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'dismissed',
      recordedAt: NOW.toISOString(),
      titleSnapshot: '1 overdue task',
    };
    localStorage.setItem(
      SUGGESTION_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'deal-panel|d-1|overdue-tasks': goodEntry,
        'bad-1': { what: 'is this' },
        'bad-2': null,
        'bad-3': 'a string',
      }),
    );
    const loaded = loadSuggestionLedger();
    expect(Object.keys(loaded)).toEqual(['deal-panel|d-1|overdue-tasks']);
    expect(loaded['deal-panel|d-1|overdue-tasks']).toEqual(goodEntry);
  });

  it('drops entries whose embedded key does not match the map key (defensive)', () => {
    const entry: SuggestionLedgerEntry = {
      key: 'lying|key|here',
      surface: 'deal-panel',
      suggestionId: 'overdue-tasks',
      dealId: 'd-1',
      action: 'dismissed',
      recordedAt: NOW.toISOString(),
      titleSnapshot: undefined,
    };
    localStorage.setItem(
      SUGGESTION_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'deal-panel|d-1|overdue-tasks': entry,
      }),
    );
    // The map key is "deal-panel|d-1|overdue-tasks" but the embedded
    // entry.key is "lying|key|here" — the loader rejects this row.
    expect(loadSuggestionLedger()).toEqual({});
  });

  it('drops entries with an invalid action enum value', () => {
    localStorage.setItem(
      SUGGESTION_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'deal-panel|d-1|overdue-tasks': {
          key: 'deal-panel|d-1|overdue-tasks',
          surface: 'deal-panel',
          suggestionId: 'overdue-tasks',
          dealId: 'd-1',
          action: 'approved', // forbidden enum value
          recordedAt: NOW.toISOString(),
        },
      }),
    );
    expect(loadSuggestionLedger()).toEqual({});
  });
});

describe('Phase 83 — module hygiene', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'suggestionLedger.ts'),
    'utf8',
  );

  function stripComments(s: string): string {
    return s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  const CODE = stripComments(SRC);

  it('imports no SDK / generated service', () => {
    expect(CODE).not.toMatch(/from\s+['"][^'"]*generated\//);
    expect(CODE).not.toMatch(/Cr664_\w+Service/);
  });

  it('imports no role module (banker / manager / team / deals / executive / admin)', () => {
    const imports = SRC.match(/from\s+['"][^'"]+['"]/g) ?? [];
    for (const imp of imports) {
      expect(imp).not.toMatch(
        /\/(banker|manager|team|deals|executive|admin)\//,
      );
    }
  });

  it('does not contain affirmative resolution / sync / AI / workflow vocabulary in code', () => {
    // The Phase 83 brief forbids these tokens in code (and rendered
    // copy). Source-level pin keeps a future author from drifting.
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+resolved\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+completed\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+closed\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+synced\b/i);
    expect(CODE).not.toMatch(/\bofficial\s+(record|state|status)\b/i);
    expect(CODE).not.toMatch(/\bsystem\s+acknowledged\b/i);
    expect(CODE).not.toMatch(/\bAI[ -]?learned\b/i);
    expect(CODE).not.toMatch(/\bworkflow\s+updated\b/i);
    // The "approved" enum-value test above passes because the test
    // file uses it; ensure the production file itself doesn't.
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+approved\b/i);
  });
});
