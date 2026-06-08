// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from './managerQueries';
import type { AsyncResult, ManagerData } from './ManagerDataProvider';
import type {
  ManagerBankerFilterSelection,
  ManagerBankerFilterView,
} from './ManagerBankerFilter';

/**
 * Phase 124A + 124B — ManagerBloombergControlPanel integration tests.
 *
 * Phase 124A pins (preserved):
 *   - command strip from authorized records;
 *   - exception tape from shared deriver (no sample data);
 *   - honest empty state with zero deals;
 *   - fails closed on any failed slot;
 *   - honest absence for missing client/stage/status/banker;
 *   - shared-VM next-best-action surfaces on top deals;
 *   - no banker write-surface imports + no write buttons + no
 *     predictive vocabulary.
 *
 * Phase 124B pins (new):
 *   - banker filter integration: selection narrows command strip /
 *     exception tape / top deals;
 *   - "Filtered to X" chip rendered when a non-'all' selection is
 *     active; no chip when the provider is absent or selection
 *     is 'all';
 *   - empty-state copy distinguishes "no records" from "no records
 *     match the filter";
 *   - top-deal name renders as a Link to /deals/<dealId>;
 *   - exception-tape row name renders as a Link to /deals/<dealId>;
 *   - no <button>, no <form>, no onClick / onSubmit in the source
 *     (drill-down is via navigation, not write affordance);
 *   - failure copy explicitly states "failing closed" + "no partial
 *     KPIs across a failed load".
 */

const { useManagerDataMock } = vi.hoisted(() => ({
  useManagerDataMock: vi.fn(),
}));
const { useOptionalManagerBankerFilterMock } = vi.hoisted(() => ({
  useOptionalManagerBankerFilterMock: vi.fn(),
}));

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: useManagerDataMock,
}));

vi.mock('./ManagerBankerFilter', async () => {
  const actual = await vi.importActual<typeof import('./ManagerBankerFilter')>(
    './ManagerBankerFilter',
  );
  return {
    ...actual,
    useOptionalManagerBankerFilter: useOptionalManagerBankerFilterMock,
  };
});

import { ManagerBloombergControlPanel } from './ManagerBloombergControlPanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-02T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}

function deal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-default',
    name: 'Default deal',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysAgo(-60),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'banker-a',
    assignedBankerName: 'Banker A',
    collateralSummary: undefined,
    productType: undefined,
    loanStructure: undefined,
    pricingType: undefined,
    ...over,
  };
}

function banker(over: Partial<TeamBanker> = {}): TeamBanker {
  return {
    id: 'banker-a',
    fullName: 'Banker A',
    email: 'a@oldglorybank.com',
    roleType: 'CommercialBanker',
    active: true,
    ...over,
  };
}

function ready<T>(data: T): AsyncResult<T> {
  return { kind: 'ready', data };
}

function setManagerData(over: Partial<ManagerData> = {}) {
  const data: ManagerData = {
    teamPipeline: { kind: 'loading' },
    teamBankers: { kind: 'loading' },
    teamTasks: { kind: 'loading' },
    teamDocuments: { kind: 'loading' },
    teamMemos: { kind: 'loading' },
    teamMemoSections: { kind: 'loading' },
    ...over,
  };
  useManagerDataMock.mockReturnValue(data);
}

function setAllReady(opts: {
  pipeline?: TeamDeal[];
  bankers?: TeamBanker[];
  tasks?: TeamScopedTask[];
  documents?: TeamScopedDocument[];
} = {}) {
  setManagerData({
    teamPipeline: ready(opts.pipeline ?? []),
    teamBankers: ready(opts.bankers ?? []),
    teamTasks: ready(opts.tasks ?? []),
    teamDocuments: ready(opts.documents ?? []),
    teamMemos: ready([]),
    teamMemoSections: ready([]),
  });
}

