// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The provider fires child loaders on mount; stub them so the test focuses on
// the in-place deal-row update mechanism (no real Dataverse).
vi.mock('./dealTaskQueries', () => ({ loadDealTasks: vi.fn(async () => ({ open: [], completed: [] })) }));
vi.mock('./dealDocumentQueries', () => ({ loadDealDocuments: vi.fn(async () => ({ outstanding: [], received: [], reviewed: [] })) }));
vi.mock('./creditMemoQueries', () => ({ loadDealCreditMemo: vi.fn(async () => ({ memos: [], sections: [] })) }));
vi.mock('./activityQueries', () => ({ loadDealActivity: vi.fn(async () => []) }));

import { DealDataProvider, useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';

function baseDeal(): DealDetail {
  return {
    id: 'deal-1', name: 'Deal', clientName: 'OmniCare 365', stage: 'Underwriting',
    status: 'Active', amount: 1, bankerName: 'M', targetCloseDate: undefined,
    productType: undefined, loanStructure: undefined, customerType: undefined,
    industry: undefined, guarantorStructure: undefined, pricingType: undefined,
    spreadIndex: undefined, spreadMargin: undefined, collateralSummary: undefined,
    createdOn: undefined, stageEntryDate: undefined, isClosed: false,
  };
}

function Consumer() {
  const { deal, applyVerifiedDealPatch } = useDealData();
  return (
    <div>
      <span data-testid="industry">{deal.industry ?? 'none'}</span>
      <button type="button" onClick={() => applyVerifiedDealPatch?.({ industry: 'Retail' })}>
        patch
      </button>
    </div>
  );
}

describe('DealDataProvider — applyVerifiedDealPatch', () => {
  it('merges verified fields into the in-context deal row without a reload', async () => {
    render(
      <DealDataProvider deal={baseDeal()}>
        <Consumer />
      </DealDataProvider>,
    );
    expect(screen.getByTestId('industry').textContent).toBe('none');
    await userEvent.setup().click(screen.getByRole('button', { name: 'patch' }));
    expect(screen.getByTestId('industry').textContent).toBe('Retail');
  });
});
