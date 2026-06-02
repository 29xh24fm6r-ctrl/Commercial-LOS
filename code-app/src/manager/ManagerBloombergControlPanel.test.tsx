// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';

import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from './managerQueries';
import type { AsyncResult, ManagerData } from './ManagerDataProvider';

/**
 * Phase 124A — ManagerBloombergControlPanel integration tests.
 *
 * Pins:
 *   - the panel renders the command strip from authorized records;
 *   - the exception tape surfaces deals from the shared deriver
 *     (blocker / at-risk / missing-fields / stale) without any
 *     sample / mock data;
 *   - the honest empty state renders when the team has zero
 *     authorized deals;
 *   - the panel fails closed when any of the four core data slots
 *     failed to load (no aggregate KPI shown across a partial load);
 *   - the panel waits for all four slots before rendering aggregates
 *     (no "0 across the board" leak while data is still in flight);
 *   - no fake fallback labels for missing client / stage / status /
 *     banker — empty deals render honest "Not set" / "Unassigned" /
 *     "No amount" copy;
 *   - the top-deals section surfaces the shared Phase-123A VM's
 *     next-best-action when one fires;
 *   - static-source pins: the component imports the shared deriver,
 *     does NOT import any banker write-surface action, and exposes
 *     no banker write buttons.
 */

const { useManagerDataMock } = vi.hoisted(() => ({
  useManagerDataMock: vi.fn(),
}));

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: useManagerDataMock,
}));

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

beforeEach(() => {
  useManagerDataMock.mockReset();
});

// ---------------------------------------------------------------------------
// Loading / failure / empty states
// ---------------------------------------------------------------------------

describe('Phase 124A — loading + failure + empty states', () => {
  it('renders the cockpit shell with the institutional read-only chip', () => {
    setAllReady({ pipeline: [deal()] });
    render(<ManagerBloombergControlPanel />);
    expect(
      screen.getByRole('region', { name: /Manager Bloomberg Control Panel/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bloomberg Control Panel/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Read-only management view')).toBeInTheDocument();
  });

  it('waits for ALL four data slots before rendering KPI aggregates (no 0-across-the-board leak)', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'loading' },
    });
    render(<ManagerBloombergControlPanel />);
    // Loading status visible; no command-strip KPI block.
    expect(
      screen.getByText(/Loading authorized team pipeline/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Pipeline command strip'),
    ).not.toBeInTheDocument();
  });

  it('fails closed when ANY core data slot reports failed (refuses to render aggregate)', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'failed', message: 'OData 5xx' },
      teamDocuments: ready([]),
    });
    render(<ManagerBloombergControlPanel />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Could not load team tasks/i);
    expect(alert).toHaveTextContent(/OData 5xx/);
    expect(
      screen.queryByLabelText('Pipeline command strip'),
    ).not.toBeInTheDocument();
  });

  it('renders the honest empty state when the team has zero authorized deals', () => {
    setAllReady({ pipeline: [] });
    render(<ManagerBloombergControlPanel />);
    expect(
      screen.getByText(/No authorized manager pipeline records found\./i),
    ).toBeInTheDocument();
    // Command strip / exception tape / banker workload / top deals
    // sections must NOT render under the empty state.
    expect(
      screen.queryByLabelText('Pipeline command strip'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Exception tape')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Banker workload')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Top deals by amount'),
    ).not.toBeInTheDocument();
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
        // d3 — past close 10 days → blocked
        deal({
          id: 'd3',
          amount: 250_000,
          targetCloseDate: isoDaysAgo(10),
        }),
        // d4 — sparse amount → counts as missing data
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
    render(<ManagerBloombergControlPanel />);
    const strip = screen.getByLabelText('Pipeline command strip');
    expect(within(strip).getByText(/Active deals/i)).toBeInTheDocument();
    expect(within(strip).getByLabelText('4 active deals')).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/Total pipeline.*1,750,000/),
    ).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/1 deals with missing required fields/),
    ).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/1 deals blocked or at risk/),
    ).toBeInTheDocument();
    expect(
      within(strip).getByLabelText(/1 outstanding documents/),
    ).toBeInTheDocument();
    expect(within(strip).getByLabelText(/1 open tasks/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Exception tape from shared deriver — no sample data
// ---------------------------------------------------------------------------

describe('Phase 124A — exception tape', () => {
  it('renders Blocked / At risk / Missing fields / Stale buckets from the authorized records', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-blocked',
          name: 'BlockedDeal',
          targetCloseDate: isoDaysAgo(15),
        }),
        deal({
          id: 'd-atrisk',
          name: 'AtRiskDeal',
          targetCloseDate: isoDaysAgo(3),
        }),
        deal({
          id: 'd-missing',
          name: 'MissingDeal',
          amount: undefined,
        }),
        deal({
          id: 'd-stale',
          name: 'StaleDeal',
          modifiedOn: isoDaysAgo(20),
        }),
        deal({ id: 'd-clean', name: 'CleanDeal' }),
      ],
      bankers: [banker()],
    });
    render(<ManagerBloombergControlPanel />);
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
    // Clean deal is NOT surfaced anywhere on the tape — buckets are
    // mutually exclusive, and clean status fires no bucket.
    expect(within(tape).queryByText(/CleanDeal/)).not.toBeInTheDocument();
  });

  it('does NOT inject sample / mock / fake borrower or deal data into the exception tape', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', name: 'Honest Deal Name', targetCloseDate: isoDaysAgo(15) }),
      ],
      bankers: [banker()],
    });
    render(<ManagerBloombergControlPanel />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bAcme\b/i);
    expect(text).not.toMatch(/\bContoso\b/i);
    expect(text).not.toMatch(/sample\s+deal/i);
    expect(text).not.toMatch(/mock\s+deal/i);
  });

  it('renders honest "None." copy in any bucket that has zero rows', () => {
    setAllReady({
      pipeline: [deal({ id: 'd-clean' })],
      bankers: [banker()],
    });
    render(<ManagerBloombergControlPanel />);
    const tape = screen.getByLabelText('Exception tape');
    // Default deal is clean → all four buckets are empty → all render "None."
    expect(within(tape).getAllByText(/^None\.$/).length).toBeGreaterThanOrEqual(4);
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
    render(<ManagerBloombergControlPanel />);
    const topDeals = screen.getByLabelText('Top deals by amount');
    const row = within(topDeals).getByText('Sparse cockpit deal').closest('li');
    expect(row).not.toBeNull();
    expect(row!).toHaveTextContent(/Client.*Not set/);
    expect(row!).toHaveTextContent(/Stage.*Not set/);
    expect(row!).toHaveTextContent(/Status.*Not set/);
    expect(row!).toHaveTextContent(/Banker.*Unassigned/);
    expect(row!).toHaveTextContent('No amount');
  });

  it('does NOT inject any of the forbidden fake-fallback placeholder strings beyond the explicit honest empty-state copy', () => {
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
    render(<ManagerBloombergControlPanel />);
    const text = document.body.textContent ?? '';
    // TBD / N/A / em-dash placeholders are NEVER injected. ("Not set"
    // is the honest empty state copy used in the banker cockpit too;
    // "Unassigned" / "No amount" are the deliberate manager-side
    // honest empty-state labels for banker / amount slots.)
    expect(text).not.toMatch(/\bTBD\b/);
    expect(text).not.toMatch(/\bN\/A\b/);
    expect(text).not.toMatch(/\bplaceholder\b/i);
  });
});

