// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 82 — BankerAutopilotRollup card tests.
 *
 * Pins:
 *   - loading + failed + no-deals empty + no-signals empty states;
 *   - rollup never says "all clear" / "no risk" / "pipeline healthy"
 *     / "everything is fine";
 *   - populated rendering: priority count chips + scan line + top
 *     rows with deal-name button, top suggestion title + reason,
 *     client / stage / target-close meta;
 *   - clicking a deal-name navigates via react-router;
 *   - signal-coverage limitation disclaimer (memo consistency note);
 *   - conservative disclaimer renders verbatim;
 *   - rendered DOM never contains AI / automation / decisioning /
 *     prediction vocabulary.
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
import { BankerAutopilotRollup } from './BankerAutopilotRollup';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useBankerMock = vi.mocked(useBanker);

const NOW = new Date();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
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

describe('BankerAutopilotRollup — Phase 82', () => {
  it('renders the loading state initially', () => {
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<BankerAutopilotRollup />);
    expect(
      screen.getByRole('heading', { name: /my next-best-action signals/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Loading personal pipeline signals/i),
    ).toBeInTheDocument();
  });

  it('renders the failed state via role="alert"', async () => {
    loadMock.mockRejectedValue(new Error('service unavailable'));
    render(<BankerAutopilotRollup />);
    await waitFor(() =>
      expect(
        screen.getByText(/Could not load my next-best-action signals/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders the no-deals empty state when the banker has none assigned', async () => {
    loadMock.mockResolvedValue(emptyData());
    render(<BankerAutopilotRollup />);
    await screen.findByText(/No active deals assigned to you yet/i);
  });

  it('renders the no-signals empty state and forbids over-confident phrases', async () => {
    const data = emptyData();
    // One healthy deal — no signal should fire.
    data.deals = [
      {
        id: 'd1',
        name: 'Healthy',
        clientName: 'OK Co',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(90),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(3),
        isClosed: false,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<BankerAutopilotRollup />);
    await screen.findByText(
      /No next-best-action suggestions from current records\./i,
    );
    // Must NOT contain the forbidden empty-state phrases.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\ball\s+clear\b/i);
    expect(text).not.toMatch(/\bno\s+risk\b/i);
    expect(text).not.toMatch(/\bpipeline\s+healthy\b/i);
    expect(text).not.toMatch(/\beverything\s+is\s+fine\b/i);
  });

  it('renders priority count chips + top deal rows when signals fire', async () => {
    const data = emptyData();
    data.deals = [
      // HIGH: overdue task on this deal.
      {
        id: 'h1',
        name: 'High Acme',
        clientName: 'Acme Mfg',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(90),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(3),
        isClosed: false,
      },
      // MEDIUM: stage-aging only.
      {
        id: 'm1',
        name: 'Medium Beta',
        clientName: 'Beta Inc',
        stage: 'Closing',
        status: 'Active',
        amount: 500_000,
        targetCloseDate: isoDaysFromNow(90),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(45),
        isClosed: false,
      },
      // LOW: stale-activity only.
      {
        id: 'l1',
        name: 'Low Gamma',
        clientName: 'Gamma LLC',
        stage: 'Application',
        status: 'Active',
        amount: 750_000,
        targetCloseDate: isoDaysFromNow(60),
        lastActivityOn: isoDaysAgo(30),
        stageEntryDate: isoDaysAgo(2),
        isClosed: false,
      },
      // Quiet deal — should NOT appear in topDeals.
      {
        id: 'q1',
        name: 'Quiet Delta',
        clientName: 'Delta Co',
        stage: 'Application',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: isoDaysFromNow(120),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(2),
        isClosed: false,
      },
    ];
    data.tasks = [
      {
        id: 't1',
        dealId: 'h1',
        title: 'Send Q2 financials',
        dueDate: isoDaysAgo(2),
        modifiedOn: undefined,
        completed: false,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<BankerAutopilotRollup />);
    await screen.findByLabelText(/High priority: 1 deal\b/i);
    expect(
      screen.getByLabelText(/Medium priority: 1 deal\b/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Low priority: 1 deal\b/i)).toBeInTheDocument();

    // Scan line.
    expect(
      screen.getByText(/Scanned 4 of your deals · 3 with signals/i),
    ).toBeInTheDocument();

    // The top deal row order is HIGH → MEDIUM → LOW.
    const list = screen.getByRole('list', {
      name: /My top deals with next-best-action signals/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(3);
    expect(items[0]!.textContent).toContain('High Acme');
    expect(items[1]!.textContent).toContain('Medium Beta');
    expect(items[2]!.textContent).toContain('Low Gamma');

    // Client name shown on rows.
    expect(items[0]!.textContent).toContain('Acme Mfg');
    expect(items[1]!.textContent).toContain('Beta Inc');
  });

  it('clicking a deal-name navigates to /deals/<id>', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd-target',
        name: 'Target Deal',
        clientName: 'Target Co',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(90),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(45),
        isClosed: false,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<BankerAutopilotRollup />);
    const button = await screen.findByRole('button', {
      name: /Open deal Target Deal/i,
    });
    const user = userEvent.setup();
    await user.click(button);
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
  });

  it('renders the signal-coverage limitation disclaimer (memo consistency note)', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'h1',
        name: 'High Acme',
        clientName: undefined,
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(5),
        lastActivityOn: isoDaysAgo(20),
        stageEntryDate: isoDaysAgo(2),
        isClosed: false,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<BankerAutopilotRollup />);
    await screen.findByLabelText(/High priority: 1 deal/i);
    expect(
      screen.getByText(/Memo consistency findings appear/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Open a deal to act — the Phase 80 per-deal panel and the existing card actions/i,
      ),
    ).toBeInTheDocument();
  });

  it('rendered DOM never contains AI / automation / decisioning / prediction vocabulary as a positive claim', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'h1',
        name: 'High Acme',
        clientName: 'Acme Mfg',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(5),
        lastActivityOn: isoDaysAgo(20),
        stageEntryDate: isoDaysAgo(2),
        isClosed: false,
      },
    ];
    loadMock.mockResolvedValue(data);
    const { container } = render(<BankerAutopilotRollup />);
    await screen.findByLabelText(/High priority: 1 deal/i);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\bautopilot\s+executed\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+approved\b/i);
    expect(text).not.toMatch(/\bdecisioned\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bsystem\s+will\s+complete\b/i);
    expect(text).not.toMatch(/\bprediction\b/i);
    // Positive automation claim — disclaimer's "Nothing happens
    // automatically" is allowed (negation); forbid affirmative forms.
    expect(text).not.toMatch(
      /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
    );
  });
});
