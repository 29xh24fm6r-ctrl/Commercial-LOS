// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DealLoadResult } from './dealQueries';

/**
 * Phase 125B — Banker Deal Workspace cockpit layout tests.
 *
 * Pins:
 *   - the workspace renders without crashing for a sparse
 *     `TEST — Deal Phase 121`-style deal (the path that triggered
 *     the Phase 125 React error #310 in production);
 *   - the cockpit two-column grid renders both columns with their
 *     aria labels (Phase 125B layout invariant);
 *   - every Phase 80 / 96 `data-deal-card` anchor used by the
 *     autopilot scrollIntoView still exists in the rendered DOM,
 *     in either column;
 *   - the hero band renders the deal name as the page's <h1>;
 *   - the navy hero surface exposes the honest "Not set" copy
 *     for missing client / banker / target close / amount cells;
 *   - the rendered DOM does NOT carry forbidden communication-
 *     lane vocabulary (Phase 110 lock at the integration layer);
 *   - the source file does NOT import Office365OutlookService /
 *     SendEmailV2 / any sendXEmail action (Phase 110 static-
 *     source pin).
 *
 * Strategy: every child card is mocked as a sentinel `<div
 * data-testid="...">`. This isolates the layout / anchor /
 * sparse-deal-render invariants from each child card's own
 * test surface, and avoids the SDK boundary entirely. The
 * existing per-card test files cover each card's internals.
 */

const { useBankerMock } = vi.hoisted(() => ({ useBankerMock: vi.fn() }));
const { loadDealForBankerMock } = vi.hoisted(() => ({
  loadDealForBankerMock: vi.fn(),
}));

vi.mock('../banker/BankerContext', () => ({
  useBanker: useBankerMock,
  useOptionalBanker: () => undefined,
}));

vi.mock('./dealQueries', () => ({
  loadDealForBanker: loadDealForBankerMock,
  loadDealForManager: vi.fn(),
  loadDealForTeam: vi.fn(),
}));

// Stub the data provider so child cards never call real loaders.
vi.mock('./DealDataProvider', () => {
  return {
    DealDataProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="deal-data-provider">{children}</div>
    ),
    useDealData: () => ({
      deal: {
        id: 'd-sparse',
        name: 'TEST — Deal Phase 121',
        clientName: undefined,
        stage: undefined,
        status: undefined,
        amount: undefined,
        bankerName: undefined,
        targetCloseDate: undefined,
        productType: undefined,
        loanStructure: undefined,
        customerType: undefined,
        industry: undefined,
        guarantorStructure: undefined,
        pricingType: undefined,
        spreadIndex: undefined,
        spreadMargin: undefined,
        collateralSummary: undefined,
        createdOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
      },
      tasks: { kind: 'loading' },
      documents: { kind: 'loading' },
      creditMemo: { kind: 'loading' },
      activity: { kind: 'loading' },
      refresh: () => undefined,
    }),
  };
});

