// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from '../banker/workQueueQueries';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';

/**
 * Phase 77 — RelationshipContext (Deal Workspace) tests.
 *
 * Pins:
 *   - role boundary: returns null when no BankerContext (manager /
 *     team / executive deal workspaces);
 *   - loading + failed (role=alert) states;
 *   - no-client-name fallback when deal.clientName is missing;
 *   - no-other-deals fallback when the current deal is the only
 *     visible deal for its client;
 *   - has-other-deals state renders aggregates, attention badges,
 *     and deal pills (current deal excluded);
 *   - clicking a deal pill calls navigate('/deals/<id>');
 *   - conservative disclaimer present;
 *   - rendered DOM does not contain forbidden vocabulary
 *     (AI-generated / risk score / relationship score / household
 *     linkage / verified relationship graph / complete borrower
 *     history / guaranteed / approved / rejected).
 */

vi.mock('../banker/workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: vi.fn(),
}));

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { loadBankerWorkQueueData } from '../banker/workQueueQueries';
import { useOptionalBanker } from '../banker/BankerContext';
import { useDealData } from './DealDataProvider';
import { RelationshipContext } from './RelationshipContext';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useOptionalBankerMock = vi.mocked(useOptionalBanker);
const useDealDataMock = vi.mocked(useDealData);

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

function deal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-current',
    name: 'Current Deal',
    clientName: 'Acme Manufacturing',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-09-30T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    ...overrides,
  };
}

function dealData(d: DealDetail): DealData {
  return {
    deal: d,
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: [] },
    refresh: () => undefined,
  };
}

