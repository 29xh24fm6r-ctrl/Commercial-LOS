import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveExecutiveCommandSnapshot,
  executiveCopilotSummaries,
} from './executiveCommandSnapshot';
import type {
  DealReadinessSnapshotRow,
} from './snapshotQueries';
import type {
  StageAggregate,
  MonthBucketAggregate,
} from './operationalFallbackQueries';

/**
 * Phase 133A — executiveCommandSnapshot pure derivation tests.
 */

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

function stage(over: Partial<StageAggregate> = {}): StageAggregate {
  return { stage: 'Underwriting', count: 1, totalAmount: 1_000_000, ...over };
}

function month(over: Partial<MonthBucketAggregate> = {}): MonthBucketAggregate {
  return {
    key: '2026-07',
    label: 'July 2026',
    count: 1,
    totalAmount: 1_000_000,
    past: false,
    ...over,
  };
}

function derive(opts: {
  readiness?: DealReadinessSnapshotRow[];
  pipelineByStage?: StageAggregate[];
  closingForecast?: MonthBucketAggregate[];
}) {
  return deriveExecutiveCommandSnapshot({
    readiness: opts.readiness ?? [],
    pipelineByStage: opts.pipelineByStage ?? [],
    closingForecast: opts.closingForecast ?? [],
    performance: [],
  });
}

// ---------------------------------------------------------------------------
// Empty view
// ---------------------------------------------------------------------------

