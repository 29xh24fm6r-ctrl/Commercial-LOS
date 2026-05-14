// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 53: Command Center integration of the Phase 51 mark-received
 * governed write. Verifies the receive button only shows on
 * overdue-document rows (banker-only by construction), clicking it
 * opens the existing ReceiveDocumentModal, a successful receive
 * dispatches the existing markDocumentReceived action with the
 * correct args, and the queue reloads after the write.
 *
 * Critical invariants:
 *   - the receive button does NOT render on non-document rows
 *   - the receive button does NOT render when systemUserId is missing
 *   - clicking the button does NOT navigate (stopPropagation works)
 *   - the action is invoked with documentId / dealId / systemUserId
 *     from the work-queue row (no duplicate fetch)
 *   - after success, the queue reloads (so the resolved row drops
 *     out via the existing outstanding filter)
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('../deals/documentActions', () => ({
  markDocumentReceived: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { loadBankerWorkQueueData } from './workQueueQueries';
import { markDocumentReceived } from '../deals/documentActions';
import { useBanker } from './BankerContext';
import { MyWorkQueue } from './MyWorkQueue';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const receiveMock = vi.mocked(markDocumentReceived);
const useBankerMock = vi.mocked(useBanker);

function overdueDueDate(): string {
  // 5 days ago, ISO, midnight UTC — comfortably past due.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 5);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function farFuture(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60);
  return d.toISOString();
}

function workQueueData(overrides: Partial<BankerWorkQueueData> = {}): BankerWorkQueueData {
  return {
    deals: [
      {
        id: 'deal-77',
        name: 'Acme Working Capital',
        clientName: 'Acme',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: farFuture(),
        lastActivityOn: undefined,
        stageEntryDate: new Date().toISOString(),
        isClosed: false,
      },
    ],
    tasks: [],
    outstandingDocuments: [
      {
        id: 'doc-1',
        dealId: 'deal-77',
        name: 'Personal Financial Statement',
        dueDate: overdueDueDate(),
        requestDate: '2026-04-01T00:00:00Z',
        receivedDate: undefined,
        reviewer: undefined,
        uploaded: false,
        modifiedOn: undefined,
      },
    ],
    memos: [],
    ...overrides,
  };
}

beforeEach(() => {
  loadMock.mockReset();
  receiveMock.mockReset();
  navigateSpy.mockReset();
  useBankerMock.mockReset();
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-user-1',
    writeDisabledReason: undefined,
  });
});

describe('MyWorkQueue — Phase 53 receive integration', () => {
  it('renders a Mark received button on overdue-document rows when systemUserId is present', async () => {
    loadMock.mockResolvedValue(workQueueData());
    render(<MyWorkQueue />);

    const button = await screen.findByRole('button', {
      name: /mark document personal financial statement received/i,
    });
    expect(button).toBeInTheDocument();
  });

  it('does NOT render the Mark received button when systemUserId is missing', async () => {
    useBankerMock.mockReturnValue({
      bankerId: 'banker-1',
      fullName: 'M. Paller',
      email: 'm@bank.test',
      systemUserId: undefined,
      writeDisabledReason: 'Could not resolve systemuserid',
    });
    loadMock.mockResolvedValue(workQueueData());
    render(<MyWorkQueue />);

    // The row appears; the action does not.
    await screen.findByText(/personal financial statement/i);
    expect(
      screen.queryByRole('button', { name: /mark document.*received/i }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the Mark received button on non-document rows', async () => {
    loadMock.mockResolvedValue(
      workQueueData({
        outstandingDocuments: [],
        tasks: [
          {
            id: 'task-1',
            dealId: 'deal-77',
            title: 'Review pricing sheet',
            dueDate: overdueDueDate(),
            modifiedOn: undefined,
            completed: false,
          },
        ],
      }),
    );
    render(<MyWorkQueue />);

    await screen.findByText(/review pricing sheet/i);
    expect(
      screen.queryByRole('button', { name: /mark document.*received/i }),
    ).not.toBeInTheDocument();
  });

  it('clicking Mark received opens the ReceiveDocumentModal (does NOT navigate)', async () => {
    loadMock.mockResolvedValue(workQueueData());
    render(<MyWorkQueue />);

    const user = userEvent.setup();
    const button = await screen.findByRole('button', {
      name: /mark document.*received/i,
    });
    await user.click(button);

    // Modal opens.
    expect(
      await screen.findByRole('heading', { name: /mark document received/i }),
    ).toBeInTheDocument();
    // Row navigation did NOT fire.
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('clicking the row body (not the button) DOES navigate to the deal', async () => {
    loadMock.mockResolvedValue(workQueueData());
    render(<MyWorkQueue />);

    const user = userEvent.setup();
    // Click the row title — not the button.
    const rowTitle = await screen.findByText(/personal financial statement/i);
    await user.click(rowTitle);

    expect(navigateSpy).toHaveBeenCalledWith('/deals/deal-77');
  });

  it('submitting the modal invokes markDocumentReceived with documentId, dealId, systemUserId, and the note', async () => {
    loadMock.mockResolvedValue(workQueueData());
    receiveMock.mockResolvedValue({ kind: 'success' });
    render(<MyWorkQueue />);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /mark document.*received/i }),
    );

    await user.type(
      screen.getByLabelText(/receipt note/i),
      'emailed by borrower',
    );
    await user.click(
      screen.getByRole('button', { name: /^mark received$/i }),
    );

    await waitFor(() => {
      expect(receiveMock).toHaveBeenCalledWith({
        documentId: 'doc-1',
        documentName: 'Personal Financial Statement',
        dealId: 'deal-77',
        systemUserId: 'sys-user-1',
        receiveNote: 'emailed by borrower',
      });
    });
  });

  it('reloads the queue after a successful receive (so the resolved row drops out)', async () => {
    // First load returns the document. After receive succeeds, the
    // reload returns an empty outstanding list (real Dataverse filter
    // would do this because cr664_receiveddate is now set).
    loadMock
      .mockResolvedValueOnce(workQueueData())
      .mockResolvedValueOnce(
        workQueueData({ outstandingDocuments: [] }),
      );
    receiveMock.mockResolvedValue({ kind: 'success' });
    render(<MyWorkQueue />);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /mark document.*received/i }),
    );
    await user.type(screen.getByLabelText(/receipt note/i), 'received');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    // Two loads: initial + post-receive reload.
    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledTimes(2);
    });
  });

  it('reloads after a governance-partial receive (the primary write succeeded)', async () => {
    loadMock.mockResolvedValue(workQueueData());
    receiveMock.mockResolvedValue({
      kind: 'governance-partial',
      auditError: undefined,
      timelineError: 'timeline 500',
    });
    render(<MyWorkQueue />);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /mark document.*received/i }),
    );
    await user.type(screen.getByLabelText(/receipt note/i), 'received');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledTimes(2);
    });
    // Modal still shows the governance-partial state — caller hasn't
    // dismissed it yet.
    expect(
      screen.getByText(/critical: governance write failed/i),
    ).toBeInTheDocument();
  });

  it('does NOT reload after a receive-failed outcome (primary write did not persist)', async () => {
    loadMock.mockResolvedValue(workQueueData());
    receiveMock.mockResolvedValue({
      kind: 'receive-failed',
      docError: 'row locked',
    });
    render(<MyWorkQueue />);

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /mark document.*received/i }),
    );
    await user.type(screen.getByLabelText(/receipt note/i), 'received');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    // Wait for the outcome render to appear so we know the action
    // resolved, then assert no second load was issued.
    expect(await screen.findByText(/could not record receipt/i)).toBeInTheDocument();
    // Only the initial load fired; no reload on receive-failed.
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('the queue footer says "Mark received inline" so bankers discover the new action', async () => {
    loadMock.mockResolvedValue(workQueueData());
    render(<MyWorkQueue />);
    await screen.findByText(/personal financial statement/i);
    expect(screen.getByText(/Mark received inline/i)).toBeInTheDocument();
  });
});