function asBanker() {
  useOptionalBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Phase 141O-flake — every fixture date here is anchored to the fixed `NOW`
  // constant via `isoDaysAgo` / `isoDaysFromNow`, but the stage-aging / closing-
  // soon badges are derived against the runtime clock. Freeze ONLY the Date clock
  // to that same anchor so the badge thresholds (e.g. "30 days in current stage")
  // are deterministic regardless of the real calendar date. Real timers stay live
  // (no `toFake` of timers) so userEvent-driven navigation tests are unaffected.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RelationshipContext — Phase 77', () => {
  it('returns null when no BankerContext is present (manager/team/executive boundary)', () => {
    useOptionalBankerMock.mockReturnValue(null);
    useDealDataMock.mockReturnValue(dealData(deal()));
    const { container } = render(<RelationshipContext />);
    expect(container.firstChild).toBeNull();
    // And we did NOT issue the banker-pipeline query.
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('renders the loading state when banker is present', () => {
    asBanker();
    useDealDataMock.mockReturnValue(dealData(deal()));
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<RelationshipContext />);
    expect(
      screen.getByRole('heading', { name: /relationship context/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Loading other visible deals for this client/i),
    ).toBeInTheDocument();
  });

  it('renders the failed state via role="alert"', async () => {
    asBanker();
    useDealDataMock.mockReturnValue(dealData(deal()));
    loadMock.mockRejectedValue(new Error('boom'));
    render(<RelationshipContext />);
    await waitFor(() =>
      expect(
        screen.getByText(/Could not load relationship context/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it('renders the no-client-name fallback when the deal has no clientName', async () => {
    asBanker();
    useDealDataMock.mockReturnValue(dealData(deal({ clientName: undefined })));
    loadMock.mockResolvedValue(emptyData());
    render(<RelationshipContext />);
    await screen.findByText(/No borrower name on record for this deal/i);
    expect(
      screen.getByText(/Client-name grouping is the limit/i),
    ).toBeInTheDocument();
  });

  it('renders the no-other-deals fallback when only the current deal exists for this client', async () => {
    asBanker();
    useDealDataMock.mockReturnValue(
      dealData(deal({ id: 'd-current', clientName: 'Acme' })),
    );
    const data = emptyData();
    data.deals = [
      {
        id: 'd-current',
        name: 'Current',
        clientName: 'Acme',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd-other-client',
        name: 'Beta Deal',
        clientName: 'Beta Co',
        stage: 'Closing',
        status: 'Active',
        amount: 500_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipContext />);
    await screen.findByText(/No other visible deals for Acme/i);
    expect(
      screen.getByText(/No other visible deals for this client/i),
    ).toBeInTheDocument();
  });

  it('renders has-other-deals with aggregates, badges, and pills (current deal excluded)', async () => {
    asBanker();
    useDealDataMock.mockReturnValue(
      dealData(deal({ id: 'd-current', clientName: 'Acme' })),
    );
    const data = emptyData();
    data.deals = [
      {
        id: 'd-current',
        name: 'Current',
        clientName: 'Acme',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(5),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(40),
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd-sib',
        // Sibling is intentionally NOT closing-soon (>14d out) and NOT
        // stage-at-risk (<30d). The point of this test is that the
        // CURRENT deal's signals (closing soon + stage at-risk +
        // draft memo) do not leak into the sibling-only aggregates.
        name: 'Sibling Term',
        clientName: 'Acme',
        stage: 'Closing',
        status: 'Active',
        amount: 750_000,
        targetCloseDate: isoDaysFromNow(40),
        lastActivityOn: isoDaysAgo(3),
        stageEntryDate: isoDaysAgo(5),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.tasks = [
      // Tasks on the current deal must NOT count.
      { id: 't1', dealId: 'd-current', title: 'X', dueDate: isoDaysAgo(1), modifiedOn: undefined, completed: false },
      // Task on the sibling deal should count.
      { id: 't2', dealId: 'd-sib', title: 'Y', dueDate: undefined, modifiedOn: undefined, completed: false },
    ];
    data.outstandingDocuments = [
      { id: 'doc1', dealId: 'd-sib', name: 'PFS', dueDate: undefined, requestDate: undefined, receivedDate: undefined, reviewer: undefined, uploaded: false, modifiedOn: undefined },
    ];
    data.pendingReviewDocuments = [
      { id: 'doc2', dealId: 'd-sib', name: 'Tax', dueDate: undefined, requestDate: undefined, receivedDate: isoDaysAgo(9), reviewer: undefined, uploaded: false, modifiedOn: undefined },
    ];
    data.memos = [
      // Draft memo on the CURRENT deal should NOT count.
      { id: 'm1', dealId: 'd-current', name: 'X', statusKey: 'draft', generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipContext />);
    // Subtitle includes the other-deal count + client name.
    await screen.findByText(/1 other visible deal for Acme/i);
    // Aggregates exclude the current deal.
    expect(screen.getByText(/Open document requests:/i)).toBeInTheDocument();
    expect(screen.getByText(/Open tasks:/i)).toBeInTheDocument();
    expect(screen.getByText(/1 may require review/i)).toBeInTheDocument();
    // No "1 stage attention" or "1 closing soon" badges from the
    // current deal — the sibling is not stage-at-risk and not within
    // 14d close.
    expect(screen.queryByText(/stage attention/i)).toBeNull();
    expect(screen.queryByText(/closing soon/i)).toBeNull();
    // No draft memo from the current deal leaks into the badges.
    expect(screen.queryByText(/draft memo/i)).toBeNull();
    // Pill for the sibling renders + is a button.
    expect(
      screen.getByRole('button', { name: /Open related deal Sibling Term/i }),
    ).toBeInTheDocument();
    // No pill for the current deal.
    expect(
      screen.queryByRole('button', { name: /Open related deal Current/i }),
    ).toBeNull();
  });

  it('clicking a deal pill navigates to the related deal workspace', async () => {
    asBanker();
    useDealDataMock.mockReturnValue(
      dealData(deal({ id: 'd-current', clientName: 'Acme' })),
    );
    const data = emptyData();
    data.deals = [
      {
        id: 'd-current',
        name: 'Current',
        clientName: 'Acme',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd-target',
        name: 'Target',
        clientName: 'Acme',
        stage: 'Closing',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipContext />);
    const pill = await screen.findByRole('button', {
      name: /Open related deal Target/i,
    });
    const user = userEvent.setup();
    await user.click(pill);
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
  });

  it('renders the conservative disclaimer and avoids forbidden vocabulary in rendered DOM', async () => {
    asBanker();
    useDealDataMock.mockReturnValue(
      dealData(deal({ id: 'd-current', clientName: 'Acme' })),
    );
    const data = emptyData();
    data.deals = [
      {
        id: 'd-current',
        name: 'Current',
        clientName: 'Acme',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd-sib',
        name: 'Sibling',
        clientName: 'Acme',
        stage: 'Closing',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    const { container } = render(<RelationshipContext />);
    await screen.findByText(/1 other visible deal for Acme/i);
    expect(
      screen.getAllByText(/derived from visible records/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Client-name grouped/i)).toBeInTheDocument();
    expect(
      screen.getByText(/May not include all related borrowers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Not a verified relationship graph/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a household linkage/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a relationship score/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/No predictive claim/i)).toBeInTheDocument();

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\brisk\s+score\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\brejected\b/i);
    expect(text).not.toMatch(/\bcomplete\s+borrower\s+history\b/i);
    expect(text).not.toMatch(/\bfull\s+relationship\s+profile\b/i);
    expect(text).not.toMatch(/\bofficial\s+householding\b/i);
    // "relationship score" can only appear in the negation phrase
    // "not a relationship score" — verify there's no positive use.
    expect(text).not.toMatch(/relationship\s+score:\s*\d/i);
    expect(text).not.toMatch(/relationship\s+score\s+of\s+/i);
  });
});