function setFilter(selection: ManagerBankerFilterSelection | undefined) {
  if (selection === undefined) {
    useOptionalManagerBankerFilterMock.mockReturnValue(undefined);
    return;
  }
  const view: ManagerBankerFilterView = {
    selection,
    setSelection: vi.fn(),
    options: [],
    matchesDeal: () => true,
    selectionLabel:
      selection.kind === 'all'
        ? 'Showing team view'
        : selection.kind === 'unassigned'
          ? 'Filtered to Unassigned'
          : `Filtered to ${selection.name}`,
    isPreferenceScoped: false,
  };
  useOptionalManagerBankerFilterMock.mockReturnValue(view);
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <ManagerBloombergControlPanel />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useManagerDataMock.mockReset();
  useOptionalManagerBankerFilterMock.mockReset();
  setFilter(undefined);
});

// ---------------------------------------------------------------------------
// Cockpit shell / loading / failure / empty
// ---------------------------------------------------------------------------

describe('Phase 124A + 124B — cockpit shell + loading + failure + empty', () => {
  it('renders the cockpit shell with title, subtitle, and read-only chip', () => {
    setAllReady({ pipeline: [deal()] });
    renderPanel();
    expect(
      screen.getByRole('region', { name: /Manager Bloomberg Control Panel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Manager Bloomberg Control Panel/i, level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Live authorized pipeline snapshot/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Read-only management view')).toBeInTheDocument();
  });

  it('waits for ALL four data slots before rendering KPI aggregates', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'loading' },
    });
    renderPanel();
    expect(
      screen.getByText(/Loading authorized team pipeline/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Pipeline command strip'),
    ).not.toBeInTheDocument();
  });

  it('fails closed on a failed slot with explicit "failing closed" copy', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'failed', message: 'OData 5xx' },
      teamDocuments: ready([]),
    });
    renderPanel();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Could not load team tasks/i);
    expect(alert).toHaveTextContent(/failing closed/i);
    expect(alert).toHaveTextContent(/no partial KPIs/i);
    expect(alert).toHaveTextContent(/OData 5xx/);
    expect(
      screen.queryByLabelText('Pipeline command strip'),
    ).not.toBeInTheDocument();
  });

  it('renders the unfiltered honest empty state when zero authorized deals exist', () => {
    setAllReady({ pipeline: [] });
    renderPanel();
    expect(
      screen.getByText(/No authorized manager pipeline records found\./i),
    ).toBeInTheDocument();
  });

  it('renders a filter-aware empty state when the active filter has zero matches', () => {
    setAllReady({ pipeline: [deal({ assignedBankerName: 'Alice' })] });
    setFilter({ kind: 'banker', id: 'banker-z', name: 'Zoe' });
    renderPanel();
    expect(
      screen.getByText(/No authorized records match the current banker filter\./i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Command strip from authorized records
// ---------------------------------------------------------------------------

describe('Phase 124A — pipeline command strip', () => {
  it('renders six KPI tiles populated from the authorized records', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', amount: 1_000_000 }),
        deal({ id: 'd2', amount: 500_000 }),
        deal({ id: 'd3', amount: 250_000, targetCloseDate: isoDaysAgo(10) }),
        deal({ id: 'd4', amount: undefined, name: 'Sparse' }),
      ],
      bankers: [banker()],
      tasks: [
        {
          id: 't1',
          title: 't1',
          completed: false,
          dueDate: undefined,
          assigneeName: undefined,
          modifiedOn: undefined,
          dealId: 'd1',
          dealName: 'd1',
        },
        {
          id: 't2',
          title: 't2',
          completed: true,
          dueDate: undefined,
          assigneeName: undefined,
          modifiedOn: undefined,
          dealId: 'd1',
          dealName: 'd1',
        },
      ],
      documents: [
        {
          id: 'doc1',
          name: 'doc',
          dueDate: undefined,
          requestDate: undefined,
          receivedDate: undefined,
          reviewer: undefined,
          uploaded: false,
          modifiedOn: undefined,
          status: 'outstanding',
          dealId: 'd1',
          dealName: 'd1',
        },
      ],
    });
    renderPanel();
    const strip = screen.getByLabelText('Pipeline command strip');
    expect(within(strip).getByLabelText('4 active deals')).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/Total pipeline.*1,750,000/),
    ).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/1 deals with missing required fields/),
    ).toBeInTheDocument();
    // Phase 125A — split blocked/at-risk tiles + new dense KPIs.
    expect(within(strip).getByLabelText(/1 deals blocked/)).toBeInTheDocument();
    expect(within(strip).getByLabelText(/0 deals at risk/)).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/1 outstanding documents/),
    ).toBeInTheDocument();
    expect(within(strip).getByLabelText(/1 open tasks/)).toBeInTheDocument();
    expect(within(strip).getByLabelText(/0 overdue tasks/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Banker filter integration (Phase 124B)
// ---------------------------------------------------------------------------

describe('Phase 124B — banker filter integration', () => {
  it('narrows the command-strip aggregates to the selected banker', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', assignedBankerId: 'b-alice', assignedBankerName: 'Alice', amount: 500_000 }),
        deal({ id: 'd2', assignedBankerId: 'b-alice', assignedBankerName: 'Alice', amount: 300_000 }),
        deal({ id: 'd3', assignedBankerId: 'b-bob', assignedBankerName: 'Bob', amount: 1_000_000 }),
      ],
      bankers: [
        banker({ id: 'b-alice', fullName: 'Alice' }),
        banker({ id: 'b-bob', fullName: 'Bob' }),
      ],
    });
    setFilter({ kind: 'banker', id: 'b-alice', name: 'Alice' });
    renderPanel();
    const strip = screen.getByLabelText('Pipeline command strip');
    // Total active deals = 2 (Alice's two), pipeline = 800,000.
    expect(within(strip).getByLabelText('2 active deals')).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/Total pipeline.*800,000/),
    ).toBeInTheDocument();
  });

  it('narrows the top-deals list to the selected banker', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd-alice-1', name: 'AliceDeal1', assignedBankerId: 'b-alice', assignedBankerName: 'Alice', amount: 500_000 }),
        deal({ id: 'd-bob-1', name: 'BobDeal1', assignedBankerId: 'b-bob', assignedBankerName: 'Bob', amount: 1_000_000 }),
      ],
      bankers: [
        banker({ id: 'b-alice', fullName: 'Alice' }),
        banker({ id: 'b-bob', fullName: 'Bob' }),
      ],
    });
    setFilter({ kind: 'banker', id: 'b-alice', name: 'Alice' });
    renderPanel();
    const top = screen.getByLabelText('Top deals by amount');
    expect(within(top).getByText('AliceDeal1')).toBeInTheDocument();
    expect(within(top).queryByText('BobDeal1')).not.toBeInTheDocument();
  });

  it('renders the "Filtered to X" chip when a non-all selection is active', () => {
    setAllReady({ pipeline: [deal()] });
    setFilter({ kind: 'banker', id: 'b-alice', name: 'Alice' });
    renderPanel();
    expect(screen.getByText(/Filtered to Alice/i)).toBeInTheDocument();
  });

  it('does NOT render the filter chip when no filter provider is mounted', () => {
    setAllReady({ pipeline: [deal()] });
    setFilter(undefined);
    renderPanel();
    expect(screen.queryByText(/Filtered to/i)).not.toBeInTheDocument();
  });

  it('does NOT narrow aggregates when filter selection is { kind: "all" }', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', assignedBankerId: 'b1', assignedBankerName: 'Alice' }),
        deal({ id: 'd2', assignedBankerId: 'b2', assignedBankerName: 'Bob' }),
      ],
      bankers: [banker({ id: 'b1', fullName: 'Alice' }), banker({ id: 'b2', fullName: 'Bob' })],
    });
    setFilter({ kind: 'all' });
    renderPanel();
    const strip = screen.getByLabelText('Pipeline command strip');
    expect(within(strip).getByLabelText('2 active deals')).toBeInTheDocument();
  });

  it('narrows the exception tape to the selected banker', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-alice-blocked',
          name: 'AliceBlocked',
          assignedBankerId: 'b-alice',
          assignedBankerName: 'Alice',
          targetCloseDate: isoDaysAgo(10),
        }),
        deal({
          id: 'd-bob-blocked',
          name: 'BobBlocked',
          assignedBankerId: 'b-bob',
          assignedBankerName: 'Bob',
          targetCloseDate: isoDaysAgo(10),
        }),
      ],
      bankers: [
        banker({ id: 'b-alice', fullName: 'Alice' }),
        banker({ id: 'b-bob', fullName: 'Bob' }),
      ],
    });
    setFilter({ kind: 'banker', id: 'b-alice', name: 'Alice' });
    renderPanel();
    const tape = screen.getByLabelText('Exception tape');
    const blocked = within(tape).getByLabelText('Blocked bucket');
    expect(within(blocked).getByText('AliceBlocked')).toBeInTheDocument();
    expect(within(blocked).queryByText('BobBlocked')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Exception tape from shared deriver — no sample data
// ---------------------------------------------------------------------------

describe('Phase 124A — exception tape', () => {
  // Phase 141I — the at-risk / stale aging buckets are derived against the
  // runtime clock, while every fixture date here is anchored to the fixed
  // `NOW` constant via `isoDaysAgo`. Freeze ONLY the Date clock to that same
  // anchor so the buckets are deterministic regardless of the real calendar
  // date. Real timers stay live (no `toFake: ['Date']` side effects on async).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Blocked / At risk / Missing fields / Stale buckets from the authorized records', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd-blocked', name: 'BlockedDeal', targetCloseDate: isoDaysAgo(15) }),
        deal({ id: 'd-atrisk', name: 'AtRiskDeal', targetCloseDate: isoDaysAgo(3) }),
        deal({ id: 'd-missing', name: 'MissingDeal', amount: undefined }),
        deal({ id: 'd-stale', name: 'StaleDeal', modifiedOn: isoDaysAgo(20) }),
        deal({ id: 'd-clean', name: 'CleanDeal' }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const tape = screen.getByLabelText('Exception tape');
    expect(within(tape).getByLabelText('Blocked bucket')).toHaveTextContent(
      /BlockedDeal/,
    );
    expect(within(tape).getByLabelText('At risk bucket')).toHaveTextContent(
      /AtRiskDeal/,
    );
    expect(
      within(tape).getByLabelText('Missing fields bucket'),
    ).toHaveTextContent(/MissingDeal/);
    expect(within(tape).getByLabelText('Stale bucket')).toHaveTextContent(
      /StaleDeal/,
    );
    expect(within(tape).queryByText(/CleanDeal/)).not.toBeInTheDocument();
  });

  it('does NOT inject sample / mock / fake borrower or deal data', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', name: 'Honest Deal Name', targetCloseDate: isoDaysAgo(15) }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bAcme\b/i);
    expect(text).not.toMatch(/\bContoso\b/i);
    expect(text).not.toMatch(/sample\s+deal/i);
    expect(text).not.toMatch(/mock\s+deal/i);
  });

  it('renders honest "None." copy in empty buckets', () => {
    setAllReady({ pipeline: [deal({ id: 'd-clean' })], bankers: [banker()] });
    renderPanel();
    const tape = screen.getByLabelText('Exception tape');
    expect(within(tape).getAllByText(/^None\.$/).length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Drill-down navigation (Phase 124B)
// ---------------------------------------------------------------------------

describe('Phase 124B — drill-down navigation', () => {
  it('renders the top-deal name as a Link to /deals/<dealId>', () => {
    setAllReady({
      pipeline: [deal({ id: 'd-drill', name: 'Drill Deal', amount: 750_000 })],
      bankers: [banker()],
    });
    renderPanel();
    const link = screen.getByLabelText(
      'Open Drill Deal in the deal workspace',
    );
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/deals/d-drill');
    expect(link.getAttribute('data-manager-drilldown-deal')).toBe('d-drill');
  });

  it('renders the exception-tape row name as a Link to /deals/<dealId>', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-blocked',
          name: 'BlockedDeal',
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const tape = screen.getByLabelText('Exception tape');
    const link = within(tape).getByLabelText(
      'Open BlockedDeal in the deal workspace',
    );
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/deals/d-blocked');
  });

  it('every drill-down link is a navigation anchor (never a <button> / form / write surface)', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', name: 'D1', targetCloseDate: isoDaysAgo(15) }),
      ],
      bankers: [banker()],
    });
    const { container } = renderPanel();
    // Phase 130A — the cockpit now embeds the read-only CopilotAssistPanel,
    // which owns its own (non-mutating) Expand / quick-action controls.
    // Scope this drill-down pin to the cockpit's OWN surfaces by excluding
    // the encapsulated Copilot subtree; the cockpit itself must still
    // expose zero <button> / <form> write affordances.
    container.querySelector('[data-cockpit-copilot]')?.remove();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Honest absence — no fake fallback labels for missing fields
// ---------------------------------------------------------------------------

describe('Phase 124A — honest absence', () => {
  it('top-deal row renders "Not set" / "Unassigned" / "No amount" honest copy for missing fields', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-sparse',
          name: 'Sparse cockpit deal',
          clientName: undefined,
          stage: undefined,
          status: undefined,
          assignedBankerId: undefined,
          assignedBankerName: undefined,
          amount: undefined,
        }),
      ],
      bankers: [],
    });
    renderPanel();
    const topDeals = screen.getByLabelText('Top deals by amount');
    const row = within(topDeals).getByText('Sparse cockpit deal').closest('li');
    expect(row).not.toBeNull();
    expect(row!).toHaveTextContent(/Client.*Not set/);
    expect(row!).toHaveTextContent(/Stage.*Not set/);
    expect(row!).toHaveTextContent(/Status.*Not set/);
    expect(row!).toHaveTextContent(/Banker.*Unassigned/);
    expect(row!).toHaveTextContent('No amount');
  });

  it('does NOT inject TBD / N/A / placeholder vocabulary', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-sparse',
          name: 'Sparse',
          clientName: undefined,
          stage: undefined,
          status: undefined,
          assignedBankerName: undefined,
          amount: undefined,
        }),
      ],
    });
    renderPanel();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bTBD\b/);
    expect(text).not.toMatch(/\bN\/A\b/);
    expect(text).not.toMatch(/\bplaceholder\b/i);
  });
});

