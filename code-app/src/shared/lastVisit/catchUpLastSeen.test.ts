// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX,
  CATCH_UP_MARKER_UPDATE_DELAY_MS,
  buildCatchUpScope,
  clearCatchUpLastSeenMs,
  getCatchUpLastSeenMs,
  setCatchUpLastSeenMs,
  summarizeCatchUpSinceLastSeen,
} from './catchUpLastSeen';

/**
 * Phase 90 — catch-up last-seen storage + scope + derivation tests.
 *
 * Pins:
 *   - buildCatchUpScope: banker yes; banker no userId → null; manager
 *     yes; manager no teamId → null; manager no userId → null;
 *     whitespace stripped.
 *   - get/set/clear lifecycle via real jsdom localStorage.
 *   - bad localStorage values surface as first-visit.
 *   - summarizeCatchUpSinceLastSeen: first-visit (priorMs=undefined)
 *     yields newCount=0 + isFirstVisit=true + isNew()===false.
 *   - strict greater-than: an item at exactly priorMs is NOT new.
 *   - future-anchored items (occurredAt > now) are NOT new.
 *   - undefined / malformed occurredAt is NOT new.
 *   - reasonable past-anchored items ARE new.
 *   - module hygiene: no SDK / role imports; no notification /
 *     sync / unread / official vocabulary in source.
 */

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 90 — buildCatchUpScope', () => {
  it('builds a banker scope from userId', () => {
    expect(
      buildCatchUpScope({ surface: 'banker', userId: 'b-1' }),
    ).toEqual({ scopeId: 'banker:b-1', surface: 'banker' });
  });

  it('returns null for banker scope with empty userId', () => {
    expect(
      buildCatchUpScope({ surface: 'banker', userId: '' }),
    ).toBeNull();
    expect(
      buildCatchUpScope({ surface: 'banker', userId: '   ' }),
    ).toBeNull();
    expect(
      buildCatchUpScope({ surface: 'banker', userId: undefined }),
    ).toBeNull();
  });

  it('builds a manager scope from userId + teamId', () => {
    expect(
      buildCatchUpScope({
        surface: 'manager',
        userId: 'b-1',
        teamId: 't-9',
      }),
    ).toEqual({ scopeId: 'manager:b-1:t-9', surface: 'manager' });
  });

  it('returns null for manager scope missing teamId', () => {
    expect(
      buildCatchUpScope({ surface: 'manager', userId: 'b-1' }),
    ).toBeNull();
    expect(
      buildCatchUpScope({
        surface: 'manager',
        userId: 'b-1',
        teamId: '   ',
      }),
    ).toBeNull();
  });

  it('returns null for manager scope missing userId', () => {
    expect(
      buildCatchUpScope({
        surface: 'manager',
        userId: undefined,
        teamId: 't-9',
      }),
    ).toBeNull();
  });

  it('trims surrounding whitespace before building the scope id', () => {
    expect(
      buildCatchUpScope({
        surface: 'manager',
        userId: '  b-1  ',
        teamId: ' t-9 ',
      }),
    ).toEqual({ scopeId: 'manager:b-1:t-9', surface: 'manager' });
  });

  it('produces a stable per-surface-per-user-per-team key', () => {
    // Same banker on two teams → different scopes.
    const teamA = buildCatchUpScope({
      surface: 'manager',
      userId: 'b-1',
      teamId: 'team-a',
    });
    const teamB = buildCatchUpScope({
      surface: 'manager',
      userId: 'b-1',
      teamId: 'team-b',
    });
    expect(teamA?.scopeId).not.toBe(teamB?.scopeId);
    // Same banker, banker vs manager → different scopes.
    const bankerScope = buildCatchUpScope({
      surface: 'banker',
      userId: 'b-1',
    });
    expect(bankerScope?.scopeId).not.toBe(teamA?.scopeId);
  });
});

