// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LAST_VISIT_STORAGE_KEY_PREFIX,
  MARKER_UPDATE_DELAY_MS,
  clearLastVisitMs,
  getLastVisitMs,
  setLastVisitMs,
  summarizeActivitySinceLastVisit,
} from './lastVisit';

/**
 * Phase 72 — pure-derivation + localStorage helper tests.
 * Covers:
 *   - Storage roundtrip (set / get / clear)
 *   - Defensive handling of missing keys, bad values, and storage
 *     errors (private-browsing quota throws are swallowed)
 *   - First-visit semantics: priorLastVisitMs = undefined → 0 new
 *   - Strict-greater-than comparison (events with timestamp ==
 *     marker do NOT count as new)
 *   - Module hygiene: no SDK / role-module / power-apps import
 */

beforeEach(() => {
  // Clear any cross-test leakage in localStorage between cases.
  localStorage.clear();
});

describe('Phase 72 — last-visit storage helpers', () => {
  it('storage key prefix is namespaced and stable', () => {
    expect(LAST_VISIT_STORAGE_KEY_PREFIX).toBe('cc:lastVisit:deal:');
  });

  it('round-trips a marker via set/get', () => {
    setLastVisitMs('deal-1', 1_700_000_000_000);
    expect(getLastVisitMs('deal-1')).toBe(1_700_000_000_000);
  });

  it('returns undefined for missing keys (first visit)', () => {
    expect(getLastVisitMs('never-seen-deal')).toBeUndefined();
  });

  it('returns undefined for unparseable stored values', () => {
    localStorage.setItem(`${LAST_VISIT_STORAGE_KEY_PREFIX}deal-x`, 'not-a-number');
    expect(getLastVisitMs('deal-x')).toBeUndefined();
  });

  it('returns undefined for non-positive stored values', () => {
    localStorage.setItem(`${LAST_VISIT_STORAGE_KEY_PREFIX}deal-x`, '0');
    expect(getLastVisitMs('deal-x')).toBeUndefined();
    localStorage.setItem(`${LAST_VISIT_STORAGE_KEY_PREFIX}deal-x`, '-5');
    expect(getLastVisitMs('deal-x')).toBeUndefined();
  });

  it('set silently ignores non-positive values', () => {
    setLastVisitMs('deal-x', 0);
    setLastVisitMs('deal-x', -1);
    setLastVisitMs('deal-x', Number.NaN);
    expect(getLastVisitMs('deal-x')).toBeUndefined();
  });

  it('set floors fractional timestamps to integers', () => {
    setLastVisitMs('deal-y', 1_700_000_000_123.7);
    expect(getLastVisitMs('deal-y')).toBe(1_700_000_000_123);
  });

  it('clear removes the marker for a deal', () => {
    setLastVisitMs('deal-1', 1_700_000_000_000);
    expect(getLastVisitMs('deal-1')).toBe(1_700_000_000_000);
    clearLastVisitMs('deal-1');
    expect(getLastVisitMs('deal-1')).toBeUndefined();
  });

  it('per-deal namespacing — markers do not bleed across deals', () => {
    setLastVisitMs('deal-A', 1_700_000_000_000);
    setLastVisitMs('deal-B', 1_700_000_111_111);
    expect(getLastVisitMs('deal-A')).toBe(1_700_000_000_000);
    expect(getLastVisitMs('deal-B')).toBe(1_700_000_111_111);
    clearLastVisitMs('deal-A');
    expect(getLastVisitMs('deal-A')).toBeUndefined();
    expect(getLastVisitMs('deal-B')).toBe(1_700_000_111_111);
  });
});

describe('Phase 72 — summarizeActivitySinceLastVisit', () => {
  const T100 = '2026-01-01T00:01:40Z'; // ~ms = something; we use offsets via Date.parse
  const T200 = '2026-01-01T00:03:20Z';
  const T300 = '2026-01-01T00:05:00Z';
  const T400 = '2026-01-01T00:06:40Z';

  function ev(id: string, eventAt: string | undefined) {
    return { id, eventAt };
  }

  it('returns 0 new + always-false isNew on first visit (no prior marker)', () => {
    const r = summarizeActivitySinceLastVisit(
      [ev('a', T100), ev('b', T300)],
      undefined,
    );
    expect(r.newCount).toBe(0);
    expect(r.latestNewAt).toBeUndefined();
    expect(r.isNew(T100)).toBe(false);
    expect(r.isNew(T300)).toBe(false);
  });

  it('counts events strictly after the prior marker', () => {
    const markerMs = Date.parse(T200);
    const r = summarizeActivitySinceLastVisit(
      [ev('a', T100), ev('b', T200), ev('c', T300), ev('d', T400)],
      markerMs,
    );
    // T100, T200 are not "new"; T300, T400 are.
    expect(r.newCount).toBe(2);
    expect(r.latestNewAt).toBe(new Date(Date.parse(T400)).toISOString());
    expect(r.isNew(T100)).toBe(false);
    expect(r.isNew(T200)).toBe(false); // exactly at marker: NOT new
    expect(r.isNew(T300)).toBe(true);
    expect(r.isNew(T400)).toBe(true);
  });

  it('isNew returns false for undefined or unparseable eventAt', () => {
    const r = summarizeActivitySinceLastVisit([], Date.parse(T200));
    expect(r.isNew(undefined)).toBe(false);
    expect(r.isNew('not-a-date')).toBe(false);
  });

  it('skips events with missing / unparseable eventAt in newCount', () => {
    const r = summarizeActivitySinceLastVisit(
      [
        ev('a', undefined),
        ev('b', 'not-a-date'),
        ev('c', T300),
      ],
      Date.parse(T200),
    );
    expect(r.newCount).toBe(1);
    expect(r.latestNewAt).toBe(new Date(Date.parse(T300)).toISOString());
  });

  it('returns 0 new + undefined latestNewAt when nothing is newer than marker', () => {
    const r = summarizeActivitySinceLastVisit(
      [ev('a', T100), ev('b', T200)],
      Date.parse(T300),
    );
    expect(r.newCount).toBe(0);
    expect(r.latestNewAt).toBeUndefined();
  });

  it('MARKER_UPDATE_DELAY_MS is 2000ms (documented + stable)', () => {
    expect(MARKER_UPDATE_DELAY_MS).toBe(2000);
  });
});

describe('Phase 72 — module hygiene', () => {
  it('does NOT import any SDK service, role module, or @microsoft/power-apps', () => {
    const src = readFileSync(resolve(__dirname, 'lastVisit.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(src).not.toMatch(
      /from\s+['"][^'"]*\/(?:admin|banker|deals|manager|team|executive)\//,
    );
    expect(src).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
    // No Dataverse-service-resembling identifier names.
    expect(src).not.toMatch(/Cr664_\w+Service/);
  });

  it('does NOT contain any synced / real-time / AI claim in source', () => {
    const src = readFileSync(resolve(__dirname, 'lastVisit.ts'), 'utf8');
    // Strip comments before scanning so the explicit "do not say
    // X" disclaimers in the file header don't trigger the check.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(codeOnly).not.toMatch(/\bsynced?\b/i);
    expect(codeOnly).not.toMatch(/\breal[- ]?time\b/i);
    expect(codeOnly).not.toMatch(/\bAI[ -]detected\b/i);
    expect(codeOnly).not.toMatch(/\bunread count\b/i);
  });
});
