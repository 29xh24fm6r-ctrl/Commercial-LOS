// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  deriveWorkspaceLinks,
  _resetWorkspaceEntitlementCacheForTests,
  useManagerEntitlement,
  useEntitledRoutes,
} from './workspaceEntitlements';
import { WORKSPACE_ROUTES, resolveWorkspaceRoute } from './workspaceRoutes';
import { BootstrapProvider } from './BootstrapContext';
import type { BootstrapResult } from './bootstrapFlow';

/**
 * Phase 124C — workspaceEntitlements tests.
 *
 * Pins:
 *   - deriveWorkspaceLinks: bootstrap-primary route always present;
 *     entitled additional routes appended in catalog order; isCurrent
 *     toggled by currentRoute; duplicates collapsed honestly;
 *   - useManagerEntitlement: cache shared at module level (one
 *     loadManagerIdentity call per upn); fires for new upn; surfaces
 *     'ready' as entitled, 'not-banker' / 'no-team' as not-entitled,
 *     'failed' / throws as failed;
 *   - useEntitledRoutes: returns 'loading' until probe settles;
 *     manager route appears iff probe returns entitled.
 */

// ---------------------------------------------------------------------------
// Mock loadManagerIdentity
// ---------------------------------------------------------------------------

const { loadManagerIdentityMock } = vi.hoisted(() => ({
  loadManagerIdentityMock: vi.fn(),
}));

vi.mock('../manager/managerQueries', () => ({
  loadManagerIdentity: loadManagerIdentityMock,
}));

beforeEach(() => {
  loadManagerIdentityMock.mockReset();
  _resetWorkspaceEntitlementCacheForTests();
});

// ---------------------------------------------------------------------------
// deriveWorkspaceLinks — pure
// ---------------------------------------------------------------------------

describe('Phase 124C — deriveWorkspaceLinks', () => {
  it('returns just the bootstrap-primary link when no additional entitlements', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [],
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      key: 'banker',
      label: 'Banker Workspace',
      route: WORKSPACE_ROUTES.banker,
      isCurrent: true,
    });
  });

  it('appends additional entitled routes in catalog order', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.manager],
    });
    expect(links.map((l) => l.key)).toEqual(['banker', 'manager']);
    expect(links[0].isCurrent).toBe(true);
    expect(links[1].isCurrent).toBe(false);
    expect(links[1]).toEqual({
      key: 'manager',
      label: 'Manager Workspace',
      route: WORKSPACE_ROUTES.manager,
      isCurrent: false,
    });
  });

  it('marks the entitled route as current when the user is rendering it', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [WORKSPACE_ROUTES.manager],
    });
    expect(links.find((l) => l.key === 'banker')?.isCurrent).toBe(false);
    expect(links.find((l) => l.key === 'manager')?.isCurrent).toBe(true);
  });

  it('deduplicates the bootstrap route if it also appears in entitledRoutes', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.banker, WORKSPACE_ROUTES.manager],
    });
    expect(links.filter((l) => l.key === 'banker')).toHaveLength(1);
    expect(links.map((l) => l.key)).toEqual(['banker', 'manager']);
  });

  it('orders links by catalog (banker → team → manager → executive → admin)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.executive,
      currentRoute: WORKSPACE_ROUTES.executive,
      entitledRoutes: [
        WORKSPACE_ROUTES.admin,
        WORKSPACE_ROUTES.banker,
        WORKSPACE_ROUTES.manager,
        WORKSPACE_ROUTES.team,
      ],
    });
    expect(links.map((l) => l.key)).toEqual([
      'banker',
      'team',
      'manager',
      'executive',
      'admin',
    ]);
  });

  it('ignores unknown routes in entitledRoutes (defensive — no fake link injected)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: ['/workspaces/nonexistent'],
    });
    expect(links.map((l) => l.key)).toEqual(['banker']);
  });
});

// ---------------------------------------------------------------------------
// useManagerEntitlement — module-cached probe
// ---------------------------------------------------------------------------