// ---------------------------------------------------------------------------
// Top deals — shared VM next-best-action surfaces
// ---------------------------------------------------------------------------

describe('Phase 124A — top deals + shared VM next-best-action', () => {
  it('surfaces vm.nextBestAction.label when overdue tasks fire the shared VM signal', () => {
    setAllReady({
      pipeline: [deal({ id: 'd-overdue', name: 'Overdue tasks deal' })],
      bankers: [banker()],
      tasks: [
        {
          id: 't1',
          title: 't1',
          completed: false,
          dueDate: isoDaysAgo(2),
          assigneeName: undefined,
          modifiedOn: undefined,
          dealId: 'd-overdue',
          dealName: 'Overdue tasks deal',
        },
      ],
    });
    renderPanel();
    const topDeals = screen.getByLabelText('Top deals by amount');
    expect(within(topDeals).getByText(/Next:.*overdue task/i)).toBeInTheDocument();
  });

  it('renders "No mechanical signal" when the VM has no next-best-action', () => {
    setAllReady({
      pipeline: [deal({ id: 'd-clean' })],
      bankers: [banker()],
    });
    renderPanel();
    const topDeals = screen.getByLabelText('Top deals by amount');
    expect(within(topDeals).getByText(/No mechanical signal/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 125A — Dense analytics grid + extended KPI ribbon
// ---------------------------------------------------------------------------

describe('Phase 125A — dense KPI ribbon', () => {
  it('renders the extended 11-tile KPI ribbon (Blocked / At risk / Stale / Overdue tasks / Avg days in stage / Closing 30d)', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', targetCloseDate: isoDaysAgo(10) }),
        deal({ id: 'd2' }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const strip = screen.getByLabelText('Pipeline command strip');
    // Distinct labels mean the ribbon now exposes split blocked/at-risk
    // plus the new Phase 125A KPIs.
    expect(within(strip).getByLabelText(/1 deals blocked/)).toBeInTheDocument();
    expect(within(strip).getByLabelText(/0 deals at risk/)).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/no record activity/i),
    ).toBeInTheDocument();
    expect(within(strip).getByLabelText(/overdue tasks/i)).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/Average days in stage/i),
    ).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/Closing in 30 days total/i),
    ).toBeInTheDocument();
  });

  it('renders "Not yet wired" for Avg days in stage when no deal has a stageEntryDate (honest absence)', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', stageEntryDate: undefined }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const strip = screen.getByLabelText('Pipeline command strip');
    expect(within(strip).getByText(/Not yet wired/i)).toBeInTheDocument();
  });
});

