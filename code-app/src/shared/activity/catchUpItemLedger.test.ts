// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CATCH_UP_DEFAULT_SNOOZE_HOURS,
  CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
  buildCatchUpLedgerKey,
  clearAllCatchUpLedgerEntries,
  clearCatchUpLedgerEntry,
  defaultSnoozeUntil,
  getCatchUpLedgerEntry,
  isDismissed,
  isSnoozeActive,
  loadCatchUpItemLedger,
  recordCatchUpItemDismissed,
  recordCatchUpItemSnoozed,
  type CatchUpLedgerEntry,
} from './catchUpItemLedger';

/**
 * Phase 91 — catch-up item ledger storage + derivation tests.
 *
 * Pins:
 *   - buildCatchUpLedgerKey is deterministic + encodes surface +
 *     itemKey.
 *   - recordCatchUpItemDismissed / recordCatchUpItemSnoozed write
 *     entries with the expected shape; snoozed entries carry
 *     snoozeUntil, dismissed do not.
 *   - getCatchUpLedgerEntry reads the entry back.
 *   - clearCatchUpLedgerEntry removes one entry; others remain.
 *   - clearAllCatchUpLedgerEntries wipes the slot.
 *   - loadCatchUpItemLedger handles malformed JSON / wrong shape /
 *     non-string slots / dismissed-with-snoozeUntil tamper / snoozed-
 *     without-snoozeUntil tamper gracefully (returns empty map /
 *     drops bad rows; never throws).
 *   - Re-record overwrites with last-write-wins (dismiss -> snooze
 *     and snooze -> dismiss flip cleanly).
 *   - isSnoozeActive: false for dismissed entries, false when
 *     snoozeUntil has passed, true while it is still in the future.
 *   - isDismissed: false for snoozed entries; true for dismissed.
 *   - defaultSnoozeUntil produces a date 24h after `now`.
 *   - Storage namespace is `cc:catchUpItemLedger:v1` (disjoint from
 *     Phase 83 `cc:autopilotSuggestionLedger:v1`).
 *   - Module hygiene: no SDK / role imports; no resolved / completed
 *     / closed / synced / official / workflow-updated vocabulary in
 *     source.
 */

const NOW = new Date('2026-05-18T15:34:00Z');

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 91 — buildCatchUpLedgerKey', () => {
  it('encodes surface + itemKey in a stable order', () => {
    expect(
      buildCatchUpLedgerKey({
        surface: 'banker-catch-up',
        itemKey: 'overdue-task:d-1:t-7',
      }),
    ).toBe('banker-catch-up|overdue-task:d-1:t-7');
  });

  it('produces different keys for the same item id on different surfaces', () => {
    const a = buildCatchUpLedgerKey({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
    });
    const b = buildCatchUpLedgerKey({
      surface: 'manager-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
    });
    expect(a).not.toBe(b);
  });
});

