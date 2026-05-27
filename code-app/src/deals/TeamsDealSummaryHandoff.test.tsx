// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';
import type { BankerIdentity } from '../banker/BankerContext';

/**
 * Phase 96 — TeamsDealSummaryHandoff card tests.
 *
 * Pins:
 *   - Card header + verbatim subtitle render;
 *   - Loading state when DealDataProvider slots are not ready;
 *   - Populated state renders the generated summary in the preview;
 *   - "Copy Teams summary" button writes the preview text to the
 *     clipboard via navigator.clipboard.writeText;
 *   - Success tag after copy says "Copied to clipboard. Paste into
 *     Teams." with role="status";
 *   - Failure tag with role="alert" when the clipboard API is
 *     unavailable;
 *   - Honest disclaimers render verbatim;
 *   - The rendered DOM never contains forbidden sent / posted /
 *     delivered / notified / synced / "Teams integrated" / "Graph
 *     connected" vocabulary as a positive claim;
 *   - The source file imports no Graph / MSAL / @microsoft/teams-js
 *     module (Phase 96 keeps the formatter + UI Graph-free).
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: vi.fn(),
}));

// Phase 97 wires loadBankerWorkQueueData for the relationship-context
// note. Mock at the module boundary so the SDK transitive import is
// not pulled into this test environment (same pattern Phase 77's
// RelationshipContext.test.tsx uses).
vi.mock('../banker/workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from '../banker/workQueueQueries';
import { TeamsDealSummaryHandoff } from './TeamsDealSummaryHandoff';

const useDealDataMock = vi.mocked(useDealData);
const useOptionalBankerMock = vi.mocked(useOptionalBanker);
const loadBankerWorkQueueDataMock = vi.mocked(loadBankerWorkQueueData);

function deal(o: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Manufacturing, LLC',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-09-30T00:00:00Z',
    productType: undefined,
    loanStructure: undefined,
    customerType: undefined,
    industry: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: 'A/R, inventory',
    createdOn: undefined,
    stageEntryDate: '2026-05-01T00:00:00Z',
    isClosed: false,
    ...o,
  };
}

function readyTasks(open: number = 2): DealTasksResult {
  return {
    open: Array.from({ length: open }, (_, i) => ({
      id: `t-${i}`,
      title: `Task ${i + 1}`,
      completed: false,
      dueDate: undefined,
      assigneeName: undefined,
      modifiedOn: undefined,
    })),
    completed: [],
  };
}

function readyDocs(over: Partial<DealDocumentsResult> = {}): DealDocumentsResult {
  return {
    outstanding: [
      {
        id: 'doc-1',
        name: 'PFS',
        dueDate: undefined,
        requestDate: undefined,
        receivedDate: undefined,
        reviewer: undefined,
        uploaded: false,
        modifiedOn: undefined,
        status: 'outstanding',
      },
    ],
    received: [],
    reviewed: [],
    ...over,
  };
}

function readyMemo(): CreditMemoData {
  return { memos: [], sections: [] };
}

function readyActivity(): TimelineEvent[] {
  return [];
}

function dealData(over: Partial<DealData> = {}): DealData {
  return {
    deal: deal(),
    tasks: { kind: 'ready', data: readyTasks() },
    documents: { kind: 'ready', data: readyDocs() },
    creditMemo: { kind: 'ready', data: readyMemo() },
    activity: { kind: 'ready', data: readyActivity() },
    refresh: () => undefined,
    ...over,
  };
}

function bankerIdentity(over: Partial<BankerIdentity> = {}): BankerIdentity {
  return {
    bankerId: 'b-1',
    fullName: 'M. Paller',
    email: 'mpaller@bank.example',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  };
}

function emptyWorkQueue(over: Partial<BankerWorkQueueData> = {}): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useOptionalBankerMock.mockReturnValue(bankerIdentity());
  // Default: the banker pipeline resolves to an empty work queue.
  // Tests that exercise the relationship-line path override this.
  loadBankerWorkQueueDataMock.mockResolvedValue(emptyWorkQueue());
});

describe('TeamsDealSummaryHandoff — Phase 96', () => {
  it('renders the card header + verbatim subtitle', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<TeamsDealSummaryHandoff />);
    expect(
      screen.getByRole('heading', { name: /copy teams summary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Generates a Teams-ready deal summary/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders the loading state when DealDataProvider slots are not ready', () => {
    useDealDataMock.mockReturnValue(
      dealData({ tasks: { kind: 'loading' } }),
    );
    render(<TeamsDealSummaryHandoff />);
    expect(screen.getByText(/Loading deal data/i)).toBeInTheDocument();
  });

  it('renders the generated summary in the preview when data is ready', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<TeamsDealSummaryHandoff />);
    const preview = screen.getByTestId('teams-deal-summary-preview');
    expect(preview.textContent).toContain('Deal summary — Acme Working Capital');
    expect(preview.textContent).toContain('Client: Acme Manufacturing, LLC');
    expect(preview.textContent).toContain('Stage: Underwriting');
    expect(preview.textContent).toContain('Loan amount: $4,500,000');
    expect(preview.textContent).toContain('- Open tasks: 2');
    expect(preview.textContent).toContain('- Outstanding documents: 1');
    expect(preview.textContent).toContain('Prepared by M. Paller on');
    expect(preview.textContent).toContain(
      'Local copy only. Not posted to Teams. Paste into Teams. You send the message manually.',
    );
  });

  it('renders the Copy Teams summary button enabled when data is ready', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<TeamsDealSummaryHandoff />);
    const btn = screen.getByRole('button', {
      name: /Copy Teams summary for Acme Working Capital/i,
    });
    expect(btn).toBeEnabled();
  });

  it('clicking Copy Teams summary writes the preview text to the clipboard', async () => {
    useDealDataMock.mockReturnValue(dealData());
    // userEvent.setup() installs its own Clipboard. Install the spy
    // AFTER setup so the component sees our vi.fn() at click time
    // (matches the Phase 78 / Phase 66 clipboard-test pattern).
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<TeamsDealSummaryHandoff />);
    await user.click(
      screen.getByRole('button', { name: /Copy Teams summary/i }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const writtenText = writeText.mock.calls[0]![0];
    expect(writtenText).toContain('Deal summary — Acme Working Capital');
    expect(writtenText).toContain('Local copy only. Not posted to Teams.');
  });

  it('shows the "Copied to clipboard. Paste into Teams." status after a successful copy', async () => {
    useDealDataMock.mockReturnValue(dealData());
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<TeamsDealSummaryHandoff />);
    await user.click(
      screen.getByRole('button', { name: /Copy Teams summary/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('status'),
      ).toHaveTextContent(/Copied to clipboard\. Paste into Teams\./i);
    });
  });

  it('shows the "Clipboard unavailable" alert when navigator.clipboard is missing', async () => {
    useDealDataMock.mockReturnValue(dealData());
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(<TeamsDealSummaryHandoff />);
    await user.click(
      screen.getByRole('button', { name: /Copy Teams summary/i }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Clipboard unavailable\. Select the preview text and copy manually\./i,
    );
  });

  it('shows the "Clipboard unavailable" alert when navigator.clipboard.writeText rejects', async () => {
    useDealDataMock.mockReturnValue(dealData());
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    render(<TeamsDealSummaryHandoff />);
    await user.click(
      screen.getByRole('button', { name: /Copy Teams summary/i }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Clipboard unavailable/i,
    );
  });

  it('renders the conservative disclaimer verbatim', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<TeamsDealSummaryHandoff />);
    // "Local copy only. Not posted to Teams. Paste into Teams. You
    // send the message manually." appears in both the disclaimer
    // paragraph AND inside the `<pre>` preview (the formatter's
    // trailing footer). Both occurrences are intentional.
    expect(
      screen.getAllByText(
        /Local copy only\. Not posted to Teams\. Paste into Teams\. You send the message manually\./i,
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/No Dataverse write/i)).toBeInTheDocument();
    expect(screen.getByText(/No audit row/i)).toBeInTheDocument();
    expect(screen.getByText(/No timeline event/i)).toBeInTheDocument();
    expect(screen.getByText(/No Graph call/i)).toBeInTheDocument();
    expect(screen.getByText(/No Teams notification raised/i)).toBeInTheDocument();
    expect(screen.getByText(/No calendar update/i)).toBeInTheDocument();
  });

  it('the rendered DOM never contains forbidden vocabulary as a positive claim', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<TeamsDealSummaryHandoff />);
    // Strip the disclaimer line that contains "Not posted to Teams"
    // (a negation) before checking — the negation must not register
    // as a positive claim. We assert the disclaimer separately above.
    const body =
      document.body.textContent?.replace(/Not posted to Teams\.?/g, '') ?? '';
    expect(body).not.toMatch(/\bsent\b/i);
    expect(body).not.toMatch(/\bposted\b/i);
    expect(body).not.toMatch(/\bdelivered\b/i);
    expect(body).not.toMatch(/\bnotified\b/i);
    expect(body).not.toMatch(/\bsynced\b/i);
    expect(body).not.toMatch(/Teams\s+integrated/i);
    expect(body).not.toMatch(/Graph\s+connected/i);
    expect(body).not.toMatch(/notification\s+raised(?!\.)/i);
  });

  it('the rendered DOM uses the three required phrases the brief pins', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<TeamsDealSummaryHandoff />);
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/Copy Teams summary/);
    expect(body).toMatch(/Paste into Teams/);
    expect(body).toMatch(/You send the message manually/);
  });

  describe('Phase 97 — relationship context line wiring', () => {
    it('includes the relationship line when other visible deals share the client-name group', async () => {
      useDealDataMock.mockReturnValue(dealData());
      loadBankerWorkQueueDataMock.mockResolvedValue(
        emptyWorkQueue({
          deals: [
            // Current deal (excluded from the relationship aggregate).
            {
              id: 'd-1',
              name: 'Acme Working Capital',
              clientName: 'Acme Manufacturing, LLC',
              stage: 'Underwriting',
              status: 'Active',
              amount: 4_500_000,
              targetCloseDate: '2026-09-30T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-05-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
            // Sibling deal on the same client-name group.
            {
              id: 'd-2',
              name: 'Acme Equipment Loan',
              clientName: 'Acme Manufacturing, LLC',
              stage: 'Underwriting',
              status: 'Active',
              amount: 750_000,
              targetCloseDate: '2026-09-15T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-04-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
          ],
          tasks: [
            {
              id: 't-1',
              dealId: 'd-2',
              title: 'Send tax returns',
              dueDate: undefined,
              modifiedOn: undefined,
              completed: false,
            },
          ],
          outstandingDocuments: [
            {
              id: 'od-1',
              dealId: 'd-2',
              name: 'PFS',
              dueDate: undefined,
              requestDate: undefined,
              receivedDate: undefined,
              reviewer: undefined,
              uploaded: false,
              modifiedOn: undefined,
            },
          ],
        }),
      );
      render(<TeamsDealSummaryHandoff />);
      const preview = await screen.findByTestId('teams-deal-summary-preview');
      await waitFor(() => {
        expect(preview.textContent).toContain(
          'Relationship: 1 other visible deal for Acme Manufacturing, LLC (client-name grouped).',
        );
      });
      expect(preview.textContent).toContain(
        'Across those deals: 1 open task and 1 outstanding document.',
      );
      expect(preview.textContent).toContain(
        'From visible records; may not include all related borrowers.',
      );
    });

    it('omits the relationship line when no other visible deals share the client-name group', async () => {
      useDealDataMock.mockReturnValue(dealData());
      loadBankerWorkQueueDataMock.mockResolvedValue(
        emptyWorkQueue({
          deals: [
            {
              id: 'd-1',
              name: 'Acme Working Capital',
              clientName: 'Acme Manufacturing, LLC',
              stage: 'Underwriting',
              status: 'Active',
              amount: 4_500_000,
              targetCloseDate: '2026-09-30T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-05-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
          ],
        }),
      );
      render(<TeamsDealSummaryHandoff />);
      const preview = await screen.findByTestId('teams-deal-summary-preview');
      // The Phase 96 happy-path assertions still hold; the
      // Relationship: line must NOT render.
      await waitFor(() => {
        expect(preview.textContent).toContain(
          'Deal summary — Acme Working Capital',
        );
      });
      expect(preview.textContent).not.toMatch(/^Relationship:/m);
      expect(preview.textContent).not.toContain('client-name grouped');
    });

    it('omits the relationship line when the current deal has no client name on record', async () => {
      useDealDataMock.mockReturnValue(
        dealData({ deal: deal({ clientName: undefined }) }),
      );
      loadBankerWorkQueueDataMock.mockResolvedValue(
        emptyWorkQueue({
          deals: [
            {
              id: 'd-1',
              name: 'Acme Working Capital',
              clientName: undefined,
              stage: 'Underwriting',
              status: 'Active',
              amount: 4_500_000,
              targetCloseDate: '2026-09-30T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-05-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
          ],
        }),
      );
      render(<TeamsDealSummaryHandoff />);
      const preview = await screen.findByTestId('teams-deal-summary-preview');
      await waitFor(() => {
        expect(preview.textContent).toContain('Client: Not provided');
      });
      expect(preview.textContent).not.toMatch(/^Relationship:/m);
    });

    it('omits the relationship line when the banker pipeline load fails (no error surfaced to the user)', async () => {
      useDealDataMock.mockReturnValue(dealData());
      loadBankerWorkQueueDataMock.mockRejectedValueOnce(
        new Error('service unavailable'),
      );
      render(<TeamsDealSummaryHandoff />);
      const preview = await screen.findByTestId('teams-deal-summary-preview');
      await waitFor(() => {
        expect(preview.textContent).toContain(
          'Deal summary — Acme Working Capital',
        );
      });
      // The summary itself renders. The Relationship line is omitted.
      expect(preview.textContent).not.toMatch(/^Relationship:/m);
      // Failure must not surface as an alert — Phase 97 brief calls
      // for graceful degradation; the rest of the summary is the
      // useful product.
      expect(
        screen.queryByText(/Could not load relationship context/i),
      ).toBeNull();
    });

    it('omits the relationship line when no banker context is mounted (no UPN → no pipeline load)', async () => {
      useDealDataMock.mockReturnValue(dealData());
      useOptionalBankerMock.mockReturnValue(null);
      render(<TeamsDealSummaryHandoff />);
      const preview = await screen.findByTestId('teams-deal-summary-preview');
      expect(preview.textContent).not.toMatch(/^Relationship:/m);
      // No banker means no banker-pipeline load.
      expect(loadBankerWorkQueueDataMock).not.toHaveBeenCalled();
    });

    it('the rendered relationship line never claims household / verified / score / AI / graph', async () => {
      useDealDataMock.mockReturnValue(dealData());
      loadBankerWorkQueueDataMock.mockResolvedValue(
        emptyWorkQueue({
          deals: [
            {
              id: 'd-1',
              name: 'Acme Working Capital',
              clientName: 'Acme Manufacturing, LLC',
              stage: 'Underwriting',
              status: 'Active',
              amount: 4_500_000,
              targetCloseDate: '2026-09-30T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-05-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
            {
              id: 'd-2',
              name: 'Acme Equipment Loan',
              clientName: 'Acme Manufacturing, LLC',
              stage: 'Underwriting',
              status: 'Active',
              amount: 750_000,
              targetCloseDate: '2026-09-15T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-04-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
          ],
        }),
      );
      render(<TeamsDealSummaryHandoff />);
      const preview = await screen.findByTestId('teams-deal-summary-preview');
      await waitFor(() => {
        expect(preview.textContent).toMatch(/^Relationship:/m);
      });
      const text = preview.textContent ?? '';
      expect(text).not.toMatch(/\bhousehold\b/i);
      expect(text).not.toMatch(/\bverified\b/i);
      expect(text).not.toMatch(/relationship\s+score/i);
      expect(text).not.toMatch(/risk\s+score/i);
      expect(text).not.toMatch(/AI[- ]?generated/i);
      expect(text).not.toMatch(/relationship\s+graph/i);
      expect(text).not.toMatch(/complete\s+history/i);
      expect(text).not.toMatch(/full\s+relationship\s+profile/i);
    });

    it('the copied clipboard text includes the relationship line when present', async () => {
      useDealDataMock.mockReturnValue(dealData());
      loadBankerWorkQueueDataMock.mockResolvedValue(
        emptyWorkQueue({
          deals: [
            {
              id: 'd-1',
              name: 'Acme Working Capital',
              clientName: 'Acme Manufacturing, LLC',
              stage: 'Underwriting',
              status: 'Active',
              amount: 4_500_000,
              targetCloseDate: '2026-09-30T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-05-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
            {
              id: 'd-2',
              name: 'Acme Equipment Loan',
              clientName: 'Acme Manufacturing, LLC',
              stage: 'Underwriting',
              status: 'Active',
              amount: 750_000,
              targetCloseDate: '2026-09-15T00:00:00Z',
              lastActivityOn: undefined,
              stageEntryDate: '2026-04-01T00:00:00Z',
              isClosed: false,
              collateralSummary: undefined,
            },
          ],
        }),
      );
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
      render(<TeamsDealSummaryHandoff />);
      // Wait for the relationship line to populate in the preview.
      await waitFor(() => {
        const preview = screen.getByTestId('teams-deal-summary-preview');
        expect(preview.textContent).toMatch(/^Relationship:/m);
      });
      await user.click(
        screen.getByRole('button', { name: /Copy Teams summary/i }),
      );
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1);
      });
      const writtenText = writeText.mock.calls[0]![0] as string;
      expect(writtenText).toContain(
        'Relationship: 1 other visible deal for Acme Manufacturing, LLC',
      );
      expect(writtenText).toContain(
        'From visible records; may not include all related borrowers.',
      );
    });
  });

  it('counts pending-review documents as received docs with no reviewer', () => {
    useDealDataMock.mockReturnValue(
      dealData({
        documents: {
          kind: 'ready',
          data: {
            outstanding: [],
            received: [
              {
                id: 'doc-rev',
                name: 'PFS',
                dueDate: undefined,
                requestDate: undefined,
                receivedDate: '2026-05-10T00:00:00Z',
                reviewer: undefined,
                uploaded: false,
                modifiedOn: undefined,
                status: 'received',
              },
              {
                id: 'doc-revd',
                name: 'Tax Return',
                dueDate: undefined,
                requestDate: undefined,
                receivedDate: '2026-05-10T00:00:00Z',
                reviewer: 'B. Other',
                uploaded: false,
                modifiedOn: undefined,
                status: 'reviewed',
              },
            ],
            reviewed: [],
          },
        },
      }),
    );
    render(<TeamsDealSummaryHandoff />);
    const preview = screen.getByTestId('teams-deal-summary-preview');
    // 1 received doc with no reviewer; the reviewed-by-B-Other row
    // does not count as pending-review.
    expect(preview.textContent).toContain('- Documents pending review: 1');
  });
});
