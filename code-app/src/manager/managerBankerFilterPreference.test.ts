// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ManagerBankerFilterOption } from './ManagerBankerFilter';
import {
  MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
  buildManagerFilterPreferenceScope,
  clearManagerFilterPreference,
  getManagerFilterPreference,
  loadManagerFilterPreferences,
  saveManagerFilterPreference,
  validateRestoredPreference,
  type ManagerFilterPreferenceEntry,
} from './managerBankerFilterPreference';

/**
 * Phase 93 — manager banker-filter preference tests.
 *
 * Pins:
 *   - buildManagerFilterPreferenceScope: returns null when userId
 *     or teamId is missing/whitespace; composes "manager:<u>:<t>"
 *     otherwise.
 *   - save/load round-trip for 'all' / 'banker' / 'unassigned'.
 *   - clear removes a single scope entry; other scopes survive.
 *   - load returns {} on missing slot / malformed JSON / wrong root
 *     / individual malformed entry / mixed-state tamper (banker
 *     fields on 'all' or 'unassigned'; banker kind with neither id
 *     nor name; embedded-key mismatch).
 *   - validateRestoredPreference:
 *     - undefined → 'all'
 *     - 'all' → 'all'
 *     - 'banker' with id present in options → restores by id
 *     - 'banker' with id NOT in options but name matching → name
 *       fallback restore
 *     - 'banker' with no match → 'all'
 *     - 'unassigned' when option exists → 'unassigned'
 *     - 'unassigned' when option missing → 'all'
 *   - Storage namespace is cc:managerFilterSelection:v1 (disjoint
 *     from Phase 90 / 91 / 83).
 *   - Module hygiene: no SDK / forbidden vocabulary.
 */

const NOW = new Date('2026-05-18T12:00:00Z');

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 93 — buildManagerFilterPreferenceScope', () => {
  it('composes manager:<userId>:<teamId>', () => {
    expect(
      buildManagerFilterPreferenceScope({
        userId: 'banker-1',
        teamId: 'team-9',
      }),
    ).toBe('manager:banker-1:team-9');
  });

  it('returns null when userId is missing or whitespace-only', () => {
    expect(
      buildManagerFilterPreferenceScope({
        userId: undefined,
        teamId: 'team-9',
      }),
    ).toBeNull();
    expect(
      buildManagerFilterPreferenceScope({ userId: '', teamId: 'team-9' }),
    ).toBeNull();
    expect(
      buildManagerFilterPreferenceScope({ userId: '   ', teamId: 'team-9' }),
    ).toBeNull();
  });

  it('returns null when teamId is missing or whitespace-only', () => {
    expect(
      buildManagerFilterPreferenceScope({
        userId: 'banker-1',
        teamId: undefined,
      }),
    ).toBeNull();
    expect(
      buildManagerFilterPreferenceScope({
        userId: 'banker-1',
        teamId: '',
      }),
    ).toBeNull();
    expect(
      buildManagerFilterPreferenceScope({
        userId: 'banker-1',
        teamId: '   ',
      }),
    ).toBeNull();
  });

  it('trims whitespace around userId and teamId before composing', () => {
    expect(
      buildManagerFilterPreferenceScope({
        userId: '  banker-1  ',
        teamId: '  team-9  ',
      }),
    ).toBe('manager:banker-1:team-9');
  });

  it('different (banker, team) combos produce different scope keys', () => {
    const a = buildManagerFilterPreferenceScope({
      userId: 'banker-1',
      teamId: 'team-a',
    });
    const b = buildManagerFilterPreferenceScope({
      userId: 'banker-1',
      teamId: 'team-b',
    });
    expect(a).not.toBe(b);
  });
});

