// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 39: end-to-end write-scoping regression at the workspace level.
 *
 * Three invariants pinned here:
 *
 * 1. Manager and Team deal workspaces — when authorization resolves
 *    to ready — render the four banker write surfaces (Complete
 *    Task / Request Document / Generate Credit Memo Draft Preview /
 *    Draft Borrower Update) as ABSENT. The workspace files pass
 *    readOnly={true} to the cards; this test pins that wiring so a
 *    future edit can't accidentally drop the readOnly prop and ungate
 *    writes for managers or team members.
 *
 * 2. Across all role workspaces (banker / manager / team), the
 *    governed write action service mocks (completeTask /
 *    requestDocument / saveCreditMemoDraft) AND the audit + timeline
 *    service mocks are NEVER called during a denied / not-found /
 *    failed / still-loading authorization. The denied UI must never
 *    emit a write or even a governance side effect.
 *
 * Together with Phase 38's pre-auth child-query guard (which pins the
 * read side) this file pins the write side: no banker write surface
 * can be reached from a non-banker workspace, and no write or
 * audit/timeline call can fire while authorization hasn't succeeded.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks for the role auth functions and every governed write
// service. afterEach asserts none of the write mocks were called — a
// regression in the workspace gating would surface immediately.
// ---------------------------------------------------------------------------
const {
  loadDealForBankerMock,
  loadDealForManagerMock,
  loadDealForTeamMock,
  loadDealTasks,
  loadDealDocuments,
  loadDealCreditMemo,
  loadDealActivity,
  completeTaskMock,
  requestDocumentMock,
  saveCreditMemoDraftMock,
  auditCreateMock,
  timelineCreateMock,
} = vi.hoisted(() => ({
  loadDealForBankerMock: vi.fn(),
  loadDealForManagerMock: vi.fn(),
  loadDealForTeamMock: vi.fn(),
  loadDealTasks: vi.fn(),
  loadDealDocuments: vi.fn(),
  loadDealCreditMemo: vi.fn(),
  loadDealActivity: vi.fn(),
  completeTaskMock: vi.fn(),
  requestDocumentMock: vi.fn(),
  saveCreditMemoDraftMock: vi.fn(),
  auditCreateMock: vi.fn(),
  timelineCreateMock: vi.fn(),
}));

vi.mock('./dealQueries', () => ({
  loadDealForBanker: loadDealForBankerMock,
  loadDealForManager: loadDealForManagerMock,
  loadDealForTeam: loadDealForTeamMock,
}));

vi.mock('./dealTaskQueries', () => ({ loadDealTasks }));
vi.mock('./dealDocumentQueries', () => ({ loadDealDocuments }));
vi.mock('./creditMemoQueries', () => ({ loadDealCreditMemo }));
vi.mock('./activityQueries', () => ({ loadDealActivity }));

// Each governed write action and the underlying audit + timeline
// services. If a workspace path ever lights up one of these by
// mistake, afterEach catches it.
vi.mock('./dealTaskActions', () => ({ completeTask: completeTaskMock }));
vi.mock('./documentActions', () => ({ requestDocument: requestDocumentMock }));
vi.mock('./creditMemoActions', () => ({
  saveCreditMemoDraft: saveCreditMemoDraftMock,
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: auditCreateMock },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: timelineCreateMock },
}));

// Per-card modal stubs (these also can't be allowed to fire).
vi.mock('./CompleteTaskModal', () => ({ CompleteTaskModal: () => null }));
vi.mock('./RequestDocumentModal', () => ({ RequestDocumentModal: () => null }));
vi.mock('./CreditMemoDraftModal', () => ({ CreditMemoDraftModal: () => null }));
vi.mock('./DraftBorrowerUpdateModal', () => ({
  DraftBorrowerUpdateModal: () => null,
}));

// Phase 77 RelationshipContext is a read-only card on the banker deal
// workspace that pulls the SDK-backed banker work-queue loader. This
// test is about write scoping, so the card is stubbed to keep the
// SDK service chain (Cr664_loandealsService et al.) out of the module
// graph — the workspace gating invariants this file pins are
// orthogonal to relationship-context rendering.
vi.mock('./RelationshipContext', () => ({
  RelationshipContext: () => null,
}));

// Phase 80 DealAutopilotPanel is a read-only suggestion surface that
// consumes the shared consistency-check module. This test cares only
// about write scoping; stubbing the panel keeps the test's module
// graph focused on the governed-write surfaces.
vi.mock('./DealAutopilotPanel', () => ({
  DealAutopilotPanel: () => null,
}));

// Phase 97: TeamsDealSummaryHandoff now imports loadBankerWorkQueueData
// to thread the cross-deal relationship note into the Phase 96 Teams
// summary. Same SDK-chain reason as RelationshipContext above —
// stubbed here to keep this test's module graph focused on the
// governed-write surfaces.
vi.mock('./TeamsDealSummaryHandoff', () => ({
  TeamsDealSummaryHandoff: () => null,
}));

