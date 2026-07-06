// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExistingPortfolioLoansPanel } from './ExistingPortfolioLoansPanel';
import type { ExistingLoanInput, BoardExistingLoanOutcome } from './existingLoanEntryAdapter';
import type { PortfolioManagerOption } from './portfolioManagerOptions';
import { LOAN_PRODUCTS } from './loanProducts';

/**
 * Phase 262 (B/C/D) — upgraded existing-loan form: product dropdown, rate-type
 * conditional index/spread, payment-61 preset, and persisting variable-rate
 * pricing (index/spread) through the governed adapter.
 * PM-1 — portfolio manager captured as a real systemuser lookup (picker).
 */

function success(): BoardExistingLoanOutcome {
  return { kind: 'success', loanId: 'id-1', loanNumber: 'LN-1', correlationId: 'c', childCreated: 0, childErrors: [], auditId: 'a' };
}

const MANAGERS: readonly PortfolioManagerOption[] = [
  { id: 'mgr-1', name: 'Dana Manager', email: 'dana@bank.test' },
  { id: 'mgr-2', name: 'Jordan Banker', email: 'jordan@bank.test' },
];

function renderForm(
  opts: { loadManagers?: () => Promise<readonly PortfolioManagerOption[]> } = {},
) {
  const boardLoan = vi.fn(async (_input: ExistingLoanInput): Promise<BoardExistingLoanOutcome> => success());
  const loadManagers = opts.loadManagers ?? (async () => MANAGERS);
  const utils = render(
    <ExistingPortfolioLoansPanel
      actorEmail="op@bank.test"
      actorSystemUserId="sys-1"
      writeDisabledReason={undefined}
      loadLoans={async () => []}
      boardLoan={boardLoan}
      loadManagers={loadManagers}
    />,
  );
  return { ...utils, boardLoan };
}

describe('Phase 262 — Existing Portfolio Loan form upgrade', () => {
  it('renders the loan product dropdown with the full product catalog', async () => {
    const { container } = renderForm();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    const product = container.querySelector('[data-xl-product]') as HTMLSelectElement;
    expect(product).not.toBeNull();
    // 16 products + the placeholder option.
    expect(within(product).getAllByRole('option')).toHaveLength(LOAN_PRODUCTS.length + 1);
    expect(within(product).getByText('SBA 7(a)')).toBeInTheDocument();
  });

  it('disables index/spread for Fixed and enables + requires them for Variable', async () => {
    const { container } = renderForm();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);

    const index = () => container.querySelector('[data-xl-index]') as HTMLSelectElement;
    const spread = () => container.querySelector('[data-xl-field="spread"]') as HTMLInputElement;
    // Default (no type) → disabled.
    expect(index().disabled).toBe(true);
    expect(spread().disabled).toBe(true);

    await user.selectOptions(container.querySelector('[data-xl-ratetype]') as HTMLSelectElement, 'Variable');
    expect(index().disabled).toBe(false);
    expect(spread().disabled).toBe(false);
    // Hint appears until index + spread are filled.
    expect(container.querySelector('[data-xl-variable-hint]')).not.toBeNull();
  });

  it('applies the payment-61 preset (term 120, reset payment 61, flag on)', async () => {
    const { container } = renderForm();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.click(container.querySelector('[data-xl-payment61-preset]') as HTMLElement);

    expect((container.querySelector('[data-xl-field="termMonths"]') as HTMLInputElement).value).toBe('120');
    expect((container.querySelector('[data-xl-field="firstResetPaymentNumber"]') as HTMLInputElement).value).toBe('61');
    expect((container.querySelector('[data-xl-payment61]') as HTMLInputElement).checked).toBe(true);
  });

  it('persists index + spread through the governed adapter for a Variable loan', async () => {
    const { container, boardLoan } = renderForm();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-1');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme');
    await user.selectOptions(container.querySelector('[data-xl-ratetype]') as HTMLSelectElement, 'Variable');
    await user.selectOptions(container.querySelector('[data-xl-index]') as HTMLSelectElement, 'Prime');
    await user.type(container.querySelector('[data-xl-field="spread"]') as HTMLInputElement, '1.5');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);

    await waitFor(() => expect(boardLoan).toHaveBeenCalledTimes(1));
    expect(boardLoan.mock.calls[0][0]).toMatchObject({ interestRateType: 'Variable', index: 'Prime', spread: 1.5 });
  });
});

describe('PM-1 — portfolio manager lookup selection', () => {
  it('loads assignable managers and boards with the selected systemuserid', async () => {
    const { container, boardLoan } = renderForm();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);

    const manager = container.querySelector('[data-xl-manager]') as HTMLSelectElement;
    expect(manager).not.toBeNull();
    // Options populate from the injected loader (+ the "Unassigned" placeholder).
    await waitFor(() => expect(within(manager).getAllByRole('option')).toHaveLength(MANAGERS.length + 1));
    expect(within(manager).getByText('Dana Manager · dana@bank.test')).toBeInTheDocument();

    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-1');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Acme');
    await user.selectOptions(manager, 'mgr-2');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);

    await waitFor(() => expect(boardLoan).toHaveBeenCalledTimes(1));
    expect(boardLoan.mock.calls[0][0]).toMatchObject({ portfolioManagerId: 'mgr-2' });
  });

  it('does not fabricate a manager bind when none is selected', async () => {
    const { container, boardLoan } = renderForm();
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);
    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-2');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Beta');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);

    await waitFor(() => expect(boardLoan).toHaveBeenCalledTimes(1));
    expect(boardLoan.mock.calls[0][0].portfolioManagerId).toBeUndefined();
  });

  it('shows an honest error and still allows boarding when the manager read fails', async () => {
    const { container, boardLoan } = renderForm({
      loadManagers: async () => {
        throw new Error('Timeout contacting Dataverse');
      },
    });
    const user = userEvent.setup();
    await user.click(container.querySelector('[data-existing-loan-add]') as HTMLElement);

    await waitFor(() => expect(container.querySelector('[data-xl-manager-error]')).not.toBeNull());
    expect((container.querySelector('[data-xl-manager]') as HTMLSelectElement).disabled).toBe(true);

    await user.type(container.querySelector('[data-xl-field="loanNumber"]') as HTMLInputElement, 'LN-3');
    await user.type(container.querySelector('[data-xl-field="borrowerLegalName"]') as HTMLInputElement, 'Gamma');
    await user.click(container.querySelector('[data-existing-loan-submit]') as HTMLButtonElement);

    await waitFor(() => expect(boardLoan).toHaveBeenCalledTimes(1));
    expect(boardLoan.mock.calls[0][0].portfolioManagerId).toBeUndefined();
  });
});
