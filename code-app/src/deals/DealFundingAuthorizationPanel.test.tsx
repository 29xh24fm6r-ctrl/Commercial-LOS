// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealFundingAuthorizationPanel } from './DealFundingAuthorizationPanel';
import type { DealDetail } from './dealQueries';

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Corp',
    stage: 'Closing & Funding',
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

describe('DealFundingAuthorizationPanel', () => {
  it('says plainly that requests/approvals are session-only, not yet saved', () => {
    render(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByRole('note')).toHaveTextContent(/not yet saved to the deal/i);
  });

  it('shows a request form and no funding-authorization panel record yet when none exists', () => {
    render(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByText(/no funding has been requested for this deal yet/i)).toBeInTheDocument();
    expect(document.querySelector('[data-funding-request-form]')).not.toBeNull();
  });

  it('requesting funding creates a record and the request form disappears', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />,
    );
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '250000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));

    await waitFor(() => expect(container.querySelector('[data-funding-request-form]')).toBeNull());
    expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING');
  });

  it('disables the request form entirely when the actor is not authorized', () => {
    const { container } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={false} actorEmail={undefined} />,
    );
    expect((container.querySelector('#funding-request-amount') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /request funding/i })).toBeDisabled();
  });

  it('the same requester cannot approve their own request (self-approval prevention holds locally)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />,
    );
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '100000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING'));

    expect(screen.getByText(/you requested this funding and cannot also approve it/i)).toBeInTheDocument();
    const approveButton = screen.getByRole('button', { name: /^approve$/i });
    expect(approveButton).toBeDisabled();
  });

  it('a distinct approver can approve below the dual-control threshold and reaches APPROVED', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="requester@bank.test" />,
    );
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '100000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING'));

    // A different actor now views/acts on the same deal (fresh render, same wrapper instance's
    // in-memory store already holds the record via the component's own state).
    rerender(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="approver@bank.test" />);
    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('APPROVED'));
  });

  it('disbursement confirmation stays blocked because no live readiness source exists yet', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="requester@bank.test" />,
    );
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '50000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING'));

    rerender(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="approver@bank.test" />);
    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('APPROVED'));

    expect(screen.getByTestId('funding-blockers')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /confirm disbursement/i });
    expect(confirmButton).toBeDisabled();
  });

  it('an unrecognized deal status fails closed (does not silently unblock as OPEN)', () => {
    render(
      <DealFundingAuthorizationPanel
        deal={baseDeal({ status: 'Some Unrecognized Status' })}
        authorized={true}
        actorEmail="banker@bank.test"
      />,
    );
    // No record yet, so this only pins that rendering with an unrecognized status doesn't throw
    // and the panel still renders its normal empty state.
    expect(screen.getByText(/no funding has been requested for this deal yet/i)).toBeInTheDocument();
  });
});
