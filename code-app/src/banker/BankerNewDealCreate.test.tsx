// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./BankerContext', () => ({ useBanker: vi.fn() }));

// Mock the dynamically-imported governed modules so no SDK loads and outcomes
// are controlled. These are loaded only on submit.
const orchestrateMock = vi.fn();
vi.mock('../deals/dealOriginationOrchestrator', () => ({
  orchestrateDealOrigination: (...args: unknown[]) => orchestrateMock(...args),
}));
vi.mock('../deals/newDealCreateAdapter', () => ({
  buildLiveNewDealCreateDeps: vi.fn(() => ({ enabled: false })),
  createGovernedNewDeal: vi.fn(),
}));
vi.mock('../deals/newDealReferenceReader', () => ({
  resolveProductionNewDealReferences: vi.fn(),
}));

import { useBanker } from './BankerContext';
import { BankerNewDealCreate } from './BankerNewDealCreate';

const useBankerMock = vi.mocked(useBanker);

function setBanker(over: Partial<ReturnType<typeof useBanker>> = {}) {
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  orchestrateMock.mockReset();
});

describe('Phase 182A -- banker New Deal create surface', () => {
  it('authorized banker (pilot on) sees the create form with an enabled gate', () => {
    setBanker();
    const { container } = render(<BankerNewDealCreate />);
    expect(screen.getByRole('region', { name: 'New Deal' })).toBeInTheDocument();
    expect(screen.getByText('Create enabled')).toBeInTheDocument();
    expect(container.querySelector('[data-banker-new-deal-form]')).not.toBeNull();
    // Submit is disabled until a deal name is entered.
    const submit = container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it('an unauthorized banker (no systemuser) sees an honest disabled state, no form', () => {
    setBanker({ systemUserId: undefined, writeDisabledReason: 'No systemuser binding.' });
    const { container } = render(<BankerNewDealCreate />);
    const note = container.querySelector('[data-banker-new-deal-state]');
    expect(note?.getAttribute('data-banker-new-deal-state')).toBe('unauthorized');
    expect(note?.textContent).toMatch(/not authorized/i);
    expect(note?.textContent).toMatch(/No record has been created/i);
    expect(container.querySelector('[data-banker-new-deal-form]')).toBeNull();
  });

  it('does not call the governed create until a name is entered and submit clicked', async () => {
    setBanker();
    render(<BankerNewDealCreate />);
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it('submitting a named deal calls the orchestrator with downstream disabled and renders the real id', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
    });
    const user = userEvent.setup();
    const { container } = render(<BankerNewDealCreate />);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(screen.getByText(/Deal created\. Id deal-xyz/)).toBeInTheDocument();
    // Orchestrator called with downstream config empty (all disabled).
    const callArg = orchestrateMock.mock.calls[0]![0] as { config: unknown; form: { dealName: string } };
    expect(callArg.config).toEqual({});
    expect(callArg.form.dealName).toBe('Acme WC');
  });

  it('audit_failed_partial renders a distinct, honest warning (not a clean success)', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'audit_failed_partial',
      createdDealId: 'deal-xyz',
      correlationId: 'corr-abc',
      auditOutcome: { kind: 'failed', error: 'AuditEvent create returned non-success. | auditPayload keys=[...]; binds=[cr664_ChangedBy@odata.bind->cr664_users,cr664_LoanDeal@odata.bind->cr664_loandeals]' },
      userFacingMessage: 'partial',
    });
    const user = userEvent.setup();
    const { container } = render(<BankerNewDealCreate />);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="audit_failed_partial"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-banker-new-deal-result="success"]')).toBeNull();
    expect(screen.getByText(/audit record failed/i)).toBeInTheDocument();
    // The raw audit error (incl. sanitized payload shape) + correlation id are
    // surfaced so the operator can capture them for diagnosis.
    const banner = container.querySelector('[data-banker-new-deal-result="audit_failed_partial"]');
    expect(banner?.textContent).toMatch(/Correlation id: corr-abc/);
    expect(container.querySelector('[data-banker-new-deal-audit-error]')?.textContent).toMatch(/binds=\[cr664_ChangedBy@odata\.bind->cr664_users/);
  });

  it('create_failed shows no confirmed deal id', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'create_failed',
      createOutcome: { kind: 'failed', error: 'boom' },
      userFacingMessage: 'failed',
    });
    const user = userEvent.setup();
    const { container } = render(<BankerNewDealCreate />);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="create_failed"]')).not.toBeNull(),
    );
    expect(screen.getByText(/could not be created/i)).toBeInTheDocument();
  });
});
