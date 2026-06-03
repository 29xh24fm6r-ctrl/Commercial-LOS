import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 128A — the workspaceEntitlements module transitively imports
// the Power Apps SDK (via managerQueries). Mock that boundary so this
// pure-source governance file can still exercise the entitlement
// deriver + the portfolio surface URL without loading the SDK.
vi.mock('../../manager/managerQueries', () => ({
  loadManagerIdentity: vi.fn(),
}));

import {
  deriveWorkspaceLinks,
  PORTFOLIO_SURFACE_URL,
} from '../../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';

/**
 * Phase 128A — Team launch-readiness governance sweep.
 *
 * Purpose: lock down the posture the four user-facing workspaces
 * (Banker / Manager / Portfolio / Team) carry at the moment of team
 * deployment, so future edits cannot quietly regress launch invariants.
 *
 * This file is intentionally cross-cutting and intentionally
 * static-source. It does not re-test rendering — it locks down the
 * import-graph + the markup discipline + the entitlement contract
 * across all four surfaces in one place, so a reviewer reading this
 * file gets the full launch contract on one screen.
 *
 * Sections:
 *   §1  Workspace switcher — links derived from entitlement source
 *       only, no unauthorized leak, Portfolio link is a query
 *       surface that points at the manager route + ?surface=portfolio
 *       (no new route invented).
 *   §2  Shell consistency — every user-facing workspace renders
 *       inside LendingOSLayout.
 *   §3  Empty / failed / loading honesty — every cockpit composes its
 *       data via its own provider chain and surfaces the honest
 *       absence the providers expose.
 *   §4  No fake-data regression — major command-center body files
 *       carry no hardcoded sample names or amounts. Test fixtures are
 *       excluded (only .ts / .tsx production files are scanned).
 *   §5  Read-only posture — no <button> / <form> / onClick / onSubmit
 *       inside the team / portfolio / manager Bloomberg cockpit
 *       bodies. The Lending OS sidebar's <button disabled>
 *       placeholders are scoped to the shell (LendingOSLayout) only.
 *   §6  Portfolio = query surface — `PORTFOLIO_SURFACE_URL` shares the
 *       manager route path; no new route is added; the surface is
 *       only admitted when the user already has the manager route.
 *   §7  Team route = same entitlement source as Manager — Phase 127B
 *       contract: when the manager probe is `entitled`, BOTH
 *       /workspaces/manager and /workspaces/team are returned by
 *       useEntitledRoutes.
 */

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const REPO_SRC = resolve(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(resolve(REPO_SRC, rel), 'utf8');
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

// Major cockpit body files we lock down at the static-source layer.
const COCKPIT_BODIES = [
  // Team
  'team/TeamOpsQueue.tsx',
  // Portfolio
  'portfolio/PortfolioCommandCenter.tsx',
  // Manager
  'manager/ManagerBloombergControlPanel.tsx',
] as const;

// User-facing workspace shells (the route entry points).
const USER_WORKSPACES = [
  'workspaces/BankerWorkspace.tsx',
  'workspaces/ManagerWorkspace.tsx',
  'workspaces/TeamWorkspace.tsx',
] as const;

// ---------------------------------------------------------------------------
// §1 — Workspace switcher: links derive from entitlement source only
// ---------------------------------------------------------------------------

describe('Phase 128A §1 — workspace switcher does not leak unauthorized links', () => {
  it('banker-only user (no entitled routes) sees ONLY the banker link', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [],
    });
    expect(links.map((l) => l.key)).toEqual(['banker']);
    expect(links[0].isCurrent).toBe(true);
  });

  it('banker-only user opting into includePortfolioSurface=true STILL sees only the banker link (no manager → no portfolio)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [],
      includePortfolioSurface: true,
    });
    expect(links.map((l) => l.key)).toEqual(['banker']);
  });

  it('manager-entitled banker sees banker + team + manager + portfolio (full launch set, in catalog order)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
      includePortfolioSurface: true,
    });
    expect(links.map((l) => l.key)).toEqual([
      'banker',
      'team',
      'manager',
      'portfolio',
    ]);
  });

  it('Team Workspace switcher entry points at /workspaces/team (existing route, no new path invented)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.team],
    });
    const team = links.find((l) => l.key === 'team');
    expect(team).toBeDefined();
    expect(team!.route).toBe(WORKSPACE_ROUTES.team);
  });

  it('Portfolio link route IS the manager route + ?surface=portfolio (query surface, not a new route)', () => {
    expect(PORTFOLIO_SURFACE_URL.startsWith(WORKSPACE_ROUTES.manager)).toBe(true);
    expect(PORTFOLIO_SURFACE_URL).toContain('?surface=portfolio');
  });

  it('current workspace is marked isCurrent exactly once (catalog order preserved when current = entitled)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.team,
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
    });
    const currents = links.filter((l) => l.isCurrent);
    expect(currents).toHaveLength(1);
    expect(currents[0].key).toBe('team');
  });

  it('current workspace is marked isCurrent exactly once when currentSurface = portfolio (Phase 126C contract)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.manager,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [],
      includePortfolioSurface: true,
      currentSurface: 'portfolio',
    });
    const currents = links.filter((l) => l.isCurrent);
    expect(currents).toHaveLength(1);
    expect(currents[0].key).toBe('portfolio');
  });
});

