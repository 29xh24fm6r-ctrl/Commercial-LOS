// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { DealData } from '../deals/DealDataProvider';

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from '../deals/DealDataProvider';
import { LoanWorkflowCommandCenter } from './LoanWorkflowCommandCenter';

const useDealDataMock = vi.mocked(useDealData);

const deal: DealDetail = {
  id: 'deal-1',
  name: 'Acme Expansion',
  clientName: 'Acme',
  stage: 'Intake',
  status: 'Active',
  amount: 2_000_000,
  bankerName: 'Banker',
  targetCloseDate: '2026-08-31',
  productType: 'Term Loan',
  loanStructure: 'Senior secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Corporate',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 250,
  collateralSummary: 'Equipment',
  createdOn: '2026-01-01',
  stageEntryDate: '2026-06-01',
  isClosed: false,
};

function data(): DealData {
  return {
    deal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } satisfies DealTasksResult },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] } satisfies DealDocumentsResult,
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } satisfies CreditMemoData },
    activity: { kind: 'ready', data: [] },
    refresh: vi.fn(),
  };
}

describe('LoanWorkflowCommandCenter', () => {
  it('renders inside the authorized deal data surface and shows blockers', () => {
    useDealDataMock.mockReturnValue(data());
    render(<LoanWorkflowCommandCenter />);

    expect(screen.getByText('Loan Workflow Command Center')).toBeInTheDocument();
    expect(screen.getByText('Intake')).toBeInTheDocument();
    expect(screen.getAllByText(/Underwriting/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing document: Loan application/).length).toBeGreaterThan(0);
  });

  it('does not render a borrower send control', () => {
    useDealDataMock.mockReturnValue(data());
    render(<LoanWorkflowCommandCenter />);

    expect(screen.queryByRole('button', { name: /send|email|sms|outlook/i })).toBeNull();
  });
});
