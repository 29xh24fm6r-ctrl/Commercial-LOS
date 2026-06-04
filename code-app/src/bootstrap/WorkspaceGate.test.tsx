// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { WorkspaceGate } from './WorkspaceGate';
import { BootstrapProvider } from './BootstrapContext';
import { WORKSPACE_ROUTES, resolveWorkspaceRoute } from './workspaceRoutes';
import { _resetWorkspaceEntitlementCacheForTests } from './workspaceEntitlements';
import type { BootstrapResult } from './bootstrapFlow';

/**
 * Phase 124C — WorkspaceGate tests (entitlement widening).
 *
 * Pins:
 *   - bootstrap-primary route renders children (spec W3 unchanged);
 *   - non-primary route the user is NOT entitled to bounces back to
 *     bootstrap.route (spec W3 unchanged — no leak);
 *   - non-primary route the user IS entitled to (manager probe
 *     resolves to ready) renders children (Phase 124C widening);
 *   - while the entitlement probe is in flight, the gate shows the
 *     loading state instead of bouncing (avoids spuriously bouncing
 *     an entitled user back to their primary);
 *   - failed probe does NOT widen access (fail honest).
 */

const { loadManagerIdentityMock } = vi.hoisted(() => ({
  loadManagerIdentityMock: vi.fn(),
}));

vi.mock('../manager/managerQueries', () => ({
  loadManagerIdentity: loadManagerIdentityMock,
}));

function bootstrap(route: string, upn = 'banker@oldglorybank.com'): BootstrapResult {
  return {
    upn,
    fullName: 'Test User',
    entraObjectId: 'oid-1',
    profileId: 'profile-1',
    profileName: 'Test Profile',
    workspaceName: 'Banker Workspace',
    route,
  } as BootstrapResult;
}

function mountGate(opts: {
  bootstrapRoute: string;
  initialPath: string;
  allowed: string;
}) {
  return render(
    <BootstrapProvider value={bootstrap(opts.bootstrapRoute)}>
      <MemoryRouter initialEntries={[opts.initialPath]}>
        <Routes>
          <Route
            path={opts.allowed}
            element={
              <WorkspaceGate allowed={opts.allowed}>
                <div data-testid="gate-children">Allowed content</div>
              </WorkspaceGate>
            }
          />
          <Route
            path={opts.bootstrapRoute}
            element={<div data-testid="primary-route">Primary route landing</div>}
          />
        </Routes>
      </MemoryRouter>
    </BootstrapProvider>,
  );
}

beforeEach(() => {
  loadManagerIdentityMock.mockReset();
  _resetWorkspaceEntitlementCacheForTests();
});

describe('Phase 124C — WorkspaceGate: bootstrap-primary route', () => {
  it('renders children when allowed === bootstrap.route (spec W3 — fast path)', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.banker,
      allowed: WORKSPACE_ROUTES.banker,
    });
    expect(await screen.findByTestId('gate-children')).toBeInTheDocument();
  });
});

describe('Phase 124C — WorkspaceGate: entitlement widening for manager', () => {
  it('renders children for entitled-banker accessing the manager route', async () => {
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
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.manager,
      allowed: WORKSPACE_ROUTES.manager,
    });
    expect(await screen.findByTestId('gate-children')).toBeInTheDocument();
  });

  it('shows the loading state while the entitlement probe is in flight', () => {
    let resolve: (v: unknown) => void = () => undefined;
    loadManagerIdentityMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.manager,
      allowed: WORKSPACE_ROUTES.manager,
    });
    expect(
      screen.getByText(/Resolving workspace entitlements/i),
    ).toBeInTheDocument();
    // Children must not render until the probe settles.
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
    resolve({ kind: 'not-banker' });
  });
});

