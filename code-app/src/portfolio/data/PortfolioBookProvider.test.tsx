// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardedLoanRow } from '../../portfolioBoarding/boardedLoansList';
import { PortfolioBookProvider, usePortfolioBook } from './PortfolioBookProvider';

function row(id: string): BoardedLoanRow {
  return {
    id,
    loanNumber: `L-${id}`,
    borrower: 'Borrower',
    status: 'Active',
    outstanding: 1_000_000,
    riskRating: undefined,
    maturityDate: undefined,
    watchlist: false,
    manuallyBoarded: false,
    boardingSource: undefined,
    extended: null,
  };
}

function Probe() {
  const { loans } = usePortfolioBook();
  if (loans.kind === 'loading') return <div>Loading</div>;
  if (loans.kind === 'failed') return <div role="alert">{loans.message}</div>;
  return <div>Ready {loans.data.length}</div>;
}

describe('PortfolioBookProvider', () => {
  it('loads the boarded book once and exposes a ready slot', async () => {
    const loadLoans = vi.fn(async () => [row('1'), row('2')]);

    render(
      <PortfolioBookProvider loadLoans={loadLoans}>
        <Probe />
      </PortfolioBookProvider>,
    );

    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(await screen.findByText('Ready 2')).toBeInTheDocument();
    expect(loadLoans).toHaveBeenCalledTimes(1);
  });

  it('surfaces loader failures as a failed slot', async () => {
    const loadLoans = vi.fn(async () => {
      throw new Error('Dataverse unavailable');
    });

    render(
      <PortfolioBookProvider loadLoans={loadLoans}>
        <Probe />
      </PortfolioBookProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Dataverse unavailable');
    });
  });
});
