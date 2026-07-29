// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./documentRequirementLiveReader', () => ({ loadDocumentRequirements: vi.fn() }));
vi.mock('./documentRequirementActions', () => ({ performDocumentRequirementAction: vi.fn() }));
vi.mock('./documentRequirementLiveDeps', () => ({ buildLiveDocumentRequirementActionDeps: vi.fn(() => ({})) }));

import { loadDocumentRequirements } from './documentRequirementLiveReader';
import { performDocumentRequirementAction } from './documentRequirementActions';
import { DocumentRequirementWorkspace } from './DocumentRequirementWorkspace';
import type { DocumentRequirementRow } from './documentRequirementLifecycle';

const loadMock = vi.mocked(loadDocumentRequirements);
const performMock = vi.mocked(performDocumentRequirementAction);

const banker = { systemUserId: 'su-1', email: 'banker@oldglorybank.com', fullName: 'Jane Banker' };
const deal = {
  productType: 'Term Loan', loanStructure: undefined, customerType: undefined,
  guarantorStructure: undefined, collateralSummary: undefined, industry: undefined, stage: 'UNDERWRITING',
};

function rowsFixture(loanAppStatus: DocumentRequirementRow['status'] = 'not_assessed'): DocumentRequirementRow[] {
  return [
    {
      id: loanAppStatus === 'not_assessed' ? undefined : 'row-loan-app',
      documentName: 'Loan Application',
      status: loanAppStatus,
      required: true,
      acknowledged: loanAppStatus !== 'not_assessed',
      acknowledgedBy: undefined,
      acknowledgedDate: undefined,
      requestedDate: undefined,
      receivedDate: undefined,
      reviewedDate: undefined,
      reviewer: undefined,
      waived: false,
      waiverReason: undefined,
      dueDate: undefined,
    },
    {
      id: 'row-debt-schedule',
      documentName: 'Debt Schedule',
      status: 'reviewed',
      required: true,
      acknowledged: true,
      acknowledgedBy: 'Jane Banker',
      acknowledgedDate: '2026-07-01T00:00:00Z',
      requestedDate: '2026-07-01T00:00:00Z',
      receivedDate: '2026-07-02T00:00:00Z',
      reviewedDate: '2026-07-03T00:00:00Z',
      reviewer: 'Jane Banker',
      waived: false,
      waiverReason: undefined,
      dueDate: undefined,
    },
  ];
}

beforeEach(() => {
  loadMock.mockReset();
  performMock.mockReset();
});

describe('DocumentRequirementWorkspace', () => {
  it('renders every derived/reconciled row with its status label and valid actions', async () => {
    loadMock.mockResolvedValue({ kind: 'ready', rows: rowsFixture() });
    render(<DocumentRequirementWorkspace dealId="deal-1" deal={deal} banker={banker} />);

    await screen.findByText('Loan Application');
    expect(screen.getByText('Debt Schedule')).toBeInTheDocument();
    const loanAppRow = screen.getByText('Loan Application').closest('li')!;
    expect(within(loanAppRow).getByText('Required — Not Assessed')).toBeInTheDocument();
    expect(within(loanAppRow).getByRole('button', { name: 'Acknowledge Required' })).toBeInTheDocument();
    const debtScheduleRow = screen.getByText('Debt Schedule').closest('li')!;
    expect(within(debtScheduleRow).getByText('Required — Reviewed')).toBeInTheDocument();
  });

  it('D6 — explains that requirements synchronize automatically, so there is no undiscoverable button', async () => {
    loadMock.mockResolvedValue({ kind: 'ready', rows: rowsFixture() });
    render(<DocumentRequirementWorkspace dealId="deal-1" deal={deal} banker={banker} />);

    await screen.findByText('Loan Application');
    const notice = screen.getByText(/derived and synchronized automatically/i);
    expect(notice).toBeInTheDocument();
  });

  it('refresh preserves all states: acknowledging one row reloads and leaves an unrelated row exactly as it was', async () => {
    loadMock.mockResolvedValueOnce({ kind: 'ready', rows: rowsFixture('not_assessed') });
    render(<DocumentRequirementWorkspace dealId="deal-1" deal={deal} banker={banker} />);
    await screen.findByText('Loan Application');

    // Debt Schedule starts fully reviewed — confirm before the action.
    const debtScheduleBefore = screen.getByText('Debt Schedule').closest('li')!;
    expect(within(debtScheduleBefore).getByText('Required — Reviewed')).toBeInTheDocument();

    performMock.mockResolvedValue({ kind: 'success', documentId: 'row-loan-app', status: 'outstanding' });
    // The reload after a successful action returns Loan Application now outstanding,
    // and Debt Schedule UNCHANGED — proving refresh doesn't clobber other rows' state.
    loadMock.mockResolvedValueOnce({ kind: 'ready', rows: rowsFixture('outstanding') });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Acknowledge Required' }));

    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2));
    await screen.findByText('Required — Outstanding');

    const debtScheduleAfter = screen.getByText('Debt Schedule').closest('li')!;
    expect(within(debtScheduleAfter).getByText('Required — Reviewed')).toBeInTheDocument();
    expect(within(debtScheduleAfter).getByText('2026-07-03T00:00:00Z')).toBeInTheDocument();
  });

  it('fail-visible: a governance-partial outcome is shown to the banker', async () => {
    loadMock.mockResolvedValue({ kind: 'ready', rows: rowsFixture('not_assessed') });
    performMock.mockResolvedValue({
      kind: 'governance-partial',
      auditError: 'audit failed',
      timelineError: undefined,
      correlationId: 'dreq-test-correlation-id',
    });
    render(<DocumentRequirementWorkspace dealId="deal-1" deal={deal} banker={banker} />);
    await screen.findByText('Loan Application');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Acknowledge Required' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/governance logging failed/i);
  });

  it('a load failure renders an honest error, not a silently empty list', async () => {
    loadMock.mockResolvedValue({ kind: 'failed', message: 'network down' });
    render(<DocumentRequirementWorkspace dealId="deal-1" deal={deal} banker={banker} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });

  it('no action buttons render for a read-only caller (no banker)', async () => {
    loadMock.mockResolvedValue({ kind: 'ready', rows: rowsFixture('not_assessed') });
    render(<DocumentRequirementWorkspace dealId="deal-1" deal={deal} banker={null} />);
    await screen.findByText('Loan Application');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
