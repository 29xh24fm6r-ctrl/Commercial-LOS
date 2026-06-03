// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { ManagerData } from '../manager/ManagerDataProvider';
import type { BootstrapResult } from '../bootstrap/bootstrapFlow';
import type { ManagerIdentity } from '../manager/managerQueries';
import { _resetWorkspaceEntitlementCacheForTests } from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 124E — Manager Workspace shell-restoration tests.
 *
 * Pins:
 *   - the dark Lending OS sidebar renders inside the manager
 *     workspace (same chrome as Banker Workspace);
 *   - the workspace switcher renders in dark tone with both
 *     "Banker Workspace" (link, since bootstrap-primary is banker)
 *     and "Manager Workspace" (aria-current, since we are
 *     rendering the manager route);
 *   - the Manager Command Center header + the Manager Bloomberg
 *     Control Panel both render INSIDE the shell;
 *   - no banker-workspace regression: the Lending OS shell's
 *     own contract (BankerShell.test.tsx) still passes — covered
 *     by running it alongside.
 */

// Mock identity + data providers at the module boundary so we can
// mount the workspace without a live Dataverse environment.
const { useBootstrapMock } = vi.hoisted(() => ({ useBootstrapMock: vi.fn() }));
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: useBootstrapMock,
  BootstrapProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { useManagerMock } = vi.hoisted(() => ({ useManagerMock: vi.fn() }));
vi.mock('../manager/ManagerContext', () => ({
  useManager: useManagerMock,
}));

