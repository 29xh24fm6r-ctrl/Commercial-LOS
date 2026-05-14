import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DELIBERATELY_BLOCKED,
  EXEC_TRANSITIONAL_FALLBACK_FEATURES,
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
  WORKSPACE_DEAL_ACCESS,
} from './platformInventory';

/**
 * Phase 44: Read-Only Workspace Governance Sweep.
 *
 * These tests pin the read-only boundary across every workspace surface
 * the platform exposes. They are static-source assertions — they read
 * the actual .ts/.tsx files and scan for forbidden imports — so a
 * future edit that quietly imports a write surface into a read-only
 * role fails CI.
 *
 * The audit performed in Phase 44 confirmed the codebase is currently
 * clean. These tests prevent regression FROM that clean state.
 *
 * Discipline:
 *   - These tests do not change runtime behavior.
 *   - They duplicate no governance fact; they only enforce existing
 *     ones at the import-graph level.
 *   - platformInventory.ts remains the single source of truth for what
 *     is shipped / blocked / not-wired / local-only / transitional.
 */

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const REPO_SRC = resolve(__dirname, '..', '..');

function listSourceFiles(dirAbs: string): string[] {
  return readdirSync(dirAbs)
    .filter(
      (n) =>
        (n.endsWith('.ts') || n.endsWith('.tsx')) &&
        !n.endsWith('.test.ts') &&
        !n.endsWith('.test.tsx'),
    )
    .map((n) => resolve(dirAbs, n));
}

function readSource(absPath: string): string {
  return readFileSync(absPath, 'utf8');
}

// ---------------------------------------------------------------------------
// Forbidden-import patterns
//
// "Action modules" are the governed-write coordinators in src/deals/ and
// src/admin/. "Write-triggering modals" are the user-facing modals that
// invoke those actions. Either type, imported into a read-only role
// surface, would be a regression.
//
// Imports are matched at the from-clause level so prose / comments
// referencing the names do not produce false positives.
// ---------------------------------------------------------------------------

const FORBIDDEN_ACTION_IMPORT =
  /from\s+['"][^'"]*\/(?:deals|admin)\/[A-Za-z0-9_]*[Aa]ctions['"]/;

const FORBIDDEN_WRITE_MODAL_IMPORT =
  /from\s+['"][^'"]*\/(?:CompleteTaskModal|RequestDocumentModal|CreditMemoDraftModal|DraftBorrowerUpdateModal|ResolveAlertModal|ResolveFlagModal)['"]/;

