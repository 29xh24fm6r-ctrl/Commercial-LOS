// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalCashFlowPanel } from './GlobalCashFlowPanel';

describe('GlobalCashFlowPanel', () => {
  it('shows an honest insufficient-data state before any figures are entered', () => {
    render(<GlobalCashFlowPanel />);
    expect(screen.getByText(/Not enough information to compute a DSCR yet/i)).toBeInTheDocument();
  });

  it('computes and displays a real DSCR once business, guarantor, and debt-service figures are entered', async () => {
    const user = userEvent.setup();
    const { container } = render(<GlobalCashFlowPanel />);

    await user.type(container.querySelector('[data-gcf-field="net-income"]') as HTMLInputElement, '200000');
    await user.type(container.querySelector('[data-gcf-field="interest-expense"]') as HTMLInputElement, '30000');
    await user.type(container.querySelector('[data-gcf-field="income-taxes"]') as HTMLInputElement, '40000');
    await user.type(container.querySelector('[data-gcf-field="depreciation"]') as HTMLInputElement, '50000');
    await user.type(container.querySelector('[data-gcf-field="amortization"]') as HTMLInputElement, '10000');

    await user.type(container.querySelector('[data-gcf-field="guarantor-0-name"]') as HTMLInputElement, 'Jane Doe');
    await user.type(container.querySelector('[data-gcf-field="guarantor-0-income"]') as HTMLInputElement, '120000');
    await user.type(container.querySelector('[data-gcf-field="guarantor-0-expenses"]') as HTMLInputElement, '60000');

    await user.type(container.querySelector('[data-gcf-field="proposed-debt-service"]') as HTMLInputElement, '250000');

    expect(container.querySelector('[data-gcf-result="computed"]')).not.toBeNull();
    // EBITDA 330,000 → Business CF 330,000; Personal CF 60,000; Global CF 390,000; Debt service 250,000
    const dscr = container.querySelector('[data-gcf-dscr]')?.textContent;
    expect(dscr).toBe((390_000 / 250_000).toFixed(2) + 'x');
  });

  it('supports adding and removing a second guarantor', async () => {
    const user = userEvent.setup();
    const { container } = render(<GlobalCashFlowPanel />);

    expect(container.querySelectorAll('[data-gcf-guarantor-row]')).toHaveLength(1);
    await user.click(container.querySelector('[data-gcf-add-guarantor]') as HTMLElement);
    expect(container.querySelectorAll('[data-gcf-guarantor-row]')).toHaveLength(2);

    await user.click(container.querySelector('[data-gcf-remove-guarantor="1"]') as HTMLElement);
    expect(container.querySelectorAll('[data-gcf-guarantor-row]')).toHaveLength(1);
  });

  it('says plainly that entries are not yet saved to the deal', () => {
    render(<GlobalCashFlowPanel />);
    expect(screen.getByRole('note')).toHaveTextContent(/not yet saved/i);
  });
});