describe('Phase 125A — analytics grid', () => {
  it('renders the analytics grid with at least 6 distinct chart regions', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1' }),
        deal({ id: 'd2', targetCloseDate: isoDaysAgo(10) }),
        deal({ id: 'd3' }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const grid = screen.getByLabelText('Analytics grid');
    expect(grid).toBeInTheDocument();
    expect(within(grid).getByText(/Pipeline by stage/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Pipeline by banker/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Aging — days in stage/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Risk distribution/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Closings forecast/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Data quality/i)).toBeInTheDocument();
  });

  it('hides the analytics grid in the empty / failed / loading states', () => {
    // Empty.
    setAllReady({ pipeline: [] });
    const { unmount: u1 } = renderPanel();
    expect(screen.queryByLabelText('Analytics grid')).not.toBeInTheDocument();
    u1();
    // Failed slot.
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'failed', message: 'down' },
      teamDocuments: ready([]),
    });
    const { unmount: u2 } = renderPanel();
    expect(screen.queryByLabelText('Analytics grid')).not.toBeInTheDocument();
    u2();
    // Loading.
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'loading' },
    });
    renderPanel();
    expect(screen.queryByLabelText('Analytics grid')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 125B — Top-deal row surfaces hydrated reference labels
// ---------------------------------------------------------------------------

describe('Phase 125B — top-deal row hydrated product / loan-structure / pricing labels', () => {
  it('renders product / loan-structure / pricing meta cells when the loader hydrated them', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-hydrated',
          name: 'Hydrated Deal',
          productType: 'SBA 7(a)',
          loanStructure: 'Term Loan',
          pricingType: 'Variable',
        }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const topDeals = screen.getByLabelText('Top deals by amount');
    const row = within(topDeals).getByText('Hydrated Deal').closest('li');
    expect(row).not.toBeNull();
    expect(row!).toHaveTextContent(/Product.*SBA 7\(a\)/);
    expect(row!).toHaveTextContent(/Loan structure.*Term Loan/);
    expect(row!).toHaveTextContent(/Pricing.*Variable/);
  });

  it('OMITS product / loan-structure / pricing cells entirely when the loader returned undefined (honest absence — no "Not set" cell pollution)', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-sparse',
          name: 'Sparse refs deal',
          productType: undefined,
          loanStructure: undefined,
          pricingType: undefined,
        }),
      ],
      bankers: [banker()],
    });
    renderPanel();
    const topDeals = screen.getByLabelText('Top deals by amount');
    const row = within(topDeals).getByText('Sparse refs deal').closest('li');
    expect(row).not.toBeNull();
    // Required slots (Client/Stage/Status/Banker) still render.
    expect(row!).toHaveTextContent(/Client/);
    expect(row!).toHaveTextContent(/Stage/);
    // Reference slots omitted from the meta grid.
    expect(within(row! as HTMLElement).queryByText(/^Product$/)).toBeNull();
    expect(within(row! as HTMLElement).queryByText(/^Loan structure$/)).toBeNull();
    expect(within(row! as HTMLElement).queryByText(/^Pricing$/)).toBeNull();
  });
});

