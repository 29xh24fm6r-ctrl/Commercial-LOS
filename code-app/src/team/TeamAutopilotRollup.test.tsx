// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamData } from './TeamDataProvider';
import type {
  TeamDealRow,
  TeamTaskRow,
  TeamDocumentRow,
  TeamMemoRow,
  TeamMemoSectionRow,
} from './teamQueries';

/**
 * Phase 84 — TeamAutopilotRollup card tests.
 *
 * Pins:
 *   - card header + verbatim subtitle;
 *   - loading + failed (role=alert) states;
 *   - no-deals empty state + no-signals empty state;
 *   - empty-state copy never says "all clear" / "no risk" /
 *     "pipeline healthy" / "everything is fine";
 *   - populated state surfaces priority chips + top deals + meta;
 *   - rollup uses the FULL team data (overdue task fires HIGH);
 *   - clicking deal-name records "opened" locally AND navigates;
 *   - Dismiss locally / Restore round-trip works;
 *   - signal-coverage limitation paragraph + conservative disclaimer
 *     render;
 *   - rendered DOM never contains AI / automation / decisioning /
 *     prediction vocabulary as a positive claim;
 *   - pre-existing dismissed entry in localStorage rehydrates the
 *     row as dismissed (Phase 83 ledger integration).
 */

