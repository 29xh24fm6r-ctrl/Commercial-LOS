// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoanReviewPanel } from './LoanReviewPanel';
import { deriveLoanReviewScope } from './loanReview';

describe('LoanReviewPanel', () => {
  it('shows honest absence when nothing is scoped', () => {
    render(<LoanReviewPanel scope={deriveLoanReviewScope([], {})} />);
    expect(screen.getByLabelText('Independent loan review')).toHaveAttribute('data-loan-review', 'empty');
  });

  it('renders coverage + selected loans with reasons', () => {
    const scope = deriveLoanReviewScope(
      [
        { loanId: 'crit', obligorGrade: 6, exposure: 1_000_000 },
        { loanId: 'clean', obligorGrade: 2, exposure: 1_000_000 },
      ],
      { passSamplePct: 0 },
    );
    render(<LoanReviewPanel scope={scope} />);
    const panel = screen.getByLabelText('Independent loan review');
    expect(panel).toHaveAttribute('data-loan-review', 'ready');
    expect(panel.querySelector('[data-review-loan="crit"]')).not.toBeNull();
    expect(panel.querySelector('[data-review-loan="clean"]')).toBeNull();
  });
});
