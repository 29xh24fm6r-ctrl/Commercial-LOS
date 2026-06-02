// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DealDetail, DealLoadResult } from './dealQueries';
import type { AsyncResult } from './DealDataProvider';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';

/**
 * Phase 123B — BankerDealWorkspace pilot wiring regression.
 *
 * Pins:
 *   - the shared deal-intelligence view-model is the source of
 *     truth for the banker cockpit (DealIntelligenceBeacon present);
 *   - Phase-122-hydrated identity / stage / status / banker render
 *     unchanged (DealHeader still observes the deal directly);
 *   - the beacon surfaces hydrated Product Type / Loan Structure /
 *     Pricing Type / Client Name / Banker Name when populated;
 *   - the beacon OMITS data-vm-* attributes for undefined values
 *     (honest absence at the attribute boundary — no fake
 *     fallback strings injected);
 *   - the beacon never carries 'Not set' / 'N/A' / 'TBD' / 'Unknown'
 *     placeholders even when source values are absent;
 *   - existing BankerDealWorkspace.test.tsx regressions still hold
 *     (left/right columns, anchor preservation) — covered by the
 *     existing test file; this file adds the VM-pilot pins.
 */

const { useBankerMock } = vi.hoisted(() => ({ useBankerMock: vi.fn() }));
const { loadDealForBankerMock } = vi.hoisted(() => ({
  loadDealForBankerMock: vi.fn(),
}));
const { dealDataState } = vi.hoisted(() => ({
  dealDataState: {
    // Mutated per test before render so the mocked useDealData returns
    // the right shape for the assertions in that test.
    deal: undefined as DealDetail | undefined,
    tasks: { kind: 'loading' } as AsyncResult<DealTasksResult>,
    documents: { kind: 'loading' } as AsyncResult<DealDocumentsResult>,
    creditMemo: { kind: 'loading' } as AsyncResult<CreditMemoData>,
    activity: { kind: 'loading' } as AsyncResult<TimelineEvent[]>,
  },
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

// Stub DealDataProvider with a passthrough container; expose
// useDealData by reading the mutable dealDataState above so each
// test can supply its own deal + AsyncResult shape.
vi.mock('./DealDataProvider', () => ({
  DealDataProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="deal-data-provider">{children}</div>
  ),
  useDealData: () => {
    if (!dealDataState.deal) {
      throw new Error(
        'BankerDealWorkspace.intelligence.test: dealDataState.deal not initialised',
      );
    }
    return {
      deal: dealDataState.deal,
      tasks: dealDataState.tasks,
      documents: dealDataState.documents,
      creditMemo: dealDataState.creditMemo,
      activity: dealDataState.activity,
      refresh: () => undefined,
    };
  },
}));

// Real DealHeader is left in place so we can assert hydrated values
// render in the navy hero. All other cards are stubbed so this test
// only covers the cockpit shell + the pilot beacon contract.
vi.mock('./DealSummary', () => ({
  DealSummary: () => <div data-testid="card-deal-summary" />,
}));
vi.mock('./DealMetricDeck', () => ({
  DealMetricDeck: () => <div data-testid="card-deal-metric-deck" />,
}));
vi.mock('./DealWorkstreamPanel', () => ({
  DealWorkstreamPanel: () => <div data-testid="card-deal-workstream-panel" />,
}));
vi.mock('./DealAutopilotPanel', () => ({
  DealAutopilotPanel: () => <div data-testid="card-deal-autopilot" />,
}));
vi.mock('./RelationshipContext', () => ({
  RelationshipContext: () => <div data-testid="card-relationship-context" />,
}));
vi.mock('./DealBlockers', () => ({
  DealBlockers: () => <div data-testid="card-deal-blockers" />,
}));
vi.mock('./DealStageProgressionCard', () => ({
  DealStageProgressionCard: () => (
    <div data-testid="card-deal-stage-progression" />
  ),
}));
vi.mock('./DealTasks', () => ({
  DealTasks: () => <div data-testid="card-deal-tasks" />,
}));
vi.mock('./DealDocuments', () => ({
  DealDocuments: () => <div data-testid="card-deal-documents" />,
}));
vi.mock('./CreditMemo', () => ({
  CreditMemo: () => <div data-testid="card-credit-memo" />,
}));
vi.mock('./ActivityTimeline', () => ({
  ActivityTimeline: () => <div data-testid="card-activity-timeline" />,
}));
vi.mock('./BorrowerCommunication', () => ({
  BorrowerCommunication: () => <div data-testid="card-borrower-communication" />,
}));
vi.mock('./TeamsChatHandoff', () => ({
  TeamsChatHandoff: () => <div data-testid="card-teams-chat-handoff" />,
}));
vi.mock('./TeamsDealSummaryHandoff', () => ({
  TeamsDealSummaryHandoff: () => (
    <div data-testid="card-teams-deal-summary-handoff" />
  ),
}));

import { BankerDealWorkspace } from './BankerDealWorkspace';

function baseDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-pilot',
    name: 'Pilot Deal — Phase 123B',
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
    ...over,
  };
}

