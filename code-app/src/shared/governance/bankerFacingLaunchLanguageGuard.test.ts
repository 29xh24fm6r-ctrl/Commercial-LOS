import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { INVENTORIED_FILES } from './productionSurfaceInventory';

/**
 * Production-Surface Inventory (Factory Arc Phase 1) — trip-wire guard.
 *
 * Every FILE already known to carry banker/manager-facing launch-program
 * language is cataloged in productionSurfaceInventory.ts (grandfathered —
 * that pre-existing debt is what later arc phases resolve, not this test).
 * This test's job is narrower: catch a NEW file, in a banker/manager/shared
 * runtime surface, introducing the same vocabulary for the first time. It is
 * a trip-wire against regression while the arc is in flight, not a
 * retroactive cleanup mandate.
 *
 * Scope is deliberately narrower than Phase 1's inventory SCAN (which also
 * covered src/shared and src/admin): src/admin and src/access are the
 * correct home for this vocabulary (Admin / Platform Operations), so this
 * guard does not scan them — a new admin-only certification model is not a
 * violation of the arc's goal. Directories in scope are the ones a banker,
 * manager, team member, or EXECUTIVE can actually see: src/banker, src/deals,
 * src/manager, src/portfolioBoarding, src/crm, src/workspaces, src/team, and
 * src/executive (excluding the Admin/Executive workspace SHELL files, which
 * are thin routing/composition wrappers, not content surfaces).
 *
 * Factory Arc Phase 15: src/team and src/executive were added. They were
 * missing from the original Phase 1 scope even though real, non-admin users
 * (team members, business executives — distinct from Admin/Platform
 * Operations) see both. This gap is exactly how the Executive Restart
 * Readiness Command Center's "Gated activation" wording (a considered,
 * already-documented Phase 14 residual-risk decision — see
 * productionSurfaceInventory.ts — not a new violation) went unguarded.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const SCAN_ROOTS = [
  'src/banker',
  'src/deals',
  'src/manager',
  'src/portfolioBoarding',
  'src/crm',
  'src/workspaces',
  'src/team',
  'src/executive',
];

/** Workspace shells that are intentionally platform-operations/executive-scoped, not banker-facing. */
const EXCLUDED_FILES = new Set([
  'src/workspaces/AdminWorkspace.tsx',
  'src/workspaces/ExecutiveWorkspace.tsx',
  'src/workspaces/ExecutiveProductStrategyWorkspace.tsx',
]);

const ALLOWLIST = new Set(INVENTORIED_FILES);

/** Strip comments so a docstring explaining WHY something isn't gated doesn't trip the guard on its own explanation. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Telltale launch-program vocabulary. Deliberately narrower than Phase 1's
 * exploratory scan list (which also included bare "disabled" and
 * "read-only because..." — both far too common as ordinary UI vocabulary,
 * e.g. an HTML `disabled` attribute, to serve as an automated trip-wire
 * without drowning in false positives). Each pattern here is specific
 * enough that a genuine hit is almost certainly launch-program narrative,
 * not incidental phrasing.
 */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bgated\b/i,
  /\bpilot\b/i,
  /\bcertification\b/i,
  /\bcertified\b/i,
  /\blaunch[- ]?ready\b/i,
  /\blaunch program\b/i,
  /\brollout\b/i,
  /\bsmoke test\b/i,
  /DRY_RUN/,
  /pending enablement/i,
  /pending operator approval/i,
  /pending certification/i,
  /\bfeature flag\b/i,
  /\bsafe default\b/i,
];

/**
 * node:path's `relative`/`join` use the platform separator — backslashes on
 * Windows. Every other path in this file (SCAN_ROOTS, EXCLUDED_FILES,
 * ALLOWLIST via INVENTORIED_FILES, and the sanity-check assertion below) is
 * written in repo-relative POSIX form. Without normalizing at the source,
 * candidateFiles on Windows never matches EXCLUDED_FILES/ALLOWLIST, so every
 * already-cataloged file is treated as new — including ones that legitimately
 * contain FORBIDDEN_PATTERNS vocabulary as internal identifiers/types/config
 * values (DRY_RUN, rollout, certification, certified, gated), producing
 * cascading false positives.
 */
function normalizeRepoPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function listSourceFiles(dir: string): string[] {
  const abs = resolve(REPO_ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const entryAbs = join(abs, entry);
    const stat = statSync(entryAbs);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(normalizeRepoPath(relative(REPO_ROOT, entryAbs))));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    files.push(normalizeRepoPath(relative(REPO_ROOT, entryAbs)));
  }
  return files;
}

describe('Production-surface inventory — banker-facing launch-language trip-wire', () => {
  const candidateFiles = SCAN_ROOTS.flatMap(listSourceFiles).filter((f) => !EXCLUDED_FILES.has(f));

  it('scanned at least the known banker-facing files (sanity check the scan itself works)', () => {
    expect(candidateFiles).toEqual(expect.arrayContaining(['src/banker/bankerOperatingCommandCenterModel.ts']));
  });

  for (const file of candidateFiles) {
    if (ALLOWLIST.has(file)) continue; // pre-existing, cataloged debt — resolved by a later arc phase, not this test.
    it(`${file} introduces no new banker-facing launch/certification language`, () => {
      const code = stripComments(readFileSync(resolve(REPO_ROOT, file), 'utf8'));
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(code, `matched ${pattern} in ${file} — a NEW file outside the Phase 1 inventory allowlist`).not.toMatch(pattern);
      }
    });
  }

  it('every allowlisted file still exists on disk (the inventory is not describing deleted files)', () => {
    for (const file of ALLOWLIST) {
      // File may have moved/been renamed by a later arc phase — this test isn't meant to police
      // that; it only checks INVENTORIED_FILES itself hasn't silently drifted from reality within
      // Phase 1's own PR. A later phase that legitimately deletes/renames a file should also prune
      // the corresponding productionSurfaceInventory.ts entry in the same PR.
      const abs = resolve(REPO_ROOT, file);
      let exists = true;
      try {
        statSync(abs);
      } catch {
        exists = false;
      }
      expect(exists, `${file} is in INVENTORIED_FILES but not found on disk`).toBe(true);
    }
  });
});
