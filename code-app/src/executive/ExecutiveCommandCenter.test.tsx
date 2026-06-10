// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { useExecutiveDataMock } = vi.hoisted(() => ({
  useExecutiveDataMock: vi.fn(),
}));
vi.mock('./ExecutiveDataProvider', () => ({
  useExecutiveData: useExecutiveDataMock,
}));

import { ExecutiveCommandCenter } from './ExecutiveCommandCenter';
import type {
  DealReadinessSnapshotRow,
} from './snapshotQueries';
import type {
  StageAggregate,
  MonthBucketAggregate,
} from './operationalFallbackQueries';

function ready<T>(data: T) {
  return { kind: 'ready' as const, data };
}
const loading = { kind: 'loading' as const };

function readiness(
  over: Partial<DealReadinessSnapshotRow> = {},
): DealReadinessSnapshotRow {
  return {
    id: 'snap-1',
    dealId: 'deal-1',
    dealName: 'Deal One',
    snapshotAt: '2026-06-01T00:00:00Z',
    readinessBand: 'High',
    readinessBandLabel: 'High',
    readinessScore: 90,
    missingDocsCount: 0,
    openBlockersCount: 0,
    pendingApprovalsCount: 0,
    staleItemsCount: 0,
    ...over,
  };
}

function setData(over: Record<string, unknown> = {}) {
  useExecutiveDataMock.mockReturnValue({
    snapshotProfitability: loading,
    snapshotReadiness: loading,
    snapshotPerformance: loading,
    snapshotRefreshStatus: loading,
    fallbackPipelineByStage: loading,
    fallbackClosingForecast: loading,
    ...over,
  });
}

function setReady(opts: {
  readiness?: DealReadinessSnapshotRow[];
  pipelineByStage?: StageAggregate[];
  closingForecast?: MonthBucketAggregate[];
} = {}) {
  setData({
    snapshotReadiness: ready(opts.readiness ?? []),
    snapshotPerformance: ready([]),
    fallbackPipelineByStage: ready(
      opts.pipelineByStage ?? [
        { stage: 'Underwriting', count: 2, totalAmount: 6_000_000 },
      ],
    ),
    fallbackClosingForecast: ready(opts.closingForecast ?? []),
  });
}

function renderCockpit() {
  return render(
    <MemoryRouter>
      <ExecutiveCommandCenter />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useExecutiveDataMock.mockReset();
});

