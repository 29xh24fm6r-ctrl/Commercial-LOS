// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FundingAuthorizationPanel } from './FundingAuthorizationPanel';
import type { FundingAuthorizationRecord, FundingReadinessFacts } from './fundingAuthorizationTypes';

function record(over: Partial<FundingAuthorizationRecord> = {}): FundingAuthorizationRecord {
  return {
    recordId: 'rec-1',
    dealId: 'deal-1',
    authorizationStatus: 'PENDING',
    requestedAmount: 500_000,
    destinationVerificationStatus: 'unverified',
    conditionsSatisfied: false,
    exceptions: [],
    requestedBy: 'requester@bank.test',
    requestedAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'corr-1',
    supportingDocumentIds: [],
    auditEventIds: ['audit-1'],
    ...over,
  };
}

const CLEAR_FACTS: FundingReadinessFacts = {
  requiredDocumentsComplete: true,
  conditionsPrecedentResolved: true,
  exceptionsAllResolved: true,
  destinationVerified: true,
  approvalExpired: false,
  dealTerminalStatus: 'OPEN',
};

function baseProps(over: Partial<ComponentProps<typeof FundingAuthorizationPanel>> = {}) {
  return {
    record: record(),
    readinessFacts: CLEAR_FACTS,
    authorizedFacilityAmount: 1_000_000,
    currentActorEmail: 'approver@bank.test',
    canApprove: true,
    onApprove: vi.fn(async () => {}),
    onReject: vi.fn(async () => {}),
    onRevoke: vi.fn(async () => {}),
    onConfirmDisbursement: vi.fn(async () => {}),
    ...over,
  };
}

describe('FundingAuthorizationPanel', () => {
  it('renders an honest "not requested" state when no record exists', () => {
    render(<FundingAuthorizationPanel {...baseProps({ record: undefined })} />);
    expect(screen.getByText('No funding has been requested for this deal yet.')).toBeInTheDocument();
  });

  it('shows PENDING status, requested amount, requester, and audit count', () => {
    render(<FundingAuthorizationPanel {...baseProps()} />);
    expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING');
    expect(screen.getByText('$500,000')).toBeInTheDocument();
    expect(screen.getByText('requester@bank.test')).toBeInTheDocument();
    expect(screen.getByTestId('funding-audit-count')).toHaveTextContent('1');
  });

  it('blocks the requester from approving their own request (self-approval)', () => {
    render(<FundingAuthorizationPanel {...baseProps({ currentActorEmail: 'requester@bank.test' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('You requested this funding and cannot also approve it');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('invokes onApprove when a distinct approver clicks Approve', async () => {
    const onApprove = vi.fn(async () => {});
    render(<FundingAuthorizationPanel {...baseProps({ onApprove })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('labels the button "Record second approval" once a first approver already exists', () => {
    render(<FundingAuthorizationPanel {...baseProps({ record: record({ authorizedBy: 'first@bank.test' }) })} />);
    expect(screen.getByRole('button', { name: 'Record second approval' })).toBeInTheDocument();
  });

  it('invokes onReject when Reject is clicked', async () => {
    const onReject = vi.fn(async () => {});
    render(<FundingAuthorizationPanel {...baseProps({ onReject })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('shows a REVOKED state message and no approve/reject controls', () => {
    render(<FundingAuthorizationPanel {...baseProps({ record: record({ authorizationStatus: 'REVOKED' }) })} />);
    expect(screen.getByText(/This authorization was revoked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('shows a REJECTED state message', () => {
    render(<FundingAuthorizationPanel {...baseProps({ record: record({ authorizationStatus: 'REJECTED' }) })} />);
    expect(screen.getByText('This funding request was rejected.')).toBeInTheDocument();
  });

  it('for an APPROVED record with clear readiness, enables Confirm disbursement once a date is entered', async () => {
    render(
      <FundingAuthorizationPanel
        {...baseProps({ record: record({ authorizationStatus: 'APPROVED', approvedAmount: 500_000, authorizedBy: 'approver@bank.test' }) })}
      />,
    );
    expect(screen.getByText('Ready to fund.')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirm disbursement' });
    expect(confirmButton).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Funding date'), '2026-08-01');
    expect(confirmButton).not.toBeDisabled();
    await user.click(confirmButton);
  });

  it('lists every readiness blocker for an APPROVED record that is not yet ready to fund', () => {
    render(
      <FundingAuthorizationPanel
        {...baseProps({
          record: record({ authorizationStatus: 'APPROVED', approvedAmount: 500_000 }),
          readinessFacts: { ...CLEAR_FACTS, requiredDocumentsComplete: false, exceptionsAllResolved: false },
        })}
      />,
    );
    const blockerList = screen.getByTestId('funding-blockers');
    expect(blockerList).toHaveTextContent('Required documents are incomplete');
    expect(blockerList).toHaveTextContent('Open exceptions remain unresolved');
    expect(screen.getByRole('button', { name: 'Confirm disbursement' })).toBeDisabled();
  });

  it('shows the funded date for a FUNDED record', () => {
    render(
      <FundingAuthorizationPanel
        {...baseProps({ record: record({ authorizationStatus: 'FUNDED', fundingDate: '2026-08-01' }) })}
      />,
    );
    expect(screen.getByTestId('funding-funded-date')).toHaveTextContent('Funded on 2026-08-01.');
  });

  it('invokes onRevoke when Revoke approval is clicked on an APPROVED record', async () => {
    const onRevoke = vi.fn(async () => {});
    render(
      <FundingAuthorizationPanel
        {...baseProps({ record: record({ authorizationStatus: 'APPROVED', approvedAmount: 500_000 }), onRevoke })}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Revoke approval' }));
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });

  it('disables approve/reject when canApprove is false', () => {
    render(<FundingAuthorizationPanel {...baseProps({ canApprove: false })} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
});
