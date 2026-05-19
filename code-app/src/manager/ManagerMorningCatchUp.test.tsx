// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ManagerData } from './ManagerDataProvider';
import type {
  TeamDeal,
  TeamScopedDocument,
  TeamScopedMemo,
  TeamScopedMemoSection,
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

vi.mock('./ManagerBankerFilter', async () => {
  const actual = await vi.importActual<typeof import('./ManagerBankerFilter')>(
    './ManagerBankerFilter',
  );
  return {
    ...actual,
    useManagerBankerFilter: vi.fn(),
  };
});

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { useManagerData } from './ManagerDataProvider';
import { useManager } from './ManagerContext';
import {
  dealMatchesBankerFilter,
  selectionLabel as computeSelectionLabel,
  useManagerBankerFilter,
  type ManagerBankerFilterSelection,
  type ManagerBankerFilterView,
} from './ManagerBankerFilter';
import { ManagerMorningCatchUp } from './ManagerMorningCatchUp';
import {
  CATCH_UP_LAST_SEEN_STORAGE_KEY_PREFIX,
  setCatchUpLastSeenMs,
} from '../shared/lastVisit/catchUpLastSeen';
import {
  CATCH_UP_ITEM_LEDGER_STORAGE_KEY,
  recordCatchUpItemDismissed,
  recordCatchUpItemSnoozed,
} from '../shared/activity/catchUpItemLedger';

const useManagerDataMock = vi.mocked(useManagerData);
const useManagerMock = vi.mocked(useManager);
const useManagerBankerFilterMock = vi.mocked(useManagerBankerFilter);

function filterView(
  selection: ManagerBankerFilterSelection = { kind: 'all' },
): ManagerBankerFilterView {
  return {
    selection,
    setSelection: vi.fn(),
    options: [],
    matchesDeal: (deal) => dealMatchesBankerFilter(deal, selection),
    selectionLabel: computeSelectionLabel(selection),
    isPreferenceScoped: false,
  };
}

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
    collateralSummary: undefined,
    ...overrides,
  };
}

