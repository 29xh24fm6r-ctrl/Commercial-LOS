import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

/**
 * Phase 48: DataProvider Isolation Regression Sweep.
 *
 * Each role-specific directory (banker / manager / team / executive /
 * admin) must keep its data layer isolated from every OTHER role's
 * data layer. Cross-role data imports break the sealed-module
 * discipline that Phases 4 (banker), 15 (executive), 17 (admin),
 * 36 (manager), 37 (team), 38 (DealRoute permission matrix), 39
 * (write surfaces), and 44 (read-only UI) collectively rely on.
 *
 * This file closes the third isolation layer:
 *   - Phase 39 pinned the WRITE boundary (which roles can fire which
 *     governed writes);
 *   - Phase 44 pinned the READ-ONLY UI boundary (which roles can see
 *     which deal-card render mode);
 *   - Phase 48 pins the DATA-LAYER boundary (which role files can
 *     import which other role files).
 *
 * What this guards against:
 *   - A banker file silently importing `managerQueries.ts` and
 *     thereby reaching team-scoped reads through the wrong predicate.
 *   - An admin diagnostic surface starting to consume a banker
 *     query, accidentally inheriting deal-scoped visibility.
 *   - A shared module under `src/shared/` reaching back into a role
 *     directory and inverting the import graph.
 *
 * Documented exceptions:
 *   - `src/deals/DealRoute.tsx` legitimately imports
 *     `<role>Provider` / `<role>DealWorkspace` from banker, manager,
 *     and team. This is the dispatcher — its job is to branch into
 *     the right role-scoped subtree. Allowlisted with a stated
 *     reason.
 *   - Shared deal cards in `src/deals/` import `useOptionalBanker`
 *     from `../banker/BankerContext` because those cards are
 *     banker-scoped FEATURES (the manager / team workspaces render
 *     them with readOnly=true; the banker workspace renders them
 *     interactively). Allowlisted.
 *   - No `src/shared/` file is allowed to import from any role
 *     directory — no exceptions.
 */

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const REPO_SRC = resolve(__dirname, '..', '..');

const ROLE_DIRS = ['banker', 'manager', 'team', 'executive', 'admin'] as const;
type Role = (typeof ROLE_DIRS)[number];

function isInScopeSource(name: string): boolean {
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
  return name.endsWith('.ts') || name.endsWith('.tsx');
}

function collectSourceFilesRecursive(dirAbs: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs)) {
    const abs = resolve(dirAbs, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      collectSourceFilesRecursive(abs, out);
    } else if (stat.isFile() && isInScopeSource(entry)) {
      out.push(abs);
    }
  }
}

function listSourceFiles(relDir: string): string[] {
  const out: string[] = [];
  collectSourceFilesRecursive(resolve(REPO_SRC, relDir), out);
  return out;
}

function readSource(absPath: string): string {
  return readFileSync(absPath, 'utf8');
}

function relForward(absPath: string): string {
  return relative(REPO_SRC, absPath).split(sep).join('/');
}

// ---------------------------------------------------------------------------
// Cross-role import detection
//
// Looks at each from-clause path string and asks: does it cross from
// the source role into another role's directory? Imports of the form
// `../<otherRole>/...` (one level up) and `../../<otherRole>/...`
// (two levels up) are both detected.
// ---------------------------------------------------------------------------

interface CrossRoleHit {
  file: string;   // forward-slash, repo-src-relative
  line: number;
  importPath: string;
  targetRole: Role;
}

