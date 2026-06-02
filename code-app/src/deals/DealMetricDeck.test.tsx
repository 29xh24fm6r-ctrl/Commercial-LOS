// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealIntelligenceViewModel } from '../shared/dealIntelligenceViewModel';

/**
 * Phase 123C — DealMetricDeck Deal Intelligence VM wiring tests.
 *
 * Pins:
 *   - When the BankerDealWorkspace's DealIntelligenceProvider is
 *     mounted, DealMetricDeck sources completeness numbers + the
 *     missing-fields list from the shared VM (proves the cockpit
 *     routes through the shared deriver, not the local recomputation).
 *   - When no provider is mounted, DealMetricDeck falls back to its
 *     locally-derived cockpit metrics — the card stays usable
 *     standalone.
 *   - "Every tracked field populated" copy still surfaces when the
 *     resolved missing-fields list is empty (whether the source is
 *     VM or local metrics).
 *   - Honest absence preserved: when the VM completeness is honest-
 *     zero (loader returned undefined for fields), the deck reports
 *     zero — no fake substitution by the deck.
 *   - Other tiles (Loan amount / Blockers / Tasks / Documents /
 *     Target close / footer last-touched / memo) stay on local
 *     metrics in this phase — Phase 123D scope.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { DealMetricDeck } from './DealMetricDeck';
import { DealIntelligenceContext } from '../shared/dealIntelligenceContext';

const useDealDataMock = vi.mocked(useDealData);

function deal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-deck',
    name: 'Deck Deal',
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
  // Every Phase-122 profile-completeness field populated → local
  // metrics will compute 13/13 missing 0 in the standalone case.
  return deal({
    amount: 1_000_000,
    targetCloseDate: '2026-09-01',
    clientName: 'Hydrated Client',
    stage: 'Underwriting',
    status: 'Active',
    bankerName: 'Hydrated Banker',
    productType: 'SBA 7(a)',
    loanStructure: 'Term Loan',
    customerType: 'LLC',
    industry: 'Manufacturing',
    guarantorStructure: 'Personal',
    pricingType: 'Variable',
    collateralSummary: 'Real estate, equipment',
  });
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
    dealId: 'd-deck',
    dealName: 'Deck Deal',
    clientName: undefined,
    bankerName: undefined,
    stageName: undefined,
    statusName: undefined,
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
      <DealMetricDeck />
    </DealIntelligenceContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Provider present — VM is the source of truth for completeness
// ---------------------------------------------------------------------------

describe('Phase 123C — DealMetricDeck consumes the VM for completeness when provider is mounted', () => {
  it('shows 13 of 13 + "Every tracked field populated" when VM completeness is 13/13, even if the deal is sparse locally', () => {
    // Sparse deal — local metrics would compute 0/13 missing 13. The
    // VM injects 13/13 missing []; the deck must surface the VM
    // numbers, not the local ones. That decisively proves the wiring.
    renderWithVM(
      deal(),
      vm({
        completeness: {
          populatedFieldCount: 13,
          totalFieldCount: 13,
          completenessPct: 100,
          missingFieldLabels: [],
        },
      }),
    );

    // Profile ring renders 100% and the "PROFILE · 13 of 13" caption.
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('PROFILE · 13 of 13')).toBeInTheDocument();
    expect(screen.getByLabelText(/13 of 13 fields populated/)).toBeInTheDocument();

    // Missing-fields tile renders 0 + the "Every tracked field
    // populated" sub.
    expect(screen.getByText(/Every tracked field populated/i)).toBeInTheDocument();

    // Footer reports the "none missing" copy.
    expect(
      screen.getByText(/None — every tracked field is populated\./i),
    ).toBeInTheDocument();
  });

  it('honors honest-zero completeness from the VM even when the deal would compute 13/13 locally', () => {
    // Hydrated deal — local metrics would say 13/13. VM injects
    // 0/13 missing 13 labels. Deck must report the VM's honest-zero,
    // proving the deck does NOT silently fall back to local when the
    // VM is present (no fake substitution by the deck).
    const labels = [
      'Loan amount',
      'Target close',
      'Client',
      'Stage',
      'Status',
      'Banker',
      'Product type',
      'Loan structure',
      'Customer type',
      'Industry',
      'Guarantor structure',
      'Pricing type',
      'Collateral',
    ];
    renderWithVM(
      hydratedDeal(),
      vm({
        completeness: {
          populatedFieldCount: 0,
          totalFieldCount: 13,
          completenessPct: 0,
          missingFieldLabels: labels,
        },
      }),
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('PROFILE · 0 of 13')).toBeInTheDocument();
    // Missing-fields tile shows 13 with the catalog sub label.
    expect(screen.getByText(/of 13 tracked/i)).toBeInTheDocument();
    // Footer renders the joined missing-fields list from the VM.
    expect(
      screen.getByText(labels.join(' · ')),
    ).toBeInTheDocument();
    // And the "Every tracked field populated" copy is NOT shown.
    expect(
      screen.queryByText(/Every tracked field populated/i),
    ).not.toBeInTheDocument();
  });

  it('renders an intermediate completeness percentage from the VM unchanged', () => {
    renderWithVM(
      deal(),
      vm({
        completeness: {
          populatedFieldCount: 10,
          totalFieldCount: 13,
          completenessPct: 77,
          missingFieldLabels: ['Industry', 'Pricing type', 'Collateral'],
        },
      }),
    );
    expect(screen.getByText('77%')).toBeInTheDocument();
    expect(screen.getByText('PROFILE · 10 of 13')).toBeInTheDocument();
    expect(
      screen.getByText('Industry · Pricing type · Collateral'),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// No provider — fall back to local cockpit metrics
// ---------------------------------------------------------------------------

describe('Phase 123C — DealMetricDeck still works without a DealIntelligenceProvider', () => {
  it('falls back to local metrics when no provider is mounted (hydrated deal → 13 of 13)', () => {
    setUseDealData(hydratedDeal());
    render(<DealMetricDeck />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('PROFILE · 13 of 13')).toBeInTheDocument();
    expect(screen.getByText(/Every tracked field populated/i)).toBeInTheDocument();
    expect(
      screen.getByText(/None — every tracked field is populated\./i),
    ).toBeInTheDocument();
  });

  it('falls back to local metrics when no provider is mounted (sparse deal → 0 of 13)', () => {
    setUseDealData(deal());
    render(<DealMetricDeck />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('PROFILE · 0 of 13')).toBeInTheDocument();
    // Missing-fields footer carries the joined list of 13 catalog labels.
    expect(screen.getByText(/Loan amount.*Target close.*Client/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline — only completeness is wired in Phase 123C
// ---------------------------------------------------------------------------

describe('Phase 123C — DealMetricDeck.tsx static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'DealMetricDeck.tsx'),
    'utf8',
  );

  it('imports useOptionalDealIntelligence (proves the wiring landed)', () => {
    expect(source).toMatch(
      /import\s+\{\s*useOptionalDealIntelligence\s*\}\s+from\s+['"]\.\.\/shared\/dealIntelligenceContext['"]/,
    );
  });

  it('still imports deriveDealCockpitMetrics (local fallback preserved)', () => {
    expect(source).toMatch(/deriveDealCockpitMetrics/);
  });

  it('does NOT inject fake-fallback placeholder strings around completeness', () => {
    // The deck must never substitute 'Not set' / 'N/A' / 'TBD' for
    // completeness numbers — those are always real counts, never
    // placeholders. (The "Not set" memo-state label and the
    // memoStateLabel switch are unrelated.)
    const sourceCode = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    expect(sourceCode).not.toMatch(/profileCompletenessPct\s*\?\?\s*['"]/);
    expect(sourceCode).not.toMatch(/populatedFieldCount\s*\?\?\s*['"]/);
    expect(sourceCode).not.toMatch(/totalFieldCount\s*\?\?\s*['"]/);
  });
});