describe('Phase 90 — get/set/clear lifecycle', () => {
  it('returns undefined when the marker has never been written (first visit)', () => {
    expect(getCatchUpLastSeenMs('banker:b-1')).toBeUndefined();
  });

  it('round-trips a positive integer marker', () => {
    setCatchUpLastSeenMs('banker:b-1', 1_700_000_000_000);
    expect(getCatchUpLastSeenMs('banker:b-1')).toBe(1_700_000_000_000);
  });

  it('rejects non-finite / non-positive values on write', () => {
    setCatchUpLastSeenMs('banker:b-1', Number.NaN);
    expect(getCatchUpLastSeenMs('banker:b-1')).toBeUndefined();
    setCatchUpLastSeenMs('banker:b-1', 0);
    expect(getCatchUpLastSeenMs('banker:b-1')).toBeUndefined();
    setCatchUpLastSeenMs('banker:b-1', -1);
    expect(getCatchUpLastSeenMs('banker:b-1')).toBeUndefined();
  });

  it('treats bad stored values as first-visit', () => {
    localStorage.setItem(
      `${CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX}banker:b-1`,
      'not-a-number',
    );
    expect(getCatchUpLastSeenMs('banker:b-1')).toBeUndefined();
  });

  it('floors millisecond writes to integer storage', () => {
    setCatchUpLastSeenMs('banker:b-1', 1_700_000_000_999.7);
    expect(getCatchUpLastSeenMs('banker:b-1')).toBe(1_700_000_000_999);
  });

  it('clearCatchUpLastSeenMs removes the entry', () => {
    setCatchUpLastSeenMs('banker:b-1', 1_700_000_000_000);
    clearCatchUpLastSeenMs('banker:b-1');
    expect(getCatchUpLastSeenMs('banker:b-1')).toBeUndefined();
  });

  it('write under one scope does not affect another scope', () => {
    setCatchUpLastSeenMs('banker:b-1', 1_700_000_000_000);
    expect(getCatchUpLastSeenMs('manager:b-1:t-1')).toBeUndefined();
    expect(getCatchUpLastSeenMs('banker:b-2')).toBeUndefined();
  });

  it('storage key uses the Phase 90 prefix (separate from Phase 72)', () => {
    setCatchUpLastSeenMs('banker:b-1', 1_700_000_000_000);
    expect(
      localStorage.getItem(`${CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX}banker:b-1`),
    ).toBe('1700000000000');
    // Phase 72's `cc:lastVisit:deal:` namespace must be untouched.
    expect(localStorage.getItem('cc:lastVisit:deal:banker:b-1')).toBeNull();
  });

  it('exposes CATCH_UP_MARKER_UPDATE_DELAY_MS = 2000 (Phase 72 parity)', () => {
    expect(CATCH_UP_MARKER_UPDATE_DELAY_MS).toBe(2000);
  });
});