function bootstrapResult(upn = 'banker@oldglorybank.com'): BootstrapResult {
  return {
    upn,
    fullName: 'Test User',
    entraObjectId: 'oid-1',
    profileId: 'profile-1',
    profileName: 'Test Profile',
    workspaceName: 'Banker Workspace',
    route: WORKSPACE_ROUTES.banker,
  } as BootstrapResult;
}

function withBootstrap(value: BootstrapResult) {
  return ({ children }: { children: ReactNode }) => (
    <BootstrapProvider value={value}>{children}</BootstrapProvider>
  );
}

describe('Phase 124C — useManagerEntitlement', () => {
  it('starts in loading and resolves to entitled when loadManagerIdentity returns ready', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b1',
        fullName: 'Test',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    expect(result.current.kind).toBe('loading');
    await waitFor(() => {
      expect(result.current.kind).toBe('entitled');
    });
    if (result.current.kind === 'entitled') {
      expect(result.current.teamId).toBe('team-1');
      expect(result.current.teamName).toBe('Capital Markets');
    }
  });

  it('resolves to not-entitled when loadManagerIdentity returns not-banker', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('not-entitled');
    });
  });

  it('resolves to not-entitled when loadManagerIdentity returns no-team', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'no-team' });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('not-entitled');
    });
  });

  it('resolves to failed when loadManagerIdentity returns failed', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'failed',
      message: 'OData 5xx',
    });
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('failed');
    });
    if (result.current.kind === 'failed') {
      expect(result.current.message).toBe('OData 5xx');
    }
  });

  it('resolves to failed when loadManagerIdentity throws', async () => {
    loadManagerIdentityMock.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useManagerEntitlement(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('failed');
    });
    if (result.current.kind === 'failed') {
      expect(result.current.message).toBe('network error');
    }
  });

  it('shares one probe per upn across multiple mounts (module-level cache)', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    const wrapper = withBootstrap(bootstrapResult());
    const a = renderHook(() => useManagerEntitlement(), { wrapper });
    const b = renderHook(() => useManagerEntitlement(), { wrapper });
    const c = renderHook(() => useManagerEntitlement(), { wrapper });
    await waitFor(() => {
      expect(a.result.current.kind).toBe('not-entitled');
      expect(b.result.current.kind).toBe('not-entitled');
      expect(c.result.current.kind).toBe('not-entitled');
    });
    expect(loadManagerIdentityMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// useEntitledRoutes
// ---------------------------------------------------------------------------

describe('Phase 124C — useEntitledRoutes', () => {
  it("returns 'loading' until the manager probe settles", async () => {
    let resolve: (v: { kind: 'ready'; identity: unknown } | { kind: 'not-banker' }) => void = () => undefined;
    loadManagerIdentityMock.mockReturnValue(
      new Promise((r) => {
        resolve = r as typeof resolve;
      }),
    );
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    expect(result.current.kind).toBe('loading');
    resolve({ kind: 'not-banker' });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
  });

  it('includes the manager + team routes when the manager probe returns entitled', async () => {
    // Phase 127B — the same `loadManagerIdentity` probe that admits
    // the manager route now also admits the team route. The team
    // route's TeamProvider re-verifies banker + team FK before
    // rendering, so this is not a data-scope widening — just a
    // switcher-and-gate widening for users who already meet the
    // team workspace's hard contract.
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b1',
        fullName: 'Test',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).toEqual([
      WORKSPACE_ROUTES.manager,
      WORKSPACE_ROUTES.team,
    ]);
  });

  it('returns an empty routes list when the probe returns not-entitled', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).toEqual([]);
  });

  it('returns an empty routes list when the probe failed (no fake widening on error)', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'failed',
      message: 'down',
    });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 126C — Portfolio surface link
// ---------------------------------------------------------------------------

