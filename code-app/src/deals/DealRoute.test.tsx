// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Phase 38: DealRoute permission regression matrix.
 *
 * Locks down /deals/:dealId dispatch across all workspace roles so a
 * future change cannot accidentally open cross-role access. Each role
 * branch is verified end-to-end via the DealRoute dispatcher:
 *
 *   banker     -> BankerProvider + BankerDealWorkspace (full r/w)
 *   manager    -> ManagerProvider + ManagerDealWorkspace (read-only)
 *   team       -> TeamProvider + TeamDealWorkspace (read-only)
 *   executive  -> "Access denied" ErrorState; NO workspace mounted
 *   admin      -> "Access denied" ErrorState; NO workspace mounted
 *   unknown    -> "Access denied" ErrorState; NO workspace mounted
 *
 * Provider + workspace mounts are stubbed so this test doesn't run the
 * real Dataverse SDK; each stub renders a sentinel string we then
 * assert on. That isolates the dispatch logic from the workspace
 * internals (those have their own existing test files).
 */

// Mock useBootstrap so each test can choose the route. vi.hoisted is
// required because vi.mock factories run BEFORE outer-scope const
// declarations are initialized.
const { useBootstrapMock } = vi.hoisted(() => ({ useBootstrapMock: vi.fn() }));
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: useBootstrapMock,
}));

// Stub each workspace component + its provider so DealRoute branching
// can be observed without exercising the (SDK-bound) real components.
vi.mock('../banker/BankerProvider', () => ({
  BankerProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="banker-provider">{children}</div>
  ),
}));
vi.mock('./BankerDealWorkspace', () => ({
  BankerDealWorkspace: ({ dealId }: { dealId: string }) => (
    <div data-testid="banker-deal-workspace">banker-workspace:{dealId}</div>
  ),
}));
vi.mock('../manager/ManagerProvider', () => ({
  ManagerProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="manager-provider">{children}</div>
  ),
}));
vi.mock('../manager/ManagerDealWorkspace', () => ({
  ManagerDealWorkspace: ({ dealId }: { dealId: string }) => (
    <div data-testid="manager-deal-workspace">manager-workspace:{dealId}</div>
  ),
}));
vi.mock('../team/TeamProvider', () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="team-provider">{children}</div>
  ),
}));
vi.mock('../team/TeamDealWorkspace', () => ({
  TeamDealWorkspace: ({ dealId }: { dealId: string }) => (
    <div data-testid="team-deal-workspace">team-workspace:{dealId}</div>
  ),
}));

import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { DealRoute } from './DealRoute';

interface BootstrapShape {
  upn: string;
  fullName: string;
  entraObjectId: string;
  profileId: string;
  profileName: string;
  workspaceId: string;
  workspaceName: string;
  route: string;
}

function bootstrap(route: string): BootstrapShape {
  return {
    upn: 'test@bank.test',
    fullName: 'Test User',
    entraObjectId: 'oid',
    profileId: 'p',
    profileName: 'profile',
    workspaceId: 'ws',
    workspaceName: 'workspace',
    route,
  };
}

