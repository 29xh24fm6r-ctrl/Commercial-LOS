import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// workspaceEntitlements imports loadManagerIdentity → the Power Apps SDK
// data layer. We only exercise the PURE derivers here, so stub the probe
// to keep the SDK import chain (and its native deps) out of this suite.
vi.mock('../manager/managerQueries', () => ({ loadManagerIdentity: vi.fn() }));

import {
  deriveWorkspaceLinks,
  PORTFOLIO_SURFACE_URL,
} from '../bootstrap/workspaceEntitlements';
import {
  WORKSPACE_ROUTES,
  resolveWorkspaceRoute,
} from '../bootstrap/workspaceRoutes';

/**
 * Phase 136A — Cross-workspace final parity smoke.
 *
 * A single tripwire that the Executive finish (Phases 133–135) did not
 * drift the broader Banker / Manager / Portfolio / Team / Executive demo
 * story. Per-workspace render + per-phase entitlement behavior is pinned
 * elsewhere (BankerWorkspace / ManagerWorkspace / TeamWorkspace /
 * ExecutiveWorkspace / PortfolioCommandCenter / WorkspaceGate /
 * workspaceEntitlements tests). This file consolidates the
 * cross-cutting invariants that should move together as one regression
 * surface:
 *   1. every workspace shell still mounts its lead cockpit;
 *   2. access derivation stays honest across all five primaries;
 *   3. no shell or cockpit grew a write affordance or live connector.
 *
 * Pure (no jsdom): static-source reads + pure-deriver calls only.
 */

