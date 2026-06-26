// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExistingPortfolioLoansPanel } from './ExistingPortfolioLoansPanel';
import type { BoardedLoanRow } from './boardedLoansList';
import type { BoardExistingLoanOutcome, ExistingLoanInput } from './existingLoanEntryAdapter';

/**
 * Phase 259 — Existing Portfolio Loans panel UX.
 */

const IDENTITY = {
  actorEmail: 'op@oldglorybank.com',
  actorSystemUserId: 'sys-op-1',
  writeDisabledReason: undefined as string | undefined,
};

function existingRows(): BoardedLoanRow[] {
  return [
    { id: 'l1', loanNumber: 'LN-100', borrower: 'Globex Inc', status: 'Current', outstanding: 500000, riskRating: '4', maturityDate: undefined, watchlist: false, manuallyBoarded: true, boardingSource: 'Manual Existing Loan Entry' },
  ];
}

let boardLoan: ReturnType<typeof vi.fn>;
let loadLoans: ReturnType<typeof vi.fn>;

beforeEach(() => {
  boardLoan = vi.fn(async (): Promise<BoardExistingLoanOutcome> => ({
    kind: 'success', loanId: 'new-loan', loanNumber: 'LN-0001', correlationId: 'c1', childCreated: 1, childErrors: [], auditId: 'a1',
  }));
  loadLoans = vi.fn(async () => existingRows());
});

function renderPanel(identity = IDENTITY) {
  return render(
    <ExistingPortfolioLoansPanel
      {...identity}
      loadLoans={loadLoans as never}
      boardLoan={boardLoan as (i: ExistingLoanInput) => Promise<BoardExistingLoanOutcome>}
    />,
  );
}

async function waitList() {
  await waitFor(() => expect(screen.queryByText(/Loading portfolio loans/i)).toBeNull());
}

describe('Phase 259 — ExistingPortfolioLoansPanel', () => {
  it('lists existing boarded loans labeled "Manually boarded loan" and opens detail on click', async () => {
    const { container } = renderPanel();
    await waitList();
    const row = container.querySelector('[data-boarded-loan-row="l1"]') as HTMLElement;
    expect(within(row).getByText('LN-100')).toBeInTheDocument();
    expect(within(row).getByText('Manually boarded loan')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(row);
    const detail = container.querySelector('[data-boarded-loan-detail]') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(within(detail).getByText(/Existing portfolio loan \(manually boarded\)/i)).toBeInTheDocument();
  });

  it('opens the form and keeps Board disabled until required fields are entered', async () => {
    const { container } = renderPanel();
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    expect(container.querySelector('[data-existing-loan-form]')).not.toBeNull();
    const submit = container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-0001');
    expect(submit).toBeDisabled(); // borrower still missing
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme Holdings');
    expect(submit).not.toBeDisabled();
  });

  it('boards a loan, opens its detail, reloads the list, and does not require an originated deal link', async () => {
    const { container } = renderPanel();
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-0001');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme Holdings');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);

    await waitFor(() => expect(boardLoan).toHaveBeenCalled());
    const input = boardLoan.mock.calls[0]![0] as ExistingLoanInput;
    expect(input.loanNumber).toBe('LN-0001');
    expect(input.borrowerLegalName).toBe('Acme Holdings');
    expect(input.authorized).toBe(true);
    expect(input.originatedDealId).toBeUndefined(); // manual path: no deal link required

    // The new loan opens in a detail drawer and the list reloads.
    await waitFor(() => expect(container.querySelector('[data-boarded-loan-detail]')).not.toBeNull());
    expect(loadLoans).toHaveBeenCalledTimes(2); // initial + post-board reload
  });

  it('adds child records (e.g. guarantors) and passes them to the governed board', async () => {
    const { container } = renderPanel();
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-0001');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme Holdings');
    await user.click(container.querySelector('[data-xl-child-add="guarantors"]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-child-input="guarantors-0"]') as HTMLInputElement, 'Jane Guarantor');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);

    await waitFor(() => expect(boardLoan).toHaveBeenCalled());
    const input = boardLoan.mock.calls[0]![0] as ExistingLoanInput;
    expect(input.guarantors).toEqual([{ name: 'Jane Guarantor' }]);
  });

  it('fails closed on readback mismatch (no detail opened)', async () => {
    boardLoan.mockResolvedValueOnce({ kind: 'readback-mismatch', expectedLoanNumber: 'LN-0001', actualLoanNumber: 'LN-9', correlationId: 'c2' });
    const { container } = renderPanel();
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-0001');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme Holdings');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);
    await waitFor(() => expect(container.querySelector('[data-existing-loan-outcome="readback-mismatch"]')).not.toBeNull());
    expect(container.querySelector('[data-boarded-loan-detail]')).toBeNull();
  });

  it('blocks a duplicate loan number', async () => {
    boardLoan.mockResolvedValueOnce({ kind: 'duplicate', reason: 'already exists', loanNumber: 'LN-0001' });
    const { container } = renderPanel();
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-0001');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme Holdings');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);
    await waitFor(() => expect(container.querySelector('[data-existing-loan-outcome="duplicate"]')).not.toBeNull());
  });

  it('is read-only (Add disabled) without a Dataverse identity', async () => {
    const { container } = renderPanel({ ...IDENTITY, actorSystemUserId: undefined, writeDisabledReason: 'No systemuser.' });
    await waitList();
    expect(container.querySelector('[data-existing-loan-add]')).toBeDisabled();
    expect(container.querySelector('[data-existing-loan-write-disabled]')).not.toBeNull();
  });
});
