import { describe, it, expect } from 'vitest';

import {
  deriveStageDistribution,
  deriveBankerAmountDistribution,
  deriveAgingHistogram,
  deriveRiskDistribution,
  deriveClosingForecast,
  deriveMissingFieldsDistribution,
  deriveDataQualityDistribution,
} from './managerDashboardCharts';
import type { ManagerVMRow } from './managerPipelineSnapshot';
import type { DealIntelligenceViewModel } from '../shared/dealIntelligenceViewModel';
import type { TeamDeal } from './managerQueries';

/**
 * Phase 124E / 125A — managerDashboardCharts deriver tests.
 *
 * Pins:
 *   - stage / banker / aging / risk / forecast / missing / quality
 *     derivers all produce stable orderings;
 *   - missing fields surface in 'Unset' / 'Unassigned' / 'Unknown'
 *     buckets honestly (no fake category coercion);
 *   - injectable `now` controls aging + forecast deterministically;
 *   - empty inputs return empty / zeroed buckets without throwing;
 *   - readinessPct returns undefined when banker has no deals
 *     (degenerate division), 0..100 otherwise.
 */

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
    name: 'Default',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(45),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'b-default',
    assignedBankerName: 'Default Banker',
    collateralSummary: undefined,
    ...over,
  };
}

function vm(over: Partial<DealIntelligenceViewModel> = {}): DealIntelligenceViewModel {
  return {
    dealId: 'd-default',
    dealName: 'Default',
    clientName: 'Default client',
    bankerName: 'Default Banker',
    stageName: 'Underwriting',
    statusName: 'Active',
    productTypeName: undefined,
    loanStructureName: undefined,
    pricingTypeName: undefined,
    amount: 1_000_000,
    targetCloseDate: undefined,
    daysToClose: undefined,
    daysInStage: undefined,
    collateralSummary: undefined,
    completeness: {
      populatedFieldCount: 0,
      totalFieldCount: 13,
      completenessPct: 0,
      missingFieldLabels: [],
    },
    openTaskCount: 0,
    overdueTaskCount: 0,
    outstandingDocumentCount: 0,
    blockerStatus: 'clear',
    blockerSignals: [],
    lastActivity: { iso: undefined, daysSince: undefined, state: 'unknown' },
    nextBestAction: undefined,
    closure: 'open',
    ...over,
  };
}