describe('Phase 91 — record / read', () => {
  it('records a dismissed entry and reads it back', () => {
    const entry = recordCatchUpItemDismissed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      titleSnapshot: 'Overdue task',
      now: NOW,
    });
    expect(entry.key).toBe('banker-catch-up|overdue-task:d-1:t-7');
    expect(entry.action).toBe('dismissed');
    expect(entry.snoozeUntil).toBeUndefined();
    expect(entry.recordedAt).toBe(NOW.toISOString());
    expect(entry.itemKind).toBe('overdue-task');
    expect(entry.dealId).toBe('d-1');

    const fetched = getCatchUpLedgerEntry(entry.key);
    expect(fetched).toEqual(entry);
  });

  it('records a snoozed entry with the supplied snoozeUntil', () => {
    const until = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const entry = recordCatchUpItemSnoozed({
      surface: 'manager-catch-up',
      itemKey: 'stage-aging:d-2',
      itemKind: 'stage-aging',
      dealId: 'd-2',
      now: NOW,
      snoozeUntil: until,
    });
    expect(entry.action).toBe('snoozed');
    expect(entry.snoozeUntil).toBe(until.toISOString());
    expect(entry.recordedAt).toBe(NOW.toISOString());
  });

  it('re-record with the same key overwrites (dismiss -> snooze)', () => {
    recordCatchUpItemDismissed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      now: new Date('2026-05-17T10:00:00Z'),
    });
    const until = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const next = recordCatchUpItemSnoozed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      now: NOW,
      snoozeUntil: until,
    });
    expect(getCatchUpLedgerEntry(next.key)).toEqual(next);
    expect(getCatchUpLedgerEntry(next.key)?.action).toBe('snoozed');
  });

  it('re-record with the same key overwrites (snooze -> dismiss)', () => {
    const until = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    recordCatchUpItemSnoozed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      now: NOW,
      snoozeUntil: until,
    });
    const dismissed = recordCatchUpItemDismissed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      now: NOW,
    });
    expect(getCatchUpLedgerEntry(dismissed.key)?.action).toBe('dismissed');
    expect(getCatchUpLedgerEntry(dismissed.key)?.snoozeUntil).toBeUndefined();
  });

  it('accepts undefined dealId (reserved for cross-deal items)', () => {
    const entry = recordCatchUpItemDismissed({
      surface: 'manager-catch-up',
      itemKey: 'cross-deal-future:x',
      itemKind: 'closing-soon',
      dealId: undefined,
      now: NOW,
    });
    expect(entry.dealId).toBeUndefined();
  });
});

describe('Phase 91 — clear', () => {
  it('clearCatchUpLedgerEntry removes only the targeted key', () => {
    const a = recordCatchUpItemDismissed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      now: NOW,
    });
    const b = recordCatchUpItemDismissed({
      surface: 'banker-catch-up',
      itemKey: 'draft-memo:d-1',
      itemKind: 'draft-memo',
      dealId: 'd-1',
      now: NOW,
    });
    clearCatchUpLedgerEntry(a.key);
    expect(getCatchUpLedgerEntry(a.key)).toBeUndefined();
    expect(getCatchUpLedgerEntry(b.key)).toBeDefined();
  });

  it('clearCatchUpLedgerEntry no-ops when key absent', () => {
    expect(() => clearCatchUpLedgerEntry('banker-catch-up|missing')).not.toThrow();
  });

  it('clearAllCatchUpLedgerEntries wipes every entry', () => {
    recordCatchUpItemDismissed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      now: NOW,
    });
    recordCatchUpItemDismissed({
      surface: 'manager-catch-up',
      itemKey: 'stage-aging:d-2',
      itemKind: 'stage-aging',
      dealId: 'd-2',
      now: NOW,
    });
    clearAllCatchUpLedgerEntries();
    expect(loadCatchUpItemLedger()).toEqual({});
  });
});

