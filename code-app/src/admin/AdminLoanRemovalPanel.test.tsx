// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./AdminContext', () => ({ useAdmin: vi.fn() }));

const searchDealsMock = vi.fn();
const listRemovedDealsMock = vi.fn();
const searchPortfolioLoansMock = vi.fn();
const listRemovedPortfolioLoansMock = vi.fn();
vi.mock('./adminLoanLookup', () => ({
  searchDeals: (...a: unknown[]) => searchDealsMock(...a),
  listRemovedDeals: (...a: unknown[]) => listRemovedDealsMock(...a),
  searchPortfolioLoans: (...a: unknown[]) => searchPortfolioLoansMock(...a),
  listRemovedPortfolioLoans: (...a: unknown[]) => listRemovedPortfolioLoansMock(...a),
}));

const writeDealMock = vi.fn();
vi.mock('./dealRemovalWrite', () => ({
  writeDealRemoval: (...a: unknown[]) => writeDealMock(...a),
  buildLiveDealRemovalWriteDeps: () => ({}),
}));

const writeLoanMock = vi.fn();
vi.mock('./portfolioLoanRemovalWrite', () => ({
  writePortfolioLoanRemoval: (...a: unknown[]) => writeLoanMock(...a),
  buildLivePortfolioLoanRemovalWriteDeps: () => ({}),
}));

import { useAdmin } from './AdminContext';
import { AdminLoanRemovalPanel } from './AdminLoanRemovalPanel';

const useAdminMock = vi.mocked(useAdmin);

function admin(over: Partial<ReturnType<typeof useAdmin>> = {}) {
  useAdminMock.mockReturnValue({
    upn: 'admin@bank.test',
    fullName: 'Admin',
    profileName: undefined,
    entraObjectId: 'e1',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  } as ReturnType<typeof useAdmin>);
}

const DEAL_ROW = { id: 'd1', name: 'Acme Term Loan', statusName: 'Underwriting', closed: false, active: true };
const LOAN_ROW = { id: 'l1', name: 'Acme Boarded Loan', loanNumber: 'LN-1001', borrowerName: 'Acme Corp', loanStatus: 'Performing', active: true };

beforeEach(() => {
  vi.clearAllMocks();
  searchDealsMock.mockResolvedValue({ success: true, rows: [DEAL_ROW] });
  listRemovedDealsMock.mockResolvedValue({ success: true, rows: [] });
  searchPortfolioLoansMock.mockResolvedValue({ success: true, rows: [LOAN_ROW] });
  listRemovedPortfolioLoansMock.mockResolvedValue({ success: true, rows: [] });
});

describe('AdminLoanRemovalPanel', () => {
  it('is read-only (no remove affordance) when no Dataverse identity is resolved', async () => {
    admin({ systemUserId: undefined, writeDisabledReason: 'No systemuser provisioned.' });
    const user = userEvent.setup();
    render(<AdminLoanRemovalPanel />);
    expect(document.querySelector('[data-admin-loan-removal-readonly]')?.textContent).toMatch(/No systemuser/i);

    await user.type(screen.getByLabelText('Search deals by name or id'), 'Acme');
    await user.click(document.querySelector('[data-admin-loan-removal-search]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('Acme Term Loan')).toBeInTheDocument());

    expect(document.querySelector('[data-admin-loan-removal-remove-deal="d1"]')).toBeNull();
  });

  it('withdraws a deal through the governed write with a reason', async () => {
    admin();
    writeDealMock.mockResolvedValue({ kind: 'success', action: 'withdraw', dealId: 'd1', label: '"Acme Term Loan" removed.', correlationId: 'c', auditId: 'a' });
    const user = userEvent.setup();
    render(<AdminLoanRemovalPanel />);

    await user.type(screen.getByLabelText('Search deals by name or id'), 'Acme');
    await user.click(document.querySelector('[data-admin-loan-removal-search]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('Acme Term Loan')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Reason for removing Acme Term Loan'), 'duplicate entry');
    await user.click(document.querySelector('[data-admin-loan-removal-remove-deal="d1"]') as HTMLButtonElement);

    await waitFor(() => expect(writeDealMock).toHaveBeenCalledTimes(1));
    const arg = writeDealMock.mock.calls[0][0] as { action: { kind: string; dealId: string; reason: string }; authorized: boolean };
    expect(arg.action).toMatchObject({ kind: 'withdraw', dealId: 'd1', reason: 'duplicate entry' });
    expect(arg.authorized).toBe(true);
    expect(await screen.findByText('"Acme Term Loan" removed.')).toBeInTheDocument();
  });

  it('removes a portfolio loan through the governed write in Portfolio loan mode', async () => {
    admin();
    writeLoanMock.mockResolvedValue({ kind: 'success', action: 'remove', loanId: 'l1', label: '"Acme Boarded Loan" removed.', correlationId: 'c', auditId: 'a' });
    const user = userEvent.setup();
    render(<AdminLoanRemovalPanel />);

    await user.click(screen.getByRole('button', { name: 'Portfolio loan' }));
    await user.type(screen.getByLabelText('Search portfolio loans by name, loan number, borrower, or id'), 'Acme');
    await user.click(document.querySelector('[data-admin-loan-removal-search]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText(/Acme Boarded Loan/)).toBeInTheDocument());

    await user.type(screen.getByLabelText('Reason for removing Acme Boarded Loan'), 'booked in error');
    await user.click(document.querySelector('[data-admin-loan-removal-remove-loan="l1"]') as HTMLButtonElement);

    await waitFor(() => expect(writeLoanMock).toHaveBeenCalledTimes(1));
    const arg = writeLoanMock.mock.calls[0][0] as { action: { kind: string; loanId: string; reason: string } };
    expect(arg.action).toMatchObject({ kind: 'remove', loanId: 'l1', reason: 'booked in error' });
  });

  it('lists removed deals with a Reinstate action', async () => {
    admin();
    listRemovedDealsMock.mockResolvedValue({ success: true, rows: [{ ...DEAL_ROW, id: 'd2', statusName: 'Withdrawn', active: false }] });
    writeDealMock.mockResolvedValue({ kind: 'success', action: 'reinstate', dealId: 'd2', label: 'reinstated', correlationId: 'c', auditId: 'a' });
    const user = userEvent.setup();
    render(<AdminLoanRemovalPanel />);

    await waitFor(() => expect(screen.getByText('Removed deals (1)')).toBeInTheDocument());
    await user.click(document.querySelector('[data-admin-loan-removal-reinstate-deal="d2"]') as HTMLButtonElement);

    await waitFor(() => expect(writeDealMock).toHaveBeenCalledTimes(1));
    expect((writeDealMock.mock.calls[0][0] as { action: { kind: string; dealId: string } }).action).toMatchObject({ kind: 'reinstate', dealId: 'd2' });
  });
});
