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
    expect(screen.getByLabelText('Executive KPI ribbon')).toBeInTheDocument();
    expect(screen.getByText('Active deals')).toBeInTheDocument();
    expect(screen.getByText('Total exposure')).toBeInTheDocument();
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

  // Note: the cockpit renders the honest-omission disclaimer, which
  // legitimately names "profitability", "approval probabilities", and
  // "predictive rankings" as things NOT shown. The no-fake-metric
  // guarantee is therefore pinned on the pure deriver
  // (executiveCommandSnapshot.test.ts), whose runtime code carries no
  // such disclaimer text. Here we only confirm the disclaimer is present
  // (covered by the "honest-omission copy" render test above).
});
