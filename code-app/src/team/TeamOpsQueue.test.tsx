// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type {
  TeamDealRow,
  TeamTaskRow,
  TeamDocumentRow,
} from './teamQueries';
import type { AsyncResult, TeamData } from './TeamDataProvider';

/**
 * Phase 127A — TeamOpsQueue integration tests.
 *
 * Pins:
 *   - cockpit shell + read-only chip + subtitle;
 *   - waits for ALL three core data slots before rendering aggregates;
 *   - fails closed with explicit copy when any slot reports failed;
 *   - honest empty state with zero authorized deals;
 *   - KPI ribbon labels honest;
 *   - lanes section + execution board both render drill-down Links
 *     to /deals/<id>;
 *   - static-source: imports the shared CommandChartPrimitives (not
 *     manager); no banker write surface; no <button>/<form>/onClick/
 *     onSubmit.
 */

const { useTeamDataMock } = vi.hoisted(() => ({ useTeamDataMock: vi.fn() }));

vi.mock('./TeamDataProvider', () => ({
  useTeamData: useTeamDataMock,
}));

import { TeamOpsQueue } from './TeamOpsQueue';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-03T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(over: Partial<TeamDealRow> = {}): TeamDealRow {
  return {
    id: 'd-default',
    name: 'Default deal',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(45),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'banker-a',
    assignedBankerName: 'Banker A',
    collateralSummary: undefined,
    ...over,
  };
}

function task(over: Partial<TeamTaskRow> = {}): TeamTaskRow {
  return {
    id: 't-default',
    title: 'Default task',
    completed: false,
    dueDate: isoDaysFromNow(3),
    assigneeName: undefined,
    modifiedOn: undefined,
    dealId: 'd-default',
    dealName: 'Default deal',
    ...over,
  };
}

function doc(over: Partial<TeamDocumentRow> = {}): TeamDocumentRow {
  return {
    id: 'doc-default',
    name: 'Default doc',
    dueDate: isoDaysFromNow(5),
    requestDate: isoDaysAgo(2),
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
    dealId: 'd-default',
    dealName: 'Default deal',
    ...over,
  };
}

function ready<T>(data: T): AsyncResult<T> {
  return { kind: 'ready', data };
}

function setData(over: Partial<TeamData> = {}) {
  const data: TeamData = {
    deals: { kind: 'loading' },
    tasks: { kind: 'loading' },
    documents: { kind: 'loading' },
    memos: { kind: 'loading' },
    memoSections: { kind: 'loading' },
    ...over,
  };
  useTeamDataMock.mockReturnValue(data);
}

function setAllReady(opts: {
  deals?: TeamDealRow[];
  tasks?: TeamTaskRow[];
  documents?: TeamDocumentRow[];
} = {}) {
  setData({
    deals: ready(opts.deals ?? []),
    tasks: ready(opts.tasks ?? []),
    documents: ready(opts.documents ?? []),
    memos: ready([]),
    memoSections: ready([]),
  });
}

function renderCockpit() {
  return render(
    <MemoryRouter>
      <TeamOpsQueue />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTeamDataMock.mockReset();
});

// ---------------------------------------------------------------------------
// Shell / loading / failure / empty
// ---------------------------------------------------------------------------

