// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnualPortfolioReviewCommandCenter } from './AnnualPortfolioReviewCommandCenter';
import { BorrowerFinancialRequestPreview } from './BorrowerFinancialRequestPreview';
import { AnnualReviewTaskBoard } from './AnnualReviewTaskBoard';
import type { AnnualReviewCycle, AnnualReviewLoanSnapshot } from '../shared/annualReview/annualReviewTypes';

const CYCLE: AnnualReviewCycle = {
  cycleId: 'c1',
  reviewYear: 2026,
  asOfDate: '2026-06-08',
  cycleEndDate: '2026-12-31',
  status: 'in_progress',
};

function loan(over: Partial<AnnualReviewLoanSnapshot> = {}): AnnualReviewLoanSnapshot {
  return { loanStatus: 'active', loanNumber: 'LN1', borrowerName: 'Synthetic Obligor', relationshipName: 'Rel', riskRating: '4', annualReviewDueDate: '2026-01-01', ...over };
}

describe('Phase 141A — command center renders honest states', () => {
  it('empty portfolio shows an honest empty queue and no fake rows', () => {
    render(<AnnualPortfolioReviewCommandCenter loans={[]} cycle={CYCLE} asOfDate="2026-06-08" />);
    expect(screen.getByText('No loans in annual review scope.')).toBeInTheDocument();
    expect(screen.getByText('No escalations.')).toBeInTheDocument();
  });

  it('renders authorized loans with missing/past-due surfaced (no fake rows)', () => {
    render(
      <AnnualPortfolioReviewCommandCenter loans={[loan()]} cycle={CYCLE} asOfDate="2026-06-08" />,
    );
    // Borrower appears in the queue row (and the escalation tape).
    expect(screen.getAllByText('Synthetic Obligor').length).toBeGreaterThanOrEqual(1);
    // A loan with no documents + a past due date escalates.
    expect(screen.queryByText('No escalations.')).not.toBeInTheDocument();
  });

  it('has no create/edit/delete write affordance', () => {
    const { container } = render(
      <AnnualPortfolioReviewCommandCenter loans={[loan()]} cycle={CYCLE} asOfDate="2026-06-08" />,
    );
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});

describe('Phase 141A — borrower request preview is draft only', () => {
  it('shows the missing-contact blocker and the no-send note', () => {
    render(<BorrowerFinancialRequestPreview loan={loan()} cycle={CYCLE} asOfDate="2026-06-08" />);
    expect(screen.getByText(/no email or SMS is sent/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing borrower contact/i)).toBeInTheDocument();
  });
});

describe('Phase 141A — task board derives tasks read-only', () => {
  it('shows tasks and states they are not persisted', () => {
    render(<AnnualReviewTaskBoard loans={[loan()]} cycle={CYCLE} asOfDate="2026-06-08" />);
    expect(screen.getByText(/tasks are not persisted in this phase/i)).toBeInTheDocument();
    expect(screen.getByText('request_financials')).toBeInTheDocument();
  });

  it('empty input shows an honest empty board', () => {
    render(<AnnualReviewTaskBoard loans={[]} cycle={CYCLE} />);
    expect(screen.getByText('No annual review tasks.')).toBeInTheDocument();
  });
});
