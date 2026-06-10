// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from '../manager/managerQueries';
import type { AsyncResult, ManagerData } from '../manager/ManagerDataProvider';
import type {
  ManagerBankerFilterSelection,
  ManagerBankerFilterView,
} from '../manager/ManagerBankerFilter';

/**
 * Phase 126A — PortfolioCommandCenter integration tests.
 *
 * Pins:
 *   - cockpit shell renders title / subtitle / read-only chip;
 *   - waits for all 4 core data slots before rendering aggregates;
 *   - fails closed with explicit copy on any failed slot;
 *   - honest empty state (zero deals vs zero-after-filter);
 *   - KPI ribbon labels (Active deals / Total exposure / Closing 30d
 *     / Blocked / At risk / Missing data / Stale / Outstanding docs
 *     / Open tasks / Avg days in stage);
 *   - analytics grid renders the 9+ chart cards;
 *   - top exposures: name is a Link to /deals/<id>; share % rendered;
 *   - exception list: row name is a Link; severity chip + reason
 *     copy from blocker signal;
 *   - banker filter integration narrows the portfolio view;
 *   - NO write affordances anywhere; static-source forbids
 *     <button> / <form> / onClick / onSubmit / banker-write
 *     surface imports.
 */

const { useManagerDataMock } = vi.hoisted(() => ({
  useManagerDataMock: vi.fn(),
}));
const { useOptionalManagerBankerFilterMock } = vi.hoisted(() => ({
  useOptionalManagerBankerFilterMock: vi.fn(),
}));

vi.mock('../manager/ManagerDataProvider', () => ({
  useManagerData: useManagerDataMock,
}));

vi.mock('../manager/ManagerBankerFilter', async () => {
  const actual = await vi.importActual<
    typeof import('../manager/ManagerBankerFilter')
  >('../manager/ManagerBankerFilter');
  return {
    ...actual,
    useOptionalManagerBankerFilter: useOptionalManagerBankerFilterMock,
  };
});

import { PortfolioCommandCenter } from './PortfolioCommandCenter';

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

function deal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-default',
    name: 'Default deal',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'banker-a',
    assignedBankerName: 'Banker A',
    collateralSummary: undefined,
    productType: 'SBA 7(a)',
    loanStructure: 'Term Loan',
    pricingType: 'Variable',
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

function renderCockpit() {
  return render(
    <MemoryRouter>
      <PortfolioCommandCenter />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useManagerDataMock.mockReset();
  useOptionalManagerBankerFilterMock.mockReset();
  setFilter(undefined);
});

// ---------------------------------------------------------------------------
// Shell / loading / failure / empty
// ---------------------------------------------------------------------------

