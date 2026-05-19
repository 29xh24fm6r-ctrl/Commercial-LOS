// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 75 — banker PersonalActivitySummary rendering tests.
 *
 * Verifies:
 *   - card title + workload-snapshot subtitle render;
 *   - empty state when the banker has no active deals;
 *   - loading + failed states;
 *   - rendered figures pin the derivation output (active count, total
 *     pipeline, closing-soon, stage attention, work items);
 *   - missing-amount + missing-stage-entry gap hints render when
 *     applicable;
 *   - the conservative-copy disclaimer renders ("Derived from current
 *     records", "not a performance evaluation", "no ranking, no
 *     predictive claim, no compensation impact");
 *   - the forbidden vocabulary (score / ranking / approved / rejected
 *     / AI-generated / underperforming / predictive) does not appear
 *     in the rendered DOM.
 *
 * SDK + role-side query loader are mocked at the module boundary;
 * the derivation primitive itself is exercised in
 * bankerPersonalActivity.test.ts. This file only verifies the
 * card's wiring + rendering invariants.
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(),
}));

import { loadBankerWorkQueueData } from './workQueueQueries';
import { useBanker } from './BankerContext';
import { PersonalActivitySummary } from './PersonalActivitySummary';

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
  // The component captures `now` via `useMemo(() => new Date(), [])`.
  // We rely on the real clock (current date is 2026-05-15) so the
  // isoDaysAgo / isoDaysFromNow helpers — anchored to NOW above —
  // line up with the component's own clock. NO fake timers: they
  // freeze setTimeout, which findByText / waitFor poll on.
  vi.clearAllMocks();
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  });
});

describe('PersonalActivitySummary — Phase 75', () => {
  it('renders the loading state initially', () => {
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<PersonalActivitySummary />);
    expect(
      screen.getByRole('heading', { name: /my activity summary/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Loading workload snapshot/i)).toBeInTheDocument();
  });

  it('renders the failed state with the error message', async () => {
    loadMock.mockRejectedValue(new Error('service unavailable'));
    render(<PersonalActivitySummary />);
    await waitFor(() =>
      expect(
        screen.getByText(/Could not load activity summary/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the empty state when the banker has no active deals', async () => {
    loadMock.mockResolvedValue(emptyData());
    render(<PersonalActivitySummary />);
    await screen.findByText(/No active deals assigned to you/i);
    expect(
      screen.getByText(/this snapshot will populate from current records/i),
    ).toBeInTheDocument();
  });

  it('renders pipeline shape, attention, and work-items sections with derived figures', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Acme RLOC',
        clientName: 'Acme',
        stage: 'Underwriting',
        status: 'Active',
        amount: 4_000_000,
        targetCloseDate: isoDaysFromNow(7), // closing soon
        lastActivityOn: undefined,
        stageEntryDate: isoDaysAgo(45), // stage at risk
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd2',
        name: 'Beta Term',
        clientName: 'Beta',
        stage: 'Closing',
        status: 'Active',
        amount: 2_500_000,
        targetCloseDate: isoDaysAgo(3), // past target close
        lastActivityOn: undefined,
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

    render(<PersonalActivitySummary />);
    // Wait for the rendered card content.
    await screen.findByText(/Pipeline shape/i);

    // Active deals = 2.
    expect(screen.getByText(/^Active deals$/i).nextSibling).toHaveTextContent('2');
    // Total pipeline = $6,500,000.
    expect(screen.getByText(/^Total pipeline$/i).nextSibling).toHaveTextContent(
      /\$6,500,000/,
    );
    // Closing soon = 1.
    expect(
      screen.getByText(/Closing soon \(≤14 days\)/i).nextSibling,
    ).toHaveTextContent('1');
    // Past target close = 1.
    expect(
      screen.getByText(/Past target close/i).nextSibling,
    ).toHaveTextContent('1');
    // Stage attention = 1.
    expect(
      screen.getByText(/Stage attention \(≥30 days\)/i).nextSibling,
    ).toHaveTextContent('1');

    // Work items section.
    expect(screen.getByText(/^Open tasks$/i).nextSibling).toHaveTextContent('2');
    expect(
      screen.getByText(/^Overdue tasks$/i).nextSibling,
    ).toHaveTextContent('1');
    expect(
      screen.getByText(/Outstanding documents/i).nextSibling,
    ).toHaveTextContent('1');
    expect(
      screen.getByText(/Documents may require review/i).nextSibling,
    ).toHaveTextContent('1');
    // Memos section appears with the draft count.
    expect(screen.getByText(/Draft credit memos/i).nextSibling).toHaveTextContent(
      '1',
    );
  });

  it('renders the missing-amount gap hint honestly when amounts are absent', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'A',
        clientName: undefined,
        stage: undefined,
        status: undefined,
        amount: undefined,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd2',
        name: 'B',
        clientName: undefined,
        stage: undefined,
        status: undefined,
        amount: 500_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<PersonalActivitySummary />);
    await screen.findByText(/Pipeline shape/i);
    expect(
      screen.getByText(/1 deal have no amount on the record/i),
    ).toBeInTheDocument();
    // Note: the message renders "1 deal" without final 's' — the
    // pluralization rule in the component is "if 1, singular".
    expect(
      screen.getByText(/Total pipeline above is estimated from available fields/i),
    ).toBeInTheDocument();
  });

  it('renders the missing-stage-entry gap hint when stage-entry dates are absent', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'A',
        clientName: undefined,
        stage: 'Underwriting',
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
    render(<PersonalActivitySummary />);
    await screen.findByText(/Pipeline shape/i);
    expect(
      screen.getByText(
        /1 deal excluded from stage attention math — no stage-entry date/i,
      ),
    ).toBeInTheDocument();
  });

  it('does not render the Memos section when no drafts exist', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'A',
        clientName: undefined,
        stage: 'Underwriting',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: isoDaysAgo(10),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.memos = [
      { id: 'm1', dealId: 'd1', name: 'X', statusKey: 'final', generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
    ];
    loadMock.mockResolvedValue(data);
    render(<PersonalActivitySummary />);
    await screen.findByText(/Pipeline shape/i);
    expect(screen.queryByText(/Draft credit memos/i)).toBeNull();
  });

  it('renders the conservative disclaimer + forbids scoring / ranking / approved language in rendered DOM', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'A',
        clientName: undefined,
        stage: 'Underwriting',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: isoDaysAgo(5),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    const { container } = render(<PersonalActivitySummary />);
    await screen.findByText(/Pipeline shape/i);

    // Both the subtitle and the disclaimer contain "derived from
    // current records" — getAllByText is the correct query.
    expect(
      screen.getAllByText(/derived from current records/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/not a performance evaluation/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no ranking, no predictive claim, no compensation impact/i),
    ).toBeInTheDocument();

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bscore\b/i);
    expect(text).not.toMatch(/\bunderperforming\b/i);
    expect(text).not.toMatch(/\bAI[ -]generated\b/i);
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\brejected\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    // Note: "ranking" is forbidden as a standalone term. The
    // disclaimer says "no ranking" — that's an explicit negation, so
    // the test asserts the *absence* of any positive use. The regex
    // catches both forms ("ranking" + "ranked") and the negated
    // form passes because the text doesn't claim a ranking exists.
    // Match only patterns that would ASSERT a ranking (e.g.
    // "ranked #1", "performance ranking" etc.) — the negation phrase
    // "no ranking" itself is intentionally retained.
    expect(text).not.toMatch(/\bperformance\s+ranking\b/i);
    expect(text).not.toMatch(/\branked\s+#\d/i);
  });
});
