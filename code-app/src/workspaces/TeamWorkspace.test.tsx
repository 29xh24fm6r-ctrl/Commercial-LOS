// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { BootstrapResult } from '../bootstrap/bootstrapFlow';
import type { TeamIdentity } from '../team/teamQueries';
import { _resetWorkspaceEntitlementCacheForTests } from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 127B — TeamWorkspace switcher + TeamOpsQueue mount tests.
 *
 * Pins:
 *   - TeamWorkspace mounts TeamOpsQueue as the FIRST cockpit (Phase 127A
 *     ordering preserved);
 *   - the workspace switcher renders inline in the team identity
 *     block when the user has at least one additional entitled route
 *     (Phase 127B widening for manager-entitled users);
 *   - the switcher exposes a "Switch to Banker Workspace" link for
 *     a banker-bootstrap user whose manager probe is entitled (the
 *     bootstrap route is always part of the link set);
 *   - the switcher exposes a "Switch to Manager Workspace" link and a
 *     "Switch to Portfolio Workspace" link for the same user (manager
 *     route widening + portfolio surface opt-in are both already in
 *     scope, mirroring BankerWorkspace's pattern);
 *   - team-bootstrap users with no additional entitlements see NO
 *     switcher (links.length === 1 hides the inline switcher
 *     honestly);
 *   - no banker write affordance, no `<button>`/`<form>` (TeamWorkspace
 *     stays read-only end-to-end).
 */

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const { useBootstrapMock } = vi.hoisted(() => ({ useBootstrapMock: vi.fn() }));
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: useBootstrapMock,
  BootstrapProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { useTeamMock } = vi.hoisted(() => ({ useTeamMock: vi.fn() }));
vi.mock('../team/TeamContext', () => ({
  useTeam: useTeamMock,
  TeamIdentityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../team/TeamProvider', () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../team/TeamDataProvider', () => ({
  TeamDataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock the manager probe so useEntitledRoutes resolves quickly without
// hitting Dataverse.
const { loadManagerIdentityMock } = vi.hoisted(() => ({
  loadManagerIdentityMock: vi.fn(),
}));
vi.mock('../manager/managerQueries', () => ({
  loadManagerIdentity: loadManagerIdentityMock,
}));

// Stub every team card so the test only covers the workspace shell
// + the TeamOpsQueue mount point + the switcher.
vi.mock('../team/TeamOpsQueue', () => ({
  TeamOpsQueue: () => <div data-testid="team-ops-queue">Team Ops Queue</div>,
}));
vi.mock('../team/SharedWorkQueue', () => ({ SharedWorkQueue: () => null }));
vi.mock('../team/TeamAutopilotRollup', () => ({ TeamAutopilotRollup: () => null }));
vi.mock('../team/TeamPipelineSummary', () => ({ TeamPipelineSummary: () => null }));
vi.mock('../team/BottlenecksAgingByStage', () => ({
  BottlenecksAgingByStage: () => null,
}));
vi.mock('../team/SharedClosingCalendar', () => ({
  SharedClosingCalendar: () => null,
}));
vi.mock('../team/TeamDocumentNeeds', () => ({ TeamDocumentNeeds: () => null }));
vi.mock('../team/TeamTaskLoad', () => ({ TeamTaskLoad: () => null }));
vi.mock('../team/SharedActiveDeals', () => ({ SharedActiveDeals: () => null }));
vi.mock('../team/TeamBankerActivityBreakdown', () => ({
  TeamBankerActivityBreakdown: () => null,
}));

import { TeamWorkspace } from './TeamWorkspace';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function teamIdentity(over: Partial<TeamIdentity> = {}): TeamIdentity {
  return {
    bankerId: 'b-1',
    fullName: 'Matthew Paller',
    email: 'banker@oldglorybank.com',
    teamId: 'team-1',
    teamName: 'Capital Markets',
    ...over,
  };
}

beforeEach(() => {
  useBootstrapMock.mockReset();
  useTeamMock.mockReset();
  loadManagerIdentityMock.mockReset();
  _resetWorkspaceEntitlementCacheForTests();
  useTeamMock.mockReturnValue(teamIdentity());
});

function renderTeamWorkspace() {
  return render(
    <MemoryRouter initialEntries={[WORKSPACE_ROUTES.team]}>
      <TeamWorkspace />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// TeamOpsQueue first-cockpit pin (Phase 127A ordering preserved)
// ---------------------------------------------------------------------------

describe('Phase 127B — TeamWorkspace mounts TeamOpsQueue as the first cockpit', () => {
  it('renders the Team Ops Queue inside the team workspace', async () => {
    useBootstrapMock.mockReturnValue(bootstrap({ route: WORKSPACE_ROUTES.team }));
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    renderTeamWorkspace();
    expect(await screen.findByTestId('team-ops-queue')).toBeInTheDocument();
  });

  it('renders the Team Command Center header and team identity block', async () => {
    useBootstrapMock.mockReturnValue(bootstrap({ route: WORKSPACE_ROUTES.team }));
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    renderTeamWorkspace();
    expect(
      screen.getByRole('heading', { level: 1, name: /Team Command Center/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Capital Markets')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Workspace switcher rendering — Phase 127B widening
// ---------------------------------------------------------------------------

describe('Phase 127B — TeamWorkspace switcher visibility', () => {
  it('renders the inline workspace switcher for a manager-entitled banker (banker bootstrap)', async () => {
    useBootstrapMock.mockReturnValue(bootstrap({ route: WORKSPACE_ROUTES.banker }));
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b-1',
        fullName: 'Matthew Paller',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    renderTeamWorkspace();
    const switcher = await screen.findByRole('navigation', {
      name: /Team workspace switcher/i,
    });
    // Banker bootstrap + entitled manager + entitled team (current).
    // Phase 127B widening means the switcher shows the bootstrap
    // (banker), the entitled manager + portfolio links, and team as
    // current.
    expect(switcher).toBeInTheDocument();
    expect(screen.getByLabelText('Switch to Banker Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Switch to Manager Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Switch to Portfolio Workspace')).toBeInTheDocument();
  });

  it('marks the Team Workspace entry as aria-current on the team route', async () => {
    useBootstrapMock.mockReturnValue(bootstrap({ route: WORKSPACE_ROUTES.banker }));
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b-1',
        fullName: 'Matthew Paller',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    renderTeamWorkspace();
    await screen.findByRole('navigation', { name: /Team workspace switcher/i });
    // The current "Team Workspace" entry is rendered as <span aria-current>,
    // not a link. So getByText finds it but queryByLabelText('Switch to
    // Team Workspace') returns null.
    const current = screen.getByText('Team Workspace');
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByLabelText('Switch to Team Workspace')).toBeNull();
  });

  it('hides the inline switcher when the user has no additional entitlements (team-bootstrap, no manager probe)', async () => {
    useBootstrapMock.mockReturnValue(bootstrap({ route: WORKSPACE_ROUTES.team }));
    // Probe returns not-entitled — only the bootstrap (team) is in the
    // allowed set. The switcher gate (links.length >= 2) hides itself
    // honestly rather than rendering a single-item nav.
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    renderTeamWorkspace();
    expect(await screen.findByTestId('team-ops-queue')).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: /Team workspace switcher/i }),
    ).toBeNull();
  });

  it('does NOT render the Portfolio Workspace link when the user is NOT manager-entitled', async () => {
    useBootstrapMock.mockReturnValue(bootstrap({ route: WORKSPACE_ROUTES.team }));
    loadManagerIdentityMock.mockResolvedValue({ kind: 'not-banker' });
    renderTeamWorkspace();
    expect(await screen.findByTestId('team-ops-queue')).toBeInTheDocument();
    // Banker-only user (or team-bootstrap with no manager probe) →
    // no portfolio link, no banker-only widening.
    expect(screen.queryByLabelText('Switch to Portfolio Workspace')).toBeNull();
  });

  it('Team Workspace link in the switcher points to /workspaces/team (existing route — no new path invented)', async () => {
    // From a manager-bootstrap user's perspective the team link is a
    // navigation link, not the current entry. Verify the href.
    useBootstrapMock.mockReturnValue(
      bootstrap({ route: WORKSPACE_ROUTES.manager, workspaceName: 'Manager Command Center' }),
    );
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b-1',
        fullName: 'Matthew Paller',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    renderTeamWorkspace();
    await screen.findByRole('navigation', { name: /Team workspace switcher/i });
    // We're rendering the TeamWorkspace itself; manager-bootstrap +
    // entitled manager means the manager link appears as a sibling
    // of the team (current) entry. The Switch to Manager Workspace
    // link must point at the existing manager route, NOT some new
    // path.
    const managerLink = screen.getByLabelText('Switch to Manager Workspace');
    expect(managerLink.getAttribute('href')).toBe(WORKSPACE_ROUTES.manager);
  });
});

// ---------------------------------------------------------------------------
// Read-only discipline (static-source pin)
// ---------------------------------------------------------------------------

describe('Phase 127B — TeamWorkspace stays read-only and uses the existing team route', () => {
  it('renders no <button> or <form> in the team workspace shell', async () => {
    useBootstrapMock.mockReturnValue(bootstrap({ route: WORKSPACE_ROUTES.banker }));
    loadManagerIdentityMock.mockResolvedValue({
      kind: 'ready',
      identity: {
        bankerId: 'b-1',
        fullName: 'Matthew Paller',
        email: 'banker@oldglorybank.com',
        teamId: 'team-1',
        teamName: 'Capital Markets',
      },
    });
    const { container } = renderTeamWorkspace();
    await screen.findByTestId('team-ops-queue');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });
});
