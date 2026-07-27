// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { DealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import type { CreditMemoData, CreditMemoSummary } from './creditMemoQueries';

/**
 * Phase 73 — CreditMemo card consistency-review block tests.
 *
 * The card already has a Phase 26 FreshnessBlock; Phase 73 added a
 * ConsistencyReviewBlock below it. These tests pin the new block's
 * three states (no-draft / no-findings / findings) and the
 * conservative-copy discipline.
 *
 * BankerContext + Bootstrap are mocked at the module boundary so
 * the SDK chain (write-disabled-reason / generated services) does
 * not load. The Phase 24/25 modal mount is suppressed via
 * CreditMemoDraftModal mock — Phase 73 does not touch it.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: () => ({
    bankerId: 'b-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  }),
}));
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: () => ({
    upn: 'm@bank.test',
    fullName: 'M. Paller',
    entraObjectId: 'oid',
    profileId: 'p',
    profileName: 'banker',
    workspaceId: 'ws-1',
    workspaceName: 'banker-ws',
    route: '/banker',
  }),
}));
vi.mock('./CreditMemoDraftModal', () => ({
  CreditMemoDraftModal: () => null,
}));
vi.mock('./creditMemoActions', () => ({
  saveCreditMemoDraft: vi.fn(),
}));
vi.mock('./finalizeCreditMemoAction', () => ({
  finalizeCreditMemoAction: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { CreditMemo } from './CreditMemo';
import { finalizeCreditMemoAction } from './finalizeCreditMemoAction';

const useDealDataMock = vi.mocked(useDealData);
const finalizeCreditMemoActionMock = vi.mocked(finalizeCreditMemoAction);

const baseDeal: DealDetail = {
  id: 'deal-73',
  name: 'Acme Working Capital',
  clientName: 'Acme Manufacturing, LLC',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-09-30T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory',
  createdOn: '2026-01-15T00:00:00Z',
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

function memo(text: string | undefined, overrides: Partial<CreditMemoSummary> = {}): CreditMemoSummary {
  return {
    id: 'm-1',
    name: 'Acme Working Capital — Draft v1',
    status: 'Draft',
    statusKey: 'draft',
    memoType: 'Banker draft',
    version: 1,
    generatedAt: '2026-06-01T00:00:00Z',
    modifiedOn: undefined,
    borrowerSafe: false,
    textPreview: text,
    ...overrides,
  };
}

function dealData(
  creditMemo: { kind: 'ready'; data: CreditMemoData } | { kind: 'loading' },
  refresh: (key: unknown) => void = () => undefined,
): DealData {
  return {
    deal: baseDeal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo,
    activity: { kind: 'ready', data: [] },
    refresh: refresh as DealData['refresh'],
  };
}

function getConsistencyBlock(): HTMLElement {
  return screen.getByRole('status', { name: /consistency review/i });
}

describe('CreditMemo — Phase 73 consistency-review states', () => {
  it('renders the no-draft state when no memo + no sections exist', () => {
    useDealDataMock.mockReturnValue(
      dealData({ kind: 'ready', data: { memos: [], sections: [] } }),
    );
    render(<CreditMemo />);
    const block = getConsistencyBlock();
    expect(
      within(block).getByText(
        /Consistency review available after a memo draft is saved/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders the "no findings" state when a memo exists and matches every structured field', () => {
    const memoText =
      'Acme Working Capital — borrower Acme Manufacturing, LLC. ' +
      'Currently in Underwriting. Loan amount $4,500,000. ' +
      'Senior secured against A/R, inventory.';
    useDealDataMock.mockReturnValue(
      dealData({
        kind: 'ready',
        data: { memos: [memo(memoText)], sections: [] },
      }),
    );
    render(<CreditMemo />);
    const block = getConsistencyBlock();
    expect(
      within(block).getByText(
        /No consistency findings from available structured fields/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders findings list with conservative copy when the memo is missing structured deal data', () => {
    // Memo omits the deal name + client name + amount → multiple
    // findings fire.
    useDealDataMock.mockReturnValue(
      dealData({
        kind: 'ready',
        data: {
          memos: [memo('Underwriting in progress. A/R, inventory.')],
          sections: [],
        },
      }),
    );
    render(<CreditMemo />);
    const block = getConsistencyBlock();
    // At least one "May need review" badge appears.
    expect(
      within(block).getAllByText(/may need review/i).length,
    ).toBeGreaterThan(0);
    // Conservative-copy phrasing must appear verbatim.
    expect(
      within(block).getByText(/Deterministic check, limited to available structured fields/i),
    ).toBeInTheDocument();
    expect(
      within(block).getByText(/Not AI/i),
    ).toBeInTheDocument();
    expect(
      within(block).getByText(/Not an approval or credit decision/i),
    ).toBeInTheDocument();
    expect(
      within(block).getByText(/Not a substitute for banker review/i),
    ).toBeInTheDocument();
  });

  it('does NOT render any failed / invalid / noncompliant / approved / rejected / AI-detected / hallucinated language anywhere', () => {
    useDealDataMock.mockReturnValue(
      dealData({
        kind: 'ready',
        data: {
          memos: [memo('Underwriting in progress.')],
          sections: [],
        },
      }),
    );
    render(<CreditMemo />);
    const block = getConsistencyBlock();
    const text = block.textContent ?? '';
    expect(text).not.toMatch(/\bfailed\b/i);
    expect(text).not.toMatch(/\binvalid\b/i);
    expect(text).not.toMatch(/\bnoncompliant\b/i);
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\brejected\b/i);
    expect(text).not.toMatch(/\bhallucinated\b/i);
    expect(text).not.toMatch(/\bAI[ -]detected\b/i);
    expect(text).not.toMatch(/\bguaranteed mismatch\b/i);
  });

  it('renders in readOnly mode without exposing the Generate Draft Preview button — consistency block stays visible', () => {
    useDealDataMock.mockReturnValue(
      dealData({
        kind: 'ready',
        data: { memos: [memo('No structured anchors here.')], sections: [] },
      }),
    );
    render(<CreditMemo readOnly />);
    // Generate Draft Preview button is suppressed by readOnly.
    expect(
      screen.queryByRole('button', { name: /generate credit memo draft preview/i }),
    ).toBeNull();
    // The consistency review block stays visible — it is derived-
    // only and not gated on write capability.
    const block = getConsistencyBlock();
    expect(block).toBeInTheDocument();
  });

  it('does not render the consistency block while credit memo data is still loading', () => {
    useDealDataMock.mockReturnValue(dealData({ kind: 'loading' }));
    render(<CreditMemo />);
    expect(
      screen.queryByRole('status', { name: /consistency review/i }),
    ).toBeNull();
  });
});

describe('CreditMemo — Workstream 146-B finalize UI', () => {
  it('offers "Finalize memo" only on the current (highest-version) Draft memo', () => {
    useDealDataMock.mockReturnValue(
      dealData({
        kind: 'ready',
        data: {
          memos: [
            memo(undefined, { id: 'm-1', version: 1, statusKey: 'draft' }),
            memo(undefined, { id: 'm-2', version: 2, statusKey: 'draft' }),
          ],
          sections: [],
        },
      }),
    );
    render(<CreditMemo />);
    const buttons = screen.getAllByRole('button', { name: /finalize memo/i });
    expect(buttons).toHaveLength(1);
  });

  it('does not offer "Finalize memo" once the current memo is already Final', () => {
    useDealDataMock.mockReturnValue(
      dealData({
        kind: 'ready',
        data: { memos: [memo(undefined, { statusKey: 'final', status: 'Final' })], sections: [] },
      }),
    );
    render(<CreditMemo />);
    expect(screen.queryByRole('button', { name: /finalize memo/i })).toBeNull();
    expect(screen.getByText(/this memo is finalized/i)).toBeInTheDocument();
  });

  it('disables Confirm finalize until a note is entered, then calls finalizeCreditMemoAction with the memo id and note', async () => {
    finalizeCreditMemoActionMock.mockResolvedValue({ kind: 'success', memoId: 'm-1' });
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(
      dealData(
        { kind: 'ready', data: { memos: [memo(undefined)], sections: [] } },
        refresh,
      ),
    );
    render(<CreditMemo />);

    fireEvent.click(screen.getByRole('button', { name: /finalize memo/i }));
    const confirmButton = screen.getByRole('button', { name: /confirm finalize/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/finalization note/i), {
      target: { value: 'Committee approved; finalizing.' },
    });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    await Promise.resolve();
    await Promise.resolve();

    expect(finalizeCreditMemoActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: 'deal-73',
        memoId: 'm-1',
        finalizeNote: 'Committee approved; finalizing.',
        actorEmail: 'm@bank.test',
      }),
    );
    expect(refresh).toHaveBeenCalledWith('after-credit-memo-finalized');
  });

  it('shows a banker-safe error and keeps the panel open when finalization is rejected', async () => {
    finalizeCreditMemoActionMock.mockResolvedValue({
      kind: 'invalid-input',
      message: 'This credit memo has already been finalized.',
    });
    useDealDataMock.mockReturnValue(
      dealData({ kind: 'ready', data: { memos: [memo(undefined)], sections: [] } }),
    );
    render(<CreditMemo />);

    fireEvent.click(screen.getByRole('button', { name: /finalize memo/i }));
    fireEvent.change(screen.getByLabelText(/finalization note/i), {
      target: { value: 'Finalizing.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm finalize/i }));

    expect(await screen.findByText(/this credit memo has already been finalized/i)).toBeInTheDocument();
    // Still offered — the panel did not silently close on failure.
    expect(screen.getByRole('button', { name: /confirm finalize/i })).toBeInTheDocument();
  });
});