// ---------------------------------------------------------------------------
// Banker workload
// ---------------------------------------------------------------------------

describe('Phase 124A — banker workload', () => {
  it('renders one row per roster banker with active deal count + amount + work', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd1',
          assignedBankerId: 'b1',
          assignedBankerName: 'Alice',
          amount: 500_000,
        }),
      ],
      bankers: [
        banker({ id: 'b1', fullName: 'Alice' }),
        banker({ id: 'b2', fullName: 'Bob' }),
      ],
    });
    render(<ManagerBloombergControlPanel />);
    const workload = screen.getByLabelText('Banker workload');
    expect(within(workload).getByText('Alice')).toBeInTheDocument();
    expect(within(workload).getByText('Bob')).toBeInTheDocument();
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
    render(<ManagerBloombergControlPanel />);
    const topDeals = screen.getByLabelText('Top deals by amount');
    expect(within(topDeals).getByText(/Next:.*overdue task/i)).toBeInTheDocument();
  });

  it('renders "No mechanical signal" when the VM has no next-best-action', () => {
    setAllReady({
      pipeline: [deal({ id: 'd-clean' })],
      bankers: [banker()],
    });
    render(<ManagerBloombergControlPanel />);
    const topDeals = screen.getByLabelText('Top deals by amount');
    expect(within(topDeals).getByText(/No mechanical signal/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

describe('Phase 124A — ManagerBloombergControlPanel.tsx static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'ManagerBloombergControlPanel.tsx'),
    'utf8',
  );
  const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports the manager pipeline snapshot deriver (which routes through the shared VM)', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*deriveManagerPipelineSnapshot[^}]*\}\s+from\s+['"]\.\/managerPipelineSnapshot['"]/,
    );
  });

  it('does NOT import any banker-only write surface (no DealAutopilotPanel, no banker context, no email actions)', () => {
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
    // Inert read-only cockpit. The only interactive element a manager
    // surface here might want would be a navigation link — explicitly
    // not included in Phase 124A foundation.
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