describe('Phase 90 — summarizeCatchUpSinceLastSeen', () => {
  const NOW = new Date('2026-05-18T12:00:00Z');
  const NOW_MS = NOW.getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function pastIso(daysAgo: number): string {
    return new Date(NOW_MS - daysAgo * MS_PER_DAY).toISOString();
  }
  function futureIso(daysAhead: number): string {
    return new Date(NOW_MS + daysAhead * MS_PER_DAY).toISOString();
  }

  it('first visit (priorLastSeenMs=undefined) → newCount=0, isFirstVisit=true', () => {
    const summary = summarizeCatchUpSinceLastSeen(
      [{ id: 'a', occurredAt: pastIso(1) }],
      undefined,
      NOW,
    );
    expect(summary.newCount).toBe(0);
    expect(summary.isFirstVisit).toBe(true);
    expect(summary.isNew(pastIso(1))).toBe(false);
    expect(summary.isNew(undefined)).toBe(false);
  });

  it('returning visit → isFirstVisit=false even when nothing is new', () => {
    const summary = summarizeCatchUpSinceLastSeen(
      [],
      NOW_MS - 7 * MS_PER_DAY,
      NOW,
    );
    expect(summary.newCount).toBe(0);
    expect(summary.isFirstVisit).toBe(false);
  });

  it('counts items whose occurredAt is strictly after priorLastSeenMs', () => {
    const priorMs = NOW_MS - 7 * MS_PER_DAY; // 7 days ago
    const summary = summarizeCatchUpSinceLastSeen(
      [
        { id: 'a', occurredAt: pastIso(3) }, // 3d ago — newer than prior → new
        { id: 'b', occurredAt: pastIso(10) }, // 10d ago — older than prior → not new
      ],
      priorMs,
      NOW,
    );
    expect(summary.newCount).toBe(1);
    expect(summary.isNew(pastIso(3))).toBe(true);
    expect(summary.isNew(pastIso(10))).toBe(false);
  });

  it('strict greater-than: an item whose occurredAt equals priorMs is NOT new', () => {
    const priorMs = NOW_MS - 5 * MS_PER_DAY;
    const summary = summarizeCatchUpSinceLastSeen(
      [
        {
          id: 'same',
          occurredAt: new Date(priorMs).toISOString(),
        },
      ],
      priorMs,
      NOW,
    );
    expect(summary.newCount).toBe(0);
    expect(summary.isNew(new Date(priorMs).toISOString())).toBe(false);
  });

  it('future-anchored items (occurredAt > now) are NOT new', () => {
    const priorMs = NOW_MS - 7 * MS_PER_DAY;
    const summary = summarizeCatchUpSinceLastSeen(
      [
        // future close date — closing-soon items have these
        { id: 'close', occurredAt: futureIso(5) },
        // future due date — task-due-soon items have these
        { id: 'due', occurredAt: futureIso(2) },
      ],
      priorMs,
      NOW,
    );
    expect(summary.newCount).toBe(0);
    expect(summary.isNew(futureIso(5))).toBe(false);
  });

  it('items with undefined occurredAt are NOT new', () => {
    const priorMs = NOW_MS - 7 * MS_PER_DAY;
    const summary = summarizeCatchUpSinceLastSeen(
      [{ id: 'a', occurredAt: undefined }],
      priorMs,
      NOW,
    );
    expect(summary.newCount).toBe(0);
    expect(summary.isNew(undefined)).toBe(false);
  });

  it('items with malformed occurredAt are NOT new', () => {
    const priorMs = NOW_MS - 7 * MS_PER_DAY;
    const summary = summarizeCatchUpSinceLastSeen(
      [{ id: 'a', occurredAt: 'not-a-date' }],
      priorMs,
      NOW,
    );
    expect(summary.newCount).toBe(0);
    expect(summary.isNew('not-a-date')).toBe(false);
  });

  it('the newCount matches the number of past-anchored items strictly after priorMs', () => {
    const priorMs = NOW_MS - 5 * MS_PER_DAY;
    const summary = summarizeCatchUpSinceLastSeen(
      [
        { id: 'a', occurredAt: pastIso(1) }, // new
        { id: 'b', occurredAt: pastIso(2) }, // new
        { id: 'c', occurredAt: pastIso(10) }, // not new
        { id: 'd', occurredAt: futureIso(3) }, // future → not new
        { id: 'e', occurredAt: undefined }, // missing → not new
      ],
      priorMs,
      NOW,
    );
    expect(summary.newCount).toBe(2);
  });
});

describe('Phase 90 — module hygiene', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'catchUpLastSeen.ts'),
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

  it('source does not contain notification / sync / unread / official-record vocabulary as a positive claim', () => {
    expect(CODE).not.toMatch(/\bnotification\s+delivered\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been)\s+synced\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been)\s+pushed\b/i);
    expect(CODE).not.toMatch(/\bunread\s+state\b/i);
    expect(CODE).not.toMatch(/\bofficial\s+(record|state|status)\b/i);
    expect(CODE).not.toMatch(/\breal[- ]?time\b/i);
    expect(CODE).not.toMatch(/\bguaranteed\b/i);
    expect(CODE).not.toMatch(/\bAI[ -]?(generated|detected)\b/i);
  });
});