const ROOT = resolve(__dirname, '..');
function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}
/** Comment-stripped copy so doc-comment vocabulary (which names the
 *  forbidden patterns as non-goals) does not trip the scans. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const SHELLS: Record<string, string> = {
  banker: 'workspaces/BankerWorkspace.tsx',
  manager: 'workspaces/ManagerWorkspace.tsx',
  team: 'workspaces/TeamWorkspace.tsx',
  executive: 'workspaces/ExecutiveWorkspace.tsx',
  portfolio: 'portfolio/PortfolioCommandCenter.tsx',
};

// ---------------------------------------------------------------------------
// 1. Every workspace shell still mounts its lead cockpit
// ---------------------------------------------------------------------------

describe('Phase 136A — each workspace still renders its shell/cockpit path', () => {
  it('Banker route mounts the BankerShell cockpit path', () => {
    expect(read(SHELLS.banker)).toMatch(/<BankerShell/);
  });

  it('Manager route mounts the Manager Bloomberg Control Panel (and the Portfolio cockpit on the surface marker)', () => {
    const src = read(SHELLS.manager);
    expect(src).toMatch(/<ManagerBloombergControlPanel\s*\/>/);
    expect(src).toMatch(/<PortfolioCommandCenter\s*\/>/);
  });

  it('Team route mounts the Team Ops Queue FIRST (before the other team cards)', () => {
    const src = read(SHELLS.team);
    const ops = src.indexOf('<TeamOpsQueue');
    const shared = src.indexOf('<SharedWorkQueue');
    expect(ops).toBeGreaterThan(-1);
    expect(shared).toBeGreaterThan(ops);
  });

  it('Executive route mounts the Executive Command Center FIRST (before the legacy detail cards)', () => {
    const src = read(SHELLS.executive);
    const cockpit = src.indexOf('<ExecutiveCommandCenter');
    const detail = src.indexOf('<PortfolioSummary');
    expect(cockpit).toBeGreaterThan(-1);
    expect(detail).toBeGreaterThan(cockpit);
  });

  it('Portfolio cockpit exposes its labelled command-center surface', () => {
    const src = read(SHELLS.portfolio);
    expect(src).toMatch(/aria-label="Portfolio Command Center"/);
    expect(src).toMatch(/data-portfolio-cockpit="command-center"/);
  });
});

// ---------------------------------------------------------------------------
// 2. Access derivation stays honest across all five primaries
// ---------------------------------------------------------------------------

describe('Phase 136A — Executive access comes ONLY from the primary workspace name', () => {
  const PRIMARY_NAMES = [
    'Banker Workspace',
    'Team Workspace',
    'Manager Command Center',
    'Portfolio Management',
    'Executive Dashboard',
  ] as const;

  it('the executive link appears for a primary iff that primary is "Executive Dashboard"', () => {
    for (const name of PRIMARY_NAMES) {
      const route = resolveWorkspaceRoute(name);
      expect(route).not.toBeNull();
      const links = deriveWorkspaceLinks({
        bootstrapRoute: route!,
        currentRoute: route!,
        entitledRoutes: [],
        includePortfolioSurface: true,
      });
      const hasExecutive = links.some((l) => l.key === 'executive');
      expect(hasExecutive).toBe(name === 'Executive Dashboard');
    }
  });

  it('manager + team + portfolio entitlement never synthesizes an Executive link (no proxy)', () => {
    // A banker-bootstrap user who is manager-entitled (so team is admitted
    // too) and viewing the portfolio surface still gets NO executive link.
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
      includePortfolioSurface: true,
      currentSurface: 'portfolio',
    });
    const keys = links.map((l) => l.key);
    expect(keys).toContain('manager');
    expect(keys).toContain('team');
    expect(keys).toContain('portfolio');
    expect(keys).not.toContain('executive');
  });

  it('Portfolio remains a query marker on the manager route — not a new route', () => {
    // No portfolio entry in the route table…
    expect('portfolio' in WORKSPACE_ROUTES).toBe(false);
    // …and the portfolio link reuses the manager route + the surface query.
    expect(PORTFOLIO_SURFACE_URL).toBe('/workspaces/manager?surface=portfolio');
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.manager,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [],
      includePortfolioSurface: true,
    });
    const portfolio = links.find((l) => l.key === 'portfolio');
    expect(portfolio?.route).toBe('/workspaces/manager?surface=portfolio');
  });

  it('useEntitledRoutes never pushes the executive route (static source — manager entitlement is not an executive proxy)', () => {
    const src = code('bootstrap/workspaceEntitlements.ts');
    // The only routes ever pushed are manager + team.
    expect(src).toMatch(/routes\.push\(WORKSPACE_ROUTES\.manager\)/);
    expect(src).toMatch(/routes\.push\(WORKSPACE_ROUTES\.team\)/);
    expect(src).not.toMatch(/routes\.push\(WORKSPACE_ROUTES\.executive\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. No shell or cockpit grew a write affordance or live connector
// ---------------------------------------------------------------------------

describe('Phase 136A — no workspace shell or cockpit added a write affordance', () => {
  for (const [name, rel] of Object.entries(SHELLS)) {
    it(`${name} surface carries no write affordance / write-surface import`, () => {
      const c = code(rel);
      expect(c, `${name}: <form>`).not.toMatch(/<form\b/i);
      expect(c, `${name}: onSubmit`).not.toMatch(/\bonSubmit\b/);
      expect(c, `${name}: SendEmail`).not.toMatch(/SendEmail/i);
      expect(c, `${name}: Office365`).not.toMatch(/Office365/i);
      expect(c, `${name}: Graph`).not.toMatch(/microsoft-graph|graph\.microsoft/i);
      expect(c, `${name}: generated write import`).not.toMatch(
        /from ['"][^'"]*\/generated\//,
      );
    });
  }
});

describe('Phase 136A — Copilot stays governed (not-configured by default, no live connector)', () => {
  // The two cockpits that surface a Copilot panel obtain proposals ONLY
  // through the governed connector accessor, whose default posture is
  // not_configured. They must not import or construct a live connector.
  for (const rel of [SHELLS.portfolio, 'executive/ExecutiveCommandCenter.tsx']) {
    it(`${rel} routes Copilot only through the governed getCopilotConnector()`, () => {
      const c = code(rel);
      expect(c).toMatch(/getCopilotConnector\(\)/);
      // No direct live-provider wiring in the cockpit.
      expect(c).not.toMatch(/\bnew\s+OpenAI\b/);
      expect(c).not.toMatch(/api\.openai\.com|openai\.azure\.com/i);
      expect(c).not.toMatch(/\bfetch\(/);
    });
  }
});