describe('Phase 126C — deriveWorkspaceLinks portfolio surface inclusion', () => {
  it('does NOT include the portfolio link by default (no opt-in flag)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.manager,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [],
    });
    expect(links.map((l) => l.key)).toEqual(['manager']);
  });

  it('does NOT include the portfolio link for banker-only users even when includePortfolioSurface=true', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [],
      includePortfolioSurface: true,
    });
    // Banker-only user (no manager route in allowed set) → no
    // portfolio link, even though the caller opted in.
    expect(links.map((l) => l.key)).toEqual(['banker']);
  });

  it('includes the portfolio link for manager-entitled bankers when includePortfolioSurface=true', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.manager],
      includePortfolioSurface: true,
    });
    expect(links.map((l) => l.key)).toEqual(['banker', 'manager', 'portfolio']);
    const portfolio = links.find((l) => l.key === 'portfolio')!;
    expect(portfolio.label).toBe('Portfolio Workspace');
    expect(portfolio.route).toBe(
      `${WORKSPACE_ROUTES.manager}?surface=portfolio`,
    );
  });

  it('includes the portfolio link for manager-bootstrap users when includePortfolioSurface=true', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.manager,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [],
      includePortfolioSurface: true,
    });
    expect(links.map((l) => l.key)).toEqual(['manager', 'portfolio']);
  });

  it('marks the portfolio link as isCurrent when currentSurface=portfolio (and manager link is NOT current)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.manager,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [],
      includePortfolioSurface: true,
      currentSurface: 'portfolio',
    });
    const manager = links.find((l) => l.key === 'manager')!;
    const portfolio = links.find((l) => l.key === 'portfolio')!;
    expect(manager.isCurrent).toBe(false);
    expect(portfolio.isCurrent).toBe(true);
  });

  it('marks the manager link as isCurrent when currentSurface is undefined and the user is on the manager route', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.manager,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [],
      includePortfolioSurface: true,
    });
    const manager = links.find((l) => l.key === 'manager')!;
    const portfolio = links.find((l) => l.key === 'portfolio')!;
    expect(manager.isCurrent).toBe(true);
    expect(portfolio.isCurrent).toBe(false);
  });

  it('portfolio link route navigates to the same manager route + surface query (no route widening)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.manager,
      currentRoute: WORKSPACE_ROUTES.manager,
      entitledRoutes: [],
      includePortfolioSurface: true,
    });
    const portfolio = links.find((l) => l.key === 'portfolio')!;
    // The portfolio link MUST share the manager route path so
    // WorkspaceGate continues to admit it. The surface marker is a
    // query string, not a new path.
    expect(portfolio.route.startsWith(WORKSPACE_ROUTES.manager)).toBe(true);
    expect(portfolio.route).toContain('?surface=portfolio');
  });
});

// ---------------------------------------------------------------------------
// Phase 127B — Team Workspace entitlement widening
// ---------------------------------------------------------------------------

describe('Phase 127B — useEntitledRoutes admits the team workspace for manager-entitled users', () => {
  it('returns BOTH manager and team routes when the manager probe is entitled', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b1',
        fullName: 'Test',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).toContain(WORKSPACE_ROUTES.team);
    expect(result.current.routes).toContain(WORKSPACE_ROUTES.manager);
  });

  it('does NOT include the team route for banker-only users (probe → not-entitled)', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).not.toContain(WORKSPACE_ROUTES.team);
  });

  it('does NOT include the team route when the probe failed (no fake widening on error)', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'failed',
      message: 'OData 5xx',
    });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    expect(result.current.routes).not.toContain(WORKSPACE_ROUTES.team);
  });
});

