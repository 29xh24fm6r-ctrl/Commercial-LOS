import { describe, it, expect } from 'vitest';

import {
  deriveWorkItemTypeCounts,
  deriveOverdueByBanker,
  deriveOutstandingDocsByBanker,
  deriveRiskDistributionForTeam,
  deriveClosingForecastForTeam,
} from './teamOpsQueueDashboardCharts';
import type {
  TeamBankerWorkloadRow,
  TeamOpsQueueLanes,
  TeamOpsVMRow,
  WorkItem,
} from './teamOpsQueueSnapshot';
import type { DealIntelligenceViewModel } from '../shared/dealIntelligenceViewModel';
import type { TeamDealRow } from './teamQueries';

/**
 * Phase 127A — teamOpsQueueDashboardCharts deriver tests.
 *
 * Pins:
 *   - work-item type counts produce 9 fixed buckets in catalog
 *     order (blocked / at-risk / overdue tasks / outstanding docs /
 *     missing data / stale / pending review / due soon / closing
 *     soon);
 *   - banker overdue / outstanding-docs derivers filter out rows
 *     with zero counts;
 *   - risk distribution buckets blocked / at-risk / clear /
 *     unknown honestly;
 *   - closing forecast builds 6 monthly buckets from `now`;
 *     past dates are excluded; UTC month arithmetic correct.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-03T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}

function workItem(over: Partial<WorkItem>): WorkItem {
  return {
    kind: 'overdue-task',
    severity: 'atRisk',
    title: 't',
    itemId: 'i',
    dealId: 'd',
    dealName: 'D',
    ownerName: undefined,
    ownerId: undefined,
    clientName: undefined,
    stage: undefined,
    status: undefined,
    dueDate: undefined,
    daysUntilDue: undefined,
    daysStale: undefined,
    reason: 'r',
    ...over,
  };
}

function emptyLanes(): TeamOpsQueueLanes {
  return {
    overdueTasks: [],
    dueSoonTasks: [],
    outstandingDocuments: [],
    pendingReviewDocs: [],
    missingData: [],
    staleDeals: [],
    blockedAtRisk: [],
    closingSoon: [],
  };
}

function bankerRow(
  over: Partial<TeamBankerWorkloadRow>,
): TeamBankerWorkloadRow {
  return {
    bankerId: 'b',
    bankerName: 'Banker',
    activeDealCount: 1,
    openTaskCount: 0,
    overdueTaskCount: 0,
    outstandingDocumentCount: 0,
    blockerAtRiskCount: 0,
    closingNext30Count: 0,
    ...over,
  };
}

function vm(over: Partial<DealIntelligenceViewModel> = {}): DealIntelligenceViewModel {
  return {
    dealId: 'd',
    dealName: 'd',
    clientName: undefined,
    bankerName: undefined,
    stageName: undefined,
    statusName: undefined,
    productTypeName: undefined,
    loanStructureName: undefined,
    pricingTypeName: undefined,
    amount: undefined,
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

function teamDeal(over: Partial<TeamDealRow> = {}): TeamDealRow {
  return {
    id: 'd',
    name: 'd',
    clientName: undefined,
    stage: undefined,
    status: undefined,
    amount: undefined,
    targetCloseDate: undefined,
    stageEntryDate: undefined,
    modifiedOn: undefined,
    assignedBankerId: undefined,
    assignedBankerName: undefined,
    collateralSummary: undefined,
    ...over,
  };
}

function vmRow(over: Partial<TeamOpsVMRow> = {}): TeamOpsVMRow {
  return {
    teamDeal: teamDeal(),
    vm: vm(),
    openTaskCount: 0,
    overdueTaskCount: 0,
    dueSoonTaskCount: 0,
    outstandingDocumentCount: 0,
    pendingReviewCount: 0,
    isStale: false,
    isClosingNext30: false,
    missingFieldLabels: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// deriveWorkItemTypeCounts
// ---------------------------------------------------------------------------

describe('Phase 127A — deriveWorkItemTypeCounts', () => {
  it('returns 9 buckets in catalog order, all zero for empty lanes', () => {
    const out = deriveWorkItemTypeCounts(emptyLanes());
    expect(out.map((b) => b.label)).toEqual([
      'Blocked',
      'At risk',
      'Overdue tasks',
      'Outstanding docs',
      'Missing data',
      'Stale',
      'Pending review',
      'Due soon',
      'Closing soon',
    ]);
    expect(out.every((b) => b.value === 0)).toBe(true);
  });

  it('splits the blocked / at-risk lane into two separate bars by severity', () => {
    const lanes: TeamOpsQueueLanes = {
      ...emptyLanes(),
      blockedAtRisk: [
        workItem({ kind: 'blocked-deal', severity: 'blocked' }),
        workItem({ kind: 'blocked-deal', severity: 'blocked' }),
        workItem({ kind: 'at-risk-deal', severity: 'atRisk' }),
      ],
    };
    const out = deriveWorkItemTypeCounts(lanes);
    expect(out.find((b) => b.label === 'Blocked')!.value).toBe(2);
    expect(out.find((b) => b.label === 'At risk')!.value).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deriveOverdueByBanker + deriveOutstandingDocsByBanker
// ---------------------------------------------------------------------------

describe('Phase 127A — deriveOverdueByBanker', () => {
  it('filters out bankers with zero overdue tasks', () => {
    const out = deriveOverdueByBanker([
      bankerRow({ bankerId: 'a', bankerName: 'A', overdueTaskCount: 3 }),
      bankerRow({ bankerId: 'b', bankerName: 'B', overdueTaskCount: 0 }),
      bankerRow({ bankerId: 'c', bankerName: 'C', overdueTaskCount: 1 }),
    ]);
    expect(out.map((b) => b.label)).toEqual(['A', 'C']);
    expect(out.map((b) => b.value)).toEqual([3, 1]);
  });
});

describe('Phase 127A — deriveOutstandingDocsByBanker', () => {
  it('filters out bankers with zero outstanding docs', () => {
    const out = deriveOutstandingDocsByBanker([
      bankerRow({ bankerId: 'a', bankerName: 'A', outstandingDocumentCount: 2 }),
      bankerRow({ bankerId: 'b', bankerName: 'B', outstandingDocumentCount: 0 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// deriveRiskDistributionForTeam
// ---------------------------------------------------------------------------

describe('Phase 127A — deriveRiskDistributionForTeam', () => {
  it('buckets each blocker status; defaults missing/undefined into unknown', () => {
    const out = deriveRiskDistributionForTeam([
      vmRow({ vm: vm({ blockerStatus: 'blocked' }) }),
      vmRow({ vm: vm({ blockerStatus: 'at-risk' }) }),
      vmRow({ vm: vm({ blockerStatus: 'at-risk' }) }),
      vmRow({ vm: vm({ blockerStatus: 'clear' }) }),
      vmRow({ vm: vm({ blockerStatus: undefined }) }),
    ]);
    expect(out).toEqual({ blocked: 1, atRisk: 2, clear: 1, unknown: 1 });
  });
});

// ---------------------------------------------------------------------------
// deriveClosingForecastForTeam
// ---------------------------------------------------------------------------

describe('Phase 127A — deriveClosingForecastForTeam', () => {
  it('builds 6 monthly buckets starting with the month containing now', () => {
    const out = deriveClosingForecastForTeam([], NOW, 6);
    expect(out).toHaveLength(6);
    expect(out[0].label).toBe('Jun 2026');
    expect(out[5].label).toBe('Nov 2026');
  });

  it('places deals into their UTC target-close month; excludes past dates', () => {
    const out = deriveClosingForecastForTeam(
      [
        vmRow({
          teamDeal: teamDeal({
            targetCloseDate: isoDaysFromNow(10),
            amount: 100,
          }),
        }),
        vmRow({
          teamDeal: teamDeal({
            targetCloseDate: isoDaysFromNow(40),
            amount: 200,
          }),
        }),
        vmRow({
          teamDeal: teamDeal({
            targetCloseDate: isoDaysAgo(10),
            amount: 999,
          }),
        }),
        vmRow({ teamDeal: teamDeal({ targetCloseDate: undefined }) }),
      ],
      NOW,
      6,
    );
    expect(out[0].dealCount).toBe(1);
    expect(out[0].totalAmount).toBe(100);
    expect(out[1].dealCount).toBe(1);
    expect(out[1].totalAmount).toBe(200);
  });

  it('rolls over year boundaries when monthHorizon crosses December', () => {
    const lateNov = new Date('2026-11-15T12:00:00Z');
    const out = deriveClosingForecastForTeam([], lateNov, 6);
    expect(out[0].label).toBe('Nov 2026');
    expect(out[1].label).toBe('Dec 2026');
    expect(out[2].label).toBe('Jan 2027');
    expect(out[5].label).toBe('Apr 2027');
  });
});