// Stub role identity providers so the workspaces have valid context
// without firing the real bootstrap / identity chain.
vi.mock('../banker/BankerProvider', () => ({
  BankerProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('../banker/BankerContext', () => ({
  useBanker: () => ({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  }),
  useOptionalBanker: () => null,
}));
vi.mock('../manager/ManagerProvider', () => ({
  ManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
vi.mock('../team/TeamProvider', () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

import { BankerDealWorkspace } from './BankerDealWorkspace';
import { ManagerDealWorkspace } from '../manager/ManagerDealWorkspace';
import { TeamDealWorkspace } from '../team/TeamDealWorkspace';

const READY_DEAL = {
  kind: 'ready' as const,
  deal: {
    id: 'deal-77',
    name: 'Acme Working Capital',
    clientName: 'Acme',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-09-30T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'Two personal',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R, inventory',
    createdOn: '2026-01-15T00:00:00Z',
    stageEntryDate: '2026-05-01T00:00:00Z',
    isClosed: false,
  },
};

function emptyChildren() {
  // Resolved-but-empty results for the four child queries.
  loadDealTasks.mockResolvedValue({ open: [], completed: [] });
  loadDealDocuments.mockResolvedValue({
    outstanding: [],
    received: [],
    reviewed: [],
  });
  loadDealCreditMemo.mockResolvedValue({ memos: [], sections: [] });
  loadDealActivity.mockResolvedValue([]);
}

const BANKER_WRITE_BUTTON_PATTERNS: RegExp[] = [
  /complete task/i,
  /request document/i,
  /generate credit memo draft preview/i,
  /draft borrower update/i,
  /save credit memo draft/i,
];

function assertNoBankerWriteButtons() {
  for (const pattern of BANKER_WRITE_BUTTON_PATTERNS) {
    expect(
      screen.queryAllByRole('button', { name: pattern }),
      `Expected no buttons matching ${pattern.source} to render in this role view`,
    ).toEqual([]);
  }
}

beforeEach(() => {
  loadDealForBankerMock.mockReset();
  loadDealForManagerMock.mockReset();
  loadDealForTeamMock.mockReset();
  loadDealTasks.mockReset();
  loadDealDocuments.mockReset();
  loadDealCreditMemo.mockReset();
  loadDealActivity.mockReset();
  completeTaskMock.mockReset();
  requestDocumentMock.mockReset();
  saveCreditMemoDraftMock.mockReset();
  auditCreateMock.mockReset();
  timelineCreateMock.mockReset();
});

afterEach(() => {
  // Universal invariant across every test: the governed write actions
  // and the audit + timeline services must NEVER fire from these
  // workspaces in the scenarios under test (denied / failed /
  // loading / read-only-ready). A regression in workspace gating
  // would surface here loudly.
  expect(completeTaskMock).not.toHaveBeenCalled();
  expect(requestDocumentMock).not.toHaveBeenCalled();
  expect(saveCreditMemoDraftMock).not.toHaveBeenCalled();
  expect(auditCreateMock).not.toHaveBeenCalled();
  expect(timelineCreateMock).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Suite 1 — Manager workspace with auth=ready never renders banker writes.
// ---------------------------------------------------------------------------
describe('ManagerDealWorkspace — auth=ready end-to-end write scoping', () => {
  it('renders ZERO banker write buttons after authorization succeeds', async () => {
    loadDealForManagerMock.mockResolvedValue(READY_DEAL);
    emptyChildren();
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    // Wait for the workspace to finish loading; the breadcrumb is a
    // stable visible marker that the deal mounted.
    await waitFor(() =>
      expect(screen.getByText(/manager command center/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Team workspace with auth=ready never renders banker writes.
// ---------------------------------------------------------------------------
describe('TeamDealWorkspace — auth=ready end-to-end write scoping', () => {
  it('renders ZERO banker write buttons after authorization succeeds', async () => {
    loadDealForTeamMock.mockResolvedValue(READY_DEAL);
    emptyChildren();
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/team command center/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Denied / failed / loading paths never render write surfaces,
// never call write actions, never call audit/timeline services. Covers
// all three role workspaces.
// ---------------------------------------------------------------------------
describe('All role deal workspaces — write surface + governance services on denied/failed/loading paths', () => {
  it('Banker workspace denied: no write buttons + no write/audit/timeline calls', async () => {
    loadDealForBankerMock.mockResolvedValue({ kind: 'denied' });
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });

  it('Banker workspace not-found: no write buttons + no write/audit/timeline calls', async () => {
    loadDealForBankerMock.mockResolvedValue({ kind: 'not-found' });
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="missing" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/deal not found/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });

  it('Banker workspace failed: no write buttons + no write/audit/timeline calls', async () => {
    loadDealForBankerMock.mockResolvedValue({
      kind: 'failed',
      message: 'service unavailable',
    });
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/could not load deal/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });

  it('Banker workspace loading: no write buttons + no write/audit/timeline calls', () => {
    loadDealForBankerMock.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/loading deal/i)).toBeInTheDocument();
    assertNoBankerWriteButtons();
  });

  it('Manager workspace denied: no write buttons + no write/audit/timeline calls', async () => {
    loadDealForManagerMock.mockResolvedValue({ kind: 'denied' });
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });

  it('Manager workspace failed: no write buttons + no write/audit/timeline calls', async () => {
    loadDealForManagerMock.mockResolvedValue({
      kind: 'failed',
      message: 'service unavailable',
    });
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/could not load deal/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });

  it('Team workspace denied: no write buttons + no write/audit/timeline calls', async () => {
    loadDealForTeamMock.mockResolvedValue({ kind: 'denied' });
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });

  it('Team workspace failed: no write buttons + no write/audit/timeline calls', async () => {
    loadDealForTeamMock.mockResolvedValue({
      kind: 'failed',
      message: 'service unavailable',
    });
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/could not load deal/i)).toBeInTheDocument(),
    );
    assertNoBankerWriteButtons();
  });
});
