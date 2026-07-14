// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Regression coverage for the Attention Console consuming the SAME authoritative
 * stage-exit blocker model (dealBlockerModel.ts) DealMetricDeck's "Blockers" tile and the
 * Stage Map advance guard use.
 *
 * Bug fixed: DealBlockers (the Attention Console) only ever computed its own aging/hygiene
 * heuristics (stale-stage, missing-info, overdue tasks/documents) via blockerRules.ts — a deal
 * with a real stage-exit hard blocker (e.g. a missing required field the CURRENT stage needs)
 * but no aging issues showed a clean "No blockers detected" Attention Console right next to a
 * Metric Deck "Blockers" tile correctly reporting 1 — and an advance button correctly disabled.
 * Two widgets on the same page disagreeing about whether the deal is blocked.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { DealBlockers } from './DealBlockers';

const useDealDataMock = vi.mocked(useDealData);

// INTAKE has the smallest exit-gate surface (identityFields + industry + customerType, one
// document "loan application", three non-blocking tasks, no credit requirements) — the
// easiest stage to construct a genuinely fully-satisfied fixture for.
function baseDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-1',
    name: 'Acme RLOC',
    clientName: 'Acme Holdings',
    stage: 'Intake',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    isClosed: false,
    ...over,
  };
}

const RECEIVED_LOAN_APPLICATION = {
  outstanding: [],
  received: [
    {
      id: 'doc-1',
      name: 'Loan Application',
      dueDate: undefined,
      requestDate: undefined,
      receivedDate: new Date().toISOString(),
      reviewer: undefined,
      uploaded: true,
      modifiedOn: undefined,
      status: 'received' as const,
    },
  ],
  reviewed: [],
};

function readyDealData(over: Partial<DealData> = {}): DealData {
  return {
    deal: baseDeal(),
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: { kind: 'ready', data: RECEIVED_LOAN_APPLICATION },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: [] },
    refresh: () => undefined,
    ...over,
  };
}

describe('DealBlockers (Attention Console) — agrees with the authoritative stage-exit blocker model', () => {
  it('a deal with no aging issues but a real missing stage-exit field shows a blocked signal (not a false "clear")', () => {
    // No aging/hygiene issues (all blockerRules.ts inputs are clean), but industry -- a
    // required field for the Intake exit gate -- is missing.
    useDealDataMock.mockReturnValue(
      readyDealData({ deal: baseDeal({ industry: undefined }) }),
    );
    render(<DealBlockers />);
    expect(screen.getByText(/Potential blocker/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage exit: Industry/i)).toBeInTheDocument();
    expect(document.querySelector('[data-big-severity-tile="blocked"]')?.textContent).toContain('1');
  });

  it('a fully clean deal (no aging issues, no missing stage-exit facts) shows clear, no phantom blockers', () => {
    useDealDataMock.mockReturnValue(readyDealData());
    render(<DealBlockers />);
    expect(screen.queryByText(/Potential blocker/i)).toBeNull();
    expect(screen.getByText(/No blockers detected/i)).toBeInTheDocument();
    expect(document.querySelector('[data-big-severity-tile="blocked"]')?.textContent).toContain('0');
  });

  it('an aging signal alone (no stage-exit blocker) still surfaces as at-risk, unaffected by the new stage-exit signal', () => {
    // Stale in current stage (> 30 days), otherwise a fully complete Intake deal.
    useDealDataMock.mockReturnValue(
      readyDealData({
        deal: baseDeal({ stageEntryDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() }),
      }),
    );
    render(<DealBlockers />);
    expect(screen.queryByText(/Potential blocker/i)).toBeNull();
    expect(screen.getByText(/At risk/i)).toBeInTheDocument();
    expect(screen.queryByText(/Stage exit:/i)).toBeNull();
  });
});
