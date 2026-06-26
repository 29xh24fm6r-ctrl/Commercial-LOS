// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData } from './workQueueQueries';
import type { PipelineDeal } from './dealQueries';
import type { BoardedLoanRow } from '../portfolioBoarding/boardedLoansList';

/**
 * Phase 261F — Loan Workflow null hardening.
 *
 * Production crashed with "Cannot read properties of null (reading
 * 'toLocaleString')": formatAmount guarded `=== undefined` but Dataverse returns
 * `null` for empty numerics, and Number.isNaN(null) is false, so null reached
 * .toLocaleString(). This mounts the production path with NULL amount/date/
 * balance fields and asserts the workbench + existing-loans section render with
 * no ErrorBoundary fallback, showing the empty marker instead of crashing.
 */

// A deal whose numeric/date fields are all null (the live empty-field shape).
const NULL_DEAL = {
  id: 'deal-null',
  name: 'Null Fields Co — Term Loan',
  clientName: 'Null Fields Co',
  stage: 'Intake',
  status: 'Open',
  amount: null,
  createdOn: null,
  targetCloseDate: null,
  lastActivityOn: null,
} as unknown as PipelineDeal;

const NULL_BOARDED = {
  id: 'bl-1',
  loanNumber: 'L-NULL',
  borrower: 'Null Fields Co',
  status: 'Current',
  outstanding: null,
  riskRating: null,
  maturityDate: null,
  watchlist: false,
  manuallyBoarded: true,
  boardingSource: 'Manual Existing Loan Entry',
} as unknown as BoardedLoanRow;

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(async (): Promise<BankerWorkQueueData> => ({
    deals: [NULL_DEAL],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  })),
}));
vi.mock('../portfolioBoarding/boardedLoansList', () => ({
  loadBoardedLoans: vi.fn(async (): Promise<readonly BoardedLoanRow[]> => [NULL_BOARDED]),
}));
vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(() => ({ bankerId: 'b1', fullName: 'Dana Banker', email: 'dana@b.test', systemUserId: 'sys-1', writeDisabledReason: undefined })),
}));

import { BankerLoanWorkflowTab } from './BankerLoanWorkflowTab';

describe('Phase 261F — Loan Workflow renders with null Dataverse fields (no crash)', () => {
  it('renders the workbench deal table + existing-loans section, no ErrorBoundary fallback', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <MemoryRouter>
        <BankerLoanWorkflowTab onNewDeal={() => {}} />
      </MemoryRouter>,
    );

    // Workbench deal table renders (derivation + formatting ran without throwing).
    await waitFor(() => expect(container.querySelector('[data-loan-table]')).not.toBeNull());
    expect(screen.getByText('Null Fields Co — Term Loan')).toBeInTheDocument();

    // The null amount shows the empty marker, not a crash.
    const dealRow = container.querySelector('[data-loan-row="deal-null"]') as HTMLElement;
    expect(within(dealRow).getByText('Not provided')).toBeInTheDocument();

    // Existing Portfolio Loans section + the boarded row (null outstanding → "—").
    await waitFor(() => expect(container.querySelector('[data-existing-portfolio="panel"]')).not.toBeNull());
    const boardedRow = container.querySelector('[data-boarded-loan-row="bl-1"]') as HTMLElement;
    expect(boardedRow).not.toBeNull();
    expect(within(boardedRow).getByText('—')).toBeInTheDocument();

    // Add Existing Loan action still renders.
    expect(container.querySelector('[data-existing-loan-add]')).not.toBeNull();

    // No ErrorBoundary fallback anywhere.
    expect(container.querySelector('[data-error-boundary]')).toBeNull();
    expect(screen.queryByText(/hit a problem/i)).toBeNull();

    errSpy.mockRestore();
  });
});
