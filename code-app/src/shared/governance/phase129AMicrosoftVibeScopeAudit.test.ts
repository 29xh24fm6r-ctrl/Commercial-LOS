import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The workspaceEntitlements / workspaceRoutes import graph is pure for
// what we touch here, but other governance siblings mock the SDK
// boundary defensively; resolveWorkspaceRoute itself has no SDK
// dependency. We still mock managerQueries in case the resolver module
// graph widens later.
vi.mock('../../manager/managerQueries', () => ({
  loadManagerIdentity: vi.fn(),
}));

import {
  WORKSPACE_ROUTES,
  resolveWorkspaceRoute,
  isPortfolioWorkspaceName,
} from '../../bootstrap/workspaceRoutes';
import {
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
  DELIBERATELY_BLOCKED,
} from './platformInventory';

/**
 * Phase 129A — Microsoft Vibe scope completion audit, governance pins.
 *
 * Locks the verifiable claims in
 * docs/PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md so the completion
 * matrix cannot silently drift from the code:
 *
 *   §1  All six live Platform Workspace names resolve to a route
 *       (no dead workspace name, none fall through to fail-closed).
 *   §2  The route table has exactly the five physical workspace routes
 *       + the per-deal route; Portfolio is a query surface, NOT a
 *       separate route.
 *   §3  The per-deal cockpit dispatcher admits banker/manager/team and
 *       denies executive/admin (deliberate governance denial).
 *   §4  Borrower / relationship surfaces are CARDS hosted in existing
 *       workspaces, not standalone routes; the borrower portal is the
 *       one required-but-unbuilt surface (tracked NOT_WIRED).
 *   §5  Governance counts match the numbers the audit doc cites
 *       (12 / 16 / 8 / 1), and the doc cites them verbatim.
 *
 * This file is static-source + pure-function only. It does not render.
 */

const REPO_SRC = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(REPO_SRC, '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_SRC, rel), 'utf8');
}
function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// The six live Platform Workspace names seeded in the deployed env
// (Phase 113 / 115 / 116). The audit's §2 contract is that EVERY one
// resolves to a real route.
const LIVE_WORKSPACE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Banker Workspace', WORKSPACE_ROUTES.banker],
  ['Team Workspace', WORKSPACE_ROUTES.team],
  ['Manager Command Center', WORKSPACE_ROUTES.manager],
  ['Portfolio Management', WORKSPACE_ROUTES.manager],
  ['Executive Dashboard', WORKSPACE_ROUTES.executive],
  ['Admin Control Center', WORKSPACE_ROUTES.admin],
];

// Audit-cited governance counts. Kept in one place so a drift trips
// both the count assertion AND the doc-citation assertion.
const AUDIT_COUNTS = Object.freeze({
  governedWrites: 13,
  localOnlyFlows: 16,
  notWired: 9,
  deliberatelyBlocked: 1,
});

const AUDIT_DOC = 'docs/PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md';

// ---------------------------------------------------------------------------
// §1 — every live workspace name resolves (no dead name)
// ---------------------------------------------------------------------------

