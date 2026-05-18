// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ManagerData } from './ManagerDataProvider';
import type {
  TeamDeal,
  TeamScopedDocument,
  TeamScopedMemo,
  TeamScopedTask,
} from './managerQueries';

/**
 * Phase 81 — ManagerAutopilotRollup card tests.
 *
 * Pins:
 *   - loading + failed + empty (no-deals) + empty (no-signals)
 *     states;
 *   - populated rendering: priority count chips + scan line + top
 *     deal rows + banker / stage / target-close meta + deal-name
 *     navigation button;
 *   - rollup never claims "all clear" / "no risk" / "portfolio
 *     healthy" / "everything is fine";
 *   - signal-coverage disclaimer renders verbatim (manager surface
 *     is deal-record-signal only);
 *   - conservative disclaimer renders verbatim;
 *   - rendered DOM never contains AI / automation / decisioning /
 *     prediction vocabulary;
 *   - clicking a deal-name navigates via react-router.
 */

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { useManagerData } from './ManagerDataProvider';
import { ManagerAutopilotRollup } from './ManagerAutopilotRollup';

const useManagerDataMock = vi.mocked(useManagerData);

const NOW = new Date();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function ready(
  deals: TeamDeal[],
  tasks: TeamScopedTask[] = [],
  documents: TeamScopedDocument[] = [],
  memos: TeamScopedMemo[] = [],
): ManagerData {
  return {
    teamPipeline: { kind: 'ready', data: deals },
    teamBankers: { kind: 'ready', data: [] },
    teamTasks: { kind: 'ready', data: tasks },
    teamDocuments: { kind: 'ready', data: documents },
    teamMemos: { kind: 'ready', data: memos },
  };
}

function deal(overrides: Partial<TeamDeal> = {}): TeamDeal {
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
    ...overrides,
  };
}