describe('Phase 127B — WorkspaceGate: team workspace admission for manager-entitled users', () => {
  it('renders the team workspace children for a manager-entitled banker', async () => {
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
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.team,
      allowed: WORKSPACE_ROUTES.team,
    });
    expect(await screen.findByTestId('gate-children')).toBeInTheDocument();
  });

  it('bounces banker-only users away from the team workspace (no leak)', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.team,
      allowed: WORKSPACE_ROUTES.team,
    });
    await waitFor(() => {
      expect(screen.getByTestId('primary-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
  });

  it('bounces when the manager probe FAILED (no fake widening to the team route on error)', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'failed',
      message: 'OData 5xx',
    });
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.team,
      allowed: WORKSPACE_ROUTES.team,
    });
    await waitFor(() => {
      expect(screen.getByTestId('primary-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
  });
});

describe('Phase 124C — WorkspaceGate: fail-closed posture preserved', () => {
  it('bounces to bootstrap.route when the user is NOT entitled to the requested workspace', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.manager,
      allowed: WORKSPACE_ROUTES.manager,
    });
    await waitFor(() => {
      expect(screen.getByTestId('primary-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
  });

  it('bounces to bootstrap.route when the entitlement probe FAILED (no fake widening on error)', async () => {
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'failed',
      message: 'OData 5xx',
    });
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.manager,
      allowed: WORKSPACE_ROUTES.manager,
    });
    await waitFor(() => {
      expect(screen.getByTestId('primary-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 133B — WorkspaceGate: executive admission (no manager/team proxy)
// ---------------------------------------------------------------------------

describe('Phase 133B — WorkspaceGate: executive admission', () => {
  it('admits an executive-primary user to /workspaces/executive (fast path)', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.executive,
      initialPath: WORKSPACE_ROUTES.executive,
      allowed: WORKSPACE_ROUTES.executive,
    });
    expect(await screen.findByTestId('gate-children')).toBeInTheDocument();
  });

  it('bounces a manager-entitled (non-executive) user away from /workspaces/executive (no proxy)', async () => {
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
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.executive,
      allowed: WORKSPACE_ROUTES.executive,
    });
    await waitFor(() => {
      expect(screen.getByTestId('primary-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
  });

  it('fails closed for a non-entitled user hitting the /workspaces/executive URL directly', async () => {
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    mountGate({
      bootstrapRoute: WORKSPACE_ROUTES.banker,
      initialPath: WORKSPACE_ROUTES.executive,
      allowed: WORKSPACE_ROUTES.executive,
    });
    await waitFor(() => {
      expect(screen.getByTestId('primary-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 134A — Executive route renders only when the primary workspace
// NAME resolves to "Executive Dashboard" (name → route → admission).
// ---------------------------------------------------------------------------

describe('Phase 134A — executive route is name-gated', () => {
  it('a user whose primary workspace name is "Executive Dashboard" reaches /workspaces/executive', async () => {
    // The bootstrap route is derived from the platform workspace NAME via
    // resolveWorkspaceRoute. Prove the full chain admits the executive
    // route for exactly that name.
    const route = resolveWorkspaceRoute('Executive Dashboard');
    expect(route).toBe(WORKSPACE_ROUTES.executive);
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    mountGate({
      bootstrapRoute: route!,
      initialPath: WORKSPACE_ROUTES.executive,
      allowed: WORKSPACE_ROUTES.executive,
    });
    expect(await screen.findByTestId('gate-children')).toBeInTheDocument();
  });

  it('a user whose primary workspace name resolves elsewhere is bounced from the executive route', async () => {
    // "Banker Workspace" resolves to the banker route; that user must not
    // reach the executive route even via a direct URL.
    const route = resolveWorkspaceRoute('Banker Workspace');
    expect(route).toBe(WORKSPACE_ROUTES.banker);
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    mountGate({
      bootstrapRoute: route!,
      initialPath: WORKSPACE_ROUTES.executive,
      allowed: WORKSPACE_ROUTES.executive,
    });
    await waitFor(() => {
      expect(screen.getByTestId('primary-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('gate-children')).not.toBeInTheDocument();
  });
});