describe('Phase 124A + 124B — ManagerBloombergControlPanel.tsx static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'ManagerBloombergControlPanel.tsx'),
    'utf8',
  );
  const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports the manager pipeline snapshot deriver', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*deriveManagerPipelineSnapshot[^}]*\}\s+from\s+['"]\.\/managerPipelineSnapshot['"]/,
    );
  });

  it('imports the optional banker-filter hook (Phase 124B integration pin)', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*useOptionalManagerBankerFilter[^}]*\}\s+from\s+['"]\.\/ManagerBankerFilter['"]/,
    );
  });

  it('imports Link from react-router-dom (Phase 124B drill-down pin)', () => {
    expect(source).toMatch(
      /import\s+\{\s*Link\s*\}\s+from\s+['"]react-router-dom['"]/,
    );
  });

  it('does NOT import any banker-only write surface', () => {
    expect(source).not.toMatch(/from\s+['"][^'"]*\/banker\//);
    expect(source).not.toMatch(/DealAutopilotPanel/);
    expect(source).not.toMatch(/from\s+['"][^'"]*Office365/);
    expect(source).not.toMatch(/SendEmailV2/);
    expect(source).not.toMatch(/sendDocumentRequestEmail/);
    expect(source).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(source).not.toMatch(/RequestDocumentModal/);
    expect(source).not.toMatch(/CompleteTaskModal/);
    expect(source).not.toMatch(/CreditMemoDraftModal/);
  });

  it('does NOT render any button / form / interactive write affordance', () => {
    expect(sourceCode).not.toMatch(/<button\b/i);
    expect(sourceCode).not.toMatch(/<form\b/i);
    expect(sourceCode).not.toMatch(/onSubmit/);
    expect(sourceCode).not.toMatch(/onClick/);
  });

  it('does NOT contain hardcoded sample / mock deal or borrower names', () => {
    expect(sourceCode).not.toMatch(/\bAcme\b/);
    expect(sourceCode).not.toMatch(/\bContoso\b/);
    expect(sourceCode).not.toMatch(/sample\s+deal/i);
    expect(sourceCode).not.toMatch(/mock\s+deal/i);
    expect(sourceCode).not.toMatch(/test\s+deal/i);
  });

  it('does NOT contain forbidden predictive / approval-odds vocabulary', () => {
    expect(sourceCode).not.toMatch(/approval\s+(odds|probability)/i);
    expect(sourceCode).not.toMatch(/credit\s+score/i);
    expect(sourceCode).not.toMatch(/deal\s+score/i);
    expect(sourceCode).not.toMatch(/AI[- ]generated/i);
    expect(sourceCode).not.toMatch(/predicted\s+close/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 130A — Copilot assist surface wiring (read-only, not configured)
// ---------------------------------------------------------------------------

describe('Phase 130A — Copilot assist panel wiring', () => {
  it('mounts the CopilotAssistPanel atop the cockpit when the snapshot is ready', () => {
    setAllReady({ pipeline: [deal()], bankers: [banker()] });
    renderPanel();
    expect(screen.getByText('Copilot Assist')).toBeInTheDocument();
  });

  it('clearly states the connector is not configured (no live connector required)', () => {
    setAllReady({ pipeline: [deal()], bankers: [banker()] });
    renderPanel();
    expect(
      screen.getByText(/Copilot connector not configured/i),
    ).toBeInTheDocument();
  });

  it('states the assistant is read-only and cannot change data', () => {
    setAllReady({ pipeline: [deal()], bankers: [banker()] });
    renderPanel();
    expect(
      screen.getByText(/Read-only assistant\. Cannot approve, change data/i),
    ).toBeInTheDocument();
  });

  it('does NOT mount the panel before the snapshot is ready (no partial context)', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'loading' },
    });
    renderPanel();
    expect(screen.queryByText('Copilot Assist')).not.toBeInTheDocument();
  });
});