describe('ManagerAutopilotRollup — Phase 81', () => {
  it('renders the card header + verbatim subtitle', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerAutopilotRollup />);
    expect(
      screen.getByRole('heading', { name: /team next-best-action signals/i }),
    ).toBeInTheDocument();
    // The subtitle uses the same phrase as the bottom disclaimer on
    // populated states; check at least one occurrence appears.
    expect(
      screen.getAllByText(
        /Derived from current records\. Nothing happens automatically\./i,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders the loading state when teamPipeline is non-ready', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'loading' },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'ready', data: [] },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
    });
    render(<ManagerAutopilotRollup />);
    expect(screen.getByText(/Loading team signals/i)).toBeInTheDocument();
  });

  it('renders the loading state when any Phase 87 child-data slot is non-ready', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'ready', data: [deal()] },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
    });
    render(<ManagerAutopilotRollup />);
    expect(screen.getByText(/Loading team signals/i)).toBeInTheDocument();
  });

  it('renders the failed state via role="alert"', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'failed', message: 'service unavailable' },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'ready', data: [] },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
    });
    render(<ManagerAutopilotRollup />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/Could not load team signals/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders the failed state when a Phase 87 child-data slot fails', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'ready', data: [deal()] },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'failed', message: 'tasks service unavailable' },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
    });
    render(<ManagerAutopilotRollup />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/tasks service unavailable/i),
    ).toBeInTheDocument();
  });

  it('renders the no-deals empty state when teamPipeline is ready but empty', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    render(<ManagerAutopilotRollup />);
    expect(
      screen.getByText(/No active deals on the team yet/i),
    ).toBeInTheDocument();
  });

  it('renders the no-signals empty state when no deal surfaces a suggestion', () => {
    // Two healthy deals: future close, fresh stage entry, fresh activity.
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'q1',
          name: 'Quiet One',
          targetCloseDate: isoDaysFromNow(90),
          stageEntryDate: isoDaysAgo(2),
          modifiedOn: isoDaysAgo(1),
        }),
        deal({
          id: 'q2',
          name: 'Quiet Two',
          targetCloseDate: isoDaysFromNow(120),
          stageEntryDate: isoDaysAgo(3),
          modifiedOn: isoDaysAgo(2),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);
    expect(
      screen.getByText(
        /No next-best-action suggestions from current records\./i,
      ),
    ).toBeInTheDocument();
    // Must NOT say any of the forbidden empty-state phrases.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\ball\s+clear\b/i);
    expect(text).not.toMatch(/\bno\s+risk\b/i);
    expect(text).not.toMatch(/\bportfolio\s+healthy\b/i);
    expect(text).not.toMatch(/\beverything\s+is\s+fine\b/i);
  });

  it('renders priority count chips + top deal rows when signals fire', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        // HIGH — closing-soon + stale activity.
        deal({
          id: 'h1',
          name: 'High Acme',
          targetCloseDate: isoDaysFromNow(5),
          modifiedOn: isoDaysAgo(20),
          assignedBankerName: 'M. Paller',
        }),
        // MEDIUM — stage aging only.
        deal({
          id: 'm1',
          name: 'Medium Beta',
          stageEntryDate: isoDaysAgo(45),
          modifiedOn: isoDaysAgo(1),
          assignedBankerName: 'B. Other',
        }),
        // LOW — stale activity only.
        deal({
          id: 'l1',
          name: 'Low Gamma',
          targetCloseDate: isoDaysFromNow(60),
          modifiedOn: isoDaysAgo(30),
          assignedBankerName: undefined,
        }),
        // Quiet deal (no signal — should not appear).
        deal({
          id: 'q1',
          name: 'Quiet Delta',
          targetCloseDate: isoDaysFromNow(120),
          stageEntryDate: isoDaysAgo(2),
          modifiedOn: isoDaysAgo(1),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);

    // Priority chips by aria-label.
    expect(screen.getByLabelText(/High priority: 1 deal\b/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Medium priority: 1 deal\b/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Low priority: 1 deal\b/i)).toBeInTheDocument();

    // Scan line.
    expect(
      screen.getByText(/Scanned 4 team deals · 3 with signals/i),
    ).toBeInTheDocument();

    // The top deal row order is HIGH → MEDIUM → LOW.
    const list = screen.getByRole('list', {
      name: /Top team deals with next-best-action signals/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(3);
    expect(items[0]!.textContent).toContain('High Acme');
    expect(items[1]!.textContent).toContain('Medium Beta');
    expect(items[2]!.textContent).toContain('Low Gamma');

    // Banker shown on rows.
    expect(items[0]!.textContent).toContain('M. Paller');
    expect(items[1]!.textContent).toContain('B. Other');
    expect(items[2]!.textContent).toContain('(unassigned)');
  });

  it('clicking a deal-name button navigates to /deals/<id>', async () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'd-target',
          name: 'Target Deal',
          stageEntryDate: isoDaysAgo(45),
          modifiedOn: isoDaysAgo(1),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /Open deal Target Deal/i }),
    );
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
  });

  it('renders the Phase 87 signal-coverage disclaimer + the conservative disclaimer', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'h1',
          name: 'High Acme',
          targetCloseDate: isoDaysFromNow(5),
          modifiedOn: isoDaysAgo(20),
        }),
      ]),
    );
    render(<ManagerAutopilotRollup />);
    // Phase 87 broadens the coverage paragraph beyond "deal-record
    // signals only" — it now enumerates the manager-scoped records
    // and continues to disclaim memo-consistency-findings.
    expect(
      screen.getByText(
        /Manager rollup uses the available manager-scoped records/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Memo consistency findings appear on each deal/i),
    ).toBeInTheDocument();
    // The bottom disclaimer.
    expect(
      screen.getByText(
        /No AI or automated decisions\. Manager visibility is scoped/i,
      ),
    ).toBeInTheDocument();
  });

  it('rendered DOM never contains AI / automation / decisioning / prediction vocabulary as a positive claim', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'h1',
          name: 'High Acme',
          targetCloseDate: isoDaysFromNow(5),
          modifiedOn: isoDaysAgo(20),
        }),
      ]),
    );
    const { container } = render(<ManagerAutopilotRollup />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\bautopilot\s+executed\b/i);
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+approved\b/i);
    expect(text).not.toMatch(/\bdecisioned\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bsystem\s+will\s+complete\b/i);
    expect(text).not.toMatch(/\bprediction\b/i);
    // Positive automation claim — disclaimer's "Nothing happens
    // automatically" is allowed (negation). Forbid affirmative forms.
    expect(text).not.toMatch(
      /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
    );
  });

  // ----- Phase 83: local suggestion ledger integration -----

  describe('Phase 83 — local suggestion ledger', () => {
    function flagged() {
      return [
        deal({
          id: 'd-flagged',
          name: 'Flagged Deal',
          stageEntryDate: isoDaysAgo(45),
          modifiedOn: isoDaysAgo(1),
        }),
      ];
    }

    beforeEach(() => {
      localStorage.clear();
    });

    it('renders a "Dismiss locally" button on each populated row', () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      expect(
        screen.getByRole('button', {
          name: /Dismiss suggestion for Flagged Deal locally/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking Dismiss locally marks the row dismissed with a Restore button', async () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss suggestion for Flagged Deal locally/i,
        }),
      );
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Restore suggestion for Flagged Deal/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking the deal-name records "opened" and navigates', async () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', { name: /Open deal Flagged Deal/i }),
      );
      expect(navigateSpy).toHaveBeenCalledWith('/deals/d-flagged');
      expect(
        screen.getAllByText(/Opened locally/i).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('extends the conservative disclaimer with the local-tracking copy', () => {
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      expect(
        screen.getByText(/tracked on this browser only/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/do not change deal status/i),
      ).toBeInTheDocument();
    });

    it('rehydrates a pre-existing dismissed entry from localStorage on mount', () => {
      localStorage.setItem(
        'cc:autopilotSuggestionLedger:v1',
        JSON.stringify({
          'manager-rollup|d-flagged|stage-aging': {
            key: 'manager-rollup|d-flagged|stage-aging',
            surface: 'manager-rollup',
            suggestionId: 'stage-aging',
            dealId: 'd-flagged',
            action: 'dismissed',
            recordedAt: '2026-05-17T10:00:00.000Z',
            titleSnapshot: '45 days in current stage',
          },
        }),
      );
      useManagerDataMock.mockReturnValue(ready(flagged()));
      render(<ManagerAutopilotRollup />);
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Restore suggestion for Flagged Deal/i,
        }),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------
  // Phase 87 — broader signal coverage (overdue tasks, pending review,
  // outstanding documents, draft memos)
  // -----------------------------------------------------------------

  describe('Phase 87 — manager-scoped child data signals', () => {
    function quietDeal(overrides: Partial<TeamDeal> = {}): TeamDeal {
      return deal({
        id: 'd-h',
        name: 'Hot Deal',
        targetCloseDate: isoDaysFromNow(60),
        stageEntryDate: isoDaysAgo(5),
        modifiedOn: isoDaysAgo(1),
        assignedBankerName: 'B. One',
        ...overrides,
      });
    }

    it('overdue tasks fire HIGH priority on the manager rollup', () => {
      const task: TeamScopedTask = {
        id: 't1',
        title: 'Send Q2 financials',
        completed: false,
        dueDate: isoDaysAgo(2),
        assigneeName: undefined,
        modifiedOn: undefined,
        dealId: 'd-h',
        dealName: 'Hot Deal',
      };
      useManagerDataMock.mockReturnValue(ready([quietDeal()], [task]));
      render(<ManagerAutopilotRollup />);
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
    });

    it('pending-review documents (status=received, no reviewer) fire HIGH priority', () => {
      const doc: TeamScopedDocument = {
        id: 'doc1',
        name: 'PFS',
        dueDate: undefined,
        requestDate: undefined,
        receivedDate: isoDaysAgo(10),
        reviewer: undefined,
        uploaded: false,
        modifiedOn: undefined,
        status: 'received',
        dealId: 'd-h',
        dealName: 'Hot Deal',
      };
      useManagerDataMock.mockReturnValue(ready([quietDeal()], [], [doc]));
      render(<ManagerAutopilotRollup />);
      expect(
        screen.getByLabelText(/High priority: 1 deal\b/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/document may require review/i),
      ).toBeInTheDocument();
    });

    it('outstanding documents fire MEDIUM priority', () => {
      const doc: TeamScopedDocument = {
        id: 'doc-od',
        name: 'PFS',
        dueDate: undefined,
        requestDate: undefined,
        receivedDate: undefined,
        reviewer: undefined,
        uploaded: false,
        modifiedOn: undefined,
        status: 'outstanding',
        dealId: 'd-h',
        dealName: 'Hot Deal',
      };
      useManagerDataMock.mockReturnValue(ready([quietDeal()], [], [doc]));
      render(<ManagerAutopilotRollup />);
      expect(
        screen.getByLabelText(/Medium priority: 1 deal\b/i),
      ).toBeInTheDocument();
    });

    it('draft memos fire LOW priority on the manager rollup', () => {
      const memo: TeamScopedMemo = {
        id: 'm1',
        name: 'Draft memo',
        statusKey: 'draft',
        generatedAt: isoDaysAgo(2),
        modifiedOn: undefined,
        dealId: 'd-h',
        dealName: 'Hot Deal',
      };
      useManagerDataMock.mockReturnValue(ready([quietDeal()], [], [], [memo]));
      render(<ManagerAutopilotRollup />);
      expect(
        screen.getByLabelText(/Low priority: 1 deal\b/i),
      ).toBeInTheDocument();
    });

    it('reviewed documents do NOT fire pending-review (Phase 80 rule still requires no reviewer)', () => {
      const reviewedDoc: TeamScopedDocument = {
        id: 'doc-r',
        name: 'PFS',
        dueDate: undefined,
        requestDate: undefined,
        receivedDate: isoDaysAgo(30),
        reviewer: 'M. Paller',
        uploaded: true,
        modifiedOn: undefined,
        status: 'reviewed',
        dealId: 'd-h',
        dealName: 'Hot Deal',
      };
      useManagerDataMock.mockReturnValue(
        ready([quietDeal()], [], [reviewedDoc]),
      );
      render(<ManagerAutopilotRollup />);
      // No signals fire → no-signals empty state.
      expect(
        screen.getByText(
          /No next-best-action suggestions from current records\./i,
        ),
      ).toBeInTheDocument();
    });

    it("does NOT claim memo-consistency-findings coverage on the manager surface", () => {
      const memo: TeamScopedMemo = {
        id: 'm1',
        name: 'Draft memo',
        statusKey: 'draft',
        generatedAt: isoDaysAgo(2),
        modifiedOn: undefined,
        dealId: 'd-h',
        dealName: 'Hot Deal',
      };
      useManagerDataMock.mockReturnValue(ready([quietDeal()], [], [], [memo]));
      const { container } = render(<ManagerAutopilotRollup />);
      const text = container.textContent ?? '';
      // The signal-coverage paragraph explicitly states memo
      // consistency findings DO NOT fire on this rollup.
      expect(text).toMatch(/Memo consistency findings appear on each deal/i);
      expect(text).toMatch(/they do not fire on this rollup/i);
    });

    it("does NOT use the Phase 81 disclaimer language 'deal-record signals only'", () => {
      // Phase 87 broadens the signal set; the old disclaimer would be
      // misleading. Forbid the legacy phrase from the populated DOM.
      useManagerDataMock.mockReturnValue(
        ready([
          deal({
            id: 'h1',
            name: 'High Acme',
            targetCloseDate: isoDaysFromNow(5),
            modifiedOn: isoDaysAgo(20),
          }),
        ]),
      );
      const { container } = render(<ManagerAutopilotRollup />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/deal-record signals only/i);
    });

    it("does NOT use over-confident phrasing in the new copy ('full coverage' / 'complete' / 'guaranteed' / 'real-time')", () => {
      useManagerDataMock.mockReturnValue(
        ready([
          deal({
            id: 'h1',
            name: 'High Acme',
            targetCloseDate: isoDaysFromNow(5),
            modifiedOn: isoDaysAgo(20),
          }),
        ]),
      );
      const { container } = render(<ManagerAutopilotRollup />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/\bfull\s+coverage\b/i);
      expect(text).not.toMatch(/\bcomplete\s+insight\b/i);
      expect(text).not.toMatch(/\bguaranteed\b/i);
      expect(text).not.toMatch(/\breal[- ]?time\b/i);
      expect(text).not.toMatch(/\bautomated\s+intervention\b/i);
      expect(text).not.toMatch(/\bofficial\s+score\b/i);
    });
  });
});
