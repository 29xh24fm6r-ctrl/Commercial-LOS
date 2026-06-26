// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 260 (Remediation A) — clicking Loan Workflow must render the workbench,
 * never a blank body. This renders the REAL tab (workbench + existing-loans
 * section) with mocked loaders and asserts a non-blank, premium surface.
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(async (): Promise<BankerWorkQueueData> => ({
    deals: [], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [],
  })),
}));
vi.mock('../portfolioBoarding/boardedLoansList', () => ({
  loadBoardedLoans: vi.fn(async () => []),
}));
vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(() => ({ bankerId: 'b1', fullName: 'Dana Banker', email: 'dana@b.test', systemUserId: 'sys-1', writeDisabledReason: undefined })),
}));

import { BankerLoanWorkflowTab } from './BankerLoanWorkflowTab';

describe('Phase 260 — Loan Workflow tab is never blank', () => {
  it('renders the workbench header, queue cards, and existing-portfolio section', async () => {
    const { container } = render(
      <MemoryRouter>
        <BankerLoanWorkflowTab onNewDeal={() => {}} />
      </MemoryRouter>,
    );
    // The panel wrapper + workbench header render immediately (no blank body).
    expect(container.querySelector('[data-banker-loan-workflow="panel"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Loan Workflow' })).toBeInTheDocument();
    expect(container.querySelector('[data-loan-queue]')).not.toBeNull();
    // Active deals / recently created / needs attention queue cards exist.
    for (const key of ['active', 'recent', 'attention']) {
      expect(container.querySelector(`[data-loan-queue-card="${key}"]`)).not.toBeNull();
    }
    // The existing portfolio loans section is mounted under its anchor.
    expect(container.querySelector('#existing-portfolio-loans')).not.toBeNull();
    await waitFor(() => {
      expect(container.querySelector('[data-existing-portfolio="panel"]')).not.toBeNull();
    });
    // Body is not blank.
    expect((container.textContent ?? '').trim().length).toBeGreaterThan(50);
  });
});