describe('Phase 133A — ExecutiveCommandCenter states', () => {
  it('renders a loading strip while core data loads (no KPI ribbon yet)', () => {
    setData(); // all loading
    renderCockpit();
    expect(
      screen.getByText(/Loading authorized executive snapshot/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Executive KPI ribbon'),
    ).not.toBeInTheDocument();
  });

  it('fails closed when a core slot fails', () => {
    setData({
      snapshotReadiness: { kind: 'failed', message: 'boom' },
      fallbackPipelineByStage: ready([]),
      fallbackClosingForecast: ready([]),
    });
    renderCockpit();
    expect(screen.getByText(/failing closed/i)).toBeInTheDocument();
  });

  it('renders an empty state when there is no snapshot data', () => {
    setReady({ readiness: [], pipelineByStage: [], closingForecast: [] });
    renderCockpit();
    expect(
      screen.getByText(/No authorized executive snapshot records found/i),
    ).toBeInTheDocument();
  });
});

describe('Phase 133A — ExecutiveCommandCenter content', () => {
  it('renders the KPI ribbon', () => {
    setReady();
    renderCockpit();
    const ribbon = screen.getByLabelText('Executive KPI ribbon');
    expect(ribbon).toBeInTheDocument();
    // Phase 144B — scope to the KPI tile faces; the same labels now also appear as
    // contributing-count labels inside the read-only drill-through panels.
    expect(ribbon.querySelector('[data-executive-kpi="active-deals"]')?.textContent).toContain('Active deals');
    expect(ribbon.querySelector('[data-executive-kpi="total-exposure"]')?.textContent).toContain('Total exposure');
  });

  it('renders risk + data-quality summaries', () => {
    setReady({
      readiness: [
        readiness({ id: '1', readinessBand: 'Blocked' }),
        readiness({ id: '2', readinessBand: 'High' }),
      ],
    });
    renderCockpit();
    expect(
      screen.getByRole('region', { name: /Strategic risk strip/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Data quality and readiness summary/i }),
    ).toBeInTheDocument();
  });

  it('renders top deals to watch as deal links', () => {
    setReady({
      readiness: [
        readiness({ id: '1', dealId: 'deal-blocked', dealName: 'BlockedDeal', readinessBand: 'Blocked', openBlockersCount: 3 }),
      ],
    });
    renderCockpit();
    const topDeals = screen.getByRole('region', { name: /Top deals to watch/i });
    const link = within(topDeals).getByText('BlockedDeal');
    expect(link.getAttribute('href')).toBe('/deals/deal-blocked');
  });

  it('renders the Copilot Assist panel in not-configured posture', () => {
    setReady();
    renderCockpit();
    expect(screen.getByText('Copilot Assist')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('renders the honest-omission copy', () => {
    setReady();
    renderCockpit();
    expect(
      screen.getByText(
        /Executive view is derived from authorized lending records currently available to this workspace\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No approval probabilities or predictive rankings are shown\./),
    ).toBeInTheDocument();
  });
});

describe('Phase 134A — empty-state + partial-data honesty', () => {
  it('a fully-empty executive view shows the empty state and NO KPI ribbon (no invented metrics)', () => {
    setReady({ readiness: [], pipelineByStage: [], closingForecast: [] });
    renderCockpit();
    expect(
      screen.getByText(/No authorized executive snapshot records found/i),
    ).toBeInTheDocument();
    // No KPI ribbon, no risk strip — nothing is fabricated to fill the page.
    expect(screen.queryByLabelText('Executive KPI ribbon')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /Strategic risk strip/i }),
    ).not.toBeInTheDocument();
  });

  it('an empty pipeline with readiness present renders honest ZERO exposure (not invented from readiness)', () => {
    // Readiness rows carry no dollar amount; exposure must come ONLY from
    // the stage aggregate. With no stage rows, exposure must read $0.
    setReady({
      pipelineByStage: [],
      readiness: [
        readiness({ id: '1', readinessBand: 'Blocked', openBlockersCount: 2 }),
        readiness({ id: '2', readinessBand: 'High' }),
      ],
    });
    renderCockpit();
    expect(screen.getByLabelText('Executive KPI ribbon')).toBeInTheDocument();
    // Active deals + total exposure are honest zeros, not fabricated.
    expect(screen.getByLabelText('0 active deals')).toBeInTheDocument();
    expect(screen.getByLabelText(/Total exposure \$0/)).toBeInTheDocument();
    // Risk posture still reflects the readiness rows that DO exist.
    expect(
      screen.getByRole('region', { name: /Strategic risk strip/i }),
    ).toBeInTheDocument();
  });

  it('a failed performance slot does NOT fail the cockpit closed or invent KPIs (only the 3 core slots gate)', () => {
    setData({
      snapshotReadiness: ready([readiness()]),
      snapshotPerformance: { kind: 'failed', message: 'perf boom' },
      fallbackPipelineByStage: ready([
        { stage: 'Underwriting', count: 1, totalAmount: 1_000_000 },
      ]),
      fallbackClosingForecast: ready([]),
    });
    renderCockpit();
    expect(screen.getByLabelText('Executive KPI ribbon')).toBeInTheDocument();
    expect(screen.queryByText(/failing closed/i)).not.toBeInTheDocument();
    // Real exposure from the stage aggregate; nothing invented from perf.
    expect(screen.getByLabelText('1 active deals')).toBeInTheDocument();
  });
});

describe('Phase 134B — density sections render from real data', () => {
  it('renders the stage distribution, closing forecast, and exception tape sections', () => {
    const { container } = (() => {
      setReady({
        pipelineByStage: [
          { stage: 'Underwriting', count: 2, totalAmount: 6_000_000 },
        ],
        readiness: [
          readiness({ id: '1', readinessBand: 'Blocked', missingDocsCount: 1 }),
        ],
        closingForecast: [
          { key: '2026-07', label: 'July 2026', count: 1, totalAmount: 2_000_000, past: false },
        ],
      });
      return renderCockpit();
    })();
    expect(
      container.querySelector('[data-executive-cockpit-section="stage-distribution"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-executive-cockpit-section="closing-forecast"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-executive-cockpit-section="exception-tape"]'),
    ).not.toBeNull();
  });

  it('the exception tape shows the real blocked count from readiness (no fabrication)', () => {
    const { container } = (() => {
      setReady({
        readiness: [
          readiness({ id: '1', readinessBand: 'Blocked' }),
          readiness({ id: '2', readinessBand: 'Blocked' }),
          readiness({ id: '3', readinessBand: 'High' }),
        ],
      });
      return renderCockpit();
    })();
    const blocked = container.querySelector(
      '[data-executive-exception="blocked"]',
    );
    expect(blocked).not.toBeNull();
    expect(blocked!.getAttribute('aria-label')).toBe('Blocked readiness: 2');
  });

  it('closing-forecast card shows an honest empty message when there are no upcoming windows', () => {
    setReady({ closingForecast: [] });
    renderCockpit();
    expect(
      screen.getByText(/No upcoming closing windows in the forecast/i),
    ).toBeInTheDocument();
  });
});

describe('Phase 134B — performance / profitability honesty', () => {
  it('shows availability counts and an explicit "Not yet wired" — no fabricated revenue/ROE', () => {
    setData({
      snapshotReadiness: ready([readiness()]),
      snapshotPerformance: ready([
        { id: 'm1', bankerId: 'b1', bankerName: 'A', metricName: 'closed', metricType: undefined, periodStart: '', periodEnd: '', value: 3 },
      ]),
      snapshotProfitability: ready([
        { id: 'p1', asOfDate: '', relationshipName: 'R', totalLoanBalance: 1, totalDeposits: 1, totalLoanRevenue: undefined, totalRelationshipRevenue: undefined, feeIncomeYtd: undefined, roe: undefined, estimatedVsActual: undefined, snapshotFreshness: '', snapshotVersion: '', staleDataFlag: false, snapshotState: undefined },
      ]),
      fallbackPipelineByStage: ready([{ stage: 'Underwriting', count: 1, totalAmount: 1_000_000 }]),
      fallbackClosingForecast: ready([]),
    });
    renderCockpit();
    const panel = screen.getByRole('region', {
      name: /Performance and profitability availability/i,
    });
    expect(within(panel).getByText('Performance metric rows')).toBeInTheDocument();
    expect(within(panel).getByText('Profitability snapshots')).toBeInTheDocument();
    expect(
      within(panel).getByText(/Not yet wired in the executive cockpit/i),
    ).toBeInTheDocument();
    // No fabricated dollar / ROE / yield / margin figures appear in the panel.
    expect(panel.textContent ?? '').not.toMatch(/ROE\s*[:=]|\$\s*\d|%/);
  });

  it('a FAILED profitability slot (non-core) does not fail the cockpit closed or invent KPIs', () => {
    setData({
      snapshotReadiness: ready([readiness()]),
      snapshotProfitability: { kind: 'failed', message: 'profit boom' },
      fallbackPipelineByStage: ready([{ stage: 'Underwriting', count: 1, totalAmount: 1_000_000 }]),
      fallbackClosingForecast: ready([]),
    });
    renderCockpit();
    expect(screen.getByLabelText('Executive KPI ribbon')).toBeInTheDocument();
    expect(screen.queryByText(/failing closed/i)).not.toBeInTheDocument();
    // Availability count reads 0 (not loaded), never invented.
    const panel = screen.getByRole('region', {
      name: /Performance and profitability availability/i,
    });
    expect(within(panel).getByText('Profitability snapshots')).toBeInTheDocument();
  });
});

describe('Phase 133A — ExecutiveCommandCenter is read-only + honest (static source)', () => {
  const src = readFileSync(
    resolve(__dirname, 'ExecutiveCommandCenter.tsx'),
    'utf8',
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('has no <button> / <form> / onClick / onSubmit in the cockpit body', () => {
    expect(code).not.toMatch(/<button\b/i);
    expect(code).not.toMatch(/<form\b/i);
    expect(code).not.toMatch(/\bonClick\b/);
    expect(code).not.toMatch(/\bonSubmit\b/);
  });

  it('does not consume manager / banker / portfolio operational providers (W2 isolation)', () => {
    expect(code).not.toMatch(/useManagerData|ManagerProvider/);
    expect(code).not.toMatch(/useBanker\b|BankerProvider/);
    expect(code).not.toMatch(/from ['"]\.\.\/portfolio\//);
  });

  it('Phase 134B — introduces no fetch / Graph / Office / Dataverse-write / email-send pattern', () => {
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(/XMLHttpRequest/);
    expect(code).not.toMatch(/SendEmailV2|Office365/);
    expect(code).not.toMatch(/microsoft-graph|graph\.microsoft/i);
    expect(code).not.toMatch(/from ['"]\.\.\/generated\//);
    expect(code).not.toMatch(/\.create\(|\.update\(|\.patch\(|\.delete\(/);
  });

  // Note: the cockpit renders the honest-omission disclaimer, which
  // legitimately names "profitability", "approval probabilities", and
  // "predictive rankings" as things NOT shown. The no-fake-metric
  // guarantee is therefore pinned on the pure deriver
  // (executiveCommandSnapshot.test.ts), whose runtime code carries no
  // such disclaimer text. Here we only confirm the disclaimer is present
  // (covered by the "honest-omission copy" render test above).
});

describe('Phase 135A — Executive demo readiness contract', () => {
  it('the densified demo cockpit still renders every 134B section from real data', () => {
    setReady({
      readiness: [
        readiness({ id: '1', readinessBand: 'Blocked' }),
        readiness({ id: '2', readinessBand: 'High' }),
      ],
      pipelineByStage: [
        { stage: 'Underwriting', count: 2, totalAmount: 6_000_000 },
      ],
      closingForecast: [],
    });
    const { container } = renderCockpit();
    for (const section of [
      'kpi-ribbon',
      'exception-tape',
      'strategic-risk',
      'exposure',
      'stage-distribution',
      'closing-forecast',
      'operations',
      'data-quality',
      'top-deals',
      'top-bottlenecks',
      'performance-profitability',
      'omissions',
    ]) {
      expect(
        container.querySelector(
          `[data-executive-cockpit-section="${section}"]`,
        ),
      ).not.toBeNull();
    }
  });

  it('still shows the honest "Not yet wired" performance/profitability state for the demo', () => {
    setReady({
      readiness: [readiness({ readinessBand: 'High' })],
    });
    renderCockpit();
    const panel = screen.getByLabelText(
      'Performance and profitability availability',
    );
    expect(within(panel).getAllByText(/Not yet wired/i).length).toBeGreaterThan(
      0,
    );
    // The demo panel must not surface any revenue / ROE / yield / margin /
    // dollar figure — only availability counts.
    expect(panel.textContent).not.toMatch(/ROE\s*[:=]|\$\s*\d|%/);
  });

  it('keeps the empty state honest as an expected demo state (no fabricated sections)', () => {
    setReady({ readiness: [], pipelineByStage: [], closingForecast: [] });
    const { container } = renderCockpit();
    expect(
      screen.getByText(/No authorized executive snapshot records found/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Executive KPI ribbon'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-executive-cockpit-section="stage-distribution"]',
      ),
    ).toBeNull();
  });

  it('cockpit source reads no profitability figure fields — only the availability count (static pin)', () => {
    // Strip comments so doc-comment vocabulary ("ROE", "revenue", etc.) does
    // not trip the scan; we pin on actual property access of figure fields.
    const code = readFileSync(
      resolve(__dirname, 'ExecutiveCommandCenter.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    // Availability is the ONLY thing read off the profitability slot.
    expect(code).toMatch(/snapshotProfitability\.data\.length/);
    // None of the profitability figure fields are ever accessed.
    for (const field of [
      /\.roe\b/,
      /\.totalLoanRevenue\b/,
      /\.totalRelationshipRevenue\b/,
      /\.feeIncomeYtd\b/,
      /\.totalDeposits\b/,
      /\.totalLoanBalance\b/,
      /\.estimatedVsActual\b/,
    ]) {
      expect(code).not.toMatch(field);
    }
  });
});

describe('Phase 135B — Executive final demo smoke', () => {
  // A single populated render that walks every demo-critical section by its
  // ACCESSIBLE name (region role / label) — the way a reviewer or QA pass
  // reads the screen, complementing the 135A data-attribute loop.
  it('renders every demo-critical section by its accessible name', () => {
    setReady({
      readiness: [
        readiness({ id: '1', dealId: 'd1', dealName: 'Blocked Deal', readinessBand: 'Blocked', openBlockersCount: 3, missingDocsCount: 1, staleItemsCount: 1 }),
        readiness({ id: '2', dealId: 'd2', dealName: 'Healthy Deal', readinessBand: 'High' }),
      ],
      pipelineByStage: [
        { stage: 'Underwriting', count: 1, totalAmount: 6_000_000 },
        { stage: 'Closing', count: 1, totalAmount: 4_000_000 },
      ],
      closingForecast: [
        { key: '2026-07', label: 'July 2026', count: 1, totalAmount: 2_000_000, past: false },
      ],
    });
    renderCockpit();

    // Read-only posture is unmistakable.
    expect(screen.getByLabelText('Read-only executive view')).toBeInTheDocument();

    // Every demo-critical region is reachable by its accessible name. Using
    // the region role (exact name) so a chart sharing a title string doesn't
    // create an ambiguous match.
    for (const name of [
      'Executive KPI ribbon',
      'Executive exception tape',
      'Strategic risk strip',
      'Portfolio exposure summary',
      'Stage distribution',
      'Closing forecast',
      'Operations health summary',
      'Data quality and readiness summary',
      'Top deals to watch',
      'Top operational bottlenecks',
      'Performance and profitability availability',
      'Executive view limitations',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }

    // Honest "Not yet wired" + Copilot not-configured both visible for the demo.
    expect(screen.getAllByText(/Not yet wired/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('the empty demo state shows no KPI ribbon, no exception tape, and no performance panel (no fabricated sections)', () => {
    setReady({ readiness: [], pipelineByStage: [], closingForecast: [] });
    renderCockpit();
    expect(
      screen.getByText(/No authorized executive snapshot records found/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Executive KPI ribbon')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Executive exception tape'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Performance and profitability availability'),
    ).not.toBeInTheDocument();
  });

  it('partial data (readiness, no stage aggregates) still smokes clean — honest $0 exposure, risk posture present', () => {
    setReady({
      pipelineByStage: [],
      readiness: [
        readiness({ id: '1', readinessBand: 'Blocked', openBlockersCount: 2 }),
        readiness({ id: '2', readinessBand: 'High' }),
      ],
    });
    renderCockpit();
    expect(screen.getByLabelText('Executive KPI ribbon')).toBeInTheDocument();
    expect(screen.getByLabelText(/Total exposure \$0/)).toBeInTheDocument();
    expect(screen.getByLabelText('Strategic risk strip')).toBeInTheDocument();
  });

  // Final consolidated hardening pin: the whole Executive demo trio
  // (workspace shell + cockpit + chart adapter) carries NO write affordance
  // and NO IO surface. This is the "finish pass" guard that all three files
  // stay demo-safe together.
  it('the Executive demo trio contains no write affordance or IO surface (static pin)', () => {
    const strip = (rel: string) =>
      readFileSync(resolve(__dirname, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
    const files: Record<string, string> = {
      cockpit: strip('ExecutiveCommandCenter.tsx'),
      adapter: strip('executiveDashboardCharts.ts'),
      workspace: strip('../workspaces/ExecutiveWorkspace.tsx'),
    };
    for (const [where, code] of Object.entries(files)) {
      expect(code, `${where}: no <form>`).not.toMatch(/<form\b/i);
      expect(code, `${where}: no onSubmit`).not.toMatch(/\bonSubmit\b/);
      expect(code, `${where}: no SendEmail`).not.toMatch(/SendEmail/i);
      expect(code, `${where}: no Office365`).not.toMatch(/Office365/i);
      expect(code, `${where}: no Graph`).not.toMatch(/microsoft-graph|graph\.microsoft/i);
      expect(code, `${where}: no generated write import`).not.toMatch(/from ['"][^'"]*\/generated\//);
    }
    // No network fetch in the cockpit or the chart adapter.
    expect(files.cockpit).not.toMatch(/\bfetch\(/);
    expect(files.adapter).not.toMatch(/\bfetch\b/);
  });
});