// Stub every child card — they each have their own test file. The
// real `DealHeader` is left in place so the navy-hero + metric-
// strip + sparse "Not set" copy can be observed in this integration
// test.
vi.mock('./DealSummary', () => ({
  DealSummary: () => <div data-testid="card-deal-summary">DealSummary</div>,
}));
vi.mock('./DealMetricDeck', () => ({
  DealMetricDeck: () => (
    <div data-testid="card-deal-metric-deck">DealMetricDeck</div>
  ),
}));
vi.mock('./DealWorkstreamPanel', () => ({
  DealWorkstreamPanel: () => (
    <div data-testid="card-deal-workstream-panel">DealWorkstreamPanel</div>
  ),
}));
vi.mock('./DealAutopilotPanel', () => ({
  DealAutopilotPanel: () => (
    <div data-testid="card-deal-autopilot">DealAutopilotPanel</div>
  ),
}));
vi.mock('./RelationshipContext', () => ({
  RelationshipContext: () => (
    <div data-testid="card-relationship-context">RelationshipContext</div>
  ),
}));
vi.mock('./DealBlockers', () => ({
  DealBlockers: () => <div data-testid="card-deal-blockers">DealBlockers</div>,
}));
vi.mock('./DealStageProgressionCard', () => ({
  DealStageProgressionCard: () => (
    <div data-testid="card-deal-stage-progression">DealStageProgressionCard</div>
  ),
}));
vi.mock('./DealTasks', () => ({
  DealTasks: () => <div data-testid="card-deal-tasks">DealTasks</div>,
}));
vi.mock('./DealDocuments', () => ({
  DealDocuments: () => (
    <div data-testid="card-deal-documents">DealDocuments</div>
  ),
}));
vi.mock('./CreditMemo', () => ({
  CreditMemo: () => <div data-testid="card-credit-memo">CreditMemo</div>,
}));
vi.mock('./ActivityTimeline', () => ({
  ActivityTimeline: () => (
    <div data-testid="card-activity-timeline">ActivityTimeline</div>
  ),
}));
vi.mock('./BorrowerCommunication', () => ({
  BorrowerCommunication: () => (
    <div data-testid="card-borrower-communication">BorrowerCommunication</div>
  ),
}));
vi.mock('./TeamsChatHandoff', () => ({
  TeamsChatHandoff: () => (
    <div data-testid="card-teams-chat-handoff">TeamsChatHandoff</div>
  ),
}));
vi.mock('./TeamsDealSummaryHandoff', () => ({
  TeamsDealSummaryHandoff: () => (
    <div data-testid="card-teams-deal-summary-handoff">
      TeamsDealSummaryHandoff
    </div>
  ),
}));

import { BankerDealWorkspace } from './BankerDealWorkspace';