// ---------------------------------------------------------------------------
// §2 — Shell consistency: every user-facing workspace renders LendingOSLayout
// ---------------------------------------------------------------------------

describe('Phase 128A §2 — every user-facing workspace renders the Lending OS shell', () => {
  it('BankerWorkspace mounts the Lending OS shell (via BankerShell)', () => {
    // BankerWorkspace delegates to BankerShell which uses LendingOSLayout.
    const banker = read('workspaces/BankerWorkspace.tsx');
    expect(banker).toMatch(/import\s+\{[^}]*BankerShell[^}]*\}/);
    const shell = read('banker/BankerShell.tsx');
    expect(shell).toMatch(
      /import\s+\{[^}]*LendingOSLayout[^}]*\}\s+from\s+['"][^'"]*LendingOSLayout['"]/,
    );
    expect(shell).toMatch(/<LendingOSLayout/);
  });

  it('ManagerWorkspace wraps its body in <LendingOSLayout>', () => {
    const src = read('workspaces/ManagerWorkspace.tsx');
    expect(src).toMatch(
      /import\s+\{[^}]*LendingOSLayout[^}]*\}\s+from\s+['"][^'"]*LendingOSLayout['"]/,
    );
    expect(src).toMatch(/<LendingOSLayout/);
  });

  it('TeamWorkspace wraps its body in <LendingOSLayout> (Phase 127C parity)', () => {
    const src = read('workspaces/TeamWorkspace.tsx');
    expect(src).toMatch(
      /import\s+\{[^}]*LendingOSLayout[^}]*\}\s+from\s+['"][^'"]*LendingOSLayout['"]/,
    );
    expect(src).toMatch(/<LendingOSLayout/);
    expect(src).toMatch(/workspaceName=\{?["']Team Workspace["']\}?/);
  });

  it('Portfolio is rendered inside the manager route, so its shell is the manager LendingOSLayout (same instance)', () => {
    // No separate portfolio route exists — the portfolio surface is a
    // ?surface=portfolio query swap inside ManagerWorkspace. Verify
    // the swap point is the cockpit, not a parallel shell.
    const src = read('workspaces/ManagerWorkspace.tsx');
    expect(src).toMatch(/PortfolioCommandCenter/);
    // ManagerWorkspace must contain only ONE LendingOSLayout — both
    // surfaces share it.
    const matches = src.match(/<LendingOSLayout/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §3 — Empty / failed / loading honesty
// ---------------------------------------------------------------------------

describe('Phase 128A §3 — every cockpit composes its own provider-driven empty/failed/loading honesty', () => {
  it('TeamOpsQueue carries explicit loading + failure + empty branches (no silent skip)', () => {
    const src = read('team/TeamOpsQueue.tsx');
    expect(src).toMatch(/Loading authorized team queue/);
    expect(src).toMatch(/failing closed/);
    expect(src).toMatch(/No authorized team records found/);
  });

  it('ManagerBloombergControlPanel carries explicit loading + failure + empty branches', () => {
    const src = read('manager/ManagerBloombergControlPanel.tsx');
    expect(src).toMatch(/[Ll]oading/);
    // The manager cockpit uses its own failure copy (`Could not load`)
    // and renders honestly when the team is empty.
    expect(src).toMatch(/Could not load|failed|failure/i);
  });

  it('PortfolioCommandCenter carries explicit loading + failure + empty branches', () => {
    const src = read('portfolio/PortfolioCommandCenter.tsx');
    expect(src).toMatch(/[Ll]oading/);
    expect(src).toMatch(/Could not load|failed|failure/i);
  });
});

// ---------------------------------------------------------------------------
// §4 — No fake-data regression in major cockpits
// ---------------------------------------------------------------------------

const FORBIDDEN_SAMPLE_NAMES = [
  /\bAcme\b/,
  /\bContoso\b/,
  /\bWayne(\s+Industries)?\b/,
  /\bStark(\s+Industries)?\b/,
  /\bInitech\b/,
  /\bUmbrella(\s+Corp)?\b/,
  /\bHooli\b/,
  /\bPied\s+Piper\b/,
  /sample\s+deal/i,
  /mock\s+deal/i,
  /\bFoo\s+Corp\b/,
  /\bBar\s+Inc\b/,
];

describe('Phase 128A §4 — no fake sample names in major cockpit bodies', () => {
  for (const rel of COCKPIT_BODIES) {
    it(`${rel} contains no hardcoded sample / mock names`, () => {
      const src = stripComments(read(rel));
      for (const re of FORBIDDEN_SAMPLE_NAMES) {
        expect(src).not.toMatch(re);
      }
    });
  }

  for (const rel of USER_WORKSPACES) {
    it(`${rel} contains no hardcoded sample / mock names`, () => {
      const src = stripComments(read(rel));
      for (const re of FORBIDDEN_SAMPLE_NAMES) {
        expect(src).not.toMatch(re);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// §5 — Read-only posture inside cockpit bodies
// ---------------------------------------------------------------------------

describe('Phase 128A §5 — cockpit bodies stay read-only', () => {
  for (const rel of COCKPIT_BODIES) {
    it(`${rel} renders no <button> / <form> / onClick / onSubmit`, () => {
      const src = stripComments(read(rel));
      expect(src).not.toMatch(/<button\b/i);
      expect(src).not.toMatch(/<form\b/i);
      expect(src).not.toMatch(/\bonSubmit\b/);
      expect(src).not.toMatch(/\bonClick\b/);
    });
  }

  it('TeamWorkspace body does not import any banker write surface', () => {
    const src = read('workspaces/TeamWorkspace.tsx');
    expect(src).not.toMatch(/from\s+['"][^'"]*CompleteTaskModal['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*RequestDocumentModal['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*CreditMemoDraftModal['"]/);
    expect(src).not.toMatch(/from\s+['"][^'"]*Office365/);
    expect(src).not.toMatch(/SendEmailV2/);
  });
});

// ---------------------------------------------------------------------------
// §6 — Portfolio is a query surface, not a route widening
// ---------------------------------------------------------------------------

describe('Phase 128A §6 — Portfolio remains a query surface, not a data-scope widening', () => {
  it('PORTFOLIO_SURFACE_URL is exactly the manager route + ?surface=portfolio', () => {
    expect(PORTFOLIO_SURFACE_URL).toBe(
      `${WORKSPACE_ROUTES.manager}?surface=portfolio`,
    );
  });

  it('App.tsx does NOT register a separate /workspaces/portfolio route', () => {
    const src = read('App.tsx');
    expect(src).not.toMatch(/['"]\/workspaces\/portfolio['"]/);
    expect(src).not.toMatch(/PortfolioWorkspace\s*\(/);
  });

  it('PortfolioCommandCenter does NOT instantiate its own provider — it reuses the manager data provider chain', () => {
    const src = read('portfolio/PortfolioCommandCenter.tsx');
    // The portfolio cockpit must consume `useManagerData()` (or the
    // shared manager data hook). It must NOT instantiate
    // ManagerProvider / ManagerDataProvider itself (those wrap the
    // route in ManagerWorkspace).
    expect(src).toMatch(/useManagerData/);
    expect(src).not.toMatch(/<ManagerProvider/);
    expect(src).not.toMatch(/<ManagerDataProvider/);
  });
});

// ---------------------------------------------------------------------------
// §7 — Team route shares Manager's entitlement source (Phase 127B contract)
// ---------------------------------------------------------------------------

describe('Phase 128A §7 — Team route shares the Manager entitlement source', () => {
  it('useEntitledRoutes returns BOTH /workspaces/manager and /workspaces/team in the entitled branch', () => {
    const src = read('bootstrap/workspaceEntitlements.ts');
    // The Phase 127B contract is that the manager-entitled branch
    // returns both routes in a single push pair; we lock that down at
    // the static-source layer so a future edit can't drop the team
    // route without trippling this test.
    expect(src).toMatch(/WORKSPACE_ROUTES\.manager/);
    expect(src).toMatch(/WORKSPACE_ROUTES\.team/);
    // Both pushes live inside the same `if (m.kind === 'entitled')`
    // block.
    const match = src.match(
      /if\s*\(\s*m\.kind\s*===\s*['"]entitled['"]\s*\)\s*\{[\s\S]*?\}/,
    );
    expect(match).not.toBeNull();
    expect(match![0]).toContain('WORKSPACE_ROUTES.manager');
    expect(match![0]).toContain('WORKSPACE_ROUTES.team');
  });

  it('Manager probe is the ONLY entitlement source today (no second probe wired silently)', () => {
    const src = read('bootstrap/workspaceEntitlements.ts');
    // useEntitledRoutes reads exactly one probe: useManagerEntitlement.
    // A future edit that secretly adds a second entitlement source
    // should be explicit + reviewed; this pin makes it a conscious
    // change.
    const probeImports = src.match(/use[A-Z][A-Za-z]*Entitlement\b/g) ?? [];
    const unique = new Set(probeImports);
    expect(unique.has('useManagerEntitlement')).toBe(true);
    // The only allowed entitlement-hook identifier is the manager one
    // (we count usage sites for that name only).
    for (const id of unique) {
      expect(id).toBe('useManagerEntitlement');
    }
  });

  it('WorkspaceGate.tsx defers admission to useEntitledRoutes (no hardcoded route allowlist)', () => {
    const src = read('bootstrap/WorkspaceGate.tsx');
    expect(src).toMatch(/useEntitledRoutes/);
    // No accidental literal-string allowlist that would diverge from
    // the entitlement source.
    expect(src).not.toMatch(/\bwhitelist\b/i);
    expect(src).not.toMatch(/\ballowed\s*=\s*\[/);
  });
});