describe('Phase 91 — loadCatchUpItemLedger fault tolerance', () => {
  it('returns an empty map when the slot is missing', () => {
    expect(loadCatchUpItemLedger()).toEqual({});
  });

  it('returns an empty map when the slot is malformed JSON', () => {
    localStorage.setItem(CATCH_UP_ITEM_LEDGER_STORAGE_KEY, 'not-json{{');
    expect(loadCatchUpItemLedger()).toEqual({});
  });

  it('returns an empty map when the slot contains a JSON array (wrong root)', () => {
    localStorage.setItem(CATCH_UP_ITEM_LEDGER_STORAGE_KEY, '[]');
    expect(loadCatchUpItemLedger()).toEqual({});
  });

  it('drops individual malformed entries while keeping well-formed ones', () => {
    const goodKey = 'banker-catch-up|overdue-task:d-1:t-7';
    const good: CatchUpLedgerEntry = {
      key: goodKey,
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      action: 'dismissed',
      recordedAt: NOW.toISOString(),
      snoozeUntil: undefined,
      titleSnapshot: 'Overdue task',
    };
    localStorage.setItem(
      CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
      JSON.stringify({
        [goodKey]: good,
        'bad-1': { what: 'is this' },
        'bad-2': null,
        'bad-3': 'a string',
      }),
    );
    const loaded = loadCatchUpItemLedger();
    expect(Object.keys(loaded)).toEqual([goodKey]);
    expect(loaded[goodKey]).toEqual(good);
  });

  it('drops entries whose embedded key does not match the map key', () => {
    const entry: CatchUpLedgerEntry = {
      key: 'lying|key',
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      action: 'dismissed',
      recordedAt: NOW.toISOString(),
      snoozeUntil: undefined,
      titleSnapshot: undefined,
    };
    localStorage.setItem(
      CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'banker-catch-up|overdue-task:d-1:t-7': entry,
      }),
    );
    expect(loadCatchUpItemLedger()).toEqual({});
  });

  it('drops entries with an invalid action enum value', () => {
    localStorage.setItem(
      CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'banker-catch-up|overdue-task:d-1:t-7': {
          key: 'banker-catch-up|overdue-task:d-1:t-7',
          surface: 'banker-catch-up',
          itemKey: 'overdue-task:d-1:t-7',
          itemKind: 'overdue-task',
          dealId: 'd-1',
          action: 'resolved', // forbidden value
          recordedAt: NOW.toISOString(),
          snoozeUntil: undefined,
        },
      }),
    );
    expect(loadCatchUpItemLedger()).toEqual({});
  });

  it('drops snoozed entries that have no snoozeUntil', () => {
    localStorage.setItem(
      CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'banker-catch-up|overdue-task:d-1:t-7': {
          key: 'banker-catch-up|overdue-task:d-1:t-7',
          surface: 'banker-catch-up',
          itemKey: 'overdue-task:d-1:t-7',
          itemKind: 'overdue-task',
          dealId: 'd-1',
          action: 'snoozed',
          recordedAt: NOW.toISOString(),
          // snoozeUntil omitted — must drop
        },
      }),
    );
    expect(loadCatchUpItemLedger()).toEqual({});
  });

  it('drops dismissed entries that carry a snoozeUntil (mixed-state tamper)', () => {
    localStorage.setItem(
      CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'banker-catch-up|overdue-task:d-1:t-7': {
          key: 'banker-catch-up|overdue-task:d-1:t-7',
          surface: 'banker-catch-up',
          itemKey: 'overdue-task:d-1:t-7',
          itemKind: 'overdue-task',
          dealId: 'd-1',
          action: 'dismissed',
          recordedAt: NOW.toISOString(),
          snoozeUntil: NOW.toISOString(), // forbidden on dismissed
        },
      }),
    );
    expect(loadCatchUpItemLedger()).toEqual({});
  });

  it('drops entries with an invalid surface', () => {
    localStorage.setItem(
      CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
      JSON.stringify({
        'foo|overdue-task:d-1:t-7': {
          key: 'foo|overdue-task:d-1:t-7',
          surface: 'foo', // not a valid surface
          itemKey: 'overdue-task:d-1:t-7',
          itemKind: 'overdue-task',
          dealId: 'd-1',
          action: 'dismissed',
          recordedAt: NOW.toISOString(),
          snoozeUntil: undefined,
        },
      }),
    );
    expect(loadCatchUpItemLedger()).toEqual({});
  });
});

