// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from '../deals/dealQueries';
import type { DealData } from '../deals/DealDataProvider';

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

import { useDealData } from '../deals/DealDataProvider';
import { DealWorkflowRoutingPanel } from './DealWorkflowRoutingPanel';

const useDealDataMock = vi.mocked(useDealData);

function baseDeal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1', name: 'Acme RLOC', clientName: 'Acme Holdings', stage: 'Underwriting', status: 'Active',
    amount: 9_000_000, bankerName: 'M. Paller', targetCloseDate: undefined, productType: 'Small Business Term Loan',
    loanStructure: 'Senior Secured', customerType: 'C&I', industry: 'Manufacturing', guarantorStructure: undefined,
    pricingType: undefined, spreadIndex: undefined, spreadMargin: undefined, collateralSummary: undefined,
    createdOn: undefined, stageEntryDate: undefined, isClosed: false,
    ...over,
  };
}

function mount(over: Partial<DealDetail> = {}) {
  useDealDataMock.mockReturnValue({ deal: baseDeal(over) } as unknown as DealData);
  return render(<DealWorkflowRoutingPanel />);
}

describe('ARC Phase 3 — DealWorkflowRoutingPanel (live routing-engine wiring)', () => {
  it('renders the derived route for the live deal in scope', () => {
    mount();
    expect(screen.getAllByText('Small business — standard').length).toBeGreaterThanOrEqual(1);
  });

  it('a high loan amount alone never surfaces a committee requirement (OGB single-approver policy)', () => {
    mount({ amount: 40_000_000 });
    expect(screen.getByText(/not required/i)).toBeInTheDocument();
    expect(screen.queryByText(/Committee materials/i)).not.toBeInTheDocument();
  });

  it('stays read-only with no mutation controls', () => {
    const { container } = mount();
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(screen.getByText(/Read-only decision support/i)).toBeInTheDocument();
  });
});