function sparseDeal(): DealLoadResult {
  return {
    kind: 'ready',
    deal: {
      id: 'd-sparse',
      name: 'TEST — Deal Phase 121',
      clientName: undefined,
      stage: undefined,
      status: undefined,
      amount: undefined,
      bankerName: undefined,
      targetCloseDate: undefined,
      productType: undefined,
      loanStructure: undefined,
      customerType: undefined,
      industry: undefined,
      guarantorStructure: undefined,
      pricingType: undefined,
      spreadIndex: undefined,
      spreadMargin: undefined,
      collateralSummary: undefined,
      createdOn: undefined,
      stageEntryDate: undefined,
      isClosed: false,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'Matthew Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  });
});

function renderWorkspace() {
  return render(
    <MemoryRouter>
      <BankerDealWorkspace dealId="d-sparse" />
    </MemoryRouter>,
  );
}

describe('Phase 125B — BankerDealWorkspace cockpit', () => {
  it('renders without crashing for a sparse TEST-style deal (Phase 125 hotfix regression at integration layer)', async () => {
    loadDealForBankerMock.mockResolvedValue(sparseDeal());
    renderWorkspace();
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /TEST — Deal Phase 121/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders the two-column cockpit grid with both labeled regions', async () => {
    loadDealForBankerMock.mockResolvedValue(sparseDeal());
    renderWorkspace();
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /TEST — Deal Phase 121/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('group', { name: /Deal cockpit/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Deal intelligence and detail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Attention and work surfaces/i }),
    ).toBeInTheDocument();
  });

  it('places intelligence cards in the LEFT column and attention cards in the RIGHT column', async () => {
    loadDealForBankerMock.mockResolvedValue(sparseDeal());
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const left = screen.getByRole('region', {
      name: /Deal intelligence and detail/i,
    });
    const right = screen.getByRole('region', {
      name: /Attention and work surfaces/i,
    });

    // Left column — intelligence + detail. Phase 125D moved
    // DealBlockers into the intelligence column (Attention
    // Console zone) so the AttentionConsole + StageMap +
    // ActionConsole + Workstream Panel + DealSummary read as
    // one cockpit panel; the right column is now the
    // dashboard-style work-surface rail.
    expect(within(left).getByTestId('card-deal-blockers')).toBeInTheDocument();
    expect(
      within(left).getByTestId('card-deal-stage-progression'),
    ).toBeInTheDocument();
    expect(within(left).getByTestId('card-deal-autopilot')).toBeInTheDocument();
    expect(within(left).getByTestId('card-deal-summary')).toBeInTheDocument();
    expect(
      within(left).getByTestId('card-relationship-context'),
    ).toBeInTheDocument();
    expect(within(left).getByTestId('card-credit-memo')).toBeInTheDocument();
    expect(
      within(left).getByTestId('card-activity-timeline'),
    ).toBeInTheDocument();

    // Right column — work surfaces.
    expect(within(right).getByTestId('card-deal-tasks')).toBeInTheDocument();
    expect(within(right).getByTestId('card-deal-documents')).toBeInTheDocument();
    expect(
      within(right).getByTestId('card-borrower-communication'),
    ).toBeInTheDocument();
    expect(
      within(right).getByTestId('card-teams-chat-handoff'),
    ).toBeInTheDocument();
    expect(
      within(right).getByTestId('card-teams-deal-summary-handoff'),
    ).toBeInTheDocument();
  });

  it('preserves every Phase 80 / 96 data-deal-card anchor used by the autopilot scrollIntoView (anchor presence is part of the contract regardless of which column the card sits in)', async () => {
    loadDealForBankerMock.mockResolvedValue(sparseDeal());
    const { container } = renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    for (const anchor of [
      'stage-progression',
      'tasks',
      'documents',
      'credit-memo',
      'activity-timeline',
      'borrower-communication',
      'teams-chat-handoff',
      'teams-deal-summary-handoff',
    ]) {
      expect(
        container.querySelector(`[data-deal-card="${anchor}"]`),
      ).not.toBeNull();
    }
  });

  it('renders the navy command hero with honest "Not set" copy for a fully sparse deal', async () => {
    loadDealForBankerMock.mockResolvedValue(sparseDeal());
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Phase 125E — the hero <header> is labeled "Deal command hero".
    // It now carries identity slots (Client / Banker / Stage) + a
    // single Status chip; the loan amount / target close moved into
    // the DealMetricDeck below the hero.
    const hero = screen.getByLabelText('Deal command hero');
    expect(within(hero).getByText(/Commercial Lending Cockpit/i)).toBeInTheDocument();
    expect(within(hero).getByText(/Status · Not set/i)).toBeInTheDocument();
    // The identity slots paint "Not set" / "Not assigned" for missing
    // client / banker / stage on the sparse seed.
    expect(within(hero).getAllByText('Not set').length).toBeGreaterThanOrEqual(2);
    expect(within(hero).getByText('Not assigned')).toBeInTheDocument();
  });

  it('does NOT render any forbidden Phase-110 communication-lane vocabulary in the integration view', async () => {
    loadDealForBankerMock.mockResolvedValue(sparseDeal());
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });

  it('does NOT introduce fake AI / predictive / ranking / approval-odds language in the workspace shell', async () => {
    loadDealForBankerMock.mockResolvedValue(sparseDeal());
    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bAI[- ]?generated\b/i);
    expect(text).not.toMatch(/\bapproval\s+probability\b/i);
    expect(text).not.toMatch(/\bapproval\s+odds\b/i);
    expect(text).not.toMatch(/\bborrower\s+sentiment\b/i);
    expect(text).not.toMatch(/\bpredicted\s+close\s+date\b/i);
    expect(text).not.toMatch(/\brisk\s+rating\b/i);
  });
});

describe('Phase 125B — BankerDealWorkspace.tsx static-source pins', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'BankerDealWorkspace.tsx'),
    'utf8',
  );

  it('does NOT import Office365OutlookService (Phase 110 lock)', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*Office365OutlookService['"]/);
  });

  it('does NOT call SendEmailV2 (Phase 110 single-callsite invariant)', () => {
    expect(SRC).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('does NOT import any sendXEmail governed-write action', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
  });
});
