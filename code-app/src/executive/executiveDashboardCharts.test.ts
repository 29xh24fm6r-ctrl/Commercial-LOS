import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deriveExecutiveCommandSnapshot } from './executiveCommandSnapshot';
import {
  stageCountBars,
  stageExposureBars,
  readinessDonutSegments,
  closingForecastPoints,
  executiveExceptionTape,
} from './executiveDashboardCharts';
import type { DealReadinessSnapshotRow } from './snapshotQueries';
import type {
  StageAggregate,
  MonthBucketAggregate,
} from './operationalFallbackQueries';

/**
 * Phase 134B — executiveDashboardCharts pure-adapter tests.
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

function snap(opts: {
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

describe('Phase 134B — stage chart adapters', () => {
  const s = snap({
    pipelineByStage: [
      { stage: 'Underwriting', count: 3, totalAmount: 6_000_000 },
      { stage: 'Closing', count: 2, totalAmount: 4_000_000 },
    ],
  });

  it('stageCountBars maps deal count per stage', () => {
    const bars = stageCountBars(s);
    expect(bars.map((b) => b.label)).toEqual(['Underwriting', 'Closing']);
    expect(bars.map((b) => b.value)).toEqual([3, 2]);
    expect(bars.every((b) => b.tone === 'info')).toBe(true);
  });

  it('stageExposureBars maps $ per stage with a count·share secondary label', () => {
    const bars = stageExposureBars(s);
    expect(bars[0].value).toBe(6_000_000);
    expect(bars[0].secondaryLabel).toMatch(/3 · 60%/);
  });

  it('an unknown stage bucket carries the neutral tone', () => {
    const u = snap({ pipelineByStage: [{ stage: '(no stage)', count: 1, totalAmount: 0 }] });
    expect(stageCountBars(u)[0].tone).toBe('neutral');
  });
});

describe('Phase 134B — readiness donut adapter', () => {
  it('produces five segments with counts from the risk distribution', () => {
    const s = snap({
      readiness: [
        readiness({ id: '1', readinessBand: 'Blocked' }),
        readiness({ id: '2', readinessBand: 'High' }),
        readiness({ id: '3', readinessBand: undefined }),
      ],
    });
    const segs = readinessDonutSegments(s.riskDistribution);
    expect(segs.map((x) => x.label)).toEqual(['High', 'Medium', 'Low', 'Blocked', 'Unknown']);
    expect(segs.find((x) => x.label === 'Blocked')!.value).toBe(1);
    expect(segs.find((x) => x.label === 'High')!.value).toBe(1);
    expect(segs.find((x) => x.label === 'Unknown')!.value).toBe(1);
  });
});

describe('Phase 134B — closing forecast adapter', () => {
  it('keeps only upcoming (non-past) buckets', () => {
    const s = snap({
      closingForecast: [
        { key: 'past', label: 'Past target close', count: 5, totalAmount: 9_000_000, past: true },
        { key: '2026-07', label: 'July 2026', count: 1, totalAmount: 2_000_000, past: false },
      ],
    });
    const pts = closingForecastPoints(s);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toEqual({ label: 'July 2026', dealCount: 1, totalAmount: 2_000_000 });
  });
});

describe('Phase 134B — executive exception tape', () => {
  it('derives honest bucket counts from the snapshot (real counts only)', () => {
    const s = snap({
      readiness: [
        readiness({ id: '1', readinessBand: 'Blocked', missingDocsCount: 1, staleItemsCount: 2 }),
        readiness({ id: '2', readinessBand: 'Low' }),
        readiness({ id: '3', readinessBand: undefined }),
      ],
    });
    const tape = executiveExceptionTape(s);
    const byKey = Object.fromEntries(tape.map((b) => [b.key, b]));
    expect(byKey['blocked'].count).toBe(1);
    expect(byKey['low-readiness'].count).toBe(1);
    expect(byKey['missing-docs'].count).toBe(1);
    expect(byKey['stale'].count).toBe(1);
    expect(byKey['no-band'].count).toBe(1);
    // Non-zero buckets carry a risk tone.
    expect(byKey['blocked'].tone).toBe('blocked');
  });

  it('a zero bucket is surfaced honestly with a clear tone (not hidden, not faked)', () => {
    const s = snap({ readiness: [readiness({ readinessBand: 'High' })] });
    const byKey = Object.fromEntries(
      executiveExceptionTape(s).map((b) => [b.key, b]),
    );
    expect(byKey['blocked'].count).toBe(0);
    expect(byKey['blocked'].tone).toBe('clear');
  });
});

describe('Phase 134B — adapter is pure (no IO / no write)', () => {
  // Strip comments — the doc-comment legitimately names "fetch"/"mutation"
  // as non-goals.
  const code = readFileSync(
    resolve(__dirname, 'executiveDashboardCharts.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  it('contains no fetch / network / Dataverse-write / async surface', () => {
    expect(code).not.toMatch(/\bfetch\b/);
    expect(code).not.toMatch(/\bawait\b/);
    expect(code).not.toMatch(/\basync\b/);
    expect(code).not.toMatch(/from ['"]\.\.\/generated\//);
    expect(code).not.toMatch(/\.create\(|\.update\(|\.patch\(|\.delete\(/);
  });
});
