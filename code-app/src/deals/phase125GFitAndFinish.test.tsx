// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Phase 125G — Lending OS cockpit fit-and-finish invariants.
 *
 * Targeted polish pass after Phase 125F restored the Lending OS
 * shell. Pins:
 *
 *   1. Banker KPI grid uses the stable `.cc-kpi-grid` class so
 *      the 10 tiles always lay out as 5×2 / 4×3 / 2×5 — no lone
 *      orphan tile.
 *   2. Deal Metric Deck uses the stable `.cc-metric-deck-tiles`
 *      class so the 6 tonal tiles always lay out as 3×2 / 2×3.
 *   3. Deal cockpit renders the new DealCockpitNav anchor strip
 *      with the 8 named anchors (Attention / Stage Map / Actions
 *      / Workstreams / Relationship / Credit memo / Activity /
 *      Summary).
 *   4. Each cockpit module's outer wrapper carries the matching
 *      `id` so the anchor strip can scroll to it.
 *   5. Attention Console groups missing-field chips by category
 *      (Economics / Parties / Timing / Stage & status /
 *      Structure) when the deal is sparse.
 *   6. DealHeader carries the new "Deal Cockpit" lockup pill.
 *   7. No fake AI / approval-odds / predictive language in the
 *      recomposed cockpit. No forbidden email-lane imports.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
  DealDataProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="deal-data-provider">{children}</div>
  ),
}));
vi.mock('../shared/creditMemoConsistency/checkCreditMemoConsistency', () => ({
  checkCreditMemoConsistency: vi.fn(() => ({
    hasDraftToCompare: false,
    findings: [],
  })),
}));

import { useDealData } from './DealDataProvider';
import { DealBlockers } from './DealBlockers';
import { DealHeader } from './DealHeader';
import { DealMetricDeck } from './DealMetricDeck';
import { DealCockpitNav } from './DealCockpitNav';

const useDealDataMock = vi.mocked(useDealData);

function sparseDeal(): DealDetail {
  return {
    id: 'd-sparse-125g',
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
  };
}