function renderRoute({
  route,
  dealId = 'deal-1',
  url,
}: {
  route: string;
  dealId?: string;
  url?: string;
}) {
  useBootstrapMock.mockReturnValue(bootstrap(route));
  return render(
    <MemoryRouter initialEntries={[url ?? `/deals/${dealId}`]}>
      <Routes>
        <Route path="/deals/:dealId" element={<DealRoute />} />
        <Route path="/deals" element={<DealRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useBootstrapMock.mockReset();
});

describe('DealRoute dispatch matrix — banker', () => {
  it('mounts BankerProvider + BankerDealWorkspace when route is banker', () => {
    renderRoute({ route: WORKSPACE_ROUTES.banker });
    expect(screen.getByTestId('banker-provider')).toBeInTheDocument();
    expect(screen.getByTestId('banker-deal-workspace')).toHaveTextContent(
      'banker-workspace:deal-1',
    );
    // No other role's surface mounts.
    expect(screen.queryByTestId('manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-provider')).not.toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });
});

describe('DealRoute dispatch matrix — manager', () => {
  it('mounts ManagerProvider + ManagerDealWorkspace when route is manager', () => {
    renderRoute({ route: WORKSPACE_ROUTES.manager });
    expect(screen.getByTestId('manager-provider')).toBeInTheDocument();
    expect(screen.getByTestId('manager-deal-workspace')).toHaveTextContent(
      'manager-workspace:deal-1',
    );
    expect(screen.queryByTestId('banker-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-provider')).not.toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });
});

describe('DealRoute dispatch matrix — team', () => {
  it('mounts TeamProvider + TeamDealWorkspace when route is team', () => {
    renderRoute({ route: WORKSPACE_ROUTES.team });
    expect(screen.getByTestId('team-provider')).toBeInTheDocument();
    expect(screen.getByTestId('team-deal-workspace')).toHaveTextContent(
      'team-workspace:deal-1',
    );
    expect(screen.queryByTestId('banker-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument();
  });
});

describe('DealRoute dispatch matrix — executive', () => {
  it('renders ACCESS DENIED for executive route and mounts NO workspace', () => {
    renderRoute({ route: WORKSPACE_ROUTES.executive });
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByTestId('banker-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-provider')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('banker-deal-workspace'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('manager-deal-workspace'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('team-deal-workspace'),
    ).not.toBeInTheDocument();
  });
});

describe('DealRoute dispatch matrix — admin', () => {
  it('renders ACCESS DENIED for admin route and mounts NO workspace', () => {
    renderRoute({ route: WORKSPACE_ROUTES.admin });
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByTestId('banker-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-provider')).not.toBeInTheDocument();
  });
});

describe('DealRoute dispatch matrix — unknown route', () => {
  it('renders ACCESS DENIED for any unrecognized workspace route', () => {
    renderRoute({ route: '/workspaces/somefutureworkspace' });
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByTestId('banker-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manager-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-provider')).not.toBeInTheDocument();
  });

  it('renders ACCESS DENIED for an empty route string', () => {
    renderRoute({ route: '' });
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });
});

describe('DealRoute dispatch matrix — invalid url param', () => {
  it('renders an explicit "Invalid deal" error when no dealId is in the URL', () => {
    // Hit /deals (no id). DealRoute pattern still matches but useParams
    // returns undefined for dealId; the dispatcher branches to its
    // explicit error state.
    renderRoute({ route: WORKSPACE_ROUTES.banker, url: '/deals' });
    expect(screen.getByText(/invalid deal/i)).toBeInTheDocument();
    expect(screen.queryByTestId('banker-deal-workspace')).not.toBeInTheDocument();
  });
});

describe('DealRoute dispatch matrix — strict role isolation', () => {
  it('NEVER mounts more than one role provider in any single render', () => {
    for (const route of [
      WORKSPACE_ROUTES.banker,
      WORKSPACE_ROUTES.manager,
      WORKSPACE_ROUTES.team,
      WORKSPACE_ROUTES.executive,
      WORKSPACE_ROUTES.admin,
      '/workspaces/unknown',
    ]) {
      const { unmount } = renderRoute({ route });
      const mounted = [
        screen.queryByTestId('banker-provider'),
        screen.queryByTestId('manager-provider'),
        screen.queryByTestId('team-provider'),
      ].filter(Boolean);
      // Banker / manager / team routes mount exactly one provider.
      // Executive / admin / unknown mount zero.
      const allowed: string[] = [
        WORKSPACE_ROUTES.banker,
        WORKSPACE_ROUTES.manager,
        WORKSPACE_ROUTES.team,
      ];
      const allowedCount = allowed.includes(route) ? 1 : 0;
      expect(mounted.length).toBe(allowedCount);
      unmount();
    }
  });
});