vi.mock('./TeamDataProvider', () => ({
  useTeamData: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { useTeamData } from './TeamDataProvider';
import { TeamAutopilotRollup } from './TeamAutopilotRollup';

const useTeamDataMock = vi.mocked(useTeamData);

const NOW = new Date();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function ready(
  deals: TeamDealRow[],
  tasks: TeamTaskRow[] = [],
  documents: TeamDocumentRow[] = [],
  memos: TeamMemoRow[] = [],
  memoSections: TeamMemoSectionRow[] = [],
): TeamData {
  return {
    deals: { kind: 'ready', data: deals },
    tasks: { kind: 'ready', data: tasks },
    documents: { kind: 'ready', data: documents },
    memos: { kind: 'ready', data: memos },
    memoSections: { kind: 'ready', data: memoSections },
  };
}

function dealRow(overrides: Partial<TeamDealRow> = {}): TeamDealRow {
  return {
    id: 'd-1',
    name: 'Sample Deal',
    clientName: 'Sample Co',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(90),
    stageEntryDate: isoDaysAgo(5),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'b-1',
    assignedBankerName: 'M. Paller',
    collateralSummary: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('TeamAutopilotRollup — Phase 84', () => {
  it('renders the card header + verbatim subtitle', () => {
    useTeamDataMock.mockReturnValue(ready([dealRow()]));
    render(<TeamAutopilotRollup />);
    expect(
      screen.getByRole('heading', { name: /team next-best-action signals/i }),
    ).toBeInTheDocument();
    // Subtitle + bottom disclaimer (when populated) both carry the
    // phrase; assert at least one match.
    expect(
      screen.getAllByText(
        /Derived from current records\. Nothing happens automatically\./i,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders the loading state when any data slot is non-ready', () => {
    useTeamDataMock.mockReturnValue({
      deals: { kind: 'loading' },
      tasks: { kind: 'ready', data: [] },
      documents: { kind: 'ready', data: [] },
      memos: { kind: 'ready', data: [] },
      memoSections: { kind: 'ready', data: [] },
    });
    render(<TeamAutopilotRollup />);
    expect(screen.getByText(/Loading team signals/i)).toBeInTheDocument();
  });

  it('renders the failed state via role="alert" when deals fail', () => {
    useTeamDataMock.mockReturnValue({
      deals: { kind: 'failed', message: 'service unavailable' },
      tasks: { kind: 'ready', data: [] },
      documents: { kind: 'ready', data: [] },
      memos: { kind: 'ready', data: [] },
      memoSections: { kind: 'ready', data: [] },
    });
    render(<TeamAutopilotRollup />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/Could not load team signals/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders the no-deals empty state when the team pipeline is empty', () => {
    useTeamDataMock.mockReturnValue(ready([]));
    render(<TeamAutopilotRollup />);
    expect(
      screen.getByText(/No active deals on the team yet/i),
    ).toBeInTheDocument();
  });

  it('renders the no-signals empty state and forbids over-confident phrasing', () => {
    // Healthy deal, no children.
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({
          id: 'q1',
          name: 'Quiet Co',
          targetCloseDate: isoDaysFromNow(120),
          stageEntryDate: isoDaysAgo(2),
          modifiedOn: isoDaysAgo(1),
        }),
      ]),
    );
    render(<TeamAutopilotRollup />);
    expect(
      screen.getByText(
        /No next-best-action suggestions from current records\./i,
      ),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\ball\s+clear\b/i);
    expect(text).not.toMatch(/\bno\s+risk\b/i);
    expect(text).not.toMatch(/\bpipeline\s+healthy\b/i);
    expect(text).not.toMatch(/\beverything\s+is\s+fine\b/i);
  });

  it('overdue tasks fire HIGH priority signal (full Phase 80 coverage on team surface)', () => {
    useTeamDataMock.mockReturnValue(
      ready(
        [
          dealRow({
            id: 'd-h',
            name: 'Hot Deal',
            assignedBankerName: 'B. One',
          }),
        ],
        [
          {
            id: 't1',
            dealId: 'd-h',
            title: 'Send Q2 financials',
            dueDate: isoDaysAgo(2),
            completed: false,
            assigneeName: undefined,
            modifiedOn: undefined,
            dealName: 'Hot Deal',
          },
        ],
        [],
        [],
      ),
    );
    render(<TeamAutopilotRollup />);
    expect(
      screen.getByLabelText(/High priority: 1 deal\b/i),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', {
      name: /Top team deals with next-best-action signals/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('Hot Deal');
    expect(items[0]!.textContent).toContain('1 overdue task');
    expect(items[0]!.textContent).toContain('B. One');
  });

  it('pending-review documents fire HIGH priority (status=received bucket)', () => {
    useTeamDataMock.mockReturnValue(
      ready(
        [dealRow({ id: 'd-pr', name: 'PR Deal' })],
        [],
        [
          {
            id: 'doc1',
            dealId: 'd-pr',
            name: 'PFS',
            dueDate: undefined,
            requestDate: undefined,
            receivedDate: isoDaysAgo(10),
            reviewer: undefined,
            uploaded: false,
            modifiedOn: undefined,
            status: 'received',
            dealName: 'PR Deal',
          },
        ],
        [],
      ),
    );
    render(<TeamAutopilotRollup />);
    expect(
      screen.getByLabelText(/High priority: 1 deal\b/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 document may require review/i),
    ).toBeInTheDocument();
  });

  it('clicking a deal-name records "opened" locally AND navigates', async () => {
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({
          id: 'd-target',
          name: 'Target Deal',
          stageEntryDate: isoDaysAgo(45), // MEDIUM stage-aging
        }),
      ]),
    );
    render(<TeamAutopilotRollup />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /Open deal Target Deal/i }),
    );
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
    expect(
      screen.getAllByText(/Opened locally/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('Dismiss locally / Restore round-trip works', async () => {
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({
          id: 'd-1',
          name: 'Dismissable',
          stageEntryDate: isoDaysAgo(45),
        }),
      ]),
    );
    render(<TeamAutopilotRollup />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', {
        name: /Dismiss suggestion for Dismissable locally/i,
      }),
    );
    expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: /Restore suggestion for Dismissable/i,
      }),
    );
    expect(screen.queryByText(/Dismissed locally/i)).toBeNull();
    expect(
      screen.getByRole('button', {
        name: /Dismiss suggestion for Dismissable locally/i,
      }),
    ).toBeInTheDocument();
  });

  it('rehydrates a pre-existing dismissed entry from localStorage (Phase 83 ledger surface = team-rollup)', () => {
    localStorage.setItem(
      'cc:autopilotSuggestionLedger:v1',
      JSON.stringify({
        'team-rollup|d-1|stage-aging': {
          key: 'team-rollup|d-1|stage-aging',
          surface: 'team-rollup',
          suggestionId: 'stage-aging',
          dealId: 'd-1',
          action: 'dismissed',
          recordedAt: '2026-05-17T10:00:00.000Z',
          titleSnapshot: '45 days in current stage',
        },
      }),
    );
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({
          id: 'd-1',
          name: 'Dismissable',
          stageEntryDate: isoDaysAgo(45),
        }),
      ]),
    );
    render(<TeamAutopilotRollup />);
    expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Restore suggestion for Dismissable/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the signal-coverage limitation + conservative disclaimer copy', () => {
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({
          id: 'd-1',
          name: 'Deal',
          stageEntryDate: isoDaysAgo(45),
        }),
      ]),
    );
    render(<TeamAutopilotRollup />);
    expect(
      screen.getByText(/Memo consistency findings appear/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Team visibility is scoped/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tracked on this browser only/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/do not change deal status/i),
    ).toBeInTheDocument();
  });

  it('rendered DOM never contains AI / automation / decisioning / prediction vocabulary as a positive claim', () => {
    useTeamDataMock.mockReturnValue(
      ready([
        dealRow({
          id: 'd-1',
          name: 'Deal',
          stageEntryDate: isoDaysAgo(45),
        }),
      ]),
    );
    const { container } = render(<TeamAutopilotRollup />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\bautopilot\s+executed\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+approved\b/i);
    expect(text).not.toMatch(/\bdecisioned\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bsystem\s+will\s+complete\b/i);
    expect(text).not.toMatch(/\bprediction\b/i);
    expect(text).not.toMatch(
      /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
    );
  });
});
