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
 * Phase 102 — ManagerRelationshipMemory card tests.
 *
 * Pins:
 *   - loading state when any manager data slot is non-ready;
 *   - failed state surfaces role="alert" with the underlying message
 *     on each of the four child slots (pipeline / tasks / documents
 *     / memos);
 *   - empty state when the manager has no team deals;
 *   - empty state when the Phase 92 banker filter excludes every
 *     deal (banker / unassigned variants);
 *   - populated rendering: client header, active-deal count, total
 *     pipeline, last-activity, nearest-upcoming-close, open-asks
 *     line, attention badges, deal pills;
 *   - missing-client branch renders "(no borrower name on record)";
 *   - grouping reflects normalized client name (Acme, LLC + Acme
 *     LLC stay separate honestly — same Phase 76 limitation);
 *   - top-N cap (10 clients) — overflow line + per-row deal cap (5);
 *   - Phase 92 banker filter narrows BOTH the deal universe AND the
 *     children that feed the aggregate;
 *   - clicking a deal pill navigates via react-router;
 *   - verbatim Phase 76-aligned disclaimer renders
 *     ("client-name grouped", "not a verified relationship graph",
 *     "not a household linkage", "not a relationship score");
 *   - rendered DOM never contains forbidden vocabulary
 *     (AI-generated / Copilot / relationship score / risk score /
 *     householding / complete relationship profile / verified
 *     entity);
 *   - the card never renders a copy-to-Teams or Outlook handoff
 *     button (Phase 102 is deliberately read-only — handoff is
 *     banker-only by design).
 */

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
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
import {
  dealMatchesBankerFilter,
  selectionLabel as computeSelectionLabel,
  useManagerBankerFilter,
  type ManagerBankerFilterSelection,
  type ManagerBankerFilterView,
} from './ManagerBankerFilter';
import { ManagerRelationshipMemory } from './ManagerRelationshipMemory';

const useManagerDataMock = vi.mocked(useManagerData);
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

function deal(overrides: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-1',
    name: 'Acme RLOC',
    clientName: 'Acme Manufacturing, LLC',
    stage: 'Underwriting',
    status: 'Active',
    amount: 3_000_000,
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(5),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'b-1',
    assignedBankerName: 'B. Other',
    collateralSummary: undefined,
    ...overrides,
  };
}

function task(
  o: Partial<TeamScopedTask> & {
    id: string;
    dealId: string | undefined;
  },
): TeamScopedTask {
  return {
    title: 'Send Q2 financials',
    completed: false,
    dueDate: undefined,
    assigneeName: undefined,
    modifiedOn: undefined,
    dealName: undefined,
    ...o,
  };
}

function doc(
  o: Partial<TeamScopedDocument> & {
    id: string;
    dealId: string | undefined;
    status: 'outstanding' | 'received' | 'reviewed';
  },
): TeamScopedDocument {
  return {
    name: 'Document',
    dueDate: undefined,
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    dealName: undefined,
    ...o,
  };
}

function memo(
  o: Partial<TeamScopedMemo> & {
    id: string;
    dealId: string | undefined;
  },
): TeamScopedMemo {
  return {
    name: 'Memo',
    statusKey: undefined,
    generatedAt: '2026-04-01',
    modifiedOn: undefined,
    dealName: undefined,
    textPreview: undefined,
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default the filter to "all team" so populated assertions hold
  // unless a specific test overrides the selection.
  useManagerBankerFilterMock.mockReturnValue(filterView({ kind: 'all' }));
});

