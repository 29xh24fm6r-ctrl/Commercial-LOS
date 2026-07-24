// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalCashFlowPanel } from './GlobalCashFlowPanel';
import type { DealDetail } from './dealQueries';
import { serializeGlobalCashFlowFormState, type GlobalCashFlowFormState } from './globalCashFlow';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { update: vi.fn(), get: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';

vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));

import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';

vi.mock('./newDealAuditActorResolver', () => ({
  createActorChangedByResolver: () => async () => ({
    ok: true,
    changedByBind: '/cr664_users(00000000-0000-0000-0000-000000000001)',
  }),
}));

const dealUpdate = vi.mocked(Cr664_loandealsService.update);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Corp',
    stage: 'Underwriting',
    status: 'Open',
    amount: 500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-08-01T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'One PG',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R and Inventory',
    createdOn: '2026-07-01T00:00:00Z',
    stageEntryDate: '2026-07-20T00:00:00Z',
    isClosed: false,
    ...overrides,
  };
}

beforeEach(() => {
  dealUpdate.mockReset();
  auditCreate.mockReset();
  auditCreate.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'audit-1' } } as never);
});

describe('GlobalCashFlowPanel', () => {
  it('shows an honest insufficient-data state before any figures are entered', () => {
    render(<GlobalCashFlowPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
    expect(screen.getByText(/Not enough information to compute a DSCR yet/i)).toBeInTheDocument();
  });

  it('computes and displays a real DSCR once business, guarantor, and debt-service figures are entered', async () => {
    const user = userEvent.setup();
    const { container } = render(<GlobalCashFlowPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);

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
    const { container } = render(<GlobalCashFlowPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);

    expect(container.querySelectorAll('[data-gcf-guarantor-row]')).toHaveLength(1);
    await user.click(container.querySelector('[data-gcf-add-guarantor]') as HTMLElement);
    expect(container.querySelectorAll('[data-gcf-guarantor-row]')).toHaveLength(2);

    await user.click(container.querySelector('[data-gcf-remove-guarantor="1"]') as HTMLElement);
    expect(container.querySelectorAll('[data-gcf-guarantor-row]')).toHaveLength(1);
  });

  describe('persistence (Factory Arc Phase 4)', () => {
    it('says entries save on click when authorized', () => {
      render(<GlobalCashFlowPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
      expect(screen.getByRole('note')).toHaveTextContent(/click save/i);
    });

    it('says plainly that entries cannot be saved when unauthorized (no fabricated persistence)', () => {
      render(<GlobalCashFlowPanel deal={baseDeal()} authorized={false} actorEmail={undefined} actorSystemUserId={undefined} />);
      expect(screen.getByRole('note')).toHaveTextContent(/cannot be saved/i);
      const saveBtn = screen.getByText('Save Global Cash Flow');
      expect(saveBtn).toBeDisabled();
    });

    it('restores previously saved figures from the deal on mount', () => {
      const saved: GlobalCashFlowFormState = {
        netIncome: '200000',
        interestExpense: '30000',
        incomeTaxes: '40000',
        depreciation: '50000',
        amortization: '10000',
        nonRecurringAddbacks: '',
        nonRecurringIncome: '',
        unfinancedCapEx: '',
        proposedNewDebtService: '250000',
        otherBusinessDebtService: '',
        guarantors: [
          { guarantorName: 'Jane Doe', grossPersonalIncome: '120000', nonCashAddbacks: '', personalLivingExpenses: '60000', otherPersonalDebtService: '' },
        ],
      };
      const deal = baseDeal({ financialSpreadInputsJson: serializeGlobalCashFlowFormState(saved) });
      const { container } = render(<GlobalCashFlowPanel deal={deal} authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);

      expect((container.querySelector('[data-gcf-field="net-income"]') as HTMLInputElement).value).toBe('200000');
      expect((container.querySelector('[data-gcf-field="guarantor-0-name"]') as HTMLInputElement).value).toBe('Jane Doe');
      expect(container.querySelector('[data-gcf-result="computed"]')).not.toBeNull();
    });

    it('a corrupt saved JSON value fails closed to a blank panel, not a crash', () => {
      const deal = baseDeal({ financialSpreadInputsJson: '{not valid json' });
      render(<GlobalCashFlowPanel deal={deal} authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);
      expect(screen.getByText(/Not enough information to compute a DSCR yet/i)).toBeInTheDocument();
    });

    it('saves entered figures via the governed write path and shows a confirmed outcome', async () => {
      dealUpdate.mockResolvedValue({ success: true, data: {} } as never);
      // Echo whatever was last written, matching the fakeDeps() convention in
      // updateDealProfile.test.ts, so readback verification passes.
      Cr664_loandealsService.get = vi.fn().mockImplementation(async () => {
        const lastCall = dealUpdate.mock.calls[dealUpdate.mock.calls.length - 1];
        const body = lastCall ? (lastCall[1] as Record<string, unknown>) : {};
        return { success: true, data: { ...body } };
      }) as never;

      const user = userEvent.setup();
      const { container } = render(<GlobalCashFlowPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.com" actorSystemUserId="sys-1" />);

      await user.type(container.querySelector('[data-gcf-field="net-income"]') as HTMLInputElement, '200000');
      await user.click(screen.getByText('Save Global Cash Flow'));

      await waitFor(() => expect(container.querySelector('[data-gcf-save-outcome="updated"]')).not.toBeNull());
      expect(container.querySelector('[data-gcf-save-outcome="updated"]')).toHaveTextContent(/saved/i);
      expect(dealUpdate).toHaveBeenCalledTimes(1);
      const [dealId, body] = dealUpdate.mock.calls[0] as [string, Record<string, unknown>];
      expect(dealId).toBe('deal-1');
      expect(typeof body.cr664_financialspreadinputs).toBe('string');
      const parsed = JSON.parse(body.cr664_financialspreadinputs as string);
      expect(parsed.netIncome).toBe('200000');
    });

    it('does not attempt a save when unauthorized (button disabled, no write call)', async () => {
      const user = userEvent.setup();
      render(<GlobalCashFlowPanel deal={baseDeal()} authorized={false} actorEmail={undefined} actorSystemUserId={undefined} />);
      const saveBtn = screen.getByText('Save Global Cash Flow');
      await user.click(saveBtn);
      expect(dealUpdate).not.toHaveBeenCalled();
    });
  });
});
