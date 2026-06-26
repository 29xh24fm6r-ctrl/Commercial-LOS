// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData } from './workQueueQueries';
import type { PipelineDeal } from './dealQueries';

/**
 * Phase 261 (Remediation A) — Loan Workflow runtime-crash regression.
 *
 * Root cause: `deriveLoanWorkbench` called `ownerName.trim()` directly on the
 * banker's `fullName`. For a banker whose cr664_fullname is null/empty (a real
 * production identity shape), `fullName` is undefined and `.trim()` threw inside
 * the render-phase useMemo, crashing the whole Loan Workflow tab into the
 * "Loan Workflow hit a problem" boundary.
 *
 * This mounts the production Loan Workflow path with that exact identity shape
 * AND realistic (non-empty) live deal/task data, and asserts the workbench
 * renders the deal table with no error-boundary fallback.
 */

const REALISTIC_DEAL: PipelineDeal = {
  id: 'deal-1',
  name: 'Riverside Logistics — Term Loan',
  clientName: 'Riverside Logistics LLC',
  stage: 'Underwriting',
  status: 'Open',
  amount: 2_400_000,
  createdOn: '2026-06-20T10:00:00Z',
  targetCloseDate: '2026-07-01T10:00:00Z',
  lastActivityOn: '2026-06-24T10:00:00Z',
} as PipelineDeal;

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(async (): Promise<BankerWorkQueueData> => ({
    deals: [REALISTIC_DEAL],
    tasks: [{ id: 't1', dealId: 'deal-1', title: 'Collect financials', dueDate: '2026-06-20T00:00:00Z', modifiedOn: undefined, completed: false }],
    outstandingDocuments: [{ id: 'doc1', dealId: 'deal-1', name: 'Tax returns', dueDate: undefined, requestDate: undefined, receivedDate: undefined, reviewer: undefined, uploaded: false, modifiedOn: undefined }],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  })),
}));
vi.mock('../portfolioBoarding/boardedLoansList', () => ({
  loadBoardedLoans: vi.fn(async () => []),
}));
// The crash-triggering identity: fullName is undefined (empty cr664_fullname).
vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(() => ({ bankerId: 'b1', fullName: undefined, email: 'banker@b.test', systemUserId: 'sys-1', writeDisabledReason: undefined })),
}));

import { BankerLoanWorkflowTab } from './BankerLoanWorkflowTab';

describe('Phase 261 — Loan Workflow does not crash on a name-less banker identity', () => {
  it('renders the workbench + deal table with no error boundary fallback', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <MemoryRouter>
        <BankerLoanWorkflowTab onNewDeal={() => {}} />
      </MemoryRouter>,
    );

    // Header renders synchronously.
    expect(screen.getByRole('heading', { name: 'Loan Workflow' })).toBeInTheDocument();

    // After data resolves the deal table appears (derivation ran without throwing).
    await waitFor(() => {
      expect(container.querySelector('[data-loan-table]')).not.toBeNull();
    });
    expect(screen.getByText('Riverside Logistics — Term Loan')).toBeInTheDocument();

    // No error-boundary fallback anywhere in the tab.
    expect(container.querySelector('[data-error-boundary]')).toBeNull();
    expect(screen.queryByText(/hit a problem/i)).toBeNull();

    // The name-less owner falls back to a safe label (no crash, no blank cell).
    expect(screen.getByText('You')).toBeInTheDocument();

    errSpy.mockRestore();
  });
});
