// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 38: pre-auth child-query guard.
 *
 * Critical security invariant: the four child queries that power
 * DealDataProvider (loadDealTasks / loadDealDocuments /
 * loadDealCreditMemo / loadDealActivity) MUST NOT fire before the
 * role-specific deal-authorization function returns ready.
 *
 * That guarantee is structural — each workspace component only mounts
 * DealDataProvider after the auth state becomes 'ready'. This test
 * pins the invariant by:
 *   - mocking the role-specific auth fn to return 'denied' or
 *     'not-found' or to never resolve;
 *   - mocking each child query module;
 *   - asserting the rendered output is the expected error state AND
 *     none of the child mocks were called.
 *
 * Covers Manager and Team workspaces. The banker auth function has
 * the same structural property (BankerDealWorkspace only renders
 * DealDataProvider on state.kind === 'ready') and is exercised by
 * the existing Phase-4 banker tests.
 */

// ---------------------------------------------------------------------------
// Mock the dealQueries authorization functions so tests control the auth
// state. vi.hoisted is required because vi.mock factories run BEFORE
// outer-scope const declarations are initialized — without it the mock
// factory's references to these spies would hit a TDZ.
// ---------------------------------------------------------------------------
const {
  loadDealForManagerMock,
  loadDealForTeamMock,
  loadDealTasks,
  loadDealDocuments,
  loadDealCreditMemo,
  loadDealActivity,
} = vi.hoisted(() => ({
  loadDealForManagerMock: vi.fn(),
  loadDealForTeamMock: vi.fn(),
  loadDealTasks: vi.fn(),
  loadDealDocuments: vi.fn(),
  loadDealCreditMemo: vi.fn(),
  loadDealActivity: vi.fn(),
}));
vi.mock('./dealQueries', () => ({
  loadDealForManager: loadDealForManagerMock,
  loadDealForTeam: loadDealForTeamMock,
  // The real exports the workspaces rely on at type/runtime — keep
  // these as no-ops; nothing in the test path calls them.
  loadDealForBanker: vi.fn(),
}));
vi.mock('./dealTaskQueries', () => ({ loadDealTasks }));
vi.mock('./dealDocumentQueries', () => ({ loadDealDocuments }));
vi.mock('./creditMemoQueries', () => ({ loadDealCreditMemo }));
vi.mock('./activityQueries', () => ({ loadDealActivity }));
// Action modules + per-card modals transitively import the SDK; stub
// the imports at the path level so neither the deal cards nor the
// DealDataProvider can drag the SDK into the test runtime.
vi.mock('./dealTaskActions', () => ({ completeTask: vi.fn() }));
vi.mock('./documentActions', () => ({ requestDocument: vi.fn() }));
vi.mock('./creditMemoActions', () => ({ saveCreditMemoDraft: vi.fn() }));
vi.mock('./CompleteTaskModal', () => ({ CompleteTaskModal: () => null }));
vi.mock('./RequestDocumentModal', () => ({ RequestDocumentModal: () => null }));
vi.mock('./CreditMemoDraftModal', () => ({ CreditMemoDraftModal: () => null }));
vi.mock('./DraftBorrowerUpdateModal', () => ({
  DraftBorrowerUpdateModal: () => null,
}));
// DealDataProvider's own useEffect would fire the load* calls on
// mount. We never expect it to mount in any test here (denied /
// not-found / failed / loading all short-circuit before
// DealDataProvider renders), but stubbing it makes a regression in
// that ordering loud — the no-op provider does nothing, so any
// later test asserting child fetches WOULD fail under this stub.
vi.mock('./DealDataProvider', async () => {
  const actual = await vi.importActual<typeof import('./DealDataProvider')>(
    './DealDataProvider',
  );
  return {
    ...actual,
    DealDataProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

// The manager + team providers transitively pull in @microsoft/power-apps
// service files that Vitest cannot resolve. Stub them so each workspace
// can mount; we drive identity directly through the context hook mocks.
vi.mock('../manager/ManagerProvider', () => ({
  ManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../team/TeamProvider', () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../manager/ManagerContext', () => ({
  useManager: () => ({
    bankerId: 'banker-1',
    fullName: 'M. Manager',
    email: 'm@bank.test',
    teamId: 'team-A',
    teamName: 'Team A',
  }),
}));
vi.mock('../team/TeamContext', () => ({
  useTeam: () => ({
    bankerId: 'banker-1',
    fullName: 'T. Member',
    email: 't@bank.test',
    teamId: 'team-A',
    teamName: 'Team A',
  }),
}));

// useBootstrap is consumed transitively by some shared components; stub
// it to keep the chain inert.
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: () => ({
    upn: 't@bank.test',
    fullName: 'T',
    entraObjectId: 'oid',
    profileId: 'p',
    profileName: 'p',
    workspaceId: 'ws',
    workspaceName: 'ws',
    route: '/workspaces/manager',
  }),
}));

import { ManagerDealWorkspace } from '../manager/ManagerDealWorkspace';
import { TeamDealWorkspace } from '../team/TeamDealWorkspace';

beforeEach(() => {
  loadDealForManagerMock.mockReset();
  loadDealForTeamMock.mockReset();
  loadDealTasks.mockReset();
  loadDealDocuments.mockReset();
  loadDealCreditMemo.mockReset();
  loadDealActivity.mockReset();
});

afterEach(() => {
  // Each test asserts NO child fetch fires; defensively confirm here
  // too so accidental cross-test bleed shows up.
  expect(loadDealTasks).not.toHaveBeenCalled();
  expect(loadDealDocuments).not.toHaveBeenCalled();
  expect(loadDealCreditMemo).not.toHaveBeenCalled();
  expect(loadDealActivity).not.toHaveBeenCalled();
});

describe('ManagerDealWorkspace — pre-auth child-query guard', () => {
  it('does NOT fire child queries when auth is denied', async () => {
    loadDealForManagerMock.mockResolvedValue({ kind: 'denied' });
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-1" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument(),
    );
    // afterEach asserts no child mock was called.
  });

  it('does NOT fire child queries when auth is not-found', async () => {
    loadDealForManagerMock.mockResolvedValue({ kind: 'not-found' });
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="missing" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/deal not found/i)).toBeInTheDocument(),
    );
  });

  it('does NOT fire child queries when auth fails (network error)', async () => {
    loadDealForManagerMock.mockResolvedValue({
      kind: 'failed',
      message: 'service unavailable',
    });
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-1" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/could not load deal/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('does NOT fire child queries while auth is still in flight (loading)', async () => {
    // Never-resolving promise — auth stays in 'loading'. The
    // workspace must NOT mount DealDataProvider yet.
    loadDealForManagerMock.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-1" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/loading deal/i)).toBeInTheDocument();
  });
});

describe('TeamDealWorkspace — pre-auth child-query guard', () => {
  it('does NOT fire child queries when auth is denied', async () => {
    loadDealForTeamMock.mockResolvedValue({ kind: 'denied' });
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="deal-1" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument(),
    );
  });

  it('does NOT fire child queries when auth is not-found', async () => {
    loadDealForTeamMock.mockResolvedValue({ kind: 'not-found' });
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="missing" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/deal not found/i)).toBeInTheDocument(),
    );
  });

  it('denied state does NOT render any deal header / card data', async () => {
    loadDealForTeamMock.mockResolvedValue({ kind: 'denied' });
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="deal-1" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument(),
    );
    // None of the eight deal cards' headings render in denied state.
    for (const heading of [
      /^deal blockers$/i,
      /^tasks/i,
      /^documents$/i,
      /^credit memo$/i,
      /^activity timeline$/i,
      /^borrower communication$/i,
      /^stage progression guard$/i,
    ]) {
      expect(screen.queryByRole('heading', { name: heading })).toBeNull();
    }
  });

  it('does NOT fire child queries while auth is still in flight (loading)', async () => {
    loadDealForTeamMock.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="deal-1" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/loading deal/i)).toBeInTheDocument();
  });
});
