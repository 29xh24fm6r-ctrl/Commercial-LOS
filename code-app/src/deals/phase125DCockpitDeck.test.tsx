// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Phase 125D — Bloomberg / Apple deal-cockpit redesign
 * component-level invariants. Sister file
 * `phase125DCockpitIntegration.test.tsx` covers the
 * BankerDealWorkspace-level integration + static-source pins
 * (kept separate because the integration file stubs every
 * card globally, which would shadow the real
 * DealBlockers / DealAutopilotPanel imports used here).
 *
 * Five describe blocks:
 *   (1) DealMetricDeck — populated values, profile-completeness
 *       ring, missing-field meter readout.
 *   (2) DealMetricDeck — sparse seed renders honest "Not set"
 *       inside every tile + every tracked field listed as
 *       missing.
 *   (3) DealWorkstreamPanel — four workstream bars render with
 *       deterministic counts.
 *   (4) DealBlockers AttentionConsole — severity meter tiles
 *       render + the card title is "Attention Console".
 *   (5) DealAutopilotPanel ActionConsole — priority meter +
 *       "Action Console" title.
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
import { DealMetricDeck } from './DealMetricDeck';
import { DealWorkstreamPanel } from './DealWorkstreamPanel';
import { DealBlockers } from './DealBlockers';
import { DealAutopilotPanel } from './DealAutopilotPanel';

const useDealDataMock = vi.mocked(useDealData);

function fullDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-1',
    name: 'Acme RLOC',
    clientName: 'Acme Manufacturing',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-08-15T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'Two personal guarantors',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R, inventory, equipment',
    createdOn: '2026-01-15T00:00:00Z',
    stageEntryDate: '2026-05-10T00:00:00Z',
    isClosed: false,
    ...over,
  };
}

function sparseDeal(): DealDetail {
  return {
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
  };
}

