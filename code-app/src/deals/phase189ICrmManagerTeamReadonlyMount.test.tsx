// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 189I — Manager/Team CRM read-only mount parity (render proof).
 *
 * Pins that the banker, manager, AND team authorized deal workspaces each
 * render the existing read-only CRM relationship panel + detail cards
 * (DealCrmRelationshipPanel → CrmRelationshipPanel + CrmRelationshipDetailCards)
 * once authorization resolves to `ready`. The CRM surface is read-only: it
 * renders no write button anywhere in the panel/cards region.
 *
 * Module-graph isolation mirrors dealWorkspaceWriteScoping.test.tsx: the deal
 * loaders, child queries, governed write services, modals, and SDK-backed cards
 * are mocked at the boundary so no Dataverse/SDK chain is pulled in. The CRM
 * panel/cards are deliberately NOT mocked — they render for real.
 *
 * `loadLiveDealIndustryProjection` IS mocked (SDK boundary): the panel auto-
 * fires a real CRM/NAICS industry refresh on mount whenever the deal carries a
 * client id (READY_DEAL does), independent of role authorization. Left
 * unmocked, that refresh chains into unmocked generated-service dynamic
 * imports that settle after this test (and RTL's per-test `cleanup()`) have
 * already moved on — an unhandled rejection plus a post-unmount state update.
 * Mocking it to resolve immediately lets every test explicitly await that
 * refresh to completion before finishing (see `expectReadOnlyCrmMount`).
 */

const {
  loadDealForBankerMock,
  loadDealForManagerMock,
  loadDealForTeamMock,
  loadDealTasks,
  loadDealDocuments,
  loadDealCreditMemo,
  loadDealActivity,
  loadLiveDealIndustryProjectionMock,
} = vi.hoisted(() => ({
  loadDealForBankerMock: vi.fn(),
  loadDealForManagerMock: vi.fn(),
  loadDealForTeamMock: vi.fn(),
  loadDealTasks: vi.fn(),
  loadDealDocuments: vi.fn(),
  loadDealCreditMemo: vi.fn(),
  loadDealActivity: vi.fn(),
  loadLiveDealIndustryProjectionMock: vi.fn(),
}));

vi.mock('../crm/dealIndustryProjection', () => ({
  loadLiveDealIndustryProjection: loadLiveDealIndustryProjectionMock,
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

// Governed write actions + audit/timeline/Office365 boundaries — stubbed so the
// real @microsoft/power-apps SDK / generated services are never loaded.
vi.mock('./dealTaskActions', () => ({ completeTask: vi.fn() }));
vi.mock('./documentActions', () => ({ requestDocument: vi.fn() }));
vi.mock('./creditMemoActions', () => ({ saveCreditMemoDraft: vi.fn() }));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));

// Per-card modal + SDK-backed card stubs (same boundaries as the write-scoping
// regression test). These keep the module graph focused on the CRM mount.
vi.mock('./CompleteTaskModal', () => ({ CompleteTaskModal: () => null }));
vi.mock('./RequestDocumentModal', () => ({ RequestDocumentModal: () => null }));
vi.mock('./CreditMemoDraftModal', () => ({ CreditMemoDraftModal: () => null }));
vi.mock('./DraftBorrowerUpdateModal', () => ({ DraftBorrowerUpdateModal: () => null }));
vi.mock('./RelationshipContext', () => ({ RelationshipContext: () => null }));
vi.mock('./DealAutopilotPanel', () => ({ DealAutopilotPanel: () => null }));
vi.mock('./TeamsDealSummaryHandoff', () => ({ TeamsDealSummaryHandoff: () => null }));

// Role identity providers — stubbed so the workspaces have valid context
// without the real bootstrap/identity chain. useOptionalBanker returns null in
// the manager/team workspaces (no banker context); the CRM panel degrades
// honestly to the authorized deal row's lookup ids.
vi.mock('../banker/BankerProvider', () => ({
  BankerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

// A ready deal carrying real CRM lookup ids so the panel renders meaningful
// (safe) detail sections, not just blocked placeholders.
const READY_DEAL = {
  kind: 'ready' as const,
  deal: {
    id: 'deal-77',
    name: 'Acme Working Capital',
    clientId: 'client-guid',
    clientName: 'Acme Holdings LLC',
    clientLookupClassification: 'real-lookup' as const,
    teamId: 'team-guid',
    teamName: 'Commercial East',
    teamLookupClassification: 'real-lookup' as const,
    assignedBankerId: 'banker-guid',
    bankerName: 'Dana Banker',
    assignedBankerLookupClassification: 'real-lookup' as const,
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    targetCloseDate: '2026-09-30T00:00:00Z',
    productType: 'RLOC',
    createdOn: '2026-01-15T00:00:00Z',
    stageEntryDate: '2026-05-01T00:00:00Z',
    isClosed: false,
  },
};

function resolveEmptyChildren() {
  loadDealTasks.mockResolvedValue({ open: [], completed: [] });
  loadDealDocuments.mockResolvedValue({ outstanding: [], received: [], reviewed: [] });
  loadDealCreditMemo.mockResolvedValue({ memos: [], sections: [] });
  loadDealActivity.mockResolvedValue([]);
}

async function expectReadOnlyCrmMount() {
  // Panel + detail cards both render.
  const panel = await screen.findByTestId('crm-relationship-panel');
  expect(panel).toBeInTheDocument();
  const cards = screen.getByTestId('crm-relationship-detail-cards');
  expect(cards).toBeInTheDocument();
  expect(screen.getByTestId('crm-detail-provenance')).toBeInTheDocument();
  // Read-only: no write affordance anywhere in the panel or detail cards.
  expect(within(panel).queryByRole('button')).toBeNull();
  expect(within(cards).queryByRole('button')).toBeNull();
  expect(within(panel).queryByRole('textbox')).toBeNull();

  // Await the panel's auto-fired CRM/NAICS industry refresh (it runs on mount
  // for any authorized role once a client id is present, per
  // CrmRelationshipPanel.tsx's effectiveClientId effect) to completion, so no
  // work is still in flight when this test — and RTL's afterEach `cleanup()`
  // — finish. `act` flushes the state updates chained after the mocked
  // projection promise resolves.
  await waitFor(() => expect(loadLiveDealIndustryProjectionMock).toHaveBeenCalled());
  await act(async () => {});
}

beforeEach(() => {
  loadDealForBankerMock.mockReset();
  loadDealForManagerMock.mockReset();
  loadDealForTeamMock.mockReset();
  loadDealTasks.mockReset();
  loadDealDocuments.mockReset();
  loadDealCreditMemo.mockReset();
  loadDealActivity.mockReset();
  loadLiveDealIndustryProjectionMock.mockReset();
  loadLiveDealIndustryProjectionMock.mockResolvedValue({ kind: 'no-org-link' });
  resolveEmptyChildren();
});

describe('Phase 189I — read-only CRM mount parity across role deal workspaces', () => {
  it('Banker deal workspace renders the read-only CRM panel/cards (unchanged mount)', async () => {
    loadDealForBankerMock.mockResolvedValue(READY_DEAL);
    render(
      <MemoryRouter>
        <BankerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await expectReadOnlyCrmMount();
  });

  it('Manager deal workspace renders the read-only CRM panel/cards (Phase 189I)', async () => {
    loadDealForManagerMock.mockResolvedValue(READY_DEAL);
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/manager command center/i)).toBeInTheDocument(),
    );
    await expectReadOnlyCrmMount();
  });

  it('Team deal workspace renders the read-only CRM panel/cards (Phase 189I)', async () => {
    loadDealForTeamMock.mockResolvedValue(READY_DEAL);
    render(
      <MemoryRouter>
        <TeamDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/team command center/i)).toBeInTheDocument(),
    );
    await expectReadOnlyCrmMount();
  });

  it('Manager/Team CRM mount does not render while authorization is denied', async () => {
    loadDealForManagerMock.mockResolvedValue({ kind: 'denied' });
    render(
      <MemoryRouter>
        <ManagerDealWorkspace dealId="deal-77" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('crm-relationship-panel')).toBeNull();
  });
});
