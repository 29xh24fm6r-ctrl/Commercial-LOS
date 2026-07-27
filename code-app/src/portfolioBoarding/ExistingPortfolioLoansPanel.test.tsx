// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ExistingPortfolioLoansPanel } from './ExistingPortfolioLoansPanel';
import type { BoardedLoanRow } from './boardedLoansList';
import type { BoardExistingLoanOutcome, ExistingLoanInput } from './existingLoanEntryAdapter';

/**
 * Phase 259 — Existing Portfolio Loans panel UX.
 */

const IDENTITY: { actorEmail: string | undefined; actorSystemUserId: string | undefined; writeDisabledReason: string | undefined } = {
  actorEmail: 'op@oldglorybank.com',
  actorSystemUserId: 'sys-op-1',
  writeDisabledReason: undefined,
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

function renderPanel(identity = IDENTITY, extra: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <ExistingPortfolioLoansPanel
        {...identity}
        loadLoans={loadLoans as never}
        boardLoan={boardLoan as (i: ExistingLoanInput) => Promise<BoardExistingLoanOutcome>}
        {...extra}
      />
    </MemoryRouter>,
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

  // PR A remediation — term/purpose are already persisted at boarding time (core column +
  // extended-attributes blob) but were never displayed anywhere in Portfolio; this pins the fix.
  it('shows loan term and purpose in the detail drawer when persisted, and a placeholder when absent', async () => {
    loadLoans = vi.fn(async () => [
      {
        ...existingRows()[0],
        termMonths: 60,
        extended: { purpose: 'Acquisition of commercial property' },
      },
    ]);
    const { container } = renderPanel(IDENTITY, { loadLoans: loadLoans as never });
    await waitList();
    const row = container.querySelector('[data-boarded-loan-row="l1"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(row);
    const detail = container.querySelector('[data-boarded-loan-detail]') as HTMLElement;
    expect(within(detail).getByText('60 months')).toBeInTheDocument();
    expect(within(detail).getByText('Acquisition of commercial property')).toBeInTheDocument();
  });

  it('shows a placeholder for term/purpose when the loan never captured them (never fabricated)', async () => {
    const { container } = renderPanel();
    await waitList();
    const row = container.querySelector('[data-boarded-loan-row="l1"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(row);
    const detail = container.querySelector('[data-boarded-loan-detail]') as HTMLElement;
    const termRow = within(detail).getByText('Term').closest('div');
    const purposeRow = within(detail).getByText('Purpose').closest('div');
    expect(termRow ? within(termRow).getByText('—') : null).not.toBeNull();
    expect(purposeRow ? within(purposeRow).getByText('—') : null).not.toBeNull();
  });

  it('links an originated portfolio loan back to its deal', async () => {
    loadLoans = vi.fn(async () => [{ ...existingRows()[0], manuallyBoarded: false, originatedDealId: 'deal-42' }]);
    const { container } = renderPanel(IDENTITY, { loadLoans: loadLoans as never });
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-boarded-loan-row="l1"]') as HTMLElement);
    const link = container.querySelector('[data-originating-deal-link]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/deals/deal-42');
  });

  it('shows an honest no-link state for a manual or legacy portfolio loan', async () => {
    const { container } = renderPanel();
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-boarded-loan-row="l1"]') as HTMLElement);
    expect(container.querySelector('[data-originating-deal-link]')).toBeNull();
    expect(container.querySelector('[data-originating-deal-unlinked]')).toHaveTextContent('Not linked to an originated deal');
  });

  // Factory Arc Phase 9 — the detail drawer shows REAL per-loan child-record
  // counts (collateral, guarantors, etc.), not a fabricated readiness claim.
  it('shows real per-loan record completeness in the detail drawer, distinguishing zero from a failed read', async () => {
    const loadRecordCounts = vi.fn(async () => ({
      borrowers: 0,
      collateral: 2,
      guarantors: 1,
      covenants: 0,
      ticklers: null, // a failed read for this group — must render distinctly from 0
      insurance: 0,
      documents: 3,
      exceptions: 0,
      reviews: 0,
      examinerNotes: 0,
    }));
    const { container } = renderPanel(IDENTITY, { loadRecordCounts });
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-boarded-loan-row="l1"]') as HTMLElement);

    await waitFor(() => expect(loadRecordCounts).toHaveBeenCalledWith('l1'));
    const section = await waitFor(() => {
      const el = container.querySelector('[data-boarded-loan-record-completeness]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    await waitFor(() => expect(within(section).getByText(/6 records across 3 of 10 groups/i)).toBeInTheDocument());

    const collateralRow = section.querySelector('[data-record-group="collateral"]') as HTMLElement;
    expect(within(collateralRow).getByText('2')).toBeInTheDocument();
    const ticklersRow = section.querySelector('[data-record-group="ticklers"]') as HTMLElement;
    expect(within(ticklersRow).getByText('Could not load')).toBeInTheDocument();
    const borrowersRow = section.querySelector('[data-record-group="borrowers"]') as HTMLElement;
    expect(within(borrowersRow).getByText('0')).toBeInTheDocument();
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
    boardLoan.mockResolvedValueOnce({ kind: 'duplicate', reason: 'already exists', loanNumber: 'LN-0001', existingLoanId: 'loan-existing' });
    const { container } = renderPanel();
    await waitList();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-0001');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme Holdings');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);
    await waitFor(() => expect(container.querySelector('[data-existing-loan-outcome="duplicate"]')).not.toBeNull());
    expect(container.querySelector('[data-existing-loan-outcome="duplicate"]')).toHaveTextContent('loan-existing');
  });

  it('is read-only (Add disabled) without a Dataverse identity', async () => {
    const { container } = renderPanel({ ...IDENTITY, actorSystemUserId: undefined, writeDisabledReason: 'No systemuser.' });
    await waitList();
    expect(container.querySelector('[data-existing-loan-add]')).toBeDisabled();
    expect(container.querySelector('[data-existing-loan-write-disabled]')).not.toBeNull();
  });
});