describe('Phase 91 — isSnoozeActive + isDismissed', () => {
  it('isSnoozeActive is false for undefined entries', () => {
    expect(isSnoozeActive(undefined, NOW)).toBe(false);
  });

  it('isSnoozeActive is false for dismissed entries', () => {
    const entry: CatchUpLedgerEntry = {
      key: 'banker-catch-up|overdue-task:d-1:t-7',
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      action: 'dismissed',
      recordedAt: NOW.toISOString(),
      snoozeUntil: undefined,
      titleSnapshot: undefined,
    };
    expect(isSnoozeActive(entry, NOW)).toBe(false);
  });

  it('isSnoozeActive is true when snoozeUntil is in the future', () => {
    const until = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const entry: CatchUpLedgerEntry = {
      key: 'banker-catch-up|overdue-task:d-1:t-7',
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      action: 'snoozed',
      recordedAt: NOW.toISOString(),
      snoozeUntil: until.toISOString(),
      titleSnapshot: undefined,
    };
    expect(isSnoozeActive(entry, NOW)).toBe(true);
  });

  it('isSnoozeActive flips false once snoozeUntil has passed', () => {
    const until = new Date(NOW.getTime() - 1); // 1ms ago
    const entry: CatchUpLedgerEntry = {
      key: 'banker-catch-up|overdue-task:d-1:t-7',
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      action: 'snoozed',
      recordedAt: NOW.toISOString(),
      snoozeUntil: until.toISOString(),
      titleSnapshot: undefined,
    };
    expect(isSnoozeActive(entry, NOW)).toBe(false);
  });

  it('isDismissed reflects the action enum directly', () => {
    expect(isDismissed(undefined)).toBe(false);
    expect(
      isDismissed({
        key: 'k',
        surface: 'banker-catch-up',
        itemKey: 'overdue-task:d-1:t-7',
        itemKind: 'overdue-task',
        dealId: 'd-1',
        action: 'dismissed',
        recordedAt: NOW.toISOString(),
        snoozeUntil: undefined,
        titleSnapshot: undefined,
      }),
    ).toBe(true);
    expect(
      isDismissed({
        key: 'k',
        surface: 'banker-catch-up',
        itemKey: 'overdue-task:d-1:t-7',
        itemKind: 'overdue-task',
        dealId: 'd-1',
        action: 'snoozed',
        recordedAt: NOW.toISOString(),
        snoozeUntil: NOW.toISOString(),
        titleSnapshot: undefined,
      }),
    ).toBe(false);
  });

  it('defaultSnoozeUntil returns a date CATCH_UP_DEFAULT_SNOOZE_HOURS after now', () => {
    const until = defaultSnoozeUntil(NOW);
    const diffH = (until.getTime() - NOW.getTime()) / (60 * 60 * 1000);
    expect(diffH).toBe(CATCH_UP_DEFAULT_SNOOZE_HOURS);
    expect(CATCH_UP_DEFAULT_SNOOZE_HOURS).toBe(24);
  });
});

describe('Phase 91 — storage namespace separation', () => {
  it('uses the Phase 91 prefix, disjoint from Phase 83', () => {
    recordCatchUpItemDismissed({
      surface: 'banker-catch-up',
      itemKey: 'overdue-task:d-1:t-7',
      itemKind: 'overdue-task',
      dealId: 'd-1',
      now: NOW,
    });
    expect(localStorage.getItem(CATCH_UP_ITEM_LEDGER_STORAGE_KEY)).not.toBeNull();
    expect(CATCH_UP_ITEM_LEDGER_STORAGE_KEY).toBe('cc:catchUpItemLedger:v1');
    // Phase 83's slot is untouched.
    expect(
      localStorage.getItem('cc:autopilotSuggestionLedger:v1'),
    ).toBeNull();
  });
});

describe('Phase 91 — module hygiene', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'catchUpItemLedger.ts'),
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

  it('source forbids resolved / completed / closed / synced / official / workflow-updated vocabulary', () => {
    // Phase 91 is a LOCAL_ONLY surface — the ledger never claims any
    // of these affirmative business-resolution states.
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+resolved\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+completed\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+closed\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+synced\b/i);
    expect(CODE).not.toMatch(/\bofficial\s+(record|state|status)\b/i);
    expect(CODE).not.toMatch(/\bsystem\s+handled\b/i);
    expect(CODE).not.toMatch(/\bworkflow\s+updated\b/i);
    expect(CODE).not.toMatch(/\backnowledged\b/i);
    expect(CODE).not.toMatch(/\bAI[ -]?(generated|detected)\b/i);
    expect(CODE).not.toMatch(/\bnotification\s+delivered\b/i);
  });
});