describe('Phase 127B — deriveWorkspaceLinks surfaces the team link when admitted', () => {
  it('renders the Team Workspace link for manager-entitled bankers (banker bootstrap + team entitled)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
    });
    const team = links.find((l) => l.key === 'team');
    expect(team).toBeDefined();
    expect(team!.label).toBe('Team Workspace');
    expect(team!.route).toBe(WORKSPACE_ROUTES.team);
    expect(team!.isCurrent).toBe(false);
  });

  it('does NOT render the Team Workspace link for banker-only users (team not in entitled set)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [],
    });
    expect(links.map((l) => l.key)).toEqual(['banker']);
  });

  it('marks the Team Workspace link as isCurrent when the user is rendering it', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.team,
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
    });
    const team = links.find((l) => l.key === 'team')!;
    const banker = links.find((l) => l.key === 'banker')!;
    expect(team.isCurrent).toBe(true);
    expect(banker.isCurrent).toBe(false);
  });

  it('Team Workspace link route is exactly the existing /workspaces/team path (no new route invented)', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.team],
    });
    const team = links.find((l) => l.key === 'team')!;
    expect(team.route).toBe(WORKSPACE_ROUTES.team);
  });
});

// ---------------------------------------------------------------------------
// Phase 133B — Executive Workspace reachability (no manager/team proxy)
// ---------------------------------------------------------------------------

describe('Phase 133B — Executive reachability', () => {
  it('executive-primary user sees Executive Workspace as the current link', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.executive,
      currentRoute: WORKSPACE_ROUTES.executive,
      entitledRoutes: [],
    });
    expect(links.map((l) => l.key)).toEqual(['executive']);
    expect(links[0].isCurrent).toBe(true);
    expect(links[0].route).toBe(WORKSPACE_ROUTES.executive);
  });

  it('executive-primary user who is ALSO manager-entitled keeps the Executive link', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.executive,
      currentRoute: WORKSPACE_ROUTES.executive,
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
      includePortfolioSurface: true,
    });
    const exec = links.find((l) => l.key === 'executive');
    expect(exec).toBeDefined();
    expect(exec!.isCurrent).toBe(true);
  });

  it('manager/team-entitled (non-executive) users do NOT get an Executive link', () => {
    const links = deriveWorkspaceLinks({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      currentRoute: WORKSPACE_ROUTES.banker,
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
      includePortfolioSurface: true,
    });
    expect(links.map((l) => l.key)).not.toContain('executive');
  });

  it('useEntitledRoutes never admits the executive route — manager entitlement is not an executive proxy', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b1',
        fullName: 'Test',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    const { result } = renderHook(() => useEntitledRoutes(), {
      wrapper: withBootstrap(bootstrapResult()),
    });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    expect(result.current.routes).toContain(WORKSPACE_ROUTES.manager);
    expect(result.current.routes).toContain(WORKSPACE_ROUTES.team);
    expect(result.current.routes).not.toContain(WORKSPACE_ROUTES.executive);
  });
});

// ---------------------------------------------------------------------------
// Phase 134A — name → link chain (no entitlement proxy)
// ---------------------------------------------------------------------------

describe('Phase 134A — executive link derives from the resolved primary-workspace name', () => {
  it('a "Executive Dashboard" primary workspace yields the Executive link as current', () => {
    const route = resolveWorkspaceRoute('Executive Dashboard');
    expect(route).toBe(WORKSPACE_ROUTES.executive);
    const links = deriveWorkspaceLinks({
      bootstrapRoute: route!,
      currentRoute: route!,
      entitledRoutes: [],
    });
    const exec = links.find((l) => l.key === 'executive');
    expect(exec).toBeDefined();
    expect(exec!.isCurrent).toBe(true);
    // No other workspace link is fabricated for an executive-only user.
    expect(links.map((l) => l.key)).toEqual(['executive']);
  });

  it('a non-executive primary-workspace name never yields an Executive link', () => {
    const route = resolveWorkspaceRoute('Banker Workspace');
    expect(route).toBe(WORKSPACE_ROUTES.banker);
    const links = deriveWorkspaceLinks({
      bootstrapRoute: route!,
      currentRoute: route!,
      // Even with the strongest entitlement (manager probe → manager + team),
      // executive is not derivable — it is not an entitlement proxy.
      entitledRoutes: [WORKSPACE_ROUTES.manager, WORKSPACE_ROUTES.team],
      includePortfolioSurface: true,
    });
    expect(links.map((l) => l.key)).not.toContain('executive');
  });
});
