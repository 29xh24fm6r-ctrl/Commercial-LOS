import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  WORKSPACE_SCREENS,
  getWorkspaceScreen,
  getWorkspaceScreensForRole,
  type WorkspaceScreen,
  type WorkspaceScreenId,
  type WorkspaceScreenRole,
} from './workspaceScreens';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 123A — workspaceScreens registry tests.
 *
 * Pins:
 *   - the canonical five screens are present (banker / manager /
 *     portfolio / team / executive) and no others;
 *   - every route value matches WORKSPACE_ROUTES[workspaceKey]
 *     (so a route rename in workspaceRoutes.ts cascades automatically);
 *   - Portfolio Command Center deliberately resolves to the manager
 *     route per the Phase 116 explicit alias decision;
 *   - role and workspaceKey assignments are stable;
 *   - consumesPerDealViewModel is true only for the single-deal
 *     banker cockpit; roll-up surfaces are false;
 *   - registry has no hardcoded sample / mock deal or borrower
 *     names — descriptions describe the role, not test data;
 *   - getWorkspaceScreen / getWorkspaceScreensForRole behave;
 *   - module is metadata-only: no SDK / service / fetch imports.
 */

const EXPECTED_IDS: ReadonlyArray<WorkspaceScreenId> = [
  'banker-command-center',
  'manager-control-panel',
  'portfolio-command-center',
  'team-exceptions',
  'executive-snapshot',
];

function byId(id: WorkspaceScreenId): WorkspaceScreen {
  const found = WORKSPACE_SCREENS.find((s) => s.id === id);
  if (!found) throw new Error(`Expected screen ${id} in registry`);
  return found;
}

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