describe('Phase 93 — save / load round-trip', () => {
  const SCOPE = 'manager:banker-1:team-9';

  it('round-trips an "all" preference', () => {
    saveManagerFilterPreference(SCOPE, { kind: 'all' }, NOW);
    const got = getManagerFilterPreference(SCOPE);
    expect(got?.kind).toBe('all');
    expect(got?.bankerId).toBeUndefined();
    expect(got?.bankerName).toBeUndefined();
    expect(got?.recordedAt).toBe(NOW.toISOString());
  });

  it('round-trips a "banker" preference with id', () => {
    saveManagerFilterPreference(
      SCOPE,
      { kind: 'banker', id: 'b-1', name: 'Alice' },
      NOW,
    );
    const got = getManagerFilterPreference(SCOPE);
    expect(got?.kind).toBe('banker');
    expect(got?.bankerId).toBe('b-1');
    expect(got?.bankerName).toBe('Alice');
  });

  it('round-trips a "banker" preference with name fallback (no id)', () => {
    saveManagerFilterPreference(
      SCOPE,
      { kind: 'banker', id: undefined, name: 'Alice' },
      NOW,
    );
    const got = getManagerFilterPreference(SCOPE);
    expect(got?.kind).toBe('banker');
    expect(got?.bankerId).toBeUndefined();
    expect(got?.bankerName).toBe('Alice');
  });

  it('round-trips an "unassigned" preference', () => {
    saveManagerFilterPreference(SCOPE, { kind: 'unassigned' }, NOW);
    const got = getManagerFilterPreference(SCOPE);
    expect(got?.kind).toBe('unassigned');
    expect(got?.bankerId).toBeUndefined();
    expect(got?.bankerName).toBeUndefined();
  });

  it('overwrites the prior entry under the same scope (last-write-wins)', () => {
    saveManagerFilterPreference(SCOPE, { kind: 'all' }, NOW);
    saveManagerFilterPreference(
      SCOPE,
      { kind: 'banker', id: 'b-1', name: 'Alice' },
      NOW,
    );
    expect(getManagerFilterPreference(SCOPE)?.kind).toBe('banker');
  });

  it('write under one scope does not affect another scope', () => {
    saveManagerFilterPreference(
      'manager:b-1:t-a',
      { kind: 'banker', id: 'b-x', name: 'A' },
      NOW,
    );
    expect(getManagerFilterPreference('manager:b-2:t-a')).toBeUndefined();
    expect(getManagerFilterPreference('manager:b-1:t-b')).toBeUndefined();
  });

  it('storage key is cc:managerFilterSelection:v1 (disjoint from Phase 83/90/91)', () => {
    saveManagerFilterPreference('manager:b-1:t-9', { kind: 'all' }, NOW);
    expect(MANAGER_FILTER_PREFERENCE_STORAGE_KEY).toBe(
      'cc:managerFilterSelection:v1',
    );
    expect(localStorage.getItem(MANAGER_FILTER_PREFERENCE_STORAGE_KEY)).not.toBeNull();
    // Other phase slots untouched.
    expect(localStorage.getItem('cc:autopilotSuggestionLedger:v1')).toBeNull();
    expect(localStorage.getItem('cc:catchUpItemLedger:v1')).toBeNull();
    expect(
      localStorage.getItem('cc:lastVisit:catchUp:manager:b-1:t-9'),
    ).toBeNull();
  });
});

describe('Phase 93 — clear', () => {
  it('clears only the targeted scope', () => {
    saveManagerFilterPreference('manager:b-1:t-9', { kind: 'all' }, NOW);
    saveManagerFilterPreference(
      'manager:b-2:t-9',
      { kind: 'banker', id: 'b-x', name: 'A' },
      NOW,
    );
    clearManagerFilterPreference('manager:b-1:t-9');
    expect(getManagerFilterPreference('manager:b-1:t-9')).toBeUndefined();
    expect(getManagerFilterPreference('manager:b-2:t-9')).toBeDefined();
  });

  it('no-ops when the scope is absent', () => {
    expect(() =>
      clearManagerFilterPreference('manager:nobody:nowhere'),
    ).not.toThrow();
  });
});

