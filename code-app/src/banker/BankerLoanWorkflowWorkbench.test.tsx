// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, within, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 260 — Loan Workflow elite workbench.
 */

vi.mock('./workQueueQueries', () => ({ loadBankerWorkQueueData: vi.fn() }));
vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(() => ({ bankerId: 'banker-1', fullName: 'Dana Banker', email: 'dana@b.test', systemUserId: 'sys-1', writeDisabledReason: undefined })),
}));

import { BankerLoanWorkflowWorkbench } from './BankerLoanWorkflowWorkbench';

const NOW = new Date('2026-06-26T12:00:00Z');

function data(): BankerWorkQueueData {
  return {
    deals: [
      { id: 'deal-new', name: 'Acme Working Capital', clientName: 'Acme Holdings', stage: 'Intake', status: 'Open', amount: 250000, targetCloseDate: undefined, lastActivityOn: '2026-06-26T11:00:00Z', stageEntryDate: '2026-06-26T11:00:00Z', createdOn: '2026-06-26T11:00:00Z', isClosed: false, collateralSummary: undefined },
    ],
    tasks: [{ id: 't1', dealId: 'deal-new', title: 'Order appraisal', dueDate: '2026-07-01T00:00:00Z', modifiedOn: undefined, completed: false }],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

let onOpenDeal: ReturnType<typeof vi.fn>;
let onNewDeal: ReturnType<typeof vi.fn>;
let onAddExistingLoan: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onOpenDeal = vi.fn();
  onNewDeal = vi.fn();
  onAddExistingLoan = vi.fn();
});

async function renderWorkbench(d: BankerWorkQueueData = data()) {
  const utils = render(
    <MemoryRouter>
      <BankerLoanWorkflowWorkbench loadData={async () => d} onOpenDeal={onOpenDeal} onNewDeal={onNewDeal} onAddExistingLoan={onAddExistingLoan} now={NOW} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(utils.container.querySelector('[data-loan-table], [data-loan-empty]')).not.toBeNull());
  return utils;
}

describe('Phase 260 — BankerLoanWorkflowWorkbench (elite)', () => {
  it('renders a premium header with New Deal / Add Existing Loan / Open Portfolio + quick search', async () => {
    const { container } = await renderWorkbench();
    expect(screen.getByRole('heading', { name: 'Loan Workflow' })).toBeInTheDocument();
    expect(screen.getByText(/intake through closing and portfolio boarding/i)).toBeInTheDocument();
    expect(container.querySelector('[data-loan-action-new-deal]')).not.toBeNull();
    expect(container.querySelector('[data-loan-action-add-existing]')).not.toBeNull();
    expect(container.querySelector('[data-loan-action-open-portfolio]')?.getAttribute('href')).toBe('/workspaces/manager');
    expect(container.querySelector('[data-loan-search]')).not.toBeNull();
  });

  it('renders the six executive work-queue cards', async () => {
    const { container } = await renderWorkbench();
    for (const key of ['active', 'recent', 'attention', 'closing', 'diligence', 'boarding']) {
      expect(container.querySelector(`[data-loan-queue-card="${key}"]`)).not.toBeNull();
    }
  });

  it('renders the scaffolding immediately (header present before data resolves — never blank)', () => {
    const { container } = render(
      <MemoryRouter>
        <BankerLoanWorkflowWorkbench loadData={() => new Promise(() => {})} onOpenDeal={onOpenDeal} now={NOW} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Loan Workflow' })).toBeInTheDocument();
    expect(container.querySelector('[data-loan-queue]')).not.toBeNull();
  });

  it('lists a newly-created deal with borrower/stage/status/amount/banker/next action and opens the command center', async () => {
    const { container } = await renderWorkbench();
    const row = container.querySelector('[data-loan-row="deal-new"]') as HTMLElement;
    expect(within(row).getByText('Acme Working Capital')).toBeInTheDocument();
    expect(within(row).getByText('Acme Holdings')).toBeInTheDocument();
    expect(within(row).getByText('Intake')).toBeInTheDocument();
    expect(within(row).getByText('Open')).toBeInTheDocument();
    expect(within(row).getByText('$250K')).toBeInTheDocument();
    expect(within(row).getByText('Dana Banker')).toBeInTheDocument();
    expect(within(row).getByText('Order appraisal')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(row);
    expect(onOpenDeal).toHaveBeenCalledWith('deal-new');
  });

  it('queue cards filter the workbench; Recently Created shows the fresh deal', async () => {
    const { container } = await renderWorkbench();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-loan-queue-card="recent"]') as HTMLElement);
    expect(container.querySelector('[data-loan-row="deal-new"]')).not.toBeNull();
  });

  it('typing into search never crashes on a deal with a null/empty name (same class as the Phase 261 null-hardening bugs)', async () => {
    const withNullNamedDeal: BankerWorkQueueData = {
      ...data(),
      deals: [
        ...data().deals,
        { id: 'deal-null-name', name: null, clientName: null, stage: 'Intake', status: 'Open', amount: undefined, targetCloseDate: undefined, lastActivityOn: undefined, stageEntryDate: undefined, createdOn: '2026-06-26T11:00:00Z', isClosed: false, collateralSummary: undefined } as unknown as BankerWorkQueueData['deals'][number],
      ],
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = await renderWorkbench(withNullNamedDeal);
    const user = userEvent.setup();
    await user.type(container.querySelector('[data-loan-search]') as HTMLElement, 'acme');
    expect(container.querySelector('[data-error-boundary]')).toBeNull();
    expect(container.querySelector('[data-loan-row="deal-new"]')).not.toBeNull();
    errSpy.mockRestore();
  });

  it('Portfolio Boarding card and Add Existing Loan invoke the existing-loans action', async () => {
    const { container } = await renderWorkbench();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-loan-queue-card="boarding"]') as HTMLElement);
    await user.click(container.querySelector('[data-loan-action-add-existing]') as HTMLElement);
    expect(onAddExistingLoan).toHaveBeenCalledTimes(2);
  });

  it('New Deal action + empty-state CTA invoke onNewDeal', async () => {
    const { container } = await renderWorkbench({ ...data(), deals: [], tasks: [] });
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-loan-action-new-deal]') as HTMLElement);
    expect(onNewDeal).toHaveBeenCalled();
    // Empty state is polished, with a Create-a-New-Deal CTA.
    const empty = container.querySelector('[data-loan-empty]') as HTMLElement;
    expect(within(empty).getByText(/No active deals yet/i)).toBeInTheDocument();
    await user.click(container.querySelector('[data-loan-empty-cta]') as HTMLElement);
    expect(onNewDeal).toHaveBeenCalledTimes(2);
  });

  it('uses no banker-facing engineering language', async () => {
    const { container } = await renderWorkbench({ ...data(), deals: [], tasks: [] });
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['not wired', 'writeback gated', 'future phase', 'command center readiness', 'no governed', 'read-only in this release']) {
      expect(text).not.toContain(banned);
    }
  });
});