describe('Phase 127A — cockpit shell + loading + failure + empty', () => {
  it('renders the cockpit shell with title, subtitle, and read-only chip', () => {
    setAllReady({ deals: [deal()] });
    renderCockpit();
    expect(
      screen.getByRole('region', { name: /Team Ops Queue/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Team Ops Queue/i, level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/What must be worked today/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Read-only team view')).toBeInTheDocument();
  });

  it('waits for ALL three core data slots before rendering aggregates', () => {
    setData({
      deals: ready([deal()]),
      tasks: { kind: 'loading' },
      documents: { kind: 'loading' },
    });
    renderCockpit();
    expect(screen.getByText(/Loading authorized team queue/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Team command ribbon')).not.toBeInTheDocument();
  });

  it('fails closed with explicit "failing closed" copy on any failed slot', () => {
    setData({
      deals: ready([deal()]),
      tasks: { kind: 'failed', message: 'OData 5xx' },
      documents: ready([]),
    });
    renderCockpit();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Could not load team tasks/i);
    expect(alert).toHaveTextContent(/failing closed/i);
    expect(alert).toHaveTextContent(/no partial KPIs/i);
    expect(screen.queryByLabelText('Team command ribbon')).not.toBeInTheDocument();
  });

  it('renders honest empty state when zero authorized deals exist', () => {
    setAllReady({ deals: [] });
    renderCockpit();
    expect(
      screen.getByText(/No authorized team records found\./i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// KPI ribbon
// ---------------------------------------------------------------------------

describe('Phase 127A — KPI ribbon', () => {
  it('renders the 10-tile command ribbon with honest labels', () => {
    setAllReady({
      deals: [deal({ id: 'd1' })],
      tasks: [
        task({ id: 't1', dealId: 'd1', dueDate: isoDaysAgo(2) }), // overdue
      ],
      documents: [
        doc({ id: 'doc1', dealId: 'd1', status: 'outstanding' }),
      ],
    });
    renderCockpit();
    const ribbon = screen.getByLabelText('Team command ribbon');
    expect(within(ribbon).getByLabelText(/1 active deals/)).toBeInTheDocument();
    expect(within(ribbon).getByLabelText(/1 overdue tasks/)).toBeInTheDocument();
    expect(
      within(ribbon).getByLabelText(/1 outstanding documents/),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Lanes + execution board
// ---------------------------------------------------------------------------

describe('Phase 127A — lanes + execution board', () => {
  it('renders each lane drill-down as a Link to /deals/<id>', () => {
    setAllReady({
      deals: [
        deal({ id: 'd-blocked', name: 'BlockedDeal', targetCloseDate: isoDaysAgo(15) }),
      ],
    });
    renderCockpit();
    // Lanes section
    const lanes = screen.getByLabelText('Work queue lanes');
    const lane = within(lanes).getByLabelText('Blocked / at-risk lane');
    const link = within(lane).getByLabelText(
      'Open BlockedDeal in the deal workspace',
    );
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/deals/d-blocked');
  });

  it('execution board sorts blocked > at-risk > info', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd-blocked',
          name: 'BlockedDeal',
          targetCloseDate: isoDaysAgo(15),
        }),
        deal({
          id: 'd-due-soon',
          name: 'DueSoonDeal',
          targetCloseDate: isoDaysFromNow(5),
        }),
      ],
      tasks: [
        task({
          id: 't-overdue',
          title: 'OverdueTask',
          dealId: 'd-due-soon',
          dueDate: isoDaysAgo(3),
        }),
      ],
    });
    renderCockpit();
    const board = screen.getByLabelText('Execution board');
    // First execution row should be BlockedDeal (severity 'blocked').
    const firstRow = within(board).getAllByRole('listitem')[0];
    expect(firstRow).toHaveTextContent(/BlockedDeal/);
  });

  it('renders honest "Queue clear" copy when nothing is actionable', () => {
    setAllReady({
      deals: [deal({ id: 'd-clean' })],
    });
    renderCockpit();
    expect(
      screen.getByText(/Queue clear — nothing to action right now\./i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Banker workload matrix
// ---------------------------------------------------------------------------

describe('Phase 127A — banker workload matrix', () => {
  it('renders a row per banker', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd1',
          assignedBankerId: 'b-a',
          assignedBankerName: 'Alice',
        }),
        deal({
          id: 'd2',
          assignedBankerId: 'b-b',
          assignedBankerName: 'Bob',
        }),
      ],
    });
    renderCockpit();
    const workload = screen.getByLabelText('Banker workload matrix');
    expect(within(workload).getByText('Alice')).toBeInTheDocument();
    expect(within(workload).getByText('Bob')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Analytics row
// ---------------------------------------------------------------------------

describe('Phase 127A — analytics row', () => {
  it('renders the analytics row with the 5 chart cards', () => {
    setAllReady({
      deals: [deal({ id: 'd1', targetCloseDate: isoDaysAgo(10) })],
    });
    renderCockpit();
    const grid = screen.getByLabelText('Team analytics row');
    expect(within(grid).getByText(/Work items by type/i)).toBeInTheDocument();
    expect(
      within(grid).getByText(/Overdue tasks by banker/i),
    ).toBeInTheDocument();
    expect(
      within(grid).getByText(/Outstanding docs by banker/i),
    ).toBeInTheDocument();
    expect(within(grid).getByText(/Risk distribution/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Closings forecast/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 127C — execution board polish (banker labels, stage/status, badges)
// ---------------------------------------------------------------------------

describe('Phase 127C — execution board renders hydrated client/stage/status/banker', () => {
  it('renders the stage label on each execution board row when present on the deal', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd-stage',
          name: 'StagedDeal',
          stage: 'Underwriting',
          status: 'Active',
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    renderCockpit();
    const board = screen.getByLabelText('Execution board');
    expect(within(board).getByText('Underwriting')).toBeInTheDocument();
    expect(within(board).getByText('Active')).toBeInTheDocument();
  });

  it('renders the hydrated banker name (not the GUID) in banker workload + execution board', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd-banker',
          name: 'BankerDeal',
          assignedBankerId: 'banker-real',
          assignedBankerName: 'Alice Realname',
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    renderCockpit();
    expect(screen.getAllByText('Alice Realname').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('banker-real')).toBeNull();
  });

  it('renders "Unknown banker" rather than the raw GUID when the banker FK did not hydrate', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd-bare',
          name: 'BareDeal',
          assignedBankerId: 'banker-guid-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          assignedBankerName: undefined,
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    renderCockpit();
    expect(screen.getAllByText('Unknown banker').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByText(/banker-guid-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/),
    ).toBeNull();
  });

  it('keeps "Unassigned" when no banker FK is set (distinct from "Unknown banker")', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd-unassigned',
          name: 'UnassignedDeal',
          assignedBankerId: undefined,
          assignedBankerName: undefined,
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    renderCockpit();
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThanOrEqual(1);
  });

  it('renders honest absence ("Stage not set", "Status not set") when the source deal has no value', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd-no-meta',
          name: 'NoMetaDeal',
          stage: undefined,
          status: undefined,
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    renderCockpit();
    const board = screen.getByLabelText('Execution board');
    // One deal with missing stage/status will appear on multiple
    // lanes (missing-data + blocked-at-risk) — each row renders the
    // honest absence label, so getAllByText returns ≥ 1.
    expect(within(board).getAllByText('Stage not set').length).toBeGreaterThanOrEqual(1);
    expect(within(board).getAllByText('Status not set').length).toBeGreaterThanOrEqual(1);
  });

  it('renders both the item-kind chip and the severity indicator on each execution row', () => {
    setAllReady({
      deals: [
        deal({
          id: 'd-blocked',
          name: 'BlockedDeal',
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    renderCockpit();
    const board = screen.getByLabelText('Execution board');
    // Item-kind chip carries data-team-execution-kind; severity dot
    // carries data-team-execution-severity. Both must appear at least
    // once.
    expect(
      board.querySelector('[data-team-execution-kind]'),
    ).not.toBeNull();
    expect(
      board.querySelector('[data-team-execution-severity]'),
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

describe('Phase 127A — TeamOpsQueue.tsx static-source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'TeamOpsQueue.tsx'), 'utf8');
  const sourceCode = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(
    /(^|\s)\/\/.*$/gm,
    '$1',
  );

  it('imports the team snapshot deriver', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*deriveTeamOpsQueueSnapshot[^}]*\}\s+from\s+['"]\.\/teamOpsQueueSnapshot['"]/,
    );
  });

  it('imports CommandChartPrimitives from shared (no manager import per Phase 48 isolation)', () => {
    expect(SRC).toMatch(
      /import\s+\{[\s\S]*?VerticalBarChart[\s\S]*?HorizontalBarChart[\s\S]*?DonutChart[\s\S]*?\}\s+from\s+['"]\.\.\/shared\/CommandChartPrimitives['"]/,
    );
    expect(SRC).not.toMatch(/from\s+['"]\.\.\/manager\//);
  });

  it('does NOT import any banker / write-surface action', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*\/banker\//);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*Office365/);
    expect(SRC).not.toMatch(/SendEmailV2/);
    expect(SRC).not.toMatch(/sendDocumentRequestEmail/);
    expect(SRC).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(SRC).not.toMatch(/CompleteTaskModal/);
    expect(SRC).not.toMatch(/RequestDocumentModal/);
    expect(SRC).not.toMatch(/CreditMemoDraftModal/);
  });

  it('does NOT render any button / form / interactive write affordance', () => {
    expect(sourceCode).not.toMatch(/<button\b/i);
    expect(sourceCode).not.toMatch(/<form\b/i);
    expect(sourceCode).not.toMatch(/onSubmit/);
    expect(sourceCode).not.toMatch(/onClick/);
  });

  it('does NOT contain predictive / weighted vocabulary', () => {
    expect(sourceCode).not.toMatch(/weighted\s+exposure/i);
    expect(sourceCode).not.toMatch(/approval\s+(odds|probability)/i);
    expect(sourceCode).not.toMatch(/win\s+rate/i);
    expect(sourceCode).not.toMatch(/AI[- ]generated/i);
  });

  it('does NOT contain hardcoded sample / mock deal or borrower names', () => {
    expect(sourceCode).not.toMatch(/\bAcme\b/);
    expect(sourceCode).not.toMatch(/\bContoso\b/);
    expect(sourceCode).not.toMatch(/sample\s+deal/i);
    expect(sourceCode).not.toMatch(/mock\s+deal/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 130A — Copilot assist surface wiring (read-only, not configured)
// ---------------------------------------------------------------------------

describe('Phase 130A — Copilot assist panel wiring', () => {
  it('mounts the CopilotAssistPanel atop the team ops queue when the snapshot is ready', () => {
    setAllReady({ deals: [deal()] });
    renderCockpit();
    expect(screen.getByText('Copilot Assist')).toBeInTheDocument();
  });

  it('clearly states the connector is not configured (no live connector required)', () => {
    setAllReady({ deals: [deal()] });
    renderCockpit();
    expect(
      screen.getByText(/Copilot connector not configured/i),
    ).toBeInTheDocument();
  });

  it('states the assistant is read-only and cannot change data', () => {
    setAllReady({ deals: [deal()] });
    renderCockpit();
    expect(
      screen.getByText(/Read-only assistant\. Cannot approve, change data/i),
    ).toBeInTheDocument();
  });
});
