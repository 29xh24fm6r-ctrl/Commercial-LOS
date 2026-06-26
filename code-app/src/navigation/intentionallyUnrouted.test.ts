import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INTENTIONALLY_UNROUTED,
  INTENTIONALLY_UNROUTED_PATHS,
} from './intentionallyUnrouted';

/**
 * Phase 2 — integrity of the intentional-unrouted allow-list.
 *
 * The reachability gate (scripts/reachability-audit.mjs) trusts this list to
 * distinguish EXPECTED orphans from UNEXPECTED ones. A stale entry (path that no
 * longer exists) or a duplicate would silently widen the allow-list, so pin both.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');

describe('intentionallyUnrouted allow-list', () => {
  it('has entries (seeded with the Phase-0 baseline orphan set)', () => {
    expect(INTENTIONALLY_UNROUTED.length).toBeGreaterThan(0);
  });

  it('every allow-listed path exists on disk (no stale entries)', () => {
    const missing = INTENTIONALLY_UNROUTED.map((m) => m.path).filter(
      (p) => !existsSync(resolve(REPO_ROOT, p)),
    );
    expect(missing).toEqual([]);
  });

  it('has no duplicate paths', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const m of INTENTIONALLY_UNROUTED) {
      if (seen.has(m.path)) dupes.push(m.path);
      seen.add(m.path);
    }
    expect(dupes).toEqual([]);
    expect(INTENTIONALLY_UNROUTED_PATHS.size).toBe(INTENTIONALLY_UNROUTED.length);
  });

  it('every entry carries a non-empty reason and plannedPhase', () => {
    const bad = INTENTIONALLY_UNROUTED.filter(
      (m) => !m.reason.trim() || !m.plannedPhase.trim(),
    );
    expect(bad.map((m) => m.path)).toEqual([]);
  });
});
