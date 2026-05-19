// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 76 — RelationshipMemory card rendering tests.
 *
 * Pins:
 *   - loading + failed (role=alert) + empty (no deals) states;
 *   - populated rendering: client header, active-deal count, total
 *     pipeline, last-activity, nearest-upcoming-close, open-asks
 *     line, attention badges, deal pills;
 *   - missing-client branch renders "(no borrower name on record)";
 *   - multi-deal client groups + sort order is reflected in DOM;
 *   - clicking a deal pill navigates;
 *   - conservative disclaimer renders verbatim phrases;
 *   - rendered DOM does NOT contain forbidden-vocabulary tokens
 *     (AI-generated / relationship score / risk score / predictive /
 *     guaranteed / approved / rejected / householding / complete
 *     relationship profile).
 *
 * SDK + role-side query loader are mocked at the module boundary;
 * the derivation primitive is exercised in
 * relationshipMemory.test.ts. This file verifies the card's
 * wiring + rendered invariants.
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { loadBankerWorkQueueData } from './workQueueQueries';
import { useBanker } from './BankerContext';
import { RelationshipMemory } from './RelationshipMemory';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useBankerMock = vi.mocked(useBanker);

const NOW = new Date('2026-05-15T12:00:00Z');

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  });
});

describe('RelationshipMemory — Phase 76', () => {
  it('renders the loading state initially', () => {
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<RelationshipMemory />);
    expect(
      screen.getByRole('heading', { name: /relationship memory/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Loading client snapshot/i)).toBeInTheDocument();
  });

  it('renders the failed state via role="alert"', async () => {
    loadMock.mockRejectedValue(new Error('service unavailable'));
    render(<RelationshipMemory />);
    await waitFor(() =>
      expect(
        screen.getByText(/Could not load relationship memory/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the empty state when the banker has no active deals', async () => {
    loadMock.mockResolvedValue(emptyData());
    render(<RelationshipMemory />);
    await screen.findByText(/No active deals assigned to you/i);
    expect(
      screen.getByText(/this snapshot will populate by client name/i),
    ).toBeInTheDocument();
  });

  it('renders a single-client snapshot with all the standard rows + pills', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Acme RLOC',
        clientName: 'Acme Manufacturing',
        stage: 'Underwriting',
        status: 'Active',
        amount: 3_000_000,
        targetCloseDate: isoDaysFromNow(8),
        lastActivityOn: isoDaysAgo(2),
        stageEntryDate: isoDaysAgo(10),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.tasks = [
      { id: 't1', dealId: 'd1', title: 'A', dueDate: isoDaysAgo(2), modifiedOn: undefined, completed: false },
      { id: 't2', dealId: 'd1', title: 'B', dueDate: undefined, modifiedOn: undefined, completed: false },
    ];
    data.outstandingDocuments = [
      { id: 'doc1', dealId: 'd1', name: 'PFS', dueDate: undefined, requestDate: undefined, receivedDate: undefined, reviewer: undefined, uploaded: false, modifiedOn: undefined },
    ];
    data.pendingReviewDocuments = [
      { id: 'doc2', dealId: 'd1', name: 'Tax', dueDate: undefined, requestDate: undefined, receivedDate: isoDaysAgo(10), reviewer: undefined, uploaded: false, modifiedOn: undefined },
    ];
    data.memos = [
      { id: 'm1', dealId: 'd1', name: 'X', statusKey: 'draft', generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
    ];
    loadMock.mockResolvedValue(data);

    render(<RelationshipMemory />);
    await screen.findByText('Acme Manufacturing');

    expect(screen.getByText(/1 active deal\b/i)).toBeInTheDocument();
    expect(screen.getByText(/Pipeline \$3,000,000/i)).toBeInTheDocument();

    // Open document requests + open tasks line.
    expect(screen.getByText(/Open document requests:/i)).toBeInTheDocument();
    expect(screen.getByText(/Open tasks:/i)).toBeInTheDocument();
    expect(screen.getByText(/1 overdue/i)).toBeInTheDocument();

    // Attention badges (pending-review past threshold, closing soon,
    // draft memo).
    expect(screen.getByText(/1 may require review/i)).toBeInTheDocument();
    expect(screen.getByText(/1 closing soon/i)).toBeInTheDocument();
    expect(screen.getByText(/1 draft memo/i)).toBeInTheDocument();

    // Deal pill renders + is a button.
    const pill = screen.getByRole('button', { name: /Open deal Acme RLOC/i });
    expect(pill).toBeInTheDocument();
    expect(pill.textContent).toMatch(/Underwriting/);
  });

  it('renders the missing-client placeholder when a deal carries no clientName', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Orphan Deal',
        clientName: undefined,
        stage: 'Application',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);
    await screen.findByText(/\(no borrower name on record\)/i);
  });

  it('groups two deals under the same normalized client name', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Acme Term',
        clientName: 'Acme, LLC',
        stage: 'Closing',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(3),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(5),
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd2',
        name: 'Acme RLOC',
        clientName: '  acme,    llc ',
        stage: 'Underwriting',
        status: 'Active',
        amount: 500_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(7),
        stageEntryDate: isoDaysAgo(40),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);
    await screen.findByText('Acme, LLC');
    // Only one client header should appear (grouped).
    expect(screen.getAllByText('Acme, LLC').length).toBe(1);
    expect(screen.getByText(/2 active deals\b/i)).toBeInTheDocument();
    // Both deal pills present.
    expect(
      screen.getByRole('button', { name: /Open deal Acme Term/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open deal Acme RLOC/i }),
    ).toBeInTheDocument();
  });

  it('clicking a deal pill navigates to the deal workspace', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Click Me',
        clientName: 'Beta',
        stage: 'Underwriting',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);
    const pill = await screen.findByRole('button', {
      name: /Open deal Click Me/i,
    });
    const user = userEvent.setup();
    await user.click(pill);
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d1');
  });

  it('renders the conservative disclaimer + forbidden-vocab scan passes', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Plain',
        clientName: 'Plain Co',
        stage: 'Underwriting',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    const { container } = render(<RelationshipMemory />);
    await screen.findByText('Plain Co');

    // Both the subtitle and the disclaimer say "derived from visible
    // records" / "client-name grouped" — use getAllByText.
    expect(
      screen.getAllByText(/derived from visible records/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/client-name grouped/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/not a verified relationship graph/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a household linkage/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a relationship score/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No predictive claim/i),
    ).toBeInTheDocument();

    const text = container.textContent ?? '';
    // Forbidden-as-positive-claim vocabulary scan.
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\brisk\s+score\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\brejected\b/i);
    expect(text).not.toMatch(/\bhouseholding\b/i);
    expect(text).not.toMatch(/\bcomplete\s+relationship\s+profile\b/i);
    expect(text).not.toMatch(/\bofficial\s+householding\b/i);
    // "relationship score" must not appear as a positive claim. The
    // disclaimer's "not a relationship score" passes this because the
    // negation phrase matches "not a relationship score" — assert
    // there's no other positive use ("relationship score: 87",
    // "relationship score of X" etc.).
    expect(text).not.toMatch(/relationship\s+score:\s*\d/i);
    expect(text).not.toMatch(/relationship\s+score\s+of\s+/i);
  });

  it('sorts attention-bearing clients ahead of calm clients in the DOM', async () => {
    const data = emptyData();
    data.deals = [
      // Calm client, recent activity.
      {
        id: 'd-calm',
        name: 'Quiet Deal',
        clientName: 'Calm Co',
        stage: 'Application',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
      // Loud client (overdue task).
      {
        id: 'd-loud',
        name: 'Loud Deal',
        clientName: 'Loud Inc',
        stage: 'Closing',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(10),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.tasks = [{ id: 't-loud', dealId: 'd-loud', title: 'overdue', dueDate: isoDaysAgo(2), modifiedOn: undefined, completed: false }];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);

    await screen.findByText('Loud Inc');
    const list = screen.getByRole('list', { name: /relationship memory clients/i });
    const rows = within(list).getAllByRole('listitem');
    // The first listitem in the relationship list is the loud client.
    // (The nested deal lists also produce listitems — filter to the
    // ones whose first text child matches a client name.)
    const clientFirstRow = rows.find((r) =>
      r.textContent?.startsWith('Loud Inc'),
    );
    expect(clientFirstRow).toBeDefined();
    const allClientHeaders = rows
      .map((r) => r.querySelector('span'))
      .map((el) => el?.textContent)
      .filter(Boolean);
    expect(allClientHeaders[0]).toMatch(/Loud Inc/);
  });
});