describe('Phase 129A §1 — all six live Platform Workspace names resolve to a route', () => {
  for (const [name, route] of LIVE_WORKSPACE_NAMES) {
    it(`'${name}' resolves to ${route}`, () => {
      expect(resolveWorkspaceRoute(name)).toBe(route);
    });
  }

  it('all six resolve (none fail closed)', () => {
    const resolved = LIVE_WORKSPACE_NAMES.map(([n]) => resolveWorkspaceRoute(n));
    expect(resolved.every((r) => r !== null)).toBe(true);
    expect(resolved).toHaveLength(6);
  });

  it("'Portfolio Management' is recognized as a portfolio surface name (cockpit swap), and resolves to the manager route", () => {
    expect(isPortfolioWorkspaceName('Portfolio Management')).toBe(true);
    expect(resolveWorkspaceRoute('Portfolio Management')).toBe(
      WORKSPACE_ROUTES.manager,
    );
    // The manager name is NOT a portfolio name even though it shares
    // the route — the two cockpits co-exist behind one route.
    expect(isPortfolioWorkspaceName('Manager Command Center')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §2 — five physical routes + per-deal route; portfolio is not a route
// ---------------------------------------------------------------------------

describe('Phase 129A §2 — route table matches the audit (5 routes + per-deal, no portfolio route)', () => {
  it('WORKSPACE_ROUTES has exactly the five physical workspace routes', () => {
    expect(Object.keys(WORKSPACE_ROUTES).sort()).toEqual([
      'admin',
      'banker',
      'executive',
      'manager',
      'team',
    ]);
  });

  it('App.tsx registers each of the five workspace routes + the per-deal route', () => {
    const app = readSrc('App.tsx');
    // App.tsx references routes through the WORKSPACE_ROUTES constant
    // (not literal path strings), so assert the typed reference per key.
    for (const key of Object.keys(WORKSPACE_ROUTES)) {
      expect(app).toContain(`WORKSPACE_ROUTES.${key}`);
    }
    expect(app).toMatch(/path="\/deals\/:dealId"/);
  });

  it('App.tsx registers NO separate /workspaces/portfolio route', () => {
    const app = readSrc('App.tsx');
    expect(app).not.toMatch(/['"]\/workspaces\/portfolio['"]/);
    expect(app).not.toMatch(/<PortfolioWorkspace\b/);
  });

  it('Portfolio is swapped into the manager route by name (no route widening)', () => {
    const mgr = readSrc('workspaces/ManagerWorkspace.tsx');
    expect(mgr).toMatch(/PortfolioCommandCenter/);
    expect(mgr).toMatch(/isPortfolioWorkspaceName|surface=portfolio|PORTFOLIO_SURFACE_PARAM_VALUE/);
  });
});

// ---------------------------------------------------------------------------
// §3 — per-deal cockpit dispatcher admits banker/manager/team, denies exec/admin
// ---------------------------------------------------------------------------

describe('Phase 129A §3 — per-deal cockpit reachability matches the audit', () => {
  const dealRoute = readSrc('deals/DealRoute.tsx');

  it('dispatches the banker, manager, and team deal workspaces', () => {
    expect(dealRoute).toMatch(/BankerDealWorkspace/);
    expect(dealRoute).toMatch(/ManagerDealWorkspace/);
    expect(dealRoute).toMatch(/TeamDealWorkspace/);
  });

  it('branches on the banker, manager, and team routes', () => {
    expect(dealRoute).toMatch(/WORKSPACE_ROUTES\.banker/);
    expect(dealRoute).toMatch(/WORKSPACE_ROUTES\.manager/);
    expect(dealRoute).toMatch(/WORKSPACE_ROUTES\.team/);
  });

  it('does NOT wire an executive or admin deal workspace (deliberate denial)', () => {
    expect(dealRoute).not.toMatch(/ExecutiveDealWorkspace/);
    expect(dealRoute).not.toMatch(/AdminDealWorkspace/);
    // The fall-through is an explicit access-denied state.
    expect(dealRoute).toMatch(/Access denied/);
  });
});

// ---------------------------------------------------------------------------
// §4 — borrower / relationship surfaces are cards, portal is unbuilt
// ---------------------------------------------------------------------------

describe('Phase 129A §4 — borrower / relationship surfaces are cards, not routes', () => {
  it('relationship + borrower-communication surfaces are component files, with no dedicated route', () => {
    // They exist as cards…
    expect(() => readSrc('banker/RelationshipMemory.tsx')).not.toThrow();
    expect(() => readSrc('deals/RelationshipContext.tsx')).not.toThrow();
    expect(() => readSrc('deals/BorrowerCommunication.tsx')).not.toThrow();
    // …but no route is registered for them.
    const app = readSrc('App.tsx');
    expect(app).not.toMatch(/workspaces\/(borrower|client|relationship)/);
  });

  it('the borrower portal is the one required-but-unbuilt surface (tracked NOT_WIRED, not silently dropped)', () => {
    const portal = NOT_WIRED.find((e) => e.id === 'borrower-portal');
    expect(portal).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// §5 — governance counts match the audit and are cited in the doc
// ---------------------------------------------------------------------------

describe('Phase 129A §5 — governance counts match the audit doc citations', () => {
  it('inventory counts equal the audit numbers (12 / 16 / 8 / 1)', () => {
    expect(GOVERNED_WRITES.length).toBe(AUDIT_COUNTS.governedWrites);
    expect(LOCAL_ONLY_FLOWS.length).toBe(AUDIT_COUNTS.localOnlyFlows);
    expect(NOT_WIRED.length).toBe(AUDIT_COUNTS.notWired);
    expect(DELIBERATELY_BLOCKED.length).toBe(AUDIT_COUNTS.deliberatelyBlocked);
  });

  it('the audit doc cites the same counts (doc/code kept in sync)', () => {
    const doc = readDoc(AUDIT_DOC);
    expect(doc).toMatch(
      new RegExp(`GOVERNED_WRITES\\s*=\\s*${AUDIT_COUNTS.governedWrites}`),
    );
    expect(doc).toMatch(
      new RegExp(`LOCAL_ONLY_FLOWS\\s*=\\s*${AUDIT_COUNTS.localOnlyFlows}`),
    );
    expect(doc).toMatch(
      new RegExp(`NOT_WIRED\\s*=\\s*${AUDIT_COUNTS.notWired}`),
    );
    expect(doc).toMatch(
      new RegExp(
        `DELIBERATELY_BLOCKED\\s*=\\s*${AUDIT_COUNTS.deliberatelyBlocked}`,
      ),
    );
  });

  it('the audit doc enumerates all six live workspace names', () => {
    const doc = readDoc(AUDIT_DOC);
    for (const [name] of LIVE_WORKSPACE_NAMES) {
      expect(doc).toContain(name);
    }
  });
});