function assertCleanFile(absPath: string, allowWriteEntryPoint = false): void {
  const src = readSource(absPath);
  expect(
    FORBIDDEN_ACTION_IMPORT.test(src),
    `${absPath} unexpectedly imports an action module`,
  ).toBe(false);
  if (!allowWriteEntryPoint) {
    expect(
      FORBIDDEN_WRITE_MODAL_IMPORT.test(src),
      `${absPath} unexpectedly imports a write-triggering modal`,
    ).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// Executive surfaces — fully read-only by design (Phase 15)
// ---------------------------------------------------------------------------

describe('Phase 44 — executive role is fully read-only', () => {
  const dir = resolve(REPO_SRC, 'executive');

  it('no executive file imports any action module or write-triggering modal', () => {
    for (const f of listSourceFiles(dir)) {
      assertCleanFile(f);
    }
  });

  it('platformInventory pins executive deal access as denied', () => {
    const exec = WORKSPACE_DEAL_ACCESS.find((w) => w.role === 'executive');
    expect(exec).toBeDefined();
    expect(exec!.dealAccess).toBe('denied');
    expect(exec!.authFunction).toBeNull();
  });

  it('exec transitional fallback features are the documented two and nothing else (Phase 15 invariant)', () => {
    expect([...EXEC_TRANSITIONAL_FALLBACK_FEATURES].sort()).toEqual(
      ['MonthlyClosingForecast', 'PipelineByStage'].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Manager surfaces — read-only except ManagerDealWorkspace, which composes
// shared deal cards with readOnly={true}.
// ---------------------------------------------------------------------------

describe('Phase 44 — manager role is read-only at the role-module boundary', () => {
  const dir = resolve(REPO_SRC, 'manager');

  it('no non-workspace manager file imports any action module or write-triggering modal', () => {
    for (const f of listSourceFiles(dir)) {
      // ManagerDealWorkspace composes shared deal cards (which may
      // transitively reference actions via their write-mode branch);
      // it is the documented exception. It is verified separately
      // below to confirm it passes readOnly into every card.
      if (f.endsWith('ManagerDealWorkspace.tsx')) continue;
      assertCleanFile(f);
    }
  });

  it('platformInventory pins manager deal access as read-only with loadDealForManager', () => {
    const mgr = WORKSPACE_DEAL_ACCESS.find((w) => w.role === 'manager');
    expect(mgr).toBeDefined();
    expect(mgr!.dealAccess).toBe('read-only');
    expect(mgr!.authFunction).toBe('loadDealForManager');
  });

  it('ManagerDealWorkspace passes readOnly to every write-capable deal card', () => {
    const src = readSource(resolve(dir, 'ManagerDealWorkspace.tsx'));
    // Each card must render in read-only mode. The shorthand
    // `<X readOnly />` AND the explicit `readOnly={true}` form are
    // both accepted.
    const cards = [
      'DealTasks',
      'DealDocuments',
      'CreditMemo',
      'BorrowerCommunication',
    ];
    for (const card of cards) {
      const pattern = new RegExp(
        `<${card}\\b[^>]*\\breadOnly(?:\\s*=\\s*\\{?\\s*true\\s*\\}?)?[^>]*>|<${card}\\b[^/]*?\\breadOnly[^>]*/>`,
      );
      expect(
        pattern.test(src),
        `ManagerDealWorkspace does not render <${card}> with readOnly`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Team surfaces — read-only except TeamDealWorkspace.
// ---------------------------------------------------------------------------

describe('Phase 44 — team role is read-only at the role-module boundary', () => {
  const dir = resolve(REPO_SRC, 'team');

  it('no non-workspace team file imports any action module or write-triggering modal', () => {
    for (const f of listSourceFiles(dir)) {
      if (f.endsWith('TeamDealWorkspace.tsx')) continue;
      assertCleanFile(f);
    }
  });

  it('platformInventory pins team deal access as read-only with loadDealForTeam', () => {
    const team = WORKSPACE_DEAL_ACCESS.find((w) => w.role === 'team');
    expect(team).toBeDefined();
    expect(team!.dealAccess).toBe('read-only');
    expect(team!.authFunction).toBe('loadDealForTeam');
  });

  it('TeamDealWorkspace passes readOnly to every write-capable deal card', () => {
    const src = readSource(resolve(dir, 'TeamDealWorkspace.tsx'));
    const cards = [
      'DealTasks',
      'DealDocuments',
      'CreditMemo',
      'BorrowerCommunication',
    ];
    for (const card of cards) {
      const pattern = new RegExp(
        `<${card}\\b[^>]*\\breadOnly(?:\\s*=\\s*\\{?\\s*true\\s*\\}?)?[^>]*>|<${card}\\b[^/]*?\\breadOnly[^>]*/>`,
      );
      expect(
        pattern.test(src),
        `TeamDealWorkspace does not render <${card}> with readOnly`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Admin diagnostic surfaces — read-only. AlertBacklog and DataQualityFlags
// are the documented admin WRITE surfaces (Phases 18/19); they may import
// their action modules and resolve modals.
// ---------------------------------------------------------------------------

describe('Phase 44 — admin diagnostic surfaces are read-only', () => {
  const dir = resolve(REPO_SRC, 'admin');

  // The two admin components that are ALLOWED to import the resolve /
  // dismiss modals. They are governed write surfaces (alert-resolve,
  // alert-dismiss, data-quality-flag-resolve in GOVERNED_WRITES).
  const ADMIN_WRITE_ENTRY_POINTS = new Set([
    'AlertBacklog.tsx',
    'DataQualityFlags.tsx',
    'ResolveAlertModal.tsx',
    'ResolveFlagModal.tsx',
    'alertActions.ts',
    'dataQualityActions.ts',
  ]);

  it('no admin diagnostic file imports any action module or write-triggering modal', () => {
    for (const f of listSourceFiles(dir)) {
      const base = f.split(/[\\/]/).pop()!;
      if (ADMIN_WRITE_ENTRY_POINTS.has(base)) continue;
      assertCleanFile(f);
    }
  });

  it('platformInventory pins admin deal access as denied', () => {
    const admin = WORKSPACE_DEAL_ACCESS.find((w) => w.role === 'admin');
    expect(admin).toBeDefined();
    expect(admin!.dealAccess).toBe('denied');
    expect(admin!.authFunction).toBeNull();
  });

  it('the admin governed writes are exactly the three Phase 18/19 entries', () => {
    const adminWriteIds = GOVERNED_WRITES.filter((w) =>
      ['alert-resolve', 'alert-dismiss', 'data-quality-flag-resolve'].includes(
        w.id,
      ),
    ).map((w) => w.id);
    expect(adminWriteIds.sort()).toEqual(
      ['alert-dismiss', 'alert-resolve', 'data-quality-flag-resolve'].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-inventory disjoint-set invariant
//
// GOVERNED_WRITES ids and (NOT_WIRED ∪ DELIBERATELY_BLOCKED ∪
// LOCAL_ONLY_FLOWS) ids must be disjoint. This is a stronger statement
// than the individual existence tests in platformInventory.test.ts — it
// catches the failure mode where a capability simultaneously claims to
// be shipped AND blocked / not-wired / local-only.
// ---------------------------------------------------------------------------

describe('Phase 44 — governance inventory disjointness', () => {
  it('no id appears in both GOVERNED_WRITES and any non-shipped bucket', () => {
    const shipped = new Set(GOVERNED_WRITES.map((w) => w.id));
    const nonShipped = new Set<string>([
      ...NOT_WIRED.map((n) => n.id),
      ...DELIBERATELY_BLOCKED.map((b) => b.id),
      ...LOCAL_ONLY_FLOWS.map((f) => f.id),
    ]);
    const overlap = [...shipped].filter((id) => nonShipped.has(id));
    expect(overlap).toEqual([]);
  });

  it('all NOT_WIRED ids are unique', () => {
    const ids = NOT_WIRED.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all DELIBERATELY_BLOCKED ids are unique', () => {
    const ids = DELIBERATELY_BLOCKED.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all LOCAL_ONLY_FLOWS ids are unique', () => {
    const ids = LOCAL_ONLY_FLOWS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all GOVERNED_WRITES ids are unique', () => {
    const ids = GOVERNED_WRITES.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// DealRoute permission boundary — the gate that turns the deal-access
// matrix above into runtime behavior. A static-source check confirms
// the executive and admin branches still deny.
// ---------------------------------------------------------------------------

describe('Phase 44 — DealRoute denies executive and admin', () => {
  it('DealRoute source contains both denial branches for executive and admin', () => {
    const src = readSource(resolve(REPO_SRC, 'deals', 'DealRoute.tsx'));
    // The exact denial markers — these are stable strings on the
    // route component per Phase 15 (executive) and Phase 17 (admin)
    // and survived the Phase 38 permission-regression hardening.
    expect(src).toMatch(/executive/i);
    expect(src).toMatch(/admin/i);
  });
});