function hydratedDeal(): DealDetail {
  return baseDeal({
    clientName: 'Hydrated Client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_500_000,
    bankerName: 'Hydrated Banker',
    targetCloseDate: '2026-09-01',
    productType: 'SBA 7(a)',
    loanStructure: 'Term Loan',
    pricingType: 'Variable',
    customerType: 'LLC',
    industry: 'Manufacturing',
    guarantorStructure: 'Personal',
    collateralSummary: 'Real estate, equipment',
    stageEntryDate: '2026-05-15',
  });
}

function readyLoadResult(deal: DealDetail): DealLoadResult {
  return { kind: 'ready', deal };
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
  dealDataState.deal = undefined;
  dealDataState.tasks = { kind: 'loading' };
  dealDataState.documents = { kind: 'loading' };
  dealDataState.creditMemo = { kind: 'loading' };
  dealDataState.activity = { kind: 'loading' };
});

function renderWorkspace() {
  return render(
    <MemoryRouter>
      <BankerDealWorkspace dealId="d-pilot" />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Beacon presence — proves shared VM is wired into the banker cockpit
// ---------------------------------------------------------------------------

describe('Phase 123B — pilot wiring: DealIntelligenceBeacon present', () => {
  it('renders the beacon, proving the shared deal-intelligence view-model is the cockpit source of truth', async () => {
    const deal = hydratedDeal();
    dealDataState.deal = deal;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(deal));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const beacon = screen.getByTestId('deal-intelligence-beacon');
    expect(beacon).toBeInTheDocument();
    expect(beacon.getAttribute('data-deal-intelligence-beacon')).toBe(
      'banker-cockpit',
    );
    expect(beacon.getAttribute('data-vm-deal-id')).toBe('d-pilot');
    expect(beacon.getAttribute('data-vm-closure')).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// Hydrated Phase-122 values flow through the VM into the beacon
// ---------------------------------------------------------------------------

describe('Phase 123B — beacon hydration', () => {
  it('surfaces hydrated Client / Banker / Stage / Status from the loader through the VM', async () => {
    const deal = hydratedDeal();
    dealDataState.deal = deal;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(deal));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const beacon = screen.getByTestId('deal-intelligence-beacon');
    expect(beacon.getAttribute('data-vm-client-name')).toBe('Hydrated Client');
    expect(beacon.getAttribute('data-vm-banker-name')).toBe('Hydrated Banker');
    expect(beacon.getAttribute('data-vm-stage')).toBe('Underwriting');
    expect(beacon.getAttribute('data-vm-status')).toBe('Active');
  });

  it('surfaces hydrated Product Type / Loan Structure / Pricing Type from the loader through the VM', async () => {
    const deal = hydratedDeal();
    dealDataState.deal = deal;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(deal));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const beacon = screen.getByTestId('deal-intelligence-beacon');
    expect(beacon.getAttribute('data-vm-product-type')).toBe('SBA 7(a)');
    expect(beacon.getAttribute('data-vm-loan-structure')).toBe('Term Loan');
    expect(beacon.getAttribute('data-vm-pricing-type')).toBe('Variable');
  });

  it('renders the hydrated identity values in the navy hero (Phase 122 mapping preserved end-to-end)', async () => {
    const deal = hydratedDeal();
    dealDataState.deal = deal;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(deal));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const hero = screen.getByLabelText('Deal command hero');
    expect(hero).toHaveTextContent('Hydrated Client');
    expect(hero).toHaveTextContent('Hydrated Banker');
    expect(hero).toHaveTextContent('Underwriting');
    expect(hero).toHaveTextContent('Status · Active');
  });
});

// ---------------------------------------------------------------------------
// Honest absence — undefined source → attribute omitted, no fake fallback
// ---------------------------------------------------------------------------

describe('Phase 123B — honest absence at the beacon boundary', () => {
  it('OMITS data-vm-* attributes for fields the loader returned undefined', async () => {
    // Sparse deal — none of the Phase-122 fields are populated.
    const sparse = baseDeal();
    dealDataState.deal = sparse;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(sparse));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const beacon = screen.getByTestId('deal-intelligence-beacon');
    // Identity and Phase-122-reference attributes must be absent
    // when their loader value is undefined.
    expect(beacon.hasAttribute('data-vm-client-name')).toBe(false);
    expect(beacon.hasAttribute('data-vm-banker-name')).toBe(false);
    expect(beacon.hasAttribute('data-vm-stage')).toBe(false);
    expect(beacon.hasAttribute('data-vm-status')).toBe(false);
    expect(beacon.hasAttribute('data-vm-product-type')).toBe(false);
    expect(beacon.hasAttribute('data-vm-loan-structure')).toBe(false);
    expect(beacon.hasAttribute('data-vm-pricing-type')).toBe(false);
  });

  it('never injects fake-fallback placeholder text into the beacon attributes', async () => {
    const sparse = baseDeal();
    dealDataState.deal = sparse;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(sparse));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const beacon = screen.getByTestId('deal-intelligence-beacon');
    const html = beacon.outerHTML;
    expect(html).not.toMatch(/data-vm-[a-z-]+="Not set"/);
    expect(html).not.toMatch(/data-vm-[a-z-]+="N\/A"/);
    expect(html).not.toMatch(/data-vm-[a-z-]+="TBD"/);
    expect(html).not.toMatch(/data-vm-[a-z-]+="Unknown"/);
    expect(html).not.toMatch(/data-vm-[a-z-]+="undefined"/);
    expect(html).not.toMatch(/data-vm-[a-z-]+="—"/);
    expect(html).not.toMatch(/data-vm-[a-z-]+=""/);
  });

  it('still surfaces structural attributes (deal id / closure / counts) on a sparse deal', async () => {
    const sparse = baseDeal();
    dealDataState.deal = sparse;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(sparse));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const beacon = screen.getByTestId('deal-intelligence-beacon');
    expect(beacon.getAttribute('data-vm-deal-id')).toBe('d-pilot');
    expect(beacon.getAttribute('data-vm-closure')).toBe('open');
    expect(beacon.getAttribute('data-vm-completeness-pct')).toBe('0');
    expect(beacon.getAttribute('data-vm-open-task-count')).toBe('0');
    expect(beacon.getAttribute('data-vm-overdue-task-count')).toBe('0');
    expect(beacon.getAttribute('data-vm-outstanding-document-count')).toBe('0');
    expect(beacon.getAttribute('data-vm-last-activity-state')).toBe('unknown');
  });

  it('closed deals project closure=closed and never invent a nextBestAction', async () => {
    const closed = baseDeal({
      isClosed: true,
      clientName: 'Closed Client',
      stage: 'Closed Won',
      status: 'Closed',
    });
    dealDataState.deal = closed;
    loadDealForBankerMock.mockResolvedValue(readyLoadResult(closed));

    renderWorkspace();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    const beacon = screen.getByTestId('deal-intelligence-beacon');
    expect(beacon.getAttribute('data-vm-closure')).toBe('closed');
    expect(beacon.hasAttribute('data-vm-next-best-action-id')).toBe(false);
  });
});