describe('Phase 123A — workspaceScreens registry shape', () => {
  it('exposes exactly the five canonical screens', () => {
    const ids = WORKSPACE_SCREENS.map((s) => s.id);
    expect(ids).toEqual(EXPECTED_IDS);
  });

  it('every entry carries id / label / role / workspaceKey / route / description / consumesPerDealViewModel', () => {
    for (const screen of WORKSPACE_SCREENS) {
      expect(typeof screen.id).toBe('string');
      expect(typeof screen.label).toBe('string');
      expect(screen.label.length).toBeGreaterThan(0);
      expect(typeof screen.role).toBe('string');
      expect(typeof screen.workspaceKey).toBe('string');
      expect(typeof screen.route).toBe('string');
      expect(screen.route.startsWith('/workspaces/')).toBe(true);
      expect(typeof screen.description).toBe('string');
      expect(screen.description.length).toBeGreaterThan(0);
      expect(typeof screen.consumesPerDealViewModel).toBe('boolean');
    }
  });

  it('the registry array is frozen at module load', () => {
    expect(Object.isFrozen(WORKSPACE_SCREENS)).toBe(true);
  });

  it('ids are unique', () => {
    const ids = WORKSPACE_SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('labels are unique', () => {
    const labels = WORKSPACE_SCREENS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ---------------------------------------------------------------------------
// Route consistency with WORKSPACE_ROUTES (Phase 116 alias decision included)
// ---------------------------------------------------------------------------

describe('Phase 123A — route consistency with WORKSPACE_ROUTES', () => {
  it('every screen.route equals WORKSPACE_ROUTES[screen.workspaceKey]', () => {
    for (const screen of WORKSPACE_SCREENS) {
      expect(screen.route).toBe(WORKSPACE_ROUTES[screen.workspaceKey]);
    }
  });

  it('Banker Command Center points at the banker workspace', () => {
    const s = byId('banker-command-center');
    expect(s.workspaceKey).toBe('banker');
    expect(s.route).toBe(WORKSPACE_ROUTES.banker);
  });

  it('Manager Control Panel points at the manager workspace', () => {
    const s = byId('manager-control-panel');
    expect(s.workspaceKey).toBe('manager');
    expect(s.route).toBe(WORKSPACE_ROUTES.manager);
  });

  it('Portfolio Command Center resolves to the Manager Command Center per the Phase 116 alias decision', () => {
    const s = byId('portfolio-command-center');
    expect(s.workspaceKey).toBe('manager');
    expect(s.route).toBe(WORKSPACE_ROUTES.manager);
  });

  it('Team Work Queue points at the team workspace', () => {
    const s = byId('team-exceptions');
    expect(s.workspaceKey).toBe('team');
    expect(s.route).toBe(WORKSPACE_ROUTES.team);
  });

  it('Executive Pipeline Snapshot points at the executive workspace', () => {
    const s = byId('executive-snapshot');
    expect(s.workspaceKey).toBe('executive');
    expect(s.route).toBe(WORKSPACE_ROUTES.executive);
  });
});

// ---------------------------------------------------------------------------
// Role assignments + per-deal view-model flag
// ---------------------------------------------------------------------------

describe('Phase 123A — roles + per-deal view-model flag', () => {
  it('roles assigned per screen', () => {
    expect(byId('banker-command-center').role).toBe('banker');
    expect(byId('manager-control-panel').role).toBe('manager');
    expect(byId('portfolio-command-center').role).toBe('manager');
    expect(byId('team-exceptions').role).toBe('team');
    expect(byId('executive-snapshot').role).toBe('executive');
  });

  it('only the banker cockpit consumes the per-deal view-model directly', () => {
    expect(byId('banker-command-center').consumesPerDealViewModel).toBe(true);
    expect(byId('manager-control-panel').consumesPerDealViewModel).toBe(false);
    expect(byId('portfolio-command-center').consumesPerDealViewModel).toBe(false);
    expect(byId('team-exceptions').consumesPerDealViewModel).toBe(false);
    expect(byId('executive-snapshot').consumesPerDealViewModel).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('Phase 123A — getWorkspaceScreen + getWorkspaceScreensForRole', () => {
  it('getWorkspaceScreen returns the matching screen', () => {
    const s = getWorkspaceScreen('team-exceptions');
    expect(s?.id).toBe('team-exceptions');
    expect(s?.label).toContain('Team Work Queue');
  });

  it('getWorkspaceScreen returns undefined for an unknown id', () => {
    const s = getWorkspaceScreen('nope' as WorkspaceScreenId);
    expect(s).toBeUndefined();
  });

  it('getWorkspaceScreensForRole returns the two manager-role screens (manager + portfolio)', () => {
    const ms = getWorkspaceScreensForRole('manager');
    const ids = ms.map((s) => s.id);
    expect(ids).toEqual(['manager-control-panel', 'portfolio-command-center']);
  });

  it('getWorkspaceScreensForRole returns the singleton banker / team / executive screens', () => {
    expect(getWorkspaceScreensForRole('banker').map((s) => s.id)).toEqual([
      'banker-command-center',
    ]);
    expect(getWorkspaceScreensForRole('team').map((s) => s.id)).toEqual([
      'team-exceptions',
    ]);
    expect(getWorkspaceScreensForRole('executive').map((s) => s.id)).toEqual([
      'executive-snapshot',
    ]);
  });

  it('getWorkspaceScreensForRole returns an empty array for an unknown role', () => {
    const result = getWorkspaceScreensForRole('admin' as WorkspaceScreenRole);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

describe('Phase 123A — static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'workspaceScreens.ts'),
    'utf8',
  );
  // Strip block + line comments for scans whose intent is the code,
  // not the documentation.
  const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports no SDK / service modules (metadata-only)', () => {
    expect(sourceCode).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(sourceCode).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
    expect(sourceCode).not.toMatch(/PowerProvider/);
  });

  it('contains no fetch / network call', () => {
    expect(sourceCode).not.toMatch(/\bfetch\s*\(/);
    expect(sourceCode).not.toMatch(/XMLHttpRequest/);
    expect(sourceCode).not.toMatch(/axios/);
  });

  it('routes are sourced from WORKSPACE_ROUTES (no hardcoded route strings)', () => {
    // The five entries must each use WORKSPACE_ROUTES[...] for their route value.
    // Allow the import statement itself.
    expect(source).toMatch(
      /import\s+\{\s*WORKSPACE_ROUTES[^}]*\}\s+from\s+['"]\.\.\/bootstrap\/workspaceRoutes['"]/,
    );
    const routeMatches = sourceCode.match(/route:\s*WORKSPACE_ROUTES\./g) ?? [];
    expect(routeMatches.length).toBe(5);
    // And no literal /workspaces/<x> string appears in the code.
    expect(sourceCode).not.toMatch(/['"]\/workspaces\//);
  });

  it('contains no hardcoded borrower / sample-deal names', () => {
    // Descriptions reference the ROLE the screen serves, never a
    // specific borrower, deal name, or test record.
    expect(sourceCode).not.toMatch(/\bAcme\b/i);
    expect(sourceCode).not.toMatch(/\bContoso\b/i);
    expect(sourceCode).not.toMatch(/\bTEST\s+deal\b/i);
    expect(sourceCode).not.toMatch(/sample\s+deal/i);
    expect(sourceCode).not.toMatch(/mock\s+deal/i);
  });

  it('the five canonical ids are pinned verbatim in the source', () => {
    for (const id of EXPECTED_IDS) {
      expect(sourceCode).toContain(`'${id}'`);
    }
  });

  it('pins the Phase 116 portfolio→manager alias decision in source comments', () => {
    // Intentionally scans the full source — this is the one pin
    // that lives in JSDoc by design.
    expect(source).toMatch(/Phase\s+116/);
    expect(source).toMatch(/Portfolio/i);
  });
});
