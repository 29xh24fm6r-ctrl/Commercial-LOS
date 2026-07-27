// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./AdminContext', () => ({ useAdmin: vi.fn() }));

const searchServicingOwnerLoansMock = vi.fn();
const writeAssignServicingOwnerMock = vi.fn();
vi.mock('./assignServicingOwnerWrite', () => ({
  searchServicingOwnerLoans: (...a: unknown[]) => searchServicingOwnerLoansMock(...a),
  writeAssignServicingOwner: (...a: unknown[]) => writeAssignServicingOwnerMock(...a),
  buildLiveAssignServicingOwnerWriteDeps: () => ({}),
}));

const loadPortfolioManagerOptionsMock = vi.fn();
vi.mock('../portfolioBoarding/portfolioManagerOptions', () => ({
  loadPortfolioManagerOptions: (...a: unknown[]) => loadPortfolioManagerOptionsMock(...a),
}));

import { useAdmin } from './AdminContext';
import { AdminAssignServicingOwnerPanel } from './AdminAssignServicingOwnerPanel';

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

const LOAN_ROW = {
  id: 'l1',
  name: 'Acme Boarded Loan',
  loanNumber: 'LN-1001',
  borrowerName: 'Acme Corp',
  active: true,
  currentServicingOwnerId: undefined,
  currentServicingOwnerName: undefined,
};

const OWNER = { id: 'su-2', name: 'Jamie Rivera', email: 'jamie@bank.test' };

beforeEach(() => {
  vi.clearAllMocks();
  searchServicingOwnerLoansMock.mockResolvedValue({ success: true, rows: [LOAN_ROW] });
  loadPortfolioManagerOptionsMock.mockResolvedValue([OWNER]);
});

describe('AdminAssignServicingOwnerPanel', () => {
  it('is read-only (no Assign affordance) when no Dataverse identity is resolved', async () => {
    admin({ systemUserId: undefined, writeDisabledReason: 'No systemuser provisioned.' });
    const user = userEvent.setup();
    render(<AdminAssignServicingOwnerPanel />);
    expect(document.querySelector('[data-admin-assign-servicing-owner-readonly]')?.textContent).toMatch(/No systemuser/i);

    await user.type(screen.getByLabelText(/Search boarded portfolio loans/i), 'Acme');
    await user.click(document.querySelector('[data-admin-assign-servicing-owner-search]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText(/Acme Boarded Loan/)).toBeInTheDocument());

    expect(document.querySelector('[data-admin-assign-servicing-owner-assign="l1"]')).toBeNull();
  });

  it('assigns a servicing owner through the governed write and shows the success outcome', async () => {
    admin();
    writeAssignServicingOwnerMock.mockResolvedValue({
      kind: 'success',
      loanId: 'l1',
      servicingOwnerId: 'su-2',
      servicingOwnerName: 'Jamie Rivera',
      correlationId: 'c1',
      auditId: 'a1',
    });
    const user = userEvent.setup();
    render(<AdminAssignServicingOwnerPanel />);

    await user.type(screen.getByLabelText(/Search boarded portfolio loans/i), 'Acme');
    await user.click(document.querySelector('[data-admin-assign-servicing-owner-search]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText(/Acme Boarded Loan/)).toBeInTheDocument());

    await waitFor(() => expect(loadPortfolioManagerOptionsMock).toHaveBeenCalled());
    await user.selectOptions(screen.getByLabelText('Servicing owner for Acme Boarded Loan'), 'su-2');
    await user.click(document.querySelector('[data-admin-assign-servicing-owner-assign="l1"]') as HTMLButtonElement);

    await waitFor(() => expect(writeAssignServicingOwnerMock).toHaveBeenCalledTimes(1));
    const arg = writeAssignServicingOwnerMock.mock.calls[0][0] as {
      loanId: string;
      servicingOwnerId: string;
      servicingOwnerName: string;
      authorized: boolean;
    };
    expect(arg).toMatchObject({ loanId: 'l1', servicingOwnerId: 'su-2', servicingOwnerName: 'Jamie Rivera', authorized: true });
    expect(await screen.findByText('Servicing owner set to Jamie Rivera.')).toBeInTheDocument();
  });

  it('the Assign button stays disabled until a servicing owner is selected', async () => {
    admin();
    const user = userEvent.setup();
    render(<AdminAssignServicingOwnerPanel />);

    await user.type(screen.getByLabelText(/Search boarded portfolio loans/i), 'Acme');
    await user.click(document.querySelector('[data-admin-assign-servicing-owner-search]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText(/Acme Boarded Loan/)).toBeInTheDocument());

    expect(document.querySelector('[data-admin-assign-servicing-owner-assign="l1"]')).toBeDisabled();
    expect(writeAssignServicingOwnerMock).not.toHaveBeenCalled();
  });

  it('shows the honest reason text (not a silent no-op) when the write is rejected as already-assigned', async () => {
    admin();
    writeAssignServicingOwnerMock.mockResolvedValue({
      kind: 'already-assigned',
      reason: '"Acme Boarded Loan" is already assigned to Jamie Rivera; nothing to change.',
    });
    const user = userEvent.setup();
    render(<AdminAssignServicingOwnerPanel />);

    await user.type(screen.getByLabelText(/Search boarded portfolio loans/i), 'Acme');
    await user.click(document.querySelector('[data-admin-assign-servicing-owner-search]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText(/Acme Boarded Loan/)).toBeInTheDocument());
    await waitFor(() => expect(loadPortfolioManagerOptionsMock).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Servicing owner for Acme Boarded Loan'), 'su-2');
    await user.click(document.querySelector('[data-admin-assign-servicing-owner-assign="l1"]') as HTMLButtonElement);

    expect(await screen.findByText(/already assigned to Jamie Rivera/i)).toBeInTheDocument();
  });
});
