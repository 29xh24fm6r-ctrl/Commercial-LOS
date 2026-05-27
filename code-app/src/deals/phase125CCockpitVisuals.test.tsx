// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Phase 125C — Premium Deal Cockpit Visual Upgrade invariants
 * (component-level pins). Sister file
 * `phase125CCockpitLayout.test.tsx` covers the BankerDealWorkspace
 * right-column liquid-glass overlay.
 *
 * Pins covered here:
 *
 *   1. SeverityGlyph shared component — renders a shape-bearing SVG
 *      icon per severity (blocked / atRisk / info), tinted from the
 *      severity palette `bar` token. aria-hidden so it does not
 *      duplicate the row's textual label for screen readers.
 *
 *   2. DealStageProgressionCard StageRail — renders the canonical
 *      non-terminal STAGE_CATALOG labels as a horizontal pill rail,
 *      marks the current stage with aria-current="step", and falls
 *      back to a "custom stage" note when the live deal carries a
 *      Dataverse-defined operator-named stage that doesn't match
 *      the canonical set (the path the Phase 121 sparse seed
 *      exercises).
 *
 *   3. DealBlockers SignalRow — each rendered signal is preceded
 *      by a SeverityGlyph chip (data-severity-glyph attribute).
 *
 *   4. DealAutopilotPanel SuggestionRow — the inline left-stripe
 *      reads from the new cobalt / teal / at-risk accent tokens
 *      depending on the suggestion's priority (medium / low /
 *      high). Read-only chrome: priority badge text, severity
 *      derivation, and basis line all stay identical.
 */

// Module-level mocks (hoisted by vitest).
vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));
vi.mock('../shared/creditMemoConsistency/checkCreditMemoConsistency', () => ({
  checkCreditMemoConsistency: vi.fn(() => ({
    hasDraftToCompare: false,
    findings: [],
  })),
}));

import { SeverityGlyph } from '../shared/SeverityGlyph';
import { useDealData } from './DealDataProvider';
import { DealStageProgressionCard } from './DealStageProgressionCard';
import { DealBlockers } from './DealBlockers';
import { DealAutopilotPanel } from './DealAutopilotPanel';

const useDealDataMock = vi.mocked(useDealData);

function baseDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-stage',
    name: 'Acme RLOC',
    clientName: 'Acme',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-09-30T00:00:00Z',
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
    stageEntryDate: '2026-05-15T00:00:00Z',
    isClosed: false,
    ...over,
  };
}

function readyDealData(over: Partial<DealData> = {}): DealData {
  return {
    deal: baseDeal(),
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
// (1) SeverityGlyph unit pin
// ---------------------------------------------------------------------------
describe('Phase 125C — SeverityGlyph', () => {
  it('renders a blocked-severity SVG glyph (warning triangle) with the correct data-severity-glyph attribute', () => {
    const { container } = render(<SeverityGlyph severity="blocked" />);
    const wrap = container.querySelector('[data-severity-glyph="blocked"]');
    expect(wrap).not.toBeNull();
    expect(wrap?.querySelector('svg path')).not.toBeNull();
  });

  it('renders an at-risk severity SVG glyph with the correct data-severity-glyph attribute', () => {
    const { container } = render(<SeverityGlyph severity="atRisk" />);
    const wrap = container.querySelector('[data-severity-glyph="atRisk"]');
    expect(wrap).not.toBeNull();
    expect(wrap?.querySelector('svg circle')).not.toBeNull();
  });

  it('renders an info severity SVG glyph with the correct data-severity-glyph attribute', () => {
    const { container } = render(<SeverityGlyph severity="info" />);
    const wrap = container.querySelector('[data-severity-glyph="info"]');
    expect(wrap).not.toBeNull();
    expect(wrap?.querySelector('svg circle')).not.toBeNull();
  });

  it('marks the glyph aria-hidden so screen readers don’t read it as separate content from the row label', () => {
    const { container } = render(<SeverityGlyph severity="blocked" />);
    const wrap = container.querySelector('[data-severity-glyph="blocked"]');
    expect(wrap?.getAttribute('aria-hidden')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// (2) DealStageProgressionCard StageRail pin
// ---------------------------------------------------------------------------
describe('Phase 125C — DealStageProgressionCard StageRail', () => {
  it('renders the canonical non-terminal stage labels as an ordered rail', () => {
    useDealDataMock.mockReturnValue(readyDealData());
    render(<DealStageProgressionCard />);
    const rail = screen.getByRole('list', {
      name: /canonical stage progression map/i,
    });
    for (const label of [
      'Origination',
      'Screening',
      'Application',
      'Pricing',
      'Underwriting',
      'Committee',
      'Documentation',
      'Closing',
      'Funded',
    ]) {
      expect(within(rail).getByText(label)).toBeInTheDocument();
    }
  });

  it('marks the current stage with aria-current="step" when the deal stage matches a canonical label', () => {
    useDealDataMock.mockReturnValue(readyDealData());
    render(<DealStageProgressionCard />);
    const current = screen.getByRole('listitem', {
      name: /Underwriting \(current\)/i,
    });
    expect(current.getAttribute('aria-current')).toBe('step');
  });

  it('surfaces a "custom stage" note when the live stage is operator-named (Phase 121 sparse-seed path)', () => {
    useDealDataMock.mockReturnValue(
      readyDealData({
        deal: baseDeal({ stage: 'TEST — Stage Phase 121' }),
      }),
    );
    render(<DealStageProgressionCard />);
    expect(
      screen.getByText(/custom stage — not in canonical sequence/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: /canonical stage progression map/i }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// (3) DealBlockers SignalRow severity-glyph pin
// ---------------------------------------------------------------------------
describe('Phase 125C — DealBlockers SignalRow severity glyph', () => {
  it('renders a SeverityGlyph chip for each signal row when at least one blocker fires', () => {
    useDealDataMock.mockReturnValue(
      readyDealData({
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
    const { container } = render(<DealBlockers />);
    const glyphs = container.querySelectorAll('[data-severity-glyph]');
    expect(glyphs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (4) DealAutopilotPanel SuggestionRow priority-stripe pin
// ---------------------------------------------------------------------------
describe('Phase 125C — DealAutopilotPanel priority stripe color', () => {
  it('uses the at-risk red token for high-priority suggestion rows', () => {
    useDealDataMock.mockReturnValue(
      readyDealData({
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
    const list = screen.getByRole('list', {
      name: /next best actions for this deal/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    const styled = items.find((el) =>
      (el.getAttribute('style') ?? '').includes('--cc-at-risk'),
    );
    expect(styled).toBeTruthy();
  });
});
