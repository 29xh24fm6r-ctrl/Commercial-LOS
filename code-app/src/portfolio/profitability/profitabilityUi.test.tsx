// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LoanProfitabilityCard } from './LoanProfitabilityCard';
import { PortfolioProfitabilityPanel } from './PortfolioProfitabilityPanel';
import { deriveLoanProfitability, type ProfitabilityAssumptions } from './loanProfitability';

const ASSUMPTIONS: ProfitabilityAssumptions = {
  costOfFundsRate: 3.0,
  capitalAllocationPct: 10,
  taxRate: 25,
  targetRoe: 12,
};

describe('LoanProfitabilityCard', () => {
  it('shows honest absence when inputs are insufficient (no fabricated number)', () => {
    const p = deriveLoanProfitability({ avgEarningBalance: 0, avgLoanRate: 6.0 }, ASSUMPTIONS);
    render(<LoanProfitabilityCard profitability={p} />);
    const card = screen.getByLabelText('Loan profitability');
    expect(card).toHaveAttribute('data-loan-profitability', 'unavailable');
    expect(within(card).getByText(/inputs not available/i)).toBeInTheDocument();
  });

  it('renders NII / contribution / ROE / RAROC + status when inputs are sufficient', () => {
    const p = deriveLoanProfitability(
      { loanId: 'PL-1', avgEarningBalance: 10_000_000, avgLoanRate: 6.0, feeIncomeUpfrontRecognized: 20_000, period: '2026-Q2' },
      ASSUMPTIONS,
      { pd: 0.02, lgd: 0.4 },
    );
    render(<LoanProfitabilityCard profitability={p} />);
    const card = screen.getByLabelText('Loan profitability');
    expect(card).toHaveAttribute('data-loan-profitability', p.status);
    expect(card.querySelector('[data-profitability-status]')).not.toBeNull();
    expect(within(card).getByText('As of 2026-Q2')).toBeInTheDocument();
    // ROE metric renders a percent.
    expect(card.querySelector('[data-profitability-metric="ROE"]')).not.toBeNull();
  });
});

describe('PortfolioProfitabilityPanel', () => {
  it('shows guidance when there are no rated loans', () => {
    render(<PortfolioProfitabilityPanel loans={[]} />);
    const panel = screen.getByLabelText('Portfolio profitability');
    expect(panel).toHaveAttribute('data-portfolio-profitability', 'empty');
    expect(within(panel).getByText(/No rated loans yet/i)).toBeInTheDocument();
  });

  it('renders the distribution + weighted-avg ROE + outliers for rated loans', () => {
    const a = deriveLoanProfitability({ loanId: 'a', avgEarningBalance: 1_000_000, avgLoanRate: 2.5 }, ASSUMPTIONS); // low ROE
    const b = deriveLoanProfitability({ loanId: 'b', avgEarningBalance: 1_000_000, avgLoanRate: 8.0 }, ASSUMPTIONS); // high ROE
    render(<PortfolioProfitabilityPanel loans={[a, b]} lowRoeThreshold={10} />);
    const panel = screen.getByLabelText('Portfolio profitability');
    expect(panel).toHaveAttribute('data-portfolio-profitability', 'ready');
    expect(panel.querySelector('[data-profitability-distribution]')).not.toBeNull();
    expect(panel.querySelector('[data-profitability-outliers]')).not.toBeNull();
    expect(panel.querySelector('[data-profitability-outlier="a"]')).not.toBeNull();
  });
});
