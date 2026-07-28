// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('./migrationReconciliationDataverseAdapter', () => ({
  loadMigrationControls: vi.fn(),
}));

import { LiveMigrationReconciliationPanel } from './LiveMigrationReconciliationPanel';

describe('LiveMigrationReconciliationPanel', () => {
  it('loads the latest control and derives a tied result from live loan fields', async () => {
    render(
      <LiveMigrationReconciliationPanel
        loans={[
          {
            id: 'loan-1',
            loanNumber: '1001',
            borrower: 'Acme',
            status: 'Active',
            outstanding: 250000,
            riskRating: undefined,
            maturityDate: undefined,
            watchlist: false,
            manuallyBoarded: false,
            boardingSource: 'LOS',
            migrationBatchId: 'BATCH-1',
          },
        ]}
        loadControls={async () => [
          {
            batchId: 'BATCH-1',
            enteredLoanCount: 1,
            enteredAggregateOutstanding: 250000,
            expectedLoanNumbers: ['1001'],
          },
        ]}
      />,
    );
    await waitFor(() => expect(screen.getByText('TIED')).toBeInTheDocument());
  });

  it('surfaces a failed control read instead of rendering a false clean state', async () => {
    render(
      <LiveMigrationReconciliationPanel
        loans={[]}
        loadControls={async () => {
          throw new Error('raw Dataverse transport failure');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText('Book tie-out unavailable')).toBeInTheDocument());
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw Dataverse transport failure');
  });
});