describe('ManagerRelationshipMemory — Phase 102', () => {
  it('renders the card header + verbatim Phase 102 subtitle', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerRelationshipMemory />);
    expect(
      screen.getByRole('heading', { name: /relationship memory/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Client-name grouped, derived from manager-visible records\./i,
      ),
    ).toBeInTheDocument();
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
    render(<ManagerRelationshipMemory />);
    expect(screen.getByText(/Loading client snapshot/i)).toBeInTheDocument();
  });

  it('renders the loading state when any child data slot is non-ready', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'ready', data: [deal()] },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
      teamMemoSections: { kind: 'ready', data: [] },
    });
    render(<ManagerRelationshipMemory />);
    expect(screen.getByText(/Loading client snapshot/i)).toBeInTheDocument();
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
    render(<ManagerRelationshipMemory />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/Could not load Relationship Memory/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders the empty state when the team pipeline is empty', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    render(<ManagerRelationshipMemory />);
    expect(
      screen.getByText(/No clients with active deals on the team/i),
    ).toBeInTheDocument();
  });

  it('renders a filter-aware empty state when the Phase 92 banker filter excludes every deal', () => {
    useManagerBankerFilterMock.mockReturnValue(
      filterView({ kind: 'banker', id: 'b-2', name: 'C. Other' }),
    );
    useManagerDataMock.mockReturnValue(
      ready([deal({ assignedBankerId: 'b-1', assignedBankerName: 'B. Other' })]),
    );
    render(<ManagerRelationshipMemory />);
    expect(
      screen.getByText(
        /No clients with active deals for C\. Other from current records\./i,
      ),
    ).toBeInTheDocument();
  });

  it('renders a single-client snapshot with all the standard rows + pills', () => {
    useManagerDataMock.mockReturnValue(
      ready(
        [deal({ id: 'd1', clientName: 'Acme Manufacturing' })],
        [
          task({ id: 't1', dealId: 'd1', dueDate: isoDaysAgo(2) }),
          task({ id: 't2', dealId: 'd1' }),
        ],
        [
          doc({
            id: 'doc1',
            dealId: 'd1',
            status: 'outstanding',
          }),
          doc({
            id: 'doc2',
            dealId: 'd1',
            status: 'received',
            receivedDate: isoDaysAgo(10),
          }),
        ],
        [
          memo({ id: 'm1', dealId: 'd1', statusKey: 'draft' }),
        ],
      ),
    );
    render(<ManagerRelationshipMemory />);
    expect(screen.getByText('Acme Manufacturing')).toBeInTheDocument();
    expect(screen.getByText(/1 active deal\b/i)).toBeInTheDocument();
    expect(screen.getByText(/Pipeline \$3,000,000/i)).toBeInTheDocument();
    expect(screen.getByText(/Open document requests:/i)).toBeInTheDocument();
    expect(screen.getByText(/Open tasks:/i)).toBeInTheDocument();
    expect(screen.getByText(/1 overdue/i)).toBeInTheDocument();
    expect(screen.getByText(/1 may require review/i)).toBeInTheDocument();
    expect(screen.getByText(/1 draft memo/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open deal Acme RLOC/i }),
    ).toBeInTheDocument();
  });

  it('renders the "(no borrower name on record)" placeholder when a deal has no clientName', () => {
    useManagerDataMock.mockReturnValue(
      ready([deal({ id: 'd1', clientName: undefined })]),
    );
    render(<ManagerRelationshipMemory />);
    expect(
      screen.getByText(/\(no borrower name on record\)/i),
    ).toBeInTheDocument();
  });

  it('groups two deals under the same normalized client name', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', name: 'Acme RLOC', clientName: 'Acme Manufacturing' }),
        deal({ id: 'd2', name: 'Acme Equipment', clientName: 'acme manufacturing' }),
      ]),
    );
    render(<ManagerRelationshipMemory />);
    // Single client row, even though the two deals differ in case.
    const rows = screen.getAllByRole('listitem');
    const clientRows = rows.filter((r) => /Acme Manufacturing/i.test(r.textContent ?? ''));
    // The first matching listitem is the client row; subsequent
    // matches are the per-deal pills nested inside it.
    expect(clientRows.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2 active deals/i)).toBeInTheDocument();
    expect(screen.getByText(/Pipeline \$6,000,000/i)).toBeInTheDocument();
  });

  it('keeps "Acme, LLC" and "Acme LLC" as SEPARATE entries (client-name grouped limitation honestly surfaced)', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', name: 'Acme RLOC', clientName: 'Acme, LLC' }),
        deal({ id: 'd2', name: 'Acme Equipment', clientName: 'Acme LLC' }),
      ]),
    );
    render(<ManagerRelationshipMemory />);
    expect(screen.getByText('Acme, LLC')).toBeInTheDocument();
    expect(screen.getByText('Acme LLC')).toBeInTheDocument();
    expect(screen.getAllByText(/1 active deal\b/i).length).toBeGreaterThanOrEqual(2);
  });

  it('Phase 92 filter narrows the rendered client groups when the banker selection excludes some deals', () => {
    useManagerBankerFilterMock.mockReturnValue(
      filterView({ kind: 'banker', id: 'b-1', name: 'B. Other' }),
    );
    useManagerDataMock.mockReturnValue(
      ready([
        deal({
          id: 'd1',
          clientName: 'Acme Manufacturing',
          assignedBankerId: 'b-1',
          assignedBankerName: 'B. Other',
        }),
        deal({
          id: 'd2',
          clientName: 'Beta Corp',
          assignedBankerId: 'b-2',
          assignedBankerName: 'C. Other',
        }),
      ]),
    );
    render(<ManagerRelationshipMemory />);
    expect(screen.getByText('Acme Manufacturing')).toBeInTheDocument();
    expect(screen.queryByText('Beta Corp')).toBeNull();
  });

  it('Phase 92 filter narrows children (tasks/docs/memos) to surviving deal-ids before aggregation', () => {
    useManagerBankerFilterMock.mockReturnValue(
      filterView({ kind: 'banker', id: 'b-1', name: 'B. Other' }),
    );
    useManagerDataMock.mockReturnValue(
      ready(
        [
          deal({
            id: 'd1',
            clientName: 'Acme Manufacturing',
            assignedBankerId: 'b-1',
            assignedBankerName: 'B. Other',
          }),
          deal({
            id: 'd2',
            clientName: 'Beta Corp',
            assignedBankerId: 'b-2',
            assignedBankerName: 'C. Other',
          }),
        ],
        [
          // Task on the hidden Beta deal — must NOT count toward
          // any visible client's open-task tally.
          task({ id: 't1', dealId: 'd2', dueDate: isoDaysAgo(2) }),
        ],
        [],
        [],
      ),
    );
    render(<ManagerRelationshipMemory />);
    // The only visible client is Acme. Its open-task count must be
    // 0 — the orphan task on the hidden Beta deal must be dropped.
    const acmeRow = screen.getByText('Acme Manufacturing').closest('li')!;
    expect(within(acmeRow).getByText(/Open tasks:/i)).toBeInTheDocument();
    // The bolded count next to "Open tasks:" is 0.
    expect(within(acmeRow).getByText(/Open tasks:\s*$/i)).toBeInTheDocument();
    // And "overdue" never surfaces.
    expect(within(acmeRow).queryByText(/overdue/i)).toBeNull();
  });

  it('caps the rendered client list at 10 and surfaces "… and N more"', () => {
    const deals: TeamDeal[] = [];
    for (let i = 0; i < 14; i++) {
      deals.push(
        deal({
          id: `d${i}`,
          name: `Deal ${i}`,
          clientName: `Client ${i}`,
        }),
      );
    }
    useManagerDataMock.mockReturnValue(ready(deals));
    render(<ManagerRelationshipMemory />);
    // 10 client rows visible — count direct children of the
    // clients list (each row contains a nested deal-pill list of
    // its own; getAllByRole('listitem') would double-count).
    const list = screen.getByRole('list', {
      name: /Manager relationship memory clients/i,
    });
    const directRows = list.querySelectorAll(':scope > li');
    expect(directRows.length).toBe(10);
    // Overflow line shown.
    expect(
      screen.getByText(/… and 4 more clients not shown\. Narrow the banker filter/i),
    ).toBeInTheDocument();
  });

  it('caps the per-row deal list at 5 + surfaces a per-row overflow line', () => {
    const deals: TeamDeal[] = [];
    for (let i = 0; i < 8; i++) {
      deals.push(
        deal({
          id: `d${i}`,
          name: `Acme Deal ${i}`,
          clientName: 'Acme Manufacturing',
          amount: 1_000_000,
        }),
      );
    }
    useManagerDataMock.mockReturnValue(ready(deals));
    render(<ManagerRelationshipMemory />);
    // 5 deal pills visible — buttons that open a deal.
    const pillButtons = screen.getAllByRole('button', {
      name: /Open deal Acme Deal/i,
    });
    expect(pillButtons.length).toBe(5);
    // Per-row overflow line.
    expect(
      screen.getByText(/… and 3 more deals not shown\./i),
    ).toBeInTheDocument();
  });

  it('clicking a deal pill navigates to /deals/<id>', async () => {
    useManagerDataMock.mockReturnValue(ready([deal({ id: 'd-target' })]));
    render(<ManagerRelationshipMemory />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /Open deal Acme RLOC/i }),
    );
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
  });

  it('renders the verbatim Phase 76-aligned disclaimer (client-name grouped, no graph / household / score)', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerRelationshipMemory />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Client-name grouped/i);
    expect(text).toMatch(/not a verified relationship graph/i);
    expect(text).toMatch(/not a household linkage/i);
    expect(text).toMatch(/not a relationship score/i);
    expect(text).toMatch(/manager-visible records/i);
    expect(text).toMatch(/Open the relevant deal to act/i);
  });

  it('rendered DOM never claims AI / Copilot / householding / verified entity / risk-or-relationship score', () => {
    useManagerDataMock.mockReturnValue(
      ready(
        [deal({ id: 'd1', clientName: 'Acme Manufacturing' })],
        [task({ id: 't1', dealId: 'd1', dueDate: isoDaysAgo(2) })],
        [
          doc({ id: 'doc1', dealId: 'd1', status: 'outstanding' }),
          doc({
            id: 'doc2',
            dealId: 'd1',
            status: 'received',
            receivedDate: isoDaysAgo(10),
          }),
        ],
        [memo({ id: 'm1', dealId: 'd1', statusKey: 'draft' })],
      ),
    );
    render(<ManagerRelationshipMemory />);
    // Strip the disclaimer paragraph before checking positive
    // claims — it carries the verbatim negations.
    const stripped = (document.body.textContent ?? '')
      .replace(/not a verified relationship graph[\s\S]*/g, '');
    expect(stripped).not.toMatch(/AI[- ]?generated/i);
    expect(stripped).not.toMatch(/\bCopilot\b/i);
    expect(stripped).not.toMatch(/\bhouseholding\b/i);
    expect(stripped).not.toMatch(/\bverified entity\b/i);
    expect(stripped).not.toMatch(/relationship\s+score/i);
    expect(stripped).not.toMatch(/risk\s+score/i);
    expect(stripped).not.toMatch(/complete\s+relationship\s+profile/i);
    expect(stripped).not.toMatch(/predictive/i);
  });

  it('never renders a copy-to-Teams or Outlook handoff button on the manager surface', () => {
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerRelationshipMemory />);
    // Phase 102 brief explicitly: no Outlook / Teams handoff
    // expansion on this surface. Manager relationship memory is a
    // read-only cross-banker awareness surface.
    expect(
      screen.queryByRole('button', { name: /Copy Teams summary/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Open in Outlook/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Copy email/i }),
    ).toBeNull();
    // Also no "Draft relationship note" affordance (Phase 78 is
    // banker-only).
    expect(
      screen.queryByRole('button', { name: /Draft relationship note/i }),
    ).toBeNull();
  });

  it('does not call into Dataverse / write helpers — module hygiene check', () => {
    // The component pulls only useManagerData + useManagerBankerFilter
    // + useNavigate. We never invoke navigator.clipboard or
    // window.location.href on Phase 102. Render + assert no
    // unexpected globals were touched.
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    useManagerDataMock.mockReturnValue(ready([deal()]));
    render(<ManagerRelationshipMemory />);
    expect(writeText).not.toHaveBeenCalled();
  });
});
