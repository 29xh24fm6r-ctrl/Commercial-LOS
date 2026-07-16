// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BankerIdentity } from '../banker/BankerContext';

vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: vi.fn(),
}));
vi.mock('./buildLivePortfolioBoardingRuntimeDeps', () => ({
  buildLivePortfolioBoardingRuntimeAdapter: vi.fn(),
}));

import { useOptionalBanker } from '../banker/BankerContext';
import { buildLivePortfolioBoardingRuntimeAdapter } from './buildLivePortfolioBoardingRuntimeDeps';
import { PortfolioLoanBoardingForm } from './PortfolioLoanBoardingForm';
import { BOARDING_FORM_SECTIONS } from './portfolioLoanBoardingFormModel';

const useOptionalBankerMock = vi.mocked(useOptionalBanker);
const buildAdapterMock = vi.mocked(buildLivePortfolioBoardingRuntimeAdapter);

function banker(overrides: Partial<BankerIdentity> = {}): BankerIdentity {
  return {
    bankerId: 'b-1',
    fullName: 'Matt Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'su-1',
    writeDisabledReason: undefined,
    ...overrides,
  } as BankerIdentity;
}

function disabledAdapter() {
  return {
    gate: { schemaReady: true, livePersistenceEnabled: false, routeEnabled: false, canCreate: false, canUpdate: false, canRead: false, canSearch: false, blockers: [], warnings: [] },
    live: false,
    adapter: {
      enabled: false,
      createBoardedLoan: vi.fn(async () => ({ ok: false, operation: 'disabled', errorCode: 'adapter_not_configured', message: 'not enabled' })),
      updateBoardedLoan: vi.fn(),
      searchBoardedLoans: vi.fn(),
    },
  };
}

beforeEach(() => {
  useOptionalBankerMock.mockReset();
  buildAdapterMock.mockReset();
  useOptionalBankerMock.mockReturnValue(banker());
  buildAdapterMock.mockReturnValue(disabledAdapter() as never);
});

describe('PortfolioLoanBoardingForm', () => {
  it('renders every declared boarding form section', () => {
    render(<PortfolioLoanBoardingForm />);
    for (const section of BOARDING_FORM_SECTIONS) {
      expect(screen.getByText(section.label)).toBeInTheDocument();
    }
  });

  it('shows the disabled-persistence notice while live boarding is not enabled', () => {
    render(<PortfolioLoanBoardingForm />);
    expect(screen.getByText(/not enabled in this environment/i)).toBeInTheDocument();
  });

  it('editing a scalar field (e.g. loan number) updates the input value', () => {
    render(<PortfolioLoanBoardingForm />);
    const loanNumberInput = screen.getByLabelText('Loan number') as HTMLInputElement;
    fireEvent.change(loanNumberInput, { target: { value: 'LN-100' } });
    expect(loanNumberInput.value).toBe('LN-100');
  });

  it('adding a collateral item renders an editable item card, and remove clears it', () => {
    render(<PortfolioLoanBoardingForm />);
    fireEvent.click(screen.getByRole('button', { name: /add collateral item/i }));
    expect(screen.getByText('Collateral item #1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('Collateral item #1')).not.toBeInTheDocument();
  });

  it('Factory Arc Phase 6 regression: the submit button itself is disabled (not just inert) while boarding is unavailable', () => {
    render(<PortfolioLoanBoardingForm />);
    const button = screen.getByRole('button', { name: 'Board this loan' });
    // Previously this button's `disabled` only checked the in-flight pending
    // state, never persistence.enabled — a banker could click it and only
    // learn it failed after a spinner. It must be disabled up front.
    expect(button).toBeDisabled();
    expect(button.getAttribute('title')).toMatch(/not enabled in this environment/i);
  });

  it('the submit button is enabled once boarding is genuinely live', () => {
    buildAdapterMock.mockReturnValue({
      gate: { schemaReady: true, livePersistenceEnabled: true, routeEnabled: true, canCreate: true, canUpdate: true, canRead: true, canSearch: true, blockers: [], warnings: [] },
      live: true,
      adapter: { enabled: true, createBoardedLoan: vi.fn(), updateBoardedLoan: vi.fn(), searchBoardedLoans: vi.fn() },
    } as never);
    render(<PortfolioLoanBoardingForm />);
    expect(screen.getByRole('button', { name: 'Board this loan' })).not.toBeDisabled();
  });

  it('clicking "Board this loan" with a disabled adapter never calls create, and reports the honest disabled failure', async () => {
    const createBoardedLoan = vi.fn(async () => ({ ok: true, operation: 'create', recordId: 'x' }));
    buildAdapterMock.mockReturnValue({
      ...disabledAdapter(),
      adapter: { enabled: false, createBoardedLoan, updateBoardedLoan: vi.fn(), searchBoardedLoans: vi.fn() },
    } as never);
    render(<PortfolioLoanBoardingForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Board this loan' }));

    // Fail-closed: the hook's own `enabled` check short-circuits before ever calling
    // the injected adapter — never a fake success from a disabled adapter.
    await vi.waitFor(() => expect(screen.getAllByText(/not enabled/i).length).toBeGreaterThan(0));
    expect(createBoardedLoan).not.toHaveBeenCalled();
  });

  it('clicking "Board this loan" with a LIVE adapter calls create with the populated package', async () => {
    const createBoardedLoan = vi.fn(async (pkg: { source?: string }) => {
      void pkg;
      return { ok: true, operation: 'create', recordId: 'row-1' };
    });
    buildAdapterMock.mockReturnValue({
      gate: { schemaReady: true, livePersistenceEnabled: true, routeEnabled: true, canCreate: true, canUpdate: true, canRead: true, canSearch: true, blockers: [], warnings: [] },
      live: true,
      adapter: { enabled: true, createBoardedLoan, updateBoardedLoan: vi.fn(), searchBoardedLoans: vi.fn() },
    } as never);
    render(<PortfolioLoanBoardingForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Board this loan' }));

    await vi.waitFor(() => expect(createBoardedLoan).toHaveBeenCalledTimes(1));
    const pkg = createBoardedLoan.mock.calls[0]![0];
    expect(pkg.source).toBe('manual_boarding');
  });
});