function ready(
  deal: DealDetail,
  over: Partial<DealData> = {},
): DealData {
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
// (1) DealMetricDeck — populated
// ---------------------------------------------------------------------------
describe('Phase 125D — DealMetricDeck (populated deal)', () => {
  it('renders the profile completeness ring at 100% for a fully populated deal', () => {
    useDealDataMock.mockReturnValue(ready(fullDeal()));
    const { container } = render(<DealMetricDeck />);
    const ring = container.querySelector('[data-completeness-ring]');
    expect(ring).not.toBeNull();
    expect(ring?.getAttribute('aria-label')).toMatch(/100 percent/i);
  });

  it('renders KPI metric tiles with tonal accents (data-metric-tile attribute)', () => {
    useDealDataMock.mockReturnValue(ready(fullDeal()));
    const { container } = render(<DealMetricDeck />);
    const tiles = container.querySelectorAll('[data-metric-tile]');
    // 8 tiles in the deck: amount / target / days-in-stage /
    // blockers / tasks / docs / memo / last-touched.
    expect(tiles.length).toBe(8);
  });

  it('shows the "no missing fields" copy when every tracked field is populated', () => {
    useDealDataMock.mockReturnValue(ready(fullDeal()));
    render(<DealMetricDeck />);
    expect(
      screen.getByText(/None — every tracked field is populated/i),
    ).toBeInTheDocument();
  });

  it('renders the deck-level region with the correct aria-label', () => {
    useDealDataMock.mockReturnValue(ready(fullDeal()));
    render(<DealMetricDeck />);
    expect(
      screen.getByRole('region', { name: /Deal metric deck/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (2) DealMetricDeck — sparse seed
// ---------------------------------------------------------------------------
describe('Phase 125D — DealMetricDeck (sparse Phase 121-style seed)', () => {
  it('renders italic "Not set" inside every tile that has no value', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    const { container } = render(<DealMetricDeck />);
    const notSet = container.querySelectorAll(
      '[data-metric-tile] :where([style*="italic"])',
    );
    // At least Loan amount, Target close, Credit memo, Last
    // touched all read "Not set" for a sparse deal.
    expect(notSet.length).toBeGreaterThanOrEqual(4);
  });

  it('lists every tracked profile field as missing in the meter readout', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    render(<DealMetricDeck />);
    expect(screen.getByText(/MISSING FIELDS/i)).toBeInTheDocument();
    // Field labels also appear as tile titles ("Loan amount",
    // etc.) — scope the assertion to the missing-fields list
    // span by matching on the joined " · " separator format the
    // deck renders.
    const all = screen.getAllByText((_, el) =>
      Boolean(el && (el.textContent ?? '').includes('Loan amount · ')),
    );
    expect(all.length).toBeGreaterThan(0);
    const missingListText = all[all.length - 1]?.textContent ?? '';
    expect(missingListText).toMatch(/Loan amount/);
    expect(missingListText).toMatch(/Industry/);
    expect(missingListText).toMatch(/Collateral/);
  });

  it('renders the completeness ring at 0% honestly', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    const { container } = render(<DealMetricDeck />);
    const ring = container.querySelector('[data-completeness-ring]');
    expect(ring?.getAttribute('aria-label')).toMatch(/0 percent/i);
  });
});

// ---------------------------------------------------------------------------
// (3) DealWorkstreamPanel
// ---------------------------------------------------------------------------
describe('Phase 125D — DealWorkstreamPanel', () => {
  it('renders four workstream progress bars', () => {
    useDealDataMock.mockReturnValue(ready(fullDeal()));
    const { container } = render(<DealWorkstreamPanel />);
    const bars = container.querySelectorAll('[data-workstream-bar]');
    expect(bars.length).toBe(4);
  });

  it('renders honest detail text on the sparse seed (no tasks, no docs, no memo)', () => {
    useDealDataMock.mockReturnValue(ready(sparseDeal()));
    render(<DealWorkstreamPanel />);
    expect(screen.getByText(/No tasks recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/No documents tracked/i)).toBeInTheDocument();
    expect(screen.getByText(/No memo records yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No communication events recorded yet/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (4) DealBlockers AttentionConsole
// ---------------------------------------------------------------------------
describe('Phase 125D — DealBlockers AttentionConsole', () => {
  it('renders the card title as "Attention Console"', () => {
    useDealDataMock.mockReturnValue(ready(fullDeal()));
    render(<DealBlockers />);
    expect(
      screen.getByRole('heading', { name: /Attention Console/i }),
    ).toBeInTheDocument();
  });

  it('renders the severity meter strip (always three tiles: blocked / at-risk / clear)', () => {
    useDealDataMock.mockReturnValue(ready(fullDeal()));
    const { container } = render(<DealBlockers />);
    const tiles = container.querySelectorAll('[data-severity-meter-tile]');
    expect(tiles.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// (5) DealAutopilotPanel ActionConsole
// ---------------------------------------------------------------------------
describe('Phase 125D — DealAutopilotPanel ActionConsole', () => {
  it('renders the card title as "Action Console" when suggestions are present', () => {
    useDealDataMock.mockReturnValue(
      ready(fullDeal(), {
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: '2026-04-01T00:00:00Z',
                modifiedOn: undefined,
                completed: false,
                assigneeName: undefined,
              },
            ],
            completed: [],
          },
        },
      }),
    );
    render(<DealAutopilotPanel />);
    expect(
      screen.getByRole('heading', { name: /Action Console/i }),
    ).toBeInTheDocument();
  });

  it('renders the priority severity meter (high / medium / low) when suggestions are present', () => {
    useDealDataMock.mockReturnValue(
      ready(fullDeal(), {
        tasks: {
          kind: 'ready',
          data: {
            open: [
              {
                id: 't1',
                title: 'Send Q2 financials',
                dueDate: '2026-04-01T00:00:00Z',
                modifiedOn: undefined,
                completed: false,
                assigneeName: undefined,
              },
            ],
            completed: [],
          },
        },
      }),
    );
    const { container } = render(<DealAutopilotPanel />);
    const tiles = Array.from(
      container.querySelectorAll<HTMLElement>('[data-severity-meter-tile]'),
    );
    expect(tiles.length).toBe(3);
    // The meter tiles are aria-labeled "<label>: <count>" so we
    // can identify each by aria-label without colliding with the
    // suggestion-row priority badges that share the same text.
    const labels = tiles.map((t) => t.getAttribute('aria-label') ?? '');
    expect(labels.some((l) => /^High:/i.test(l))).toBe(true);
    expect(labels.some((l) => /^Medium:/i.test(l))).toBe(true);
    expect(labels.some((l) => /^Low:/i.test(l))).toBe(true);
  });
});