function ready(deal: DealDetail, over: Partial<DealData> = {}): DealData {
  return {
    deal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: [] },
    refresh: () => undefined,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// (1) Banker KPI grid stable layout — static-source pin
// ---------------------------------------------------------------------------
describe('Phase 125G — Banker KPI grid stable layout', () => {
  const SRC_GRID = readFileSync(
    resolve(__dirname, '..', 'banker', 'BankerKpiGrid.tsx'),
    'utf8',
  );
  const SRC_CSS = readFileSync(
    resolve(__dirname, '..', 'index.css'),
    'utf8',
  );

  it('BankerKpiGrid uses the .cc-kpi-grid class', () => {
    expect(SRC_GRID).toMatch(/className="cc-kpi-grid"/);
  });

  it('BankerKpiGrid no longer hard-codes auto-fit gridTemplateColumns', () => {
    // The Phase 125F layout relied on `auto-fit, minmax(178px, 1fr)`
    // which produced the 9+1 orphan. Phase 125G removes that inline.
    expect(SRC_GRID).not.toMatch(/auto-fit, minmax\(178px/);
  });

  it('index.css declares .cc-kpi-grid with the 5/4/2 column breakpoints', () => {
    expect(SRC_CSS).toMatch(/\.cc-kpi-grid\s*\{[^}]*repeat\(5,/);
    expect(SRC_CSS).toMatch(/@media[^{]+1240px\)\s*\{\s*\.cc-kpi-grid[^}]*repeat\(4,/);
    expect(SRC_CSS).toMatch(/@media[^{]+760px\)\s*\{\s*\.cc-kpi-grid[^}]*repeat\(2,/);
  });
});

// ---------------------------------------------------------------------------
// (2) Deal Metric Deck — 3×2 / 2×3 / 1 stable layout
// ---------------------------------------------------------------------------
describe('Phase 125G — Deal Metric Deck stable layout', () => {
  it('DealMetricDeck uses the .cc-metric-deck-tiles class', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    const { container } = render(<DealMetricDeck />);
    const tilesContainer = container.querySelector('.cc-metric-deck-tiles');
    expect(tilesContainer).not.toBeNull();
    expect(tilesContainer?.getAttribute('data-metric-deck-tiles')).toBe('phase-125g');
  });

  it('index.css declares .cc-metric-deck-tiles with the 3/2/1 column breakpoints', () => {
    const css = readFileSync(resolve(__dirname, '..', 'index.css'), 'utf8');
    expect(css).toMatch(/\.cc-metric-deck-tiles\s*\{[^}]*repeat\(3,/);
    expect(css).toMatch(/@media[^{]+980px\)\s*\{\s*\.cc-metric-deck-tiles[^}]*repeat\(2,/);
  });
});

// ---------------------------------------------------------------------------
// (3) DealCockpitNav anchor strip
// ---------------------------------------------------------------------------
describe('Phase 125G — DealCockpitNav anchor strip', () => {
  it('renders 8 anchor links (Attention / Stage Map / Actions / Workstreams / Relationship / Credit memo / Activity / Summary)', () => {
    const { container } = render(<DealCockpitNav />);
    const links = container.querySelectorAll('[data-cockpit-anchor-link]');
    expect(links.length).toBe(8);
    const labels = Array.from(links).map((a) => a.textContent ?? '');
    for (const expected of [
      'Attention',
      'Stage Map',
      'Actions',
      'Workstreams',
      'Relationship',
      'Credit memo',
      'Activity',
      'Summary',
    ]) {
      expect(labels.some((l) => l.includes(expected))).toBe(true);
    }
  });

  it('each anchor link uses the matching #id href so smooth-scroll resolves', () => {
    const { container } = render(<DealCockpitNav />);
    for (const anchor of [
      'attention-console',
      'stage-map',
      'action-console',
      'workstreams',
      'relationship',
      'credit-memo',
      'activity-timeline',
      'deal-summary',
    ]) {
      const link = container.querySelector(`[data-cockpit-anchor-link="${anchor}"]`);
      expect(link).not.toBeNull();
      expect(link?.getAttribute('href')).toBe(`#${anchor}`);
    }
  });

  it('BankerDealWorkspace declares matching id="…" wrappers for every anchor', () => {
    const src = readFileSync(
      resolve(__dirname, 'BankerDealWorkspace.tsx'),
      'utf8',
    );
    for (const anchor of [
      'attention-console',
      'stage-map',
      'action-console',
      'workstreams',
      'relationship',
      'credit-memo',
      'activity-timeline',
      'deal-summary',
    ]) {
      expect(src).toMatch(new RegExp(`id="${anchor}"`));
      expect(src).toMatch(new RegExp(`data-cockpit-anchor="${anchor}"`));
    }
  });
});

// ---------------------------------------------------------------------------
// (4) Attention Console — grouped missing-field chips
// ---------------------------------------------------------------------------
describe('Phase 125G — Attention Console grouped missing-field chips', () => {
  it('renders the five missing-field group labels on a fully sparse deal', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    const { container } = render(<DealBlockers />);
    const groupStack = container.querySelector(
      '[data-missing-field-groups="phase-125g"]',
    );
    expect(groupStack).not.toBeNull();
    // Each group renders as a `[data-missing-field-group="<id>"]`
    // block. On a fully sparse deal all five groups should fire.
    for (const id of ['economics', 'parties', 'timing', 'stage-status', 'structure']) {
      expect(
        container.querySelector(`[data-missing-field-group="${id}"]`),
      ).not.toBeNull();
    }
  });

  it('renders the matching group labels (Economics / Parties / Timing / Stage & status / Structure)', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    render(<DealBlockers />);
    for (const label of [
      'Economics',
      'Parties',
      'Timing',
      'Stage & status',
      'Structure',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('places each missing-field chip inside its correct category', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    const { container } = render(<DealBlockers />);
    const expected: Record<string, ReadonlyArray<string>> = {
      economics: ['Loan amount', 'Pricing type'],
      parties: ['Client', 'Banker'],
      timing: ['Target close'],
      'stage-status': ['Stage', 'Status'],
      structure: [
        'Product type',
        'Loan structure',
        'Customer type',
        'Industry',
        'Guarantor structure',
        'Collateral',
      ],
    };
    for (const [id, labels] of Object.entries(expected)) {
      const group = container.querySelector(`[data-missing-field-group="${id}"]`);
      expect(group).not.toBeNull();
      const groupText = group?.textContent ?? '';
      for (const label of labels) {
        expect(groupText).toContain(label);
      }
    }
  });

  it('overall missing-count remains the catalog total on a fully sparse deal', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    render(<DealBlockers />);
    // PROFILE_COMPLETENESS_FIELDS catalog has 13 entries; the
    // Attention Console header reads "Missing data — 13 of 13".
    expect(screen.getByText(/Missing data — 13 of 13 fields/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (5) DealHeader — Deal Cockpit lockup pill
// ---------------------------------------------------------------------------
describe('Phase 125G — DealHeader Deal Cockpit lockup', () => {
  it('renders the "Deal Cockpit" pill alongside the institutional eyebrow', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    render(<DealHeader />);
    const hero = screen.getByLabelText(/Deal command hero/i);
    expect(within(hero).getByText(/Commercial Lending Cockpit/i)).toBeInTheDocument();
    expect(within(hero).getByText(/^Deal Cockpit$/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (6) No fake claims / no forbidden imports / Phase 110 lock
// ---------------------------------------------------------------------------
describe('Phase 125G — Governance pins', () => {
  const READ = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('DealCockpitNav has no SDK / email-lane imports', () => {
    const src = READ('DealCockpitNav.tsx');
    expect(src).not.toMatch(/Office365OutlookService/);
    expect(src).not.toMatch(/SendEmailV2/);
    expect(src).not.toMatch(/sendBorrowerUpdateEmail|sendDocumentRequestEmail/);
  });

  it('DealBlockers (with new grouping logic) still has no SDK / email imports', () => {
    const src = READ('DealBlockers.tsx');
    expect(src).not.toMatch(/Office365OutlookService/);
    expect(src).not.toMatch(/SendEmailV2/);
  });

  it('DealCockpitNav renders no fake AI / approval-odds / predictive copy', () => {
    const { container } = render(<DealCockpitNav />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[- ]?generated\b/i);
    expect(text).not.toMatch(/\bapproval\s+(probability|odds)\b/i);
    expect(text).not.toMatch(/\bpredicted\s+close\s+date\b/i);
    expect(text).not.toMatch(/\bdeal\s+score\b/i);
  });
});