function findCrossRoleImports(sourceRole: Role, fileAbs: string): CrossRoleHit[] {
  const src = readSource(fileAbs);
  const hits: CrossRoleHit[] = [];
  const re = /from\s+['"]([^'"]+)['"]/g;
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const importPath = m[1]!;
      for (const other of ROLE_DIRS) {
        if (other === sourceRole) continue;
        const oneUp = `../${other}/`;
        const twoUp = `../../${other}/`;
        if (importPath.startsWith(oneUp) || importPath.startsWith(twoUp)) {
          hits.push({
            file: relForward(fileAbs),
            line: i + 1,
            importPath,
            targetRole: other,
          });
        }
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Tests — role-by-role
// ---------------------------------------------------------------------------

describe('Phase 48 — role data layers are isolated from other role data layers', () => {
  for (const role of ROLE_DIRS) {
    it(`no file in src/${role}/ imports from another role directory`, () => {
      const files = listSourceFiles(role);
      const violations: CrossRoleHit[] = [];
      for (const file of files) {
        violations.push(...findCrossRoleImports(role, file));
      }
      if (violations.length > 0) {
        const report = violations
          .map(
            (v) =>
              `  ${v.file}:${v.line} → "${v.importPath}" (crosses into ${v.targetRole}/)`,
          )
          .join('\n');
        throw new Error(
          `${violations.length} cross-role import(s) found in src/${role}/:\n${report}\n` +
            'Move shared logic into src/shared/ or src/deals/ (or allowlist with a stated reason).',
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// src/shared/ — must not reach back into ANY role directory
// ---------------------------------------------------------------------------

describe('Phase 48 — src/shared/ does not import from any role directory', () => {
  it('every file under src/shared/ has zero cross-role imports', () => {
    const files = listSourceFiles('shared');
    const violations: { file: string; line: number; importPath: string; targetRole: Role }[] =
      [];
    for (const fileAbs of files) {
      const src = readSource(fileAbs);
      const lines = src.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const re = /from\s+['"]([^'"]+)['"]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const importPath = m[1]!;
          for (const role of ROLE_DIRS) {
            if (
              importPath.startsWith(`../${role}/`) ||
              importPath.startsWith(`../../${role}/`)
            ) {
              violations.push({
                file: relForward(fileAbs),
                line: i + 1,
                importPath,
                targetRole: role,
              });
            }
          }
        }
      }
    }
    if (violations.length > 0) {
      const report = violations
        .map(
          (v) =>
            `  ${v.file}:${v.line} → "${v.importPath}" (reaches into ${v.targetRole}/)`,
        )
        .join('\n');
      throw new Error(
        `${violations.length} src/shared/ → role import(s) found:\n${report}\n` +
          'src/shared/ is the sink, never a consumer of role-specific modules.',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// src/deals/ — directional exceptions allowlisted
//
// The dispatcher (DealRoute.tsx) imports each role's provider +
// workspace; that's its job. The shared deal cards import
// useOptionalBanker / useBanker because those cards are
// banker-feature components that the manager / team workspaces
// render in read-only mode.
// ---------------------------------------------------------------------------

interface DealsExceptionEntry {
  /** Repo-src-relative, forward-slash. */
  file: string;
  /** The target role import path stem (e.g. '../banker/BankerContext'). */
  allowedFrom: readonly string[];
  reason: string;
}

const DEALS_ALLOWED_CROSS_IMPORTS: readonly DealsExceptionEntry[] = [
  {
    file: 'deals/DealRoute.tsx',
    allowedFrom: [
      '../banker/BankerProvider',
      '../manager/ManagerProvider',
      '../manager/ManagerDealWorkspace',
      '../team/TeamProvider',
      '../team/TeamDealWorkspace',
    ],
    reason:
      'DealRoute is the role dispatcher (Phase 4/36/37); its job is to branch into ' +
      'the right role-scoped subtree. Executive and admin are intentionally denied at ' +
      'this layer and therefore appear NOWHERE here.',
  },
  {
    file: 'deals/BankerDealWorkspace.tsx',
    allowedFrom: ['../banker/BankerContext', '../banker/LendingOSLayout'],
    reason:
      'Banker-only workspace consumes the banker identity context. Phase 125F also ' +
      'wraps the deal cockpit inside the shared LendingOSLayout shell so the dark ' +
      'left sidebar persists across the banker home AND the per-deal page (unified ' +
      'Lending OS chrome). Manager and team have their own workspace hosts ' +
      '(ManagerDealWorkspace / TeamDealWorkspace) in their respective role ' +
      'directories and are not affected by the shell wrap.',
  },
  {
    file: 'deals/DealTasks.tsx',
    allowedFrom: ['../banker/BankerContext'],
    reason:
      'Shared deal card uses useOptionalBanker to know whether to render the ' +
      'banker-mode write surface or the read-only mode. Manager/team workspaces ' +
      'render this same card with readOnly={true}.',
  },
  {
    file: 'deals/DealDocuments.tsx',
    allowedFrom: ['../banker/BankerContext'],
    reason: 'Same useOptionalBanker pattern as DealTasks.',
  },
  {
    file: 'deals/CreditMemo.tsx',
    allowedFrom: ['../banker/BankerContext'],
    reason: 'Same useOptionalBanker pattern as DealTasks.',
  },
  {
    file: 'deals/BorrowerCommunication.tsx',
    allowedFrom: ['../banker/BankerContext'],
    reason: 'Same useOptionalBanker pattern as DealTasks.',
  },
  {
    file: 'deals/RelationshipContext.tsx',
    allowedFrom: [
      '../banker/BankerContext',
      '../banker/workQueueQueries',
      '../banker/RelationshipNoteDraftModal',
    ],
    reason:
      'Phase 77 banker-only Deal Workspace card. Consumes useOptionalBanker ' +
      'to enforce role boundary (returns null outside BankerProvider) and ' +
      'reuses the Phase 32 banker-scoped loadBankerWorkQueueData loader to ' +
      'fetch the same already-authorized data Phase 75/76 use — no new ' +
      'query shape, no permission widening. Phase 78 added the import of ' +
      'RelationshipNoteDraftModal so the same banker-only local-only note ' +
      'draft surface appears on both the Banker Workspace Relationship ' +
      'Memory card and the Deal Workspace Relationship Context card.',
  },
  {
    file: 'deals/TeamsChatHandoff.tsx',
    allowedFrom: ['../banker/BankerContext'],
    reason:
      'Phase 86 banker-only Deal Workspace card. Consumes useOptionalBanker ' +
      'to source the signed-in banker email for the Teams chat deep-link ' +
      'and to enforce the role boundary (returns null outside ' +
      'BankerProvider, which renders the disabled "Teams chat handoff ' +
      'unavailable" state). UPN is NEVER inferred from borrower / client ' +
      'name; same useOptionalBanker pattern as DealTasks / DealDocuments / ' +
      'CreditMemo / BorrowerCommunication / RelationshipContext. Card is ' +
      'mounted only in BankerDealWorkspace; the manager/team deal-route ' +
      'branches do not render it.',
  },
  {
    file: 'deals/TeamsDealSummaryHandoff.tsx',
    allowedFrom: [
      '../banker/BankerContext',
      '../banker/workQueueQueries',
    ],
    reason:
      'Phase 96 banker-only Deal Workspace card. Consumes useOptionalBanker ' +
      'to source the signed-in banker full name for the "Prepared by …" ' +
      'line in the copy-to-Teams summary, and to enforce the role boundary ' +
      '(returns null outside BankerProvider, in which case the formatter ' +
      'falls back to the verbatim "the assigned banker" string rather than ' +
      'fabricating a name). Banker name is NEVER inferred from borrower / ' +
      'client name. Same useOptionalBanker pattern as TeamsChatHandoff. ' +
      'Phase 97 additionally imports loadBankerWorkQueueData to derive a ' +
      'one-line cross-deal relationship-context note via the Phase 76/77 ' +
      'deriveCrossDealContext primitive — same loader the sibling Phase 77 ' +
      'RelationshipContext card uses on the same page. Card is mounted ' +
      'only in BankerDealWorkspace; the manager/team deal-route branches ' +
      'do not render it.',
  },
];

describe('Phase 48 — src/deals/ cross-role imports are limited to documented exceptions', () => {
  it('every src/deals/ → role import is in the documented allowlist with a reason', () => {
    const files = listSourceFiles('deals');
    const unexpected: { file: string; line: number; importPath: string }[] = [];
    for (const fileAbs of files) {
      const relPath = relForward(fileAbs); // e.g. 'deals/DealRoute.tsx'
      const src = readSource(fileAbs);
      const lines = src.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const re = /from\s+['"]([^'"]+)['"]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const importPath = m[1]!;
          // Only flag paths reaching into a role directory.
          const crossRole = ROLE_DIRS.some((r) =>
            importPath.startsWith(`../${r}/`),
          );
          if (!crossRole) continue;
          // Is it allowlisted?
          const entry = DEALS_ALLOWED_CROSS_IMPORTS.find(
            (e) => e.file === relPath,
          );
          if (entry && entry.allowedFrom.includes(importPath)) continue;
          unexpected.push({ file: relPath, line: i + 1, importPath });
        }
      }
    }
    if (unexpected.length > 0) {
      const report = unexpected
        .map((u) => `  ${u.file}:${u.line} → "${u.importPath}"`)
        .join('\n');
      throw new Error(
        `${unexpected.length} undocumented src/deals/ → role import(s):\n${report}\n` +
          'If legitimate, add to DEALS_ALLOWED_CROSS_IMPORTS with a stated reason.',
      );
    }
  });

  it('every allowlist entry has a stated reason (>40 chars)', () => {
    for (const entry of DEALS_ALLOWED_CROSS_IMPORTS) {
      expect(
        entry.reason.length,
        `Allowlist entry for ${entry.file} has too short a reason`,
      ).toBeGreaterThan(40);
    }
  });

  it('every allowlisted file actually contains at least one of its allowed cross-role imports', () => {
    for (const entry of DEALS_ALLOWED_CROSS_IMPORTS) {
      const fileAbs = resolve(REPO_SRC, entry.file);
      const src = readSource(fileAbs);
      const found = entry.allowedFrom.some((path) =>
        src.includes(`from '${path}'`) || src.includes(`from "${path}"`),
      );
      expect(
        found,
        `Allowlist entry for ${entry.file} names imports that don't appear in the file. ` +
          'Remove the entry — it has rotted.',
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Final invariant: currentUserLookup lives at src/shared/governance/,
// NOT under any role directory. Phase 48 fixed an admin-housed leak.
// ---------------------------------------------------------------------------

describe('Phase 48 — currentUserLookup is housed in src/shared/governance', () => {
  it('the file exists at the shared path', () => {
    const src = readSource(
      resolve(REPO_SRC, 'shared/governance/currentUserLookup.ts'),
    );
    expect(src).toMatch(/export\s+async\s+function\s+resolveCurrentSystemUserId/);
  });

  it('no file imports resolveCurrentSystemUserId from a role directory', () => {
    const allRoles = listSourceFiles('banker')
      .concat(listSourceFiles('manager'))
      .concat(listSourceFiles('team'))
      .concat(listSourceFiles('executive'))
      .concat(listSourceFiles('admin'))
      .concat(listSourceFiles('deals'))
      .concat(listSourceFiles('shared'));
    for (const fileAbs of allRoles) {
      const src = readSource(fileAbs);
      expect(
        src,
        `${relForward(fileAbs)} still imports currentUserLookup from a role directory`,
      ).not.toMatch(
        /from\s+['"](?:\.\.\/)+(?:banker|manager|team|executive|admin)\/currentUserLookup['"]/,
      );
    }
  });
});
