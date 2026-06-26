// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 258 — Loan Workflow workbench: lists a newly-created deal, shows the
 * required columns, and opens a deal's command center on click.
 */

// The component statically imports loadBankerWorkQueueData (SDK-bound) for its
// default; mock the module so the test never pulls the SDK (we inject loadData).
vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(() => ({
    bankerId: 'banker-1',
    fullName: 'Dana Banker',
    email: 'dana@oldglorybank.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  })),
}));

import { BankerLoanWorkflowWorkbench } from './BankerLoanWorkflowWorkbench';

const NOW = new Date('2026-06-26T12:00:00Z');

function data(): BankerWorkQueueData {
  return {
    deals: [
      {
        id: 'deal-new',
        name: 'Acme Working Capital',
        clientName: 'Acme Holdings',
        stage: 'Intake',
        status: 'Open',
        amount: 250000,
        targetCloseDate: undefined,
        lastActivityOn: '2026-06-26T11:00:00Z',
        stageEntryDate: '2026-06-26T11:00:00Z',
        createdOn: '2026-06-26T11:00:00Z',
        isClosed: false,
        collateralSummary: undefined,
      },
    ],
    tasks: [
      { id: 't1', dealId: 'deal-new', title: 'Order appraisal', dueDate: '2026-07-01T00:00:00Z', modifiedOn: undefined, completed: false },
    ],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

let onOpenDeal: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onOpenDeal = vi.fn();
});

async function renderWorkbench(d: BankerWorkQueueData = data()) {
  const utils = render(
    <MemoryRouter>
      <BankerLoanWorkflowWorkbench loadData={async () => d} onOpenDeal={onOpenDeal} now={NOW} />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(utils.container.querySelector('[data-workbench-table]')).not.toBeNull();
  });
  return utils;
}

describe('Phase 258 — BankerLoanWorkflowWorkbench', () => {
  it('renders the four workbench sections with counts', async () => {
    const { container } = await renderWorkbench();
    for (const key of ['active', 'recent', 'closing', 'attention']) {
      expect(container.querySelector(`[data-workbench-section="${key}"]`)).not.toBeNull();
    }
    const active = container.querySelector('[data-workbench-section="active"]') as HTMLElement;
    expect(within(active).getByText('My Active Deals')).toBeInTheDocument();
    expect(within(active).getByText('1')).toBeInTheDocument();
  });

  it('lists a newly-created deal with borrower, stage, status, amount, owner, next action', async () => {
    const { container } = await renderWorkbench();
    const row = container.querySelector('[data-workbench-row="deal-new"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(within(row).getByText('Acme Working Capital')).toBeInTheDocument();
    expect(within(row).getByText('Acme Holdings')).toBeInTheDocument();
    expect(within(row).getByText('Intake')).toBeInTheDocument();
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(within(row).getByText('$250K')).toBeInTheDocument();
    expect(within(row).getByText('Dana Banker')).toBeInTheDocument();
    expect(within(row).getByText('Order appraisal')).toBeInTheDocument();
  });

  it('surfaces the freshly-created deal in the Recently Created section', async () => {
    const { container } = await renderWorkbench();
    const user = userEvent.setup();
    const recentCard = container.querySelector('[data-workbench-section="recent"]') as HTMLElement;
    expect(within(recentCard).getByText('1')).toBeInTheDocument();
    await user.click(recentCard);
    expect(container.querySelector('[data-workbench-row="deal-new"]')).not.toBeNull();
  });

  it('opens the deal command center (routes to /deals/:id) on row click', async () => {
    const { container } = await renderWorkbench();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-workbench-row="deal-new"]') as HTMLElement);
    expect(onOpenDeal).toHaveBeenCalledWith('deal-new');
  });

  it('shows an honest empty view when there are no deals', async () => {
    const { container } = render(
      <MemoryRouter>
        <BankerLoanWorkflowWorkbench
          loadData={async () => ({ ...data(), deals: [], tasks: [] })}
          onOpenDeal={onOpenDeal}
          now={NOW}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-workbench-empty]')).not.toBeNull();
    });
    expect(container.querySelector('[data-workbench-table]')).toBeNull();
  });
});