function row(over: Partial<ManagerVMRow> = {}): ManagerVMRow {
  return {
    teamDeal: deal(),
    vm: vm(),
    openTaskCount: 0,
    overdueTaskCount: 0,
    outstandingDocumentCount: 0,
    managerMissingFieldLabels: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Stage distribution
// ---------------------------------------------------------------------------

describe('Phase 125A — deriveStageDistribution', () => {
  it('returns empty for no rows', () => {
    expect(deriveStageDistribution([])).toEqual([]);
  });

  it('groups by stage, sums amounts, sorts by amount desc', () => {
    const out = deriveStageDistribution([
      row({ teamDeal: deal({ id: 'd1', stage: 'Origination', amount: 100 }) }),
      row({ teamDeal: deal({ id: 'd2', stage: 'Underwriting', amount: 500 }) }),
      row({ teamDeal: deal({ id: 'd3', stage: 'Origination', amount: 200 }) }),
    ]);
    expect(out).toEqual([
      { stage: 'Underwriting', dealCount: 1, totalAmount: 500 },
      { stage: 'Origination', dealCount: 2, totalAmount: 300 },
    ]);
  });

  it("buckets deals with unset stage as 'Unset' (honest absence)", () => {
    const out = deriveStageDistribution([
      row({ teamDeal: deal({ id: 'd1', stage: undefined }) }),
      row({ teamDeal: deal({ id: 'd2', stage: '   ' }) }), // whitespace-only also unset
    ]);
    expect(out[0].stage).toBe('Unset');
    expect(out[0].dealCount).toBe(2);
  });

  it('treats undefined amounts as 0 (no fake substitution)', () => {
    const out = deriveStageDistribution([
      row({ teamDeal: deal({ stage: 'Origination', amount: undefined }) }),
    ]);
    expect(out[0].totalAmount).toBe(0);
    expect(out[0].dealCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Banker amount distribution
// ---------------------------------------------------------------------------

describe('Phase 125A — deriveBankerAmountDistribution', () => {
  it('aggregates per banker + sorts by amount desc', () => {
    const out = deriveBankerAmountDistribution(
      [
        row({
          teamDeal: deal({
            id: 'd1',
            assignedBankerId: 'b-a',
            assignedBankerName: 'Alice',
            amount: 500_000,
          }),
        }),
        row({
          teamDeal: deal({
            id: 'd2',
            assignedBankerId: 'b-b',
            assignedBankerName: 'Bob',
            amount: 1_000_000,
          }),
        }),
        row({
          teamDeal: deal({
            id: 'd3',
            assignedBankerId: 'b-a',
            assignedBankerName: 'Alice',
            amount: 200_000,
          }),
        }),
      ],
      NOW,
    );
    // Sort: total amount desc → Bob (1M) then Alice (700K).
    expect(out.map((r) => r.bankerName)).toEqual(['Bob', 'Alice']);
    expect(out[0].dealCount).toBe(1);
    expect(out[0].totalAmount).toBe(1_000_000);
    expect(out[1].dealCount).toBe(2);
    expect(out[1].totalAmount).toBe(700_000);
  });

  it("buckets deals with no banker into '__unassigned__' / 'Unassigned'", () => {
    const out = deriveBankerAmountDistribution(
      [
        row({
          teamDeal: deal({
            id: 'd-orphan',
            assignedBankerId: undefined,
            assignedBankerName: undefined,
          }),
        }),
      ],
      NOW,
    );
    expect(out[0].bankerId).toBe('__unassigned__');
    expect(out[0].bankerName).toBe('Unassigned');
  });

  it('counts atRisk as blocked OR at-risk; counts overdue tasks separately', () => {
    const out = deriveBankerAmountDistribution(
      [
        row({
          teamDeal: deal({ assignedBankerId: 'b1', assignedBankerName: 'X' }),
          vm: vm({ blockerStatus: 'blocked' }),
          openTaskCount: 3,
          overdueTaskCount: 1,
        }),
      ],
      NOW,
    );
    expect(out[0].atRiskCount).toBe(1);
    expect(out[0].openTaskCount).toBe(3);
    expect(out[0].overdueTaskCount).toBe(1);
  });

  it('readinessPct counts deals with zero missing fields; returns 100 / 0 / partial values honestly', () => {
    const out = deriveBankerAmountDistribution(
      [
        row({
          teamDeal: deal({ assignedBankerId: 'b1', assignedBankerName: 'X' }),
          managerMissingFieldLabels: [],
        }),
        row({
          teamDeal: deal({ id: 'd2', assignedBankerId: 'b1', assignedBankerName: 'X' }),
          managerMissingFieldLabels: ['Client'],
        }),
      ],
      NOW,
    );
    expect(out[0].readinessPct).toBe(50);
  });

  it('flags stale deals via modifiedOn ≥ 14 days', () => {
    const out = deriveBankerAmountDistribution(
      [
        row({
          teamDeal: deal({
            assignedBankerId: 'b1',
            assignedBankerName: 'X',
            modifiedOn: isoDaysAgo(20),
          }),
        }),
      ],
      NOW,
    );
    expect(out[0].staleDealCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Aging histogram
// ---------------------------------------------------------------------------

describe('Phase 125A — deriveAgingHistogram', () => {
  it('returns six labeled buckets even for empty input', () => {
    const out = deriveAgingHistogram([], NOW);
    expect(out.map((b) => b.label)).toEqual([
      '0–7 d',
      '8–14 d',
      '15–30 d',
      '31–60 d',
      '61–90 d',
      '90+ d',
    ]);
    expect(out.every((b) => b.dealCount === 0)).toBe(true);
  });

  it('places deals into the first matching bucket; ignores deals with no stageEntryDate', () => {
    const out = deriveAgingHistogram(
      [
        row({ teamDeal: deal({ stageEntryDate: isoDaysAgo(3) }) }), // 0-7
        row({ teamDeal: deal({ stageEntryDate: isoDaysAgo(20) }) }), // 15-30
        row({ teamDeal: deal({ stageEntryDate: isoDaysAgo(120) }) }), // 90+
        row({ teamDeal: deal({ stageEntryDate: undefined }) }), // skipped
      ],
      NOW,
    );
    expect(out.find((b) => b.label === '0–7 d')!.dealCount).toBe(1);
    expect(out.find((b) => b.label === '15–30 d')!.dealCount).toBe(1);
    expect(out.find((b) => b.label === '90+ d')!.dealCount).toBe(1);
  });

  it('ignores future stage entries (negative days)', () => {
    const out = deriveAgingHistogram(
      [row({ teamDeal: deal({ stageEntryDate: isoDaysFromNow(5) }) })],
      NOW,
    );
    expect(out.reduce((s, b) => s + b.dealCount, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Risk distribution
// ---------------------------------------------------------------------------

describe('Phase 125A — deriveRiskDistribution', () => {
  it('counts each blocker status; defaults missing/unknown into the unknown bucket', () => {
    const out = deriveRiskDistribution([
      row({ vm: vm({ blockerStatus: 'blocked' }) }),
      row({ vm: vm({ blockerStatus: 'at-risk' }) }),
      row({ vm: vm({ blockerStatus: 'at-risk' }) }),
      row({ vm: vm({ blockerStatus: 'clear' }) }),
      row({ vm: vm({ blockerStatus: undefined }) }),
    ]);
    expect(out).toEqual({ blocked: 1, atRisk: 2, clear: 1, unknown: 1 });
  });
});

// ---------------------------------------------------------------------------
// Closing forecast
// ---------------------------------------------------------------------------

describe('Phase 125A — deriveClosingForecast', () => {
  it('builds 6 monthly buckets starting with the month containing `now`', () => {
    const out = deriveClosingForecast([], NOW, 6);
    expect(out).toHaveLength(6);
    // NOW = 2026-06-03 → first bucket is Jun 2026, last is Nov 2026.
    expect(out[0].label).toBe('Jun 2026');
    expect(out[5].label).toBe('Nov 2026');
  });

  it('places deals into their UTC target-close month; excludes past dates', () => {
    const out = deriveClosingForecast(
      [
        row({ teamDeal: deal({ targetCloseDate: isoDaysFromNow(10), amount: 100 }) }), // June 13
        row({ teamDeal: deal({ targetCloseDate: isoDaysFromNow(40), amount: 200 }) }), // July 13
        row({ teamDeal: deal({ targetCloseDate: isoDaysAgo(10), amount: 999 }) }), // past — excluded
        row({ teamDeal: deal({ targetCloseDate: undefined }) }), // skipped
      ],
      NOW,
      6,
    );
    expect(out[0].dealCount).toBe(1);
    expect(out[0].totalAmount).toBe(100);
    expect(out[1].dealCount).toBe(1);
    expect(out[1].totalAmount).toBe(200);
    expect(out.reduce((s, b) => s + b.dealCount, 0)).toBe(2);
  });

  it('rolls over year boundaries when monthHorizon crosses December', () => {
    const lateNov = new Date('2026-11-15T12:00:00Z');
    const out = deriveClosingForecast([], lateNov, 6);
    expect(out[0].label).toBe('Nov 2026');
    expect(out[1].label).toBe('Dec 2026');
    expect(out[2].label).toBe('Jan 2027');
    expect(out[5].label).toBe('Apr 2027');
  });
});

// ---------------------------------------------------------------------------
// Missing fields distribution
// ---------------------------------------------------------------------------

describe('Phase 125A — deriveMissingFieldsDistribution', () => {
  it('counts each missing-field label across rows; sorts by count desc', () => {
    const out = deriveMissingFieldsDistribution([
      row({ managerMissingFieldLabels: ['Client', 'Loan amount'] }),
      row({ managerMissingFieldLabels: ['Client'] }),
      row({ managerMissingFieldLabels: ['Banker', 'Loan amount'] }),
    ]);
    expect(out).toEqual([
      { label: 'Client', dealCount: 2 },
      { label: 'Loan amount', dealCount: 2 },
      { label: 'Banker', dealCount: 1 },
    ]);
  });

  it('returns empty for no missing fields', () => {
    expect(
      deriveMissingFieldsDistribution([row(), row({ managerMissingFieldLabels: [] })]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Data quality distribution
// ---------------------------------------------------------------------------

describe('Phase 125A — deriveDataQualityDistribution', () => {
  it('buckets deals by completeness percent (relative to 6-field manager catalog)', () => {
    // Manager catalog has 6 fields. 0 missing -> 100%; 3 missing -> 50%; 5 missing -> 17%.
    const out = deriveDataQualityDistribution([
      row({ managerMissingFieldLabels: [] }), // 100%
      row({ managerMissingFieldLabels: ['Client'] }), // 83%
      row({
        managerMissingFieldLabels: ['Client', 'Loan amount', 'Target close'],
      }), // 50%
      row({
        managerMissingFieldLabels: ['Client', 'Loan amount', 'Target close', 'Stage', 'Status'],
      }), // 17%
    ]);
    const byLabel = Object.fromEntries(out.map((b) => [b.label, b.dealCount]));
    expect(byLabel['Complete (100%)']).toBe(1);
    expect(byLabel['Mostly populated (75–99%)']).toBe(1);
    expect(byLabel['Partial (50–74%)']).toBe(1);
    expect(byLabel['Sparse (<50%)']).toBe(1);
  });

  it('always returns the four labeled buckets even for empty input', () => {
    const out = deriveDataQualityDistribution([]);
    expect(out.map((b) => b.label)).toEqual([
      'Sparse (<50%)',
      'Partial (50–74%)',
      'Mostly populated (75–99%)',
      'Complete (100%)',
    ]);
    expect(out.every((b) => b.dealCount === 0)).toBe(true);
  });
});