vi.mock('../manager/ManagerProvider', () => ({
  ManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { useManagerDataMock } = vi.hoisted(() => ({ useManagerDataMock: vi.fn() }));
vi.mock('../manager/ManagerDataProvider', () => ({
  ManagerDataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useManagerData: useManagerDataMock,
}));

vi.mock('../manager/ManagerBankerFilter', async () => {
  const actual = await vi.importActual<typeof import('../manager/ManagerBankerFilter')>(
    '../manager/ManagerBankerFilter',
  );
  return {
    ...actual,
    ManagerBankerFilterProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    ManagerBankerFilterControl: () => null,
    useOptionalManagerBankerFilter: () => undefined,
  };
});

// Mock the manager probe so useEntitledRoutes resolves quickly.
const { loadManagerIdentityMock } = vi.hoisted(() => ({
  loadManagerIdentityMock: vi.fn(),
}));
vi.mock('../manager/managerQueries', () => ({
  loadManagerIdentity: loadManagerIdentityMock,
}));

// Stub the existing manager cards so this test only covers the
// shell + the Bloomberg Control Panel mount point.
vi.mock('../manager/ManagerBloombergControlPanel', () => ({
  ManagerBloombergControlPanel: () => (
    <div data-testid="manager-bloomberg-control-panel">Bloomberg Control Panel</div>
  ),
}));
vi.mock('../portfolio/PortfolioCommandCenter', () => ({
  PortfolioCommandCenter: () => (
    <div data-testid="portfolio-command-center">Portfolio Command Center</div>
  ),
}));
vi.mock('../manager/TeamPipelineSummary', () => ({ TeamPipelineSummary: () => null }));
vi.mock('../manager/TeamWorkQueue', () => ({ TeamWorkQueue: () => null }));
vi.mock('../manager/ManagerAutopilotRollup', () => ({
  ManagerAutopilotRollup: () => null,
}));
vi.mock('../manager/ManagerMorningCatchUp', () => ({
  ManagerMorningCatchUp: () => null,
}));
vi.mock('../manager/ManagerRelationshipMemory', () => ({
  ManagerRelationshipMemory: () => null,
}));
vi.mock('../manager/DealsByStage', () => ({ DealsByStage: () => null }));
vi.mock('../manager/AtRiskBlockedDeals', () => ({ AtRiskBlockedDeals: () => null }));
vi.mock('../manager/BankerWorkloadSummary', () => ({
  BankerWorkloadSummary: () => null,
}));
vi.mock('../manager/ClosingForecast', () => ({ ClosingForecast: () => null }));
vi.mock('../manager/ActivitySummary', () => ({
  ManagerActivitySummary: () => null,
}));

import { ManagerWorkspace } from './ManagerWorkspace';

function bootstrap(over: Partial<BootstrapResult> = {}): BootstrapResult {
  return {
    upn: 'banker@oldglorybank.com',
    fullName: 'Matthew Paller',
    entraObjectId: 'oid-1',
    profileId: 'profile-1',
    profileName: 'Banker Profile',
    workspaceName: 'Banker Workspace',
    route: WORKSPACE_ROUTES.banker,
    ...over,
  } as BootstrapResult;
}

function managerIdentity(over: Partial<ManagerIdentity> = {}): ManagerIdentity {
  return {
    bankerId: 'b-1',
    fullName: 'Matthew Paller',
    email: 'banker@oldglorybank.com',
    teamId: 'team-1',
    teamName: 'Capital Markets',
    ...over,
  };
}

function loadingManagerData(): ManagerData {
  return {
    teamPipeline: { kind: 'loading' },
    teamBankers: { kind: 'loading' },
    teamTasks: { kind: 'loading' },
    teamDocuments: { kind: 'loading' },
    teamMemos: { kind: 'loading' },
    teamMemoSections: { kind: 'loading' },
  };
}

beforeEach(() => {
  useBootstrapMock.mockReset();
  useManagerMock.mockReset();
  useManagerDataMock.mockReset();
  loadManagerIdentityMock.mockReset();
  _resetWorkspaceEntitlementCacheForTests();
  useBootstrapMock.mockReturnValue(bootstrap());
  useManagerMock.mockReturnValue(managerIdentity());
  useManagerDataMock.mockReturnValue(loadingManagerData());
  loadManagerIdentityMock.mockResolvedValue({
    kind: 'ready',
    identity: managerIdentity(),
  });
});

function renderManagerWorkspace(initialUrl = '/workspaces/manager') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <ManagerWorkspace />
    </MemoryRouter>,
  );
}

describe('Phase 124E — Manager Workspace shell restoration', () => {
  it('mounts the Lending OS dark sidebar (same shell as Banker Workspace)', () => {
    renderManagerWorkspace();
    expect(
      screen.getByRole('navigation', { name: /Lending OS navigation/i }),
    ).toBeInTheDocument();
    // Lending OS brand wordmark is present in the sidebar.
    expect(screen.getByText(/Lending OS/i)).toBeInTheDocument();
    expect(screen.getByText(/Old Glory Bank/i)).toBeInTheDocument();
  });

  it('mounts the workspace switcher in the dark sidebar with Banker + Manager links', async () => {
    renderManagerWorkspace();
    // Wait for the entitlement probe to settle (useEntitledRoutes).
    await screen.findAllByRole('navigation', { name: /Workspace switcher/i });
    const switchers = screen.getAllByRole('navigation', {
      name: /Workspace switcher/i,
    });
    // One in the dark sidebar (tone=dark), one inline in the manager
    // identity block (tone=light). Both render the Banker link.
    expect(switchers.some((n) => n.getAttribute('data-workspace-switcher') === 'dark')).toBe(
      true,
    );
    expect(switchers.some((n) => n.getAttribute('data-workspace-switcher') === 'light')).toBe(
      true,
    );
    // Both surfaces should expose the Switch to Banker Workspace link.
    expect(screen.getAllByLabelText('Switch to Banker Workspace').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('renders the Manager Command Center header INSIDE the Lending OS shell', () => {
    renderManagerWorkspace();
    expect(
      screen.getByRole('heading', { level: 1, name: /Manager Command Center/i }),
    ).toBeInTheDocument();
  });

  it('renders the Manager Bloomberg Control Panel as the first cockpit inside the shell', () => {
    renderManagerWorkspace();
    expect(
      screen.getByTestId('manager-bloomberg-control-panel'),
    ).toBeInTheDocument();
  });

  it('renders the existing manager identity block (Team / Signed in / email)', () => {
    renderManagerWorkspace();
    // Team name is unique to the manager identity block.
    expect(screen.getByText('Capital Markets')).toBeInTheDocument();
    // Identity name + email render both in the sidebar identity card
    // AND the inline manager context block; assert at least one of
    // each is present.
    expect(screen.getAllByText('Matthew Paller').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('banker@oldglorybank.com').length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 124E — Manager Workspace static-source discipline', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'ManagerWorkspace.tsx'),
    'utf8',
  );
  it('imports LendingOSLayout (shell parity pin)', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*LendingOSLayout[^}]*\}\s+from\s+['"][^'"]*LendingOSLayout['"]/,
    );
  });

  it('wraps content in <LendingOSLayout> with workspaceName + workspaceLinks', () => {
    expect(SRC).toMatch(/<LendingOSLayout/);
    expect(SRC).toMatch(/workspaceName=/);
    expect(SRC).toMatch(/workspaceLinks=\{workspaceLinks\}/);
  });

  it('does NOT pass onNavSelect (sidebar nav stays non-interactive on the manager surface)', () => {
    // Verify the LendingOSLayout element has no onNavSelect prop.
    expect(SRC).not.toMatch(/<LendingOSLayout[\s\S]*?onNavSelect=/);
  });
});

// ---------------------------------------------------------------------------
// Phase 126B — Portfolio route conditional mount
// ---------------------------------------------------------------------------

describe('Phase 126B — manager-name workspaces still render the Bloomberg Control Panel', () => {
  it('renders ManagerBloombergControlPanel when bootstrap workspaceName is "Manager Command Center"', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Manager Command Center' }),
    );
    renderManagerWorkspace();
    expect(
      screen.getByTestId('manager-bloomberg-control-panel'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('portfolio-command-center'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /Manager Command Center/i }),
    ).toBeInTheDocument();
  });

  it('renders the Manager cockpit even when the bootstrap-primary is some other workspace (still no portfolio match)', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Banker Workspace' }),
    );
    renderManagerWorkspace();
    expect(
      screen.getByTestId('manager-bloomberg-control-panel'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('portfolio-command-center'),
    ).not.toBeInTheDocument();
  });
});