describe('Phase 93 — loadManagerFilterPreferences fault tolerance', () => {
  it('returns {} when slot is missing', () => {
    expect(loadManagerFilterPreferences()).toEqual({});
  });

  it('returns {} when slot is malformed JSON', () => {
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      'not-json{{',
    );
    expect(loadManagerFilterPreferences()).toEqual({});
  });

  it('returns {} when slot contains a JSON array (wrong root)', () => {
    localStorage.setItem(MANAGER_FILTER_PREFERENCE_STORAGE_KEY, '[]');
    expect(loadManagerFilterPreferences()).toEqual({});
  });

  it('drops individual malformed entries while keeping well-formed ones', () => {
    const goodScope = 'manager:b-1:t-9';
    const good: ManagerFilterPreferenceEntry = {
      scopeId: goodScope,
      kind: 'banker',
      bankerId: 'b-x',
      bankerName: 'A',
      recordedAt: NOW.toISOString(),
    };
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        [goodScope]: good,
        'bad-1': { what: 'is this' },
        'bad-2': null,
        'bad-3': 'a string',
      }),
    );
    const loaded = loadManagerFilterPreferences();
    expect(Object.keys(loaded)).toEqual([goodScope]);
    expect(loaded[goodScope]).toEqual(good);
  });

  it('drops entries whose embedded scopeId does not match the map key', () => {
    const entry: ManagerFilterPreferenceEntry = {
      scopeId: 'lying:scope',
      kind: 'all',
      bankerId: undefined,
      bankerName: undefined,
      recordedAt: NOW.toISOString(),
    };
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ 'manager:b-1:t-9': entry }),
    );
    expect(loadManagerFilterPreferences()).toEqual({});
  });

  it('drops entries with invalid kind value', () => {
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        'manager:b-1:t-9': {
          scopeId: 'manager:b-1:t-9',
          kind: 'profile-saved', // forbidden / unknown
          recordedAt: NOW.toISOString(),
        },
      }),
    );
    expect(loadManagerFilterPreferences()).toEqual({});
  });

  it('drops "all" entries that carry banker fields (mixed-state tamper)', () => {
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        'manager:b-1:t-9': {
          scopeId: 'manager:b-1:t-9',
          kind: 'all',
          bankerId: 'b-x',
          recordedAt: NOW.toISOString(),
        },
      }),
    );
    expect(loadManagerFilterPreferences()).toEqual({});
  });

  it('drops "banker" entries that have neither id nor name', () => {
    localStorage.setItem(
      MANAGER_FILTER_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        'manager:b-1:t-9': {
          scopeId: 'manager:b-1:t-9',
          kind: 'banker',
          recordedAt: NOW.toISOString(),
        },
      }),
    );
    expect(loadManagerFilterPreferences()).toEqual({});
  });
});