describe('Phase 133A — empty executive view', () => {
  it('returns isEmpty with zeroed ribbon and no rows', () => {
    const s = derive({});
    expect(s.isEmpty).toBe(true);
    expect(s.ribbon.totalActiveDeals).toBe(0);
    expect(s.ribbon.totalExposure).toBe(0);
    expect(s.ribbon.blockedCount).toBe(0);
    expect(s.exposureByStage).toHaveLength(0);
    expect(s.topDeals).toHaveLength(0);
    expect(s.topBlockers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// KPI ribbon + exposure
// ---------------------------------------------------------------------------

describe('Phase 133A — KPI ribbon', () => {
  it('totals active deals + exposure from the stage aggregate', () => {
    const s = derive({
      pipelineByStage: [
        stage({ stage: 'Underwriting', count: 3, totalAmount: 6_000_000 }),
        stage({ stage: 'Closing', count: 2, totalAmount: 4_000_000 }),
      ],
    });
    expect(s.ribbon.totalActiveDeals).toBe(5);
    expect(s.ribbon.totalExposure).toBe(10_000_000);
    expect(s.exposureByStage[0].stage).toBe('Underwriting');
    expect(s.exposureByStage[0].sharePct).toBe(60);
  });

  it('maps readiness bands to risk distribution + blocked / at-risk counts', () => {
    const s = derive({
      readiness: [
        readiness({ id: '1', readinessBand: 'Blocked' }),
        readiness({ id: '2', readinessBand: 'Low' }),
        readiness({ id: '3', readinessBand: 'Low' }),
        readiness({ id: '4', readinessBand: 'High' }),
        readiness({ id: '5', readinessBand: undefined }),
      ],
    });
    expect(s.riskDistribution.blocked).toBe(1);
    expect(s.riskDistribution.low).toBe(2);
    expect(s.riskDistribution.high).toBe(1);
    expect(s.riskDistribution.unknown).toBe(1);
    expect(s.ribbon.blockedCount).toBe(1);
    expect(s.ribbon.atRiskCount).toBe(2);
    expect(s.ribbon.readinessUnknownCount).toBe(1);
  });

  it('sums operational counts from readiness rows', () => {
    const s = derive({
      readiness: [
        readiness({ id: '1', missingDocsCount: 2, openBlockersCount: 1, pendingApprovalsCount: 1, staleItemsCount: 3 }),
        readiness({ id: '2', missingDocsCount: 1, openBlockersCount: 2, pendingApprovalsCount: 0, staleItemsCount: 0 }),
      ],
    });
    expect(s.ribbon.outstandingDocumentCount).toBe(3);
    expect(s.ribbon.openBlockerCount).toBe(3);
    expect(s.ribbon.pendingApprovalCount).toBe(1);
    expect(s.ribbon.staleItemCount).toBe(3);
    expect(s.dataQuality.dealsWithMissingDocs).toBe(2);
    expect(s.dataQuality.dealsWithStaleItems).toBe(1);
  });

  it('takes closing-window exposure from the nearest future forecast bucket', () => {
    const s = derive({
      closingForecast: [
        month({ key: 'past', label: 'Past target close', past: true, totalAmount: 9_000_000 }),
        month({ key: '2026-07', label: 'July 2026', past: false, totalAmount: 2_000_000 }),
        month({ key: '2026-08', label: 'August 2026', past: false, totalAmount: 5_000_000 }),
      ],
    });
    expect(s.ribbon.closingWindowExposure).toBe(2_000_000);
    expect(s.ribbon.closingWindowLabel).toBe('July 2026');
  });
});

// ---------------------------------------------------------------------------
// Top deals / blockers ranking
// ---------------------------------------------------------------------------

describe('Phase 133A — readiness-ranked deals', () => {
  it('ranks blocked before low before high, then by open blockers', () => {
    const s = derive({
      readiness: [
        readiness({ id: '1', dealId: 'd-high', dealName: 'HighDeal', readinessBand: 'High' }),
        readiness({ id: '2', dealId: 'd-blocked', dealName: 'BlockedDeal', readinessBand: 'Blocked', openBlockersCount: 2 }),
        readiness({ id: '3', dealId: 'd-low', dealName: 'LowDeal', readinessBand: 'Low', openBlockersCount: 5 }),
      ],
    });
    expect(s.topDeals[0].dealName).toBe('BlockedDeal');
    expect(s.topDeals[1].dealName).toBe('LowDeal');
    expect(s.topDeals[2].dealName).toBe('HighDeal');
  });

  it('top blockers are ranked by open-blocker count and carry a dealId for linking', () => {
    const s = derive({
      readiness: [
        readiness({ id: '1', dealId: 'd-a', dealName: 'A', openBlockersCount: 1 }),
        readiness({ id: '2', dealId: 'd-b', dealName: 'B', openBlockersCount: 4 }),
        readiness({ id: '3', dealId: 'd-c', dealName: 'C', openBlockersCount: 0 }),
      ],
    });
    expect(s.topBlockers.map((d) => d.dealName)).toEqual(['B', 'A']);
    expect(s.topBlockers[0].dealId).toBe('d-b');
  });
});

// ---------------------------------------------------------------------------
// Copilot summary
// ---------------------------------------------------------------------------

describe('Phase 133A — Copilot summary', () => {
  it('includes ribbon + readiness lines and no raw GUID', () => {
    const s = derive({
      pipelineByStage: [stage({ count: 2, totalAmount: 2_000_000 })],
      readiness: [readiness({ id: 'snap-guid', dealId: 'deal-guid' })],
    });
    const lines = executiveCopilotSummaries(s);
    const joined = lines.join('\n');
    expect(joined).toMatch(/Active deals:/);
    expect(joined).toMatch(/Total exposure/);
    expect(joined).toMatch(/Readiness —/);
    for (const line of lines) {
      expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(line).not.toMatch(/deal-guid|snap-guid/);
    }
  });
});

// ---------------------------------------------------------------------------
// No fake / predictive / profitability language (static source)
// ---------------------------------------------------------------------------

describe('Phase 133A — snapshot makes no fake/predictive claim', () => {
  const src = readFileSync(
    resolve(__dirname, 'executiveCommandSnapshot.ts'),
    'utf8',
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('runtime code uses no profitability / approval-probability / win-rate / predictive vocabulary', () => {
    expect(code).not.toMatch(/profitab/i);
    expect(code).not.toMatch(/approval\s*(odds|probability)/i);
    expect(code).not.toMatch(/win\s*rate/i);
    expect(code).not.toMatch(/predict/i);
    expect(code).not.toMatch(/\byield\b/i);
    expect(code).not.toMatch(/\bCECL\b/i);
  });
});