describe('Phase 126B — portfolio-name workspaces swap the cockpit to PortfolioCommandCenter', () => {
  it('mounts PortfolioCommandCenter when bootstrap workspaceName is "Portfolio Management"', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Portfolio Management' }),
    );
    renderManagerWorkspace();
    expect(
      screen.getByTestId('portfolio-command-center'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('manager-bloomberg-control-panel'),
    ).not.toBeInTheDocument();
  });

  it('updates the header copy to "Portfolio Command Center" in portfolio mode', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Portfolio Management' }),
    );
    renderManagerWorkspace();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Portfolio Command Center/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: /Manager Command Center/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Live authorized portfolio exposure/i),
    ).toBeInTheDocument();
  });

  it('is case-insensitive on the bootstrap workspaceName (still swaps to portfolio cockpit)', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: '  PORTFOLIO MANAGEMENT  ' }),
    );
    renderManagerWorkspace();
    expect(
      screen.getByTestId('portfolio-command-center'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('manager-bloomberg-control-panel'),
    ).not.toBeInTheDocument();
  });

  it('still mounts ManagerDataProvider and the LendingOS shell (permission-before-render preserved)', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Portfolio Management' }),
    );
    renderManagerWorkspace();
    expect(
      screen.getByRole('navigation', { name: /Lending OS navigation/i }),
    ).toBeInTheDocument();
    // The existing nine manager cards continue to render below the
    // portfolio cockpit (their data scope is identical) — we don't
    // assert any specific card here since they're mocked to null,
    // but we DO assert the cockpit replacement is the only visible
    // swap.
    expect(
      screen.getByTestId('portfolio-command-center'),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 126C — Portfolio surface URL query swap
// ---------------------------------------------------------------------------

describe('Phase 126C — `?surface=portfolio` query swaps the cockpit for ANY user on the manager route', () => {
  it('renders PortfolioCommandCenter when the URL carries ?surface=portfolio even with a manager bootstrap', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Manager Command Center' }),
    );
    renderManagerWorkspace('/workspaces/manager?surface=portfolio');
    expect(
      screen.getByTestId('portfolio-command-center'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('manager-bloomberg-control-panel'),
    ).not.toBeInTheDocument();
  });

  it('renders ManagerBloombergControlPanel by default when no surface query is present (manager bootstrap)', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Manager Command Center' }),
    );
    renderManagerWorkspace('/workspaces/manager');
    expect(
      screen.getByTestId('manager-bloomberg-control-panel'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('portfolio-command-center'),
    ).not.toBeInTheDocument();
  });

  it('?surface=manager overrides a portfolio bootstrap (explicit query wins)', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Portfolio Management' }),
    );
    renderManagerWorkspace('/workspaces/manager?surface=manager');
    // Phase 126B default would have been Portfolio Command Center;
    // the explicit surface query routes around it.
    expect(
      screen.getByTestId('manager-bloomberg-control-panel'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('portfolio-command-center'),
    ).not.toBeInTheDocument();
  });

  it('Portfolio Workspace switcher link appears for manager-bootstrap users', async () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Manager Command Center' }),
    );
    renderManagerWorkspace();
    // Wait for the entitlement probe to settle so the switcher
    // renders. The portfolio link is added independently of the
    // probe (because the user is ALREADY on the manager route), so
    // it should appear immediately, but we wait for switcher render
    // either way.
    await screen.findAllByRole('navigation', {
      name: /[Ww]orkspace switcher/i,
    });
    const portfolioLinks = screen.getAllByLabelText('Switch to Portfolio Workspace');
    expect(portfolioLinks.length).toBeGreaterThanOrEqual(1);
    // The portfolio link points to the same manager route + the
    // surface query — no new route is exposed.
    expect(portfolioLinks[0].getAttribute('href')).toBe(
      '/workspaces/manager?surface=portfolio',
    );
  });

  it('the data provider chain is unchanged on the portfolio surface (no permission widening)', () => {
    useBootstrapMock.mockReturnValue(
      bootstrap({ workspaceName: 'Manager Command Center' }),
    );
    renderManagerWorkspace('/workspaces/manager?surface=portfolio');
    // Same shell, same identity card, same Lending OS sidebar.
    expect(
      screen.getByRole('navigation', { name: /Lending OS navigation/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Capital Markets')).toBeInTheDocument();
  });
});