describe('Phase 93 — validateRestoredPreference', () => {
  function bankerOpt(
    id: string | undefined,
    name: string,
  ): ManagerBankerFilterOption {
    return {
      value: id ? `banker-id:${id}` : `banker-name:${name}`,
      label: name,
      selection: { kind: 'banker', id, name },
    };
  }
  const ALL: ManagerBankerFilterOption = {
    value: '__all__',
    label: 'All team',
    selection: { kind: 'all' },
  };
  const UNASSIGNED: ManagerBankerFilterOption = {
    value: '__unassigned__',
    label: 'Unassigned',
    selection: { kind: 'unassigned' },
  };

  it("undefined preference -> 'all'", () => {
    expect(validateRestoredPreference(undefined, [ALL])).toEqual({
      kind: 'all',
    });
  });

  it("'all' -> 'all'", () => {
    const stored: ManagerFilterPreferenceEntry = {
      scopeId: 'manager:b-1:t-9',
      kind: 'all',
      bankerId: undefined,
      bankerName: undefined,
      recordedAt: NOW.toISOString(),
    };
    expect(validateRestoredPreference(stored, [ALL])).toEqual({ kind: 'all' });
  });

  it("'banker' with id present in options -> restores by id", () => {
    const stored: ManagerFilterPreferenceEntry = {
      scopeId: 'manager:b-1:t-9',
      kind: 'banker',
      bankerId: 'b-x',
      bankerName: 'Alice',
      recordedAt: NOW.toISOString(),
    };
    expect(
      validateRestoredPreference(stored, [ALL, bankerOpt('b-x', 'Alice')]),
    ).toEqual({ kind: 'banker', id: 'b-x', name: 'Alice' });
  });

  it("'banker' with id NOT in options, name matches -> name-fallback restore", () => {
    const stored: ManagerFilterPreferenceEntry = {
      scopeId: 'manager:b-1:t-9',
      kind: 'banker',
      bankerId: 'b-stale',
      bankerName: 'Alice',
      recordedAt: NOW.toISOString(),
    };
    // Options contain an Alice but under a different id (e.g., the
    // id was missing on the deal record so the option is name-keyed).
    expect(
      validateRestoredPreference(stored, [ALL, bankerOpt(undefined, 'Alice')]),
    ).toEqual({ kind: 'banker', id: undefined, name: 'Alice' });
  });

  it("'banker' name match is case-insensitive", () => {
    const stored: ManagerFilterPreferenceEntry = {
      scopeId: 'manager:b-1:t-9',
      kind: 'banker',
      bankerId: undefined,
      bankerName: 'alice',
      recordedAt: NOW.toISOString(),
    };
    expect(
      validateRestoredPreference(stored, [ALL, bankerOpt(undefined, 'Alice')]),
    ).toEqual({ kind: 'banker', id: undefined, name: 'Alice' });
  });

  it("'banker' with no matching option -> 'all' (stale)", () => {
    const stored: ManagerFilterPreferenceEntry = {
      scopeId: 'manager:b-1:t-9',
      kind: 'banker',
      bankerId: 'b-nobody',
      bankerName: 'Phantom',
      recordedAt: NOW.toISOString(),
    };
    expect(
      validateRestoredPreference(stored, [ALL, bankerOpt('b-x', 'Alice')]),
    ).toEqual({ kind: 'all' });
  });

  it("'unassigned' when option exists -> 'unassigned'", () => {
    const stored: ManagerFilterPreferenceEntry = {
      scopeId: 'manager:b-1:t-9',
      kind: 'unassigned',
      bankerId: undefined,
      bankerName: undefined,
      recordedAt: NOW.toISOString(),
    };
    expect(
      validateRestoredPreference(stored, [ALL, UNASSIGNED]),
    ).toEqual({ kind: 'unassigned' });
  });

  it("'unassigned' when no unassigned option -> 'all'", () => {
    const stored: ManagerFilterPreferenceEntry = {
      scopeId: 'manager:b-1:t-9',
      kind: 'unassigned',
      bankerId: undefined,
      bankerName: undefined,
      recordedAt: NOW.toISOString(),
    };
    expect(validateRestoredPreference(stored, [ALL])).toEqual({ kind: 'all' });
  });
});

describe('Phase 93 — module hygiene', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'managerBankerFilterPreference.ts'),
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

  it('source does not contain sync / profile / official-setting / tenant-setting vocabulary as a positive claim', () => {
    expect(CODE).not.toMatch(/\bsaved\s+to\s+profile\b/i);
    expect(CODE).not.toMatch(/\bofficial\s+preference\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been)\s+synced\b/i);
    expect(CODE).not.toMatch(/\btenant\s+setting\b/i);
    expect(CODE).not.toMatch(/\bmanager\s+setting\b/i);
    expect(CODE).not.toMatch(/\bremembered\s+by\s+the\s+system\b/i);
    expect(CODE).not.toMatch(/\bAI[ -]?(generated|detected)\b/i);
    expect(CODE).not.toMatch(/\breal[- ]?time\b/i);
  });
});