describe('Phase 126A — cockpit shell + loading + failure + empty', () => {
  it('renders the cockpit shell with title, subtitle, and read-only chip', () => {
    setAllReady({ pipeline: [deal()] });
    renderCockpit();
    expect(
      screen.getByRole('region', { name: /Portfolio Command Center/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Portfolio Command Center/i,
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Live authorized portfolio exposure/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Read-only portfolio view'),
    ).toBeInTheDocument();
  });

  it('waits for ALL four data slots before rendering KPI aggregates', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'loading' },
    });
    renderCockpit();
    expect(screen.getByText(/Loading authorized portfolio/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Portfolio KPI ribbon')).not.toBeInTheDocument();
  });

  it('fails closed with explicit "failing closed" copy on any failed slot', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'failed', message: 'OData 5xx' },
      teamDocuments: ready([]),
    });
    renderCockpit();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Could not load team tasks/i);
    expect(alert).toHaveTextContent(/failing closed/i);
    expect(alert).toHaveTextContent(/no partial KPIs/i);
    expect(screen.queryByLabelText('Portfolio KPI ribbon')).not.toBeInTheDocument();
  });

  it('renders honest empty state when the portfolio is empty', () => {
    setAllReady({ pipeline: [] });
    renderCockpit();
    expect(
      screen.getByText(/No authorized portfolio records found\./i),
    ).toBeInTheDocument();
  });

  it('renders a filter-aware empty state when the filter has zero matches', () => {
    setAllReady({ pipeline: [deal({ assignedBankerName: 'Alice' })] });
    setFilter({ kind: 'banker', id: 'b-zoe', name: 'Zoe' });
    renderCockpit();
    expect(
      screen.getByText(
        /No authorized portfolio records match the current banker filter\./i,
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// KPI ribbon
// ---------------------------------------------------------------------------

describe('Phase 126A — KPI ribbon', () => {
  it('renders the portfolio KPI tiles with honest labels', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', amount: 750_000 }),
        deal({ id: 'd2', amount: 250_000 }),
      ],
      bankers: [banker()],
    });
    renderCockpit();
    const ribbon = screen.getByLabelText('Portfolio KPI ribbon');
    expect(within(ribbon).getByLabelText(/2 active deals/)).toBeInTheDocument();
    expect(
      within(ribbon).getByLabelText(/Total exposure.*1,000,000/),
    ).toBeInTheDocument();
    expect(
      within(ribbon).getByLabelText(/0 deals blocked/),
    ).toBeInTheDocument();
    expect(
      within(ribbon).getByLabelText(/0 deals at risk/),
    ).toBeInTheDocument();
    expect(
      within(ribbon).getByLabelText(/no record activity/i),
    ).toBeInTheDocument();
  });

  it('renders "Not yet wired" for Avg days in stage when no deal has a stageEntryDate (honest absence)', () => {
    setAllReady({
      pipeline: [deal({ stageEntryDate: undefined })],
      bankers: [banker()],
    });
    renderCockpit();
    const ribbon = screen.getByLabelText('Portfolio KPI ribbon');
    expect(within(ribbon).getByText(/Not yet wired/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Analytics grid
// ---------------------------------------------------------------------------

describe('Phase 126A — analytics grid', () => {
  it('renders the analytics grid with at least 9 distinct chart regions', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1' }),
        deal({ id: 'd2', productType: 'SBA 504', loanStructure: 'Line of Credit', pricingType: 'Fixed' }),
      ],
      bankers: [banker()],
    });
    renderCockpit();
    const grid = screen.getByLabelText('Portfolio analytics grid');
    expect(within(grid).getByText(/Pipeline by stage/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Exposure by product type/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Loan structure mix/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Pricing type mix/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Exposure by banker/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Deal size mix/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Risk distribution/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Closings forecast/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Missing field concentration/i)).toBeInTheDocument();
    expect(within(grid).getByText(/Data quality/i)).toBeInTheDocument();
  });

  it('hides the analytics grid in loading / failed / empty states', () => {
    setManagerData({
      teamPipeline: ready([deal()]),
      teamBankers: ready([banker()]),
      teamTasks: { kind: 'loading' },
      teamDocuments: { kind: 'loading' },
    });
    renderCockpit();
    expect(
      screen.queryByLabelText('Portfolio analytics grid'),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Top exposures
// ---------------------------------------------------------------------------

describe('Phase 126A — top exposures', () => {
  it('renders each top-exposure name as a Link to /deals/<id>', () => {
    setAllReady({
      pipeline: [deal({ id: 'd-drill', name: 'Drill Deal', amount: 1_000_000 })],
      bankers: [banker()],
    });
    renderCockpit();
    const link = screen.getByLabelText('Open Drill Deal in the deal workspace');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/deals/d-drill');
  });

  it('renders share-of-total exposure on each row', () => {
    setAllReady({
      pipeline: [
        deal({ id: 'd1', name: 'Big', amount: 750_000 }),
        deal({ id: 'd2', name: 'Small', amount: 250_000 }),
      ],
      bankers: [banker()],
    });
    renderCockpit();
    expect(screen.getByText(/75% share/)).toBeInTheDocument();
    expect(screen.getByText(/25% share/)).toBeInTheDocument();
  });

  it('omits product/loan/pricing meta cells when undefined (honest absence)', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-sparse',
          name: 'Sparse refs',
          productType: undefined,
          loanStructure: undefined,
          pricingType: undefined,
        }),
      ],
      bankers: [banker()],
    });
    renderCockpit();
    const row = screen.getByText('Sparse refs').closest('li');
    expect(row).not.toBeNull();
    expect(within(row! as HTMLElement).queryByText(/^Product$/)).toBeNull();
    expect(within(row! as HTMLElement).queryByText(/^Loan structure$/)).toBeNull();
    expect(within(row! as HTMLElement).queryByText(/^Pricing$/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

describe('Phase 126A — exceptions list', () => {
  it('renders blocked + at-risk deals; each row name links to /deals/<id>', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-blocked',
          name: 'BlockedDeal',
          targetCloseDate: isoDaysAgo(15),
        }),
        deal({ id: 'd-clean', name: 'CleanDeal' }),
      ],
      bankers: [banker()],
    });
    renderCockpit();
    const list = screen.getByLabelText('Portfolio exceptions');
    expect(within(list).getByText('BlockedDeal')).toBeInTheDocument();
    expect(within(list).queryByText('CleanDeal')).not.toBeInTheDocument();
    const link = within(list).getByLabelText(
      'Open BlockedDeal in the deal workspace',
    );
    expect(link.getAttribute('href')).toBe('/deals/d-blocked');
  });

  it('renders honest "portfolio clear" copy when no deal is blocked/at-risk', () => {
    setAllReady({
      pipeline: [deal({ id: 'd-clean' })],
      bankers: [banker()],
    });
    renderCockpit();
    expect(
      screen.getByText(/Portfolio clear — no blocked or at-risk deals\./i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Filter integration
// ---------------------------------------------------------------------------

describe('Phase 126A — banker filter integration', () => {
  it('narrows the KPI ribbon + top exposures when a banker is selected', () => {
    setAllReady({
      pipeline: [
        deal({
          id: 'd-alice',
          name: 'AliceDeal',
          assignedBankerId: 'b-alice',
          assignedBankerName: 'Alice',
          amount: 500_000,
        }),
        deal({
          id: 'd-bob',
          name: 'BobDeal',
          assignedBankerId: 'b-bob',
          assignedBankerName: 'Bob',
          amount: 1_500_000,
        }),
      ],
      bankers: [
        banker({ id: 'b-alice', fullName: 'Alice' }),
        banker({ id: 'b-bob', fullName: 'Bob' }),
      ],
    });
    setFilter({ kind: 'banker', id: 'b-alice', name: 'Alice' });
    renderCockpit();
    const ribbon = screen.getByLabelText('Portfolio KPI ribbon');
    expect(within(ribbon).getByLabelText(/1 active deals/)).toBeInTheDocument();
    expect(
      within(ribbon).getByLabelText(/Total exposure.*500,000/),
    ).toBeInTheDocument();
    // The "Filtered to Alice" chip is visible.
    expect(screen.getByText(/Filtered to Alice/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

describe('Phase 126A — PortfolioCommandCenter.tsx static-source discipline', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'PortfolioCommandCenter.tsx'),
    'utf8',
  );
  const sourceCode = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(
    /(^|\s)\/\/.*$/gm,
    '$1',
  );

  it('imports the portfolio snapshot deriver', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*derivePortfolioCommandSnapshot[^}]*\}\s+from\s+['"]\.\/portfolioCommandSnapshot['"]/,
    );
  });

  it('reuses ManagerChartPrimitives (no duplicate chart library)', () => {
    expect(SRC).toMatch(
      /import\s+\{[\s\S]*?VerticalBarChart[\s\S]*?HorizontalBarChart[\s\S]*?DonutChart[\s\S]*?\}\s+from\s+['"]\.\.\/manager\/ManagerChartPrimitives['"]/,
    );
  });

  it('does NOT import any banker-only write surface', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*\/banker\//);
    expect(SRC).not.toMatch(/DealAutopilotPanel/);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*Office365/);
    expect(SRC).not.toMatch(/SendEmailV2/);
    expect(SRC).not.toMatch(/sendDocumentRequestEmail/);
    expect(SRC).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(SRC).not.toMatch(/RequestDocumentModal/);
    expect(SRC).not.toMatch(/CompleteTaskModal/);
    expect(SRC).not.toMatch(/CreditMemoDraftModal/);
  });

  it('does NOT render any button / form / interactive write affordance', () => {
    expect(sourceCode).not.toMatch(/<button\b/i);
    expect(sourceCode).not.toMatch(/<form\b/i);
    expect(sourceCode).not.toMatch(/onSubmit/);
    expect(sourceCode).not.toMatch(/onClick/);
  });

  it('does NOT contain predictive / weighted-exposure vocabulary', () => {
    expect(sourceCode).not.toMatch(/weighted\s+exposure/i);
    expect(sourceCode).not.toMatch(/approval\s+(odds|probability)/i);
    expect(sourceCode).not.toMatch(/win\s+rate/i);
    expect(sourceCode).not.toMatch(/pull-through/i);
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
  it('mounts the CopilotAssistPanel atop the portfolio cockpit when the snapshot is ready', () => {
    setAllReady({ pipeline: [deal()], bankers: [banker()] });
    renderCockpit();
    expect(screen.getByText('Copilot Assist')).toBeInTheDocument();
  });

  it('clearly states the connector is not configured (no live connector required)', () => {
    setAllReady({ pipeline: [deal()], bankers: [banker()] });
    renderCockpit();
    expect(
      screen.getByText(/Copilot connector not configured/i),
    ).toBeInTheDocument();
  });

  it('states the assistant is read-only and cannot change data', () => {
    setAllReady({ pipeline: [deal()], bankers: [banker()] });
    renderCockpit();
    expect(
      screen.getByText(/Read-only assistant\. Cannot approve, change data/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 132A — Risk & Concentration Radar mounts in the cockpit
// ---------------------------------------------------------------------------

describe('Phase 132A — risk radar', () => {
  it('mounts the Risk & Concentration Radar near the top when ready', () => {
    setAllReady({ pipeline: [deal({ assignedBankerName: 'Alice' })] });
    renderCockpit();
    expect(
      screen.getByRole('region', { name: /Risk and Concentration Radar/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Single-name concentration')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Policy bands are operational indicators, not regulatory classifications\./,
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 144D — KPI drill-through deep-link
// ---------------------------------------------------------------------------

function renderCockpitAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PortfolioCommandCenter />
    </MemoryRouter>,
  );
}

describe('Phase 144D — deep-link reopens a KPI drill-through panel', () => {
  it('opens the matching KPI panel when ?drill=<target id> is present', () => {
    setAllReady({ pipeline: [deal({ id: 'd1', amount: 750_000 })], bankers: [banker()] });
    renderCockpitAt('/portfolio?drill=portfolio-kpi-active-deals');
    const ribbon = screen.getByLabelText('Portfolio KPI ribbon');
    const tile = ribbon.querySelector('[data-portfolio-kpi="active-deals"]');
    const details = tile?.closest('details');
    expect(details).toBeTruthy();
    expect((details as HTMLDetailsElement).open).toBe(true);
    // The panel payload comes from the registry/props — its heading is the
    // target title, not the raw URL id.
    expect(within(details as HTMLElement).getByRole('heading', { name: 'Active deals' })).toBeTruthy();
  });

  it('does not open any panel for an unknown / unsafe drill param (fails closed)', () => {
    setAllReady({ pipeline: [deal({ id: 'd1' })], bankers: [banker()] });
    renderCockpitAt('/portfolio?drill=javascript:alert');
    const ribbon = screen.getByLabelText('Portfolio KPI ribbon');
    const openDetails = ribbon.querySelectorAll('details[open]');
    expect(openDetails.length).toBe(0);
  });

  it('leaves all panels closed when no drill param is present (normal behavior preserved)', () => {
    setAllReady({ pipeline: [deal({ id: 'd1' })], bankers: [banker()] });
    renderCockpitAt('/portfolio');
    const ribbon = screen.getByLabelText('Portfolio KPI ribbon');
    expect(ribbon.querySelectorAll('details[open]').length).toBe(0);
  });
});
