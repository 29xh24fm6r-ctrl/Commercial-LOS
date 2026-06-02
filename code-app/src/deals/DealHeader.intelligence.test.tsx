// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealIntelligenceViewModel } from '../shared/dealIntelligenceViewModel';

/**
 * Phase 123C — DealHeader Deal Intelligence VM wiring tests.
 *
 * Pins:
 *   - When the BankerDealWorkspace's DealIntelligenceProvider is
 *     mounted, DealHeader prefers VM values for identity / banker /
 *     stage / status / closure (proves the cockpit routes through
 *     the shared deriver, even though the values are byte-equivalent
 *     to deal.* today).
 *   - When no provider is mounted, DealHeader falls back to the deal
 *     record so the component stays usable standalone (existing per-
 *     card tests in DealHeader.test.tsx continue to pass unchanged).
 *   - Honest absence preserved: undefined VM fields surface as the
 *     same "Not set" / "Not assigned" copy DealHeader already shows
 *     for missing deal fields — no fake fallback strings injected
 *     through the VM path.
 *   - Closure pill rendered from vm.closure when VM present, from
 *     deal.isClosed when absent.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { DealHeader } from './DealHeader';
import { DealIntelligenceContext } from '../shared/dealIntelligenceContext';

const useDealDataMock = vi.mocked(useDealData);

function deal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-id-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    name: 'TEST — Deal Phase 121',
    clientName: 'TEST — Borrower Phase 121',
    bankerName: 'Matthew Paller',
    stage: 'Underwriting',
    status: 'Active',
    amount: 2_500_000,
    targetCloseDate: '2026-06-03',
    stageEntryDate: '2026-05-20',
    createdOn: '2026-05-20',
    industry: undefined,
    customerType: undefined,
    productType: undefined,
    loanStructure: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    isClosed: false,
    ...over,
  } as DealDetail;
}

function setUseDealData(d: DealDetail) {
  useDealDataMock.mockReturnValue({
    deal: d,
    tasks: { kind: 'loading' },
    documents: { kind: 'loading' },
    creditMemo: { kind: 'loading' },
    activity: { kind: 'loading' },
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useDealData>);
}

function vm(over: Partial<DealIntelligenceViewModel> = {}): DealIntelligenceViewModel {
  return {
    dealId: 'vm-deal-id-11111111-2222-3333-4444-555555555555',
    dealName: 'VM-sourced deal name',
    clientName: 'VM Client',
    bankerName: 'VM Banker',
    stageName: 'VM Stage',
    statusName: 'VM Status',
    productTypeName: undefined,
    loanStructureName: undefined,
    pricingTypeName: undefined,
    amount: undefined,
    targetCloseDate: undefined,
    daysToClose: undefined,
    daysInStage: undefined,
    collateralSummary: undefined,
    completeness: {
      populatedFieldCount: 0,
      totalFieldCount: 13,
      completenessPct: 0,
      missingFieldLabels: [],
    },
    openTaskCount: 0,
    overdueTaskCount: 0,
    outstandingDocumentCount: 0,
    blockerStatus: undefined,
    blockerSignals: [],
    lastActivity: { iso: undefined, daysSince: undefined, state: 'unknown' },
    nextBestAction: undefined,
    closure: 'open',
    ...over,
  };
}

function renderWithVM(d: DealDetail, v: DealIntelligenceViewModel) {
  setUseDealData(d);
  return render(
    <DealIntelligenceContext.Provider value={v}>
      <DealHeader />
    </DealIntelligenceContext.Provider>,
  );
}

describe('Phase 123C — DealHeader VM wiring (provider present)', () => {
  it('prefers vm.dealName for the <h1> over deal.name', () => {
    renderWithVM(deal({ name: 'Deal-source name' }), vm({ dealName: 'VM-sourced name' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'VM-sourced name',
    );
  });

  it('prefers vm.dealId for the deal id chip + aria-label over deal.id', () => {
    renderWithVM(
      deal({ id: 'deal-source-id-aaaaaaaa' }),
      vm({ dealId: 'vm-sourced-id-bbbbbbbb' }),
    );
    expect(screen.getByLabelText('Deal id vm-sourced-id-bbbbbbbb')).toBeInTheDocument();
    expect(screen.getByText('#vm-sourc')).toBeInTheDocument();
  });

  it('renders VM-sourced Client / Banker / Stage labels in the identity slots', () => {
    renderWithVM(
      deal({
        clientName: 'Deal Client',
        bankerName: 'Deal Banker',
        stage: 'Deal Stage',
      }),
      vm({
        clientName: 'VM Client',
        bankerName: 'VM Banker',
        stageName: 'VM Stage',
      }),
    );
    expect(screen.getByText('VM Client')).toBeInTheDocument();
    expect(screen.getByText('VM Banker')).toBeInTheDocument();
    expect(screen.getByText('VM Stage')).toBeInTheDocument();
    // Deal-sourced values must NOT leak through when VM provides one.
    expect(screen.queryByText('Deal Client')).not.toBeInTheDocument();
    expect(screen.queryByText('Deal Banker')).not.toBeInTheDocument();
    expect(screen.queryByText('Deal Stage')).not.toBeInTheDocument();
  });

  it('renders VM-sourced Status chip "Status · <name>"', () => {
    renderWithVM(deal({ status: 'Deal Status' }), vm({ statusName: 'VM Status' }));
    expect(screen.getByText(/Status · VM Status/i)).toBeInTheDocument();
    expect(screen.queryByText(/Status · Deal Status/i)).not.toBeInTheDocument();
  });

  it('renders the Closed pill when vm.closure === "closed", regardless of deal.isClosed', () => {
    renderWithVM(deal({ isClosed: false }), vm({ closure: 'closed' }));
    expect(screen.getByLabelText('Deal closed')).toBeInTheDocument();
  });

  it('does NOT render the Closed pill when vm.closure === "open", regardless of deal.isClosed', () => {
    renderWithVM(deal({ isClosed: true }), vm({ closure: 'open' }));
    expect(screen.queryByLabelText('Deal closed')).not.toBeInTheDocument();
  });
});

describe('Phase 123C — DealHeader honest absence under provider', () => {
  it('renders "Not set" / "Not assigned" when VM values are undefined (no fake fallback through VM path)', () => {
    renderWithVM(
      deal({
        clientName: undefined,
        bankerName: undefined,
        stage: undefined,
        status: undefined,
      }),
      vm({
        clientName: undefined,
        bankerName: undefined,
        stageName: undefined,
        statusName: undefined,
      }),
    );
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText(/Status · Not set/i)).toBeInTheDocument();
  });

  it('falls back to deal.* when VM provides undefined for a specific field', () => {
    renderWithVM(
      deal({ clientName: 'Deal Client Fallback', bankerName: 'Deal Banker Fallback' }),
      vm({ clientName: undefined, bankerName: undefined }),
    );
    // The component uses `vm?.field ?? deal.field`, so undefined VM
    // field correctly delegates to the deal record.
    expect(screen.getByText('Deal Client Fallback')).toBeInTheDocument();
    expect(screen.getByText('Deal Banker Fallback')).toBeInTheDocument();
  });
});

describe('Phase 123C — DealHeader without provider (existing behavior preserved)', () => {
  it('still renders deal-sourced labels when no DealIntelligenceProvider is mounted', () => {
    setUseDealData(
      deal({
        clientName: 'Standalone Client',
        bankerName: 'Standalone Banker',
        stage: 'Standalone Stage',
        status: 'Standalone Status',
      }),
    );
    render(<DealHeader />);
    expect(screen.getByText('Standalone Client')).toBeInTheDocument();
    expect(screen.getByText('Standalone Banker')).toBeInTheDocument();
    expect(screen.getByText('Standalone Stage')).toBeInTheDocument();
    expect(screen.getByText(/Status · Standalone Status/i)).toBeInTheDocument();
  });

  it('still renders "Not set" / "Not assigned" for missing deal fields when no provider is mounted', () => {
    setUseDealData(
      deal({
        clientName: undefined,
        bankerName: undefined,
        stage: undefined,
        status: undefined,
      }),
    );
    render(<DealHeader />);
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText(/Status · Not set/i)).toBeInTheDocument();
  });
});