function ready(
  deals: TeamDeal[],
  tasks: TeamScopedTask[] = [],
  documents: TeamScopedDocument[] = [],
  memos: TeamScopedMemo[] = [],
  memoSections: TeamScopedMemoSection[] = [],
): ManagerData {
  return {
    teamPipeline: { kind: 'ready', data: deals },
    teamBankers: { kind: 'ready', data: [] },
    teamTasks: { kind: 'ready', data: tasks },
    teamDocuments: { kind: 'ready', data: documents },
    teamMemos: { kind: 'ready', data: memos },
    teamMemoSections: { kind: 'ready', data: memoSections },
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
  // Phase 92: default to "all team" so every Phase 88/90/91 test
  // continues to see the same data set it was authored against.
  useManagerBankerFilterMock.mockReturnValue(filterView({ kind: 'all' }));
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
      teamMemoSections: { kind: 'ready', data: [] },
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
      teamMemoSections: { kind: 'ready', data: [] },
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
      teamMemoSections: { kind: 'ready', data: [] },
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
      teamMemoSections: { kind: 'ready', data: [] },
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
      textPreview: undefined,
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

  // -----------------------------------------------------------------
  // Phase 91 — local catch-up item ledger (dismiss / snooze / restore)
  // -----------------------------------------------------------------

  describe('Phase 91 — local catch-up item ledger', () => {
    function readyWithOverdue(): ReturnType<typeof ready> {
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
      return ready([deal({ id: 'd-1', name: 'Hot Deal' })], [taskRow]);
    }

    it('renders Dismiss locally + Snooze 24h buttons on non-dismissed items', () => {
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByRole('button', {
          name: /Dismiss catch-up item for Hot Deal locally/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Snooze catch-up item for Hot Deal 24 hours locally/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking Dismiss locally marks the row dismissed + reveals a Restore button', async () => {
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss catch-up item for Hot Deal locally/i,
        }),
      );
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Restore catch-up item for Hot Deal/i,
        }),
      ).toBeInTheDocument();
    });

    it('clicking Restore brings back the Dismiss/Snooze controls', async () => {
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss catch-up item for Hot Deal locally/i,
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: /Restore catch-up item for Hot Deal/i,
        }),
      );
      expect(
        screen.getByRole('button', {
          name: /Dismiss catch-up item for Hot Deal locally/i,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Dismissed locally/i)).toBeNull();
    });

    it('clicking Snooze 24h hides the item from the visible feed', async () => {
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Snooze catch-up item for Hot Deal 24 hours locally/i,
        }),
      );
      expect(
        screen.getByText(/No catch-up items from current records/i),
      ).toBeInTheDocument();
    });

    it('rehydrates a pre-existing dismissed entry from localStorage on mount', () => {
      recordCatchUpItemDismissed({
        surface: 'manager-catch-up',
        itemKey: 'overdue-task:d-1:t1',
        itemKind: 'overdue-task',
        dealId: 'd-1',
        titleSnapshot: 'Overdue task',
        now: new Date('2026-05-17T10:00:00Z'),
      });
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      expect(screen.getByText(/Dismissed locally/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Restore catch-up item for Hot Deal/i,
        }),
      ).toBeInTheDocument();
    });

    it('rehydrates a pre-existing active snooze from localStorage (hides the item)', () => {
      const futureUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      recordCatchUpItemSnoozed({
        surface: 'manager-catch-up',
        itemKey: 'overdue-task:d-1:t1',
        itemKind: 'overdue-task',
        dealId: 'd-1',
        now: new Date(),
        snoozeUntil: futureUntil,
      });
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(/No catch-up items from current records/i),
      ).toBeInTheDocument();
    });

    it('the disclaimer states local-only tracking + does-not-change-deal-status invariant', () => {
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(
          /"Dismiss locally" and "Snooze locally" are tracked on this browser only/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/they do not change deal status/i),
      ).toBeInTheDocument();
    });

    it('the ledger row never says resolved / completed / closed / acknowledged / workflow-updated', async () => {
      useManagerDataMock.mockReturnValue(readyWithOverdue());
      render(<ManagerMorningCatchUp />);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Dismiss catch-up item for Hot Deal locally/i,
        }),
      );
      const body = document.body.textContent ?? '';
      expect(body).not.toMatch(/\b(is|was|has been|will be)\s+resolved\b/i);
      expect(body).not.toMatch(/\b(is|was|has been|will be)\s+completed\b/i);
      expect(body).not.toMatch(/\b(is|was|has been|will be)\s+closed\b/i);
      expect(body).not.toMatch(/\backnowledged\b/i);
      expect(body).not.toMatch(/\bworkflow\s+updated\b/i);
      expect(body).not.toMatch(/\bsystem\s+handled\b/i);
    });

    it('the ledger storage key is `cc:catchUpItemLedger:v1` (disjoint from Phase 83)', () => {
      expect(CATCH_UP_ITEM_LEDGER_STORAGE_KEY).toBe('cc:catchUpItemLedger:v1');
    });
  });

  // -----------------------------------------------------------------
  // Phase 92 — per-banker filter
  // -----------------------------------------------------------------

  describe('Phase 92 — per-banker filter', () => {
    function twoBankerDeals() {
      return [
        deal({
          id: 'd-alice',
          name: 'Alice Deal',
          assignedBankerId: 'b-alice',
          assignedBankerName: 'Alice',
          stageEntryDate: isoDaysAgo(45),
        }),
        deal({
          id: 'd-bob',
          name: 'Bob Deal',
          assignedBankerId: 'b-bob',
          assignedBankerName: 'Bob',
          stageEntryDate: isoDaysAgo(45),
        }),
      ];
    }

    it('default "all" view shows catch-up items for every banker', () => {
      useManagerDataMock.mockReturnValue(ready(twoBankerDeals()));
      render(<ManagerMorningCatchUp />);
      const list = screen.getByRole('list', {
        name: /Manager morning catch-up items/i,
      });
      const items = within(list).getAllByRole('listitem');
      expect(items.length).toBe(2);
      expect(screen.queryByText(/^Filtered to /i)).toBeNull();
    });

    it('filtering to one banker hides the other banker\'s items', () => {
      useManagerDataMock.mockReturnValue(ready(twoBankerDeals()));
      useManagerBankerFilterMock.mockReturnValue(
        filterView({ kind: 'banker', id: 'b-alice', name: 'Alice' }),
      );
      render(<ManagerMorningCatchUp />);
      const list = screen.getByRole('list', {
        name: /Manager morning catch-up items/i,
      });
      const items = within(list).getAllByRole('listitem');
      expect(items.length).toBe(1);
      expect(items[0]!.textContent).toContain('Alice Deal');
      expect(items[0]!.textContent).not.toContain('Bob Deal');
    });

    it('renders the "Filtered to <Banker>" tag in the header when filtered', () => {
      useManagerDataMock.mockReturnValue(ready(twoBankerDeals()));
      useManagerBankerFilterMock.mockReturnValue(
        filterView({ kind: 'banker', id: 'b-alice', name: 'Alice' }),
      );
      render(<ManagerMorningCatchUp />);
      expect(screen.getByText(/Filtered to Alice/i)).toBeInTheDocument();
    });

    it('renders a filter-aware empty state ("No catch-up items for X") when no items survive', () => {
      useManagerDataMock.mockReturnValue(ready(twoBankerDeals()));
      useManagerBankerFilterMock.mockReturnValue(
        filterView({
          kind: 'banker',
          id: 'b-nobody',
          name: 'Phantom Banker',
        }),
      );
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(
          /No catch-up items for Phantom Banker from current records\./i,
        ),
      ).toBeInTheDocument();
    });

    it('child rows are filtered to the visible deal universe', () => {
      const aliceTask: TeamScopedTask = {
        id: 't-alice',
        title: 'Send Q2 financials',
        completed: false,
        dueDate: isoDaysAgo(2),
        assigneeName: undefined,
        modifiedOn: undefined,
        dealId: 'd-alice',
        dealName: 'Alice Deal',
      };
      const bobTask: TeamScopedTask = {
        id: 't-bob',
        title: 'Send Q3 financials',
        completed: false,
        dueDate: isoDaysAgo(2),
        assigneeName: undefined,
        modifiedOn: undefined,
        dealId: 'd-bob',
        dealName: 'Bob Deal',
      };
      useManagerDataMock.mockReturnValue(
        ready(twoBankerDeals(), [aliceTask, bobTask]),
      );
      useManagerBankerFilterMock.mockReturnValue(
        filterView({ kind: 'banker', id: 'b-bob', name: 'Bob' }),
      );
      render(<ManagerMorningCatchUp />);
      const list = screen.getByRole('list', {
        name: /Manager morning catch-up items/i,
      });
      const text =
        within(list).getAllByRole('listitem').map((i) => i.textContent).join('|') ?? '';
      // Bob's overdue-task surfaces; Alice's never reaches the
      // derivation.
      expect(text).toContain('Bob Deal');
      expect(text).not.toContain('Alice Deal');
    });

    it('the filter tag never uses forbidden vocabulary', () => {
      useManagerDataMock.mockReturnValue(ready(twoBankerDeals()));
      useManagerBankerFilterMock.mockReturnValue(
        filterView({ kind: 'banker', id: 'b-alice', name: 'Alice' }),
      );
      const { container } = render(<ManagerMorningCatchUp />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/official\s+(assignment|view)/i);
      expect(text).not.toMatch(/performance\s+ranking/i);
      expect(text).not.toMatch(/underperforming/i);
      expect(text).not.toMatch(/surveillance/i);
      expect(text).not.toMatch(/audit\s+view/i);
    });
  });

  // -----------------------------------------------------------------
  // Phase 94 — Mark all seen affordance
  // -----------------------------------------------------------------

  describe('Phase 94 — Mark all seen', () => {
    function dataWithOverdueTask() {
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
      return ready([deal({ id: 'd-1', name: 'Hot Deal' })], [taskRow]);
    }

    it('does NOT render when newCount===0 (no new items)', () => {
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 1 * 24 * 60 * 60 * 1000, // marker fresher than the task anchor
      );
      useManagerDataMock.mockReturnValue(dataWithOverdueTask());
      render(<ManagerMorningCatchUp />);
      expect(
        screen.queryByRole('button', {
          name: /Mark all catch-up items seen on this browser/i,
        }),
      ).toBeNull();
    });

    it('does NOT render on first visit (no prior marker)', () => {
      useManagerDataMock.mockReturnValue(dataWithOverdueTask());
      render(<ManagerMorningCatchUp />);
      expect(
        screen.queryByRole('button', {
          name: /Mark all catch-up items seen on this browser/i,
        }),
      ).toBeNull();
    });

    it('does NOT render when scope is unscoped (no teamId)', () => {
      useManagerMock.mockReturnValue({
        bankerId: 'manager-banker-1',
        fullName: 'M. Manager',
        email: 'mgr@bank.test',
        teamId: '',
        teamName: '',
      });
      useManagerDataMock.mockReturnValue(dataWithOverdueTask());
      render(<ManagerMorningCatchUp />);
      expect(
        screen.queryByRole('button', {
          name: /Mark all catch-up items seen on this browser/i,
        }),
      ).toBeNull();
    });

    it('renders when there are new items + scope is available', () => {
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      );
      useManagerDataMock.mockReturnValue(dataWithOverdueTask());
      render(<ManagerMorningCatchUp />);
      const btn = screen.getByRole('button', {
        name: /Mark all catch-up items seen on this browser/i,
      });
      expect(btn.textContent).toBe('Mark all seen');
      expect(
        screen.getByText(/Clears local new-item markers only/i),
      ).toBeInTheDocument();
    });

    it('clicking clears the "N new" count line + "New" badges immediately', async () => {
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      );
      useManagerDataMock.mockReturnValue(dataWithOverdueTask());
      render(<ManagerMorningCatchUp />);
      expect(
        screen.getByText(/1 new since your last visit on this browser/i),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/New since your last visit on this browser/i),
      ).toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Mark all catch-up items seen on this browser/i,
        }),
      );
      expect(
        screen.getByText(/No new items since your last visit on this browser/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/New since your last visit on this browser/i),
      ).toBeNull();
      expect(
        screen.queryByRole('button', {
          name: /Mark all catch-up items seen on this browser/i,
        }),
      ).toBeNull();
    });

    it('persists the new marker to localStorage on click', async () => {
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      );
      useManagerDataMock.mockReturnValue(dataWithOverdueTask());
      render(<ManagerMorningCatchUp />);
      const before = Date.now();
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', {
          name: /Mark all catch-up items seen on this browser/i,
        }),
      );
      const raw = localStorage.getItem(
        'cc:lastVisit:catchUp:manager:manager-banker-1:team-1',
      );
      expect(raw).not.toBeNull();
      expect(Number(raw)).toBeGreaterThanOrEqual(before);
    });

    it('the Mark-all-seen row never uses forbidden vocabulary', () => {
      setCatchUpLastSeenMs(
        'manager:manager-banker-1:team-1',
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      );
      useManagerDataMock.mockReturnValue(dataWithOverdueTask());
      const { container } = render(<ManagerMorningCatchUp />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/\bunread\b/i);
      expect(text).not.toMatch(/\backnowledged\b/i);
      expect(text).not.toMatch(/\bresolved\b/i);
      expect(text).not.toMatch(/\b(is|was|has been|will be)\s+completed\b/i);
      expect(text).not.toMatch(/\bofficial\s+(record|state|status|read)\b/i);
      expect(text).not.toMatch(/\bworkflow\s+updated\b/i);
      expect(text).not.toMatch(/\bnotification\s+cleared\b/i);
      expect(text).not.toMatch(/\b(is|was|has been)\s+synced\b/i);
      expect(text).not.toMatch(/\bmarked\s+as\s+read\b/i);
    });
  });
});
