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
 * Phase 88 — ManagerMorningCatchUp card tests.
 *
 * Pins:
 *   - card header + verbatim subtitle ("Derived from current
 *     manager-visible records. Nothing happens automatically.");
 *   - loading + failed (role=alert) + no-items empty states;
 *   - populated state renders priority badge + deal-name button +
 *     reason + banker / source meta;
 *   - clicking the deal-name navigates;
 *   - empty state copy + populated disclaimer include verbatim
 *     "Not AI-generated.";
 *   - rendered DOM never contains forbidden vocabulary
 *     (AI-generated as a positive claim is the disclaimer's negation
 *     — must NOT appear as an affirmative; we still scan for
 *     "AI detected", "system decided", "critical breach",
 *     "guaranteed", "noncompliant", "official alert", "real-time",
 *     "automatically" affirmative forms, and "failed" as a positive
 *     claim about a record).
 */

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
}));

vi.mock('./ManagerContext', () => ({
  useManager: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { useManagerData } from './ManagerDataProvider';
import { useManager } from './ManagerContext';
import { ManagerMorningCatchUp } from './ManagerMorningCatchUp';
import {
  CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX,
  setCatchUpLastSeenMs,
} from '../shared/lastVisit/catchUpLastSeen';

const useManagerDataMock = vi.mocked(useManagerData);
const useManagerMock = vi.mocked(useManager);

const NOW = new Date();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(overrides: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-1',
    name: 'Sample Deal',
    clientName: 'Sample Co',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(5),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'b-1',
    assignedBankerName: 'M. Paller',
    ...overrides,
  };
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useManagerMock.mockReturnValue({
    bankerId: 'manager-banker-1',
    fullName: 'M. Manager',
    email: 'mgr@bank.test',
    teamId: 'team-1',
    teamName: 'Acme Team',
  });
});

describe('ManagerMorningCatchUp — Phase 88', () => {
  it('renders the card header + verbatim subtitle', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    render(<ManagerMorningCatchUp />);
    expect(
      screen.getByRole('heading', { name: /morning catch-up/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Derived from current manager-visible records\. Nothing happens automatically\./i,
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
    render(<ManagerMorningCatchUp />);
    expect(screen.getByText(/Loading catch-up/i)).toBeInTheDocument();
  });

  it('renders the loading state when any child-data slot is non-ready', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'ready', data: [deal()] },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
    });
    render(<ManagerMorningCatchUp />);
    expect(screen.getByText(/Loading catch-up/i)).toBeInTheDocument();
  });

  it('renders the failed state via role="alert" when teamPipeline fails', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'failed', message: 'service unavailable' },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'ready', data: [] },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
    });
    render(<ManagerMorningCatchUp />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/Could not load catch-up/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders the failed state when a child-data slot fails', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'ready', data: [deal()] },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'failed', message: 'tasks service unavailable' },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
    });
    render(<ManagerMorningCatchUp />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/tasks service unavailable/i),
    ).toBeInTheDocument();
  });

  it('renders the empty state with the verbatim no-items copy + Not AI-generated disclaimer', () => {
    // One quiet deal — derivation surfaces no items.
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerMorningCatchUp />);
    expect(
      screen.getByText(/No catch-up items from current records\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Not AI-generated\./i)).toBeInTheDocument();
  });

  it('empty-state copy never says "all clear" / "no risk" / "pipeline healthy" / "real-time"', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerMorningCatchUp />);
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\ball\s+clear\b/i);
    expect(body).not.toMatch(/\bno\s+risk\b/i);
    expect(body).not.toMatch(/\bpipeline\s+healthy\b/i);
    expect(body).not.toMatch(/\beverything\s+is\s+fine\b/i);
    expect(body).not.toMatch(/\breal[- ]?time\b/i);
  });

  it('renders an overdue-task item as a high-priority row with the deal name + banker meta', () => {
    const task: TeamScopedTask = {
      id: 't1',
      title: 'Send Q2 financials',
      completed: false,
      dueDate: isoDaysAgo(2),
      assigneeName: undefined,
      modifiedOn: undefined,
      dealId: 'd-1',
      dealName: 'Hot Deal',
    };
    useManagerDataMock.mockReturnValue(
      ready([deal({ id: 'd-1', name: 'Hot Deal', assignedBankerName: 'B. One' })], [task]),
    );
    render(<ManagerMorningCatchUp />);
    const list = screen.getByRole('list', {
      name: /Manager morning catch-up items/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('Hot Deal');
    expect(items[0]!.textContent).toContain('Overdue task');
    expect(items[0]!.textContent).toContain('B. One');
    expect(items[0]!.textContent).toContain('task'); // source label
    // High priority badge.
    expect(
      within(items[0]!).getByLabelText(/High priority/i),
    ).toBeInTheDocument();
  });

  it('renders multiple items per deal when multiple kinds fire', () => {
    const task: TeamScopedTask = {
      id: 't1',
      title: 'Send Q2 financials',
      completed: false,
      dueDate: isoDaysAgo(2),
      assigneeName: undefined,
      modifiedOn: undefined,
      dealId: 'd-1',
      dealName: 'Multi Deal',
    };
    const memo: TeamScopedMemo = {
      id: 'm1',
      name: 'Draft memo',
      statusKey: 'draft',
      generatedAt: isoDaysAgo(2),
      modifiedOn: undefined,
      dealId: 'd-1',
      dealName: 'Multi Deal',
    };
    useManagerDataMock.mockReturnValue(
      ready(
        [
          deal({
            id: 'd-1',
            name: 'Multi Deal',
            stageEntryDate: isoDaysAgo(45), // stage-aging
          }),
        ],
        [task],
        [],
        [memo],
      ),
    );
    render(<ManagerMorningCatchUp />);
    const list = screen.getByRole('list', {
      name: /Manager morning catch-up items/i,
    });
    const items = within(list).getAllByRole('listitem');
    // 3 items (overdue-task HIGH, stage-aging MED, draft-memo LOW)
    expect(items.length).toBe(3);
  });

  it('clicking the deal-name button navigates to /deals/<id>', async () => {
    const task: TeamScopedTask = {
      id: 't1',
      title: 'Send Q2 financials',
      completed: false,
      dueDate: isoDaysAgo(2),
      assigneeName: undefined,
      modifiedOn: undefined,
      dealId: 'd-target',
      dealName: 'Target Deal',
    };
    useManagerDataMock.mockReturnValue(
      ready([deal({ id: 'd-target', name: 'Target Deal' })], [task]),
    );
    render(<ManagerMorningCatchUp />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /Open deal Target Deal/i }),
    );
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
  });

  it('caps the rendered feed at 8 items (TOP_N_CATCH_UP_ITEMS)', () => {
    const deals: TeamDeal[] = [];
    const tasks: TeamScopedTask[] = [];
    for (let i = 0; i < 12; i++) {
      const id = `d-${i}`;
      deals.push(deal({ id, name: `Deal ${String.fromCharCode(65 + i)}` }));
      tasks.push({
        id: `t-${i}`,
        title: `Task ${i}`,
        completed: false,
        dueDate: isoDaysAgo(i + 1),
        assigneeName: undefined,
        modifiedOn: undefined,
        dealId: id,
        dealName: `Deal ${String.fromCharCode(65 + i)}`,
      });
    }
    useManagerDataMock.mockReturnValue(ready(deals, tasks));
    render(<ManagerMorningCatchUp />);
    const list = screen.getByRole('list', {
      name: /Manager morning catch-up items/i,
    });
    expect(within(list).getAllByRole('listitem').length).toBe(8);
  });

  it('surfaces missing-stage and missing-assigned-banker data-quality items', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'd-dq',
          name: 'Data Quality Deal',
          stage: undefined,
          assignedBankerName: undefined,
        }),
      ]),
    );
    render(<ManagerMorningCatchUp />);
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/Stage not set/i);
    expect(body).toMatch(/No assigned banker/i);
  });

  it("renders 'Not AI-generated' in the populated-state disclaimer", () => {
    const task: TeamScopedTask = {
      id: 't1',
      title: 'X',
      completed: false,
      dueDate: isoDaysAgo(2),
      assigneeName: undefined,
      modifiedOn: undefined,
      dealId: 'd-1',
      dealName: 'D',
    };
    useManagerDataMock.mockReturnValue(ready([deal()], [task]));
    render(<ManagerMorningCatchUp />);
    expect(screen.getByText(/Not AI-generated\./i)).toBeInTheDocument();
  });

  it('rendered DOM never contains forbidden vocabulary as a positive claim', () => {
    const task: TeamScopedTask = {
      id: 't1',
      title: 'X',
      completed: false,
      dueDate: isoDaysAgo(2),
      assigneeName: undefined,
      modifiedOn: undefined,
      dealId: 'd-1',
      dealName: 'D',
    };
    useManagerDataMock.mockReturnValue(ready([deal()], [task]));
    const { container } = render(<ManagerMorningCatchUp />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?detected\b/i);
    expect(text).not.toMatch(/\bsystem\s+decided\b/i);
    expect(text).not.toMatch(/\bcritical\s+breach\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bnoncompliant\b/i);
    expect(text).not.toMatch(/\bofficial\s+alert\b/i);
    expect(text).not.toMatch(/\breal[- ]?time\b/i);
    expect(text).not.toMatch(/\bautopilot\s+executed\b/i);
    expect(text).not.toMatch(
      /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
    );
    // "failed" must not appear as a positive claim about a record
    // (the disclaimer doesn't use it; the card body doesn't either).
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+failed\b/i);
    // "decisioned" — explicit overclaim term forbidden across all
    // autopilot/activity-intelligence surfaces.
    expect(text).not.toMatch(/\bdecisioned\b/i);
  });

  // -----------------------------------------------------------------
  // Phase 90 — local last-seen marker overlay
  // -----------------------------------------------------------------

  describe('Phase 90 — since-last-visit overlay', () => {
    function dealWithStageAging(): TeamDeal {
      return deal({
        id: 'd-1',
        name: 'Aging Deal',
        stageEntryDate: isoDaysAgo(45),
      });
    }

    it('first visit (no prior marker) shows "First visit on this browser" copy', () => {
      useManagerDataMock.mockReturnValue(ready([dealWithStageAging()]));
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(/First visit on this browser/i),
      ).toBeInTheDocument();
    });

    it('returning visit with no new items shows the "No new items since your last visit" line', () => {
      // Marker fresher than the only item's anchor (45d ago).
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      );
      useManagerDataMock.mockReturnValue(ready([dealWithStageAging()]));
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(/No new items since your last visit on this browser/i),
      ).toBeInTheDocument();
    });

    it('returning visit with new items shows the count line + per-item "New" badge', () => {
      // Marker 7d ago; overdue-task anchor 2d ago → new.
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      );
      const taskRow: TeamScopedTask = {
        id: 't1',
        title: 'Send Q2 financials',
        completed: false,
        dueDate: isoDaysAgo(2),
        assigneeName: undefined,
        modifiedOn: undefined,
        dealId: 'd-1',
        dealName: 'Hot Deal',
      };
      useManagerDataMock.mockReturnValue(
        ready([deal({ id: 'd-1', name: 'Hot Deal' })], [taskRow]),
      );
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(/1 new since your last visit on this browser/i),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/New since your last visit on this browser/i),
      ).toBeInTheDocument();
    });

    it('does NOT render a "New" badge on items older than the prior marker', () => {
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      );
      useManagerDataMock.mockReturnValue(ready([dealWithStageAging()]));
      render(<ManagerMorningCatchUp />);
      expect(
        screen.queryByLabelText(/New since your last visit on this browser/i),
      ).toBeNull();
    });

    it('falls back to "Last-seen marker unavailable" when the manager has no teamId', () => {
      useManagerMock.mockReturnValue({
        bankerId: 'manager-banker-1',
        fullName: 'M. Manager',
        email: 'mgr@bank.test',
        teamId: '',
        teamName: '',
      });
      useManagerDataMock.mockReturnValue(ready([]));
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(/Last-seen marker unavailable for this browser/i),
      ).toBeInTheDocument();
    });

    it('manager scope uses the team-scoped storage key (manager:<bankerId>:<teamId>)', () => {
      // Pre-seed under the correct manager+team key and a different
      // key; verify the right marker is consumed.
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      );
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-2',
        Date.now() - 100 * 24 * 60 * 60 * 1000,
      );
      useManagerDataMock.mockReturnValue(ready([dealWithStageAging()]));
      render(<ManagerMorningCatchUp />);
      // The team-1 marker is 1d ago → "no new" copy.
      expect(
        screen.getByText(/No new items since your last visit on this browser/i),
      ).toBeInTheDocument();
      // Verify the prefix constant is the one Phase 90 ships.
      expect(CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX).toBe(
        'cc:lastVisit:catchUp:',
      );
    });

    it('the since-last-visit line never uses notification / sync / pushed / official-record vocabulary', () => {
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      );
      const taskRow: TeamScopedTask = {
        id: 't1',
        title: 'X',
        completed: false,
        dueDate: isoDaysAgo(2),
        assigneeName: undefined,
        modifiedOn: undefined,
        dealId: 'd-1',
        dealName: 'D',
      };
      useManagerDataMock.mockReturnValue(
        ready([deal({ id: 'd-1', name: 'D' })], [taskRow]),
      );
      const { container } = render(<ManagerMorningCatchUp />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/\bunread\b/i);
      expect(text).not.toMatch(/\bnotification\b/i);
      expect(text).not.toMatch(
        /\b(is|was|has been)\s+(synced|pushed|delivered)\b/i,
      );
      expect(text).not.toMatch(/\bofficial\s+(record|state|status)\b/i);
      expect(text).not.toMatch(/\breal[- ]?time\b/i);
    });
  });
});
