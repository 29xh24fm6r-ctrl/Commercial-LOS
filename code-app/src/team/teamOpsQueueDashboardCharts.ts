import type {
  TeamOpsVMRow,
  TeamOpsQueueLanes,
  TeamBankerWorkloadRow,
} from './teamOpsQueueSnapshot';

/**
 * Phase 127A — Team Ops Queue chart derivers.
 *
 * Pure projections over the same TeamOpsVMRow / lane / workload
 * shapes the snapshot already produced. Adapters convert these to
 * the shared `CommandChartPrimitives` datum shapes inline in the
 * cockpit (no React state here).
 *
 * The team module cannot import from `src/manager/` per Phase 48
 * isolation, so the risk-distribution + closing-forecast derivers
 * are local copies of the manager-side logic — same algorithm,
 * structurally compatible inputs.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Work items by type
// ---------------------------------------------------------------------------

export interface WorkItemTypeBucket {
  label: string;
  value: number;
  tone: 'blocked' | 'atRisk' | 'info' | 'clear';
}

/**
 * One bar per lane on the queue. Reads counts off the already-built
 * `TeamOpsQueueLanes` so the deriver runs O(1) per call.
 */
export function deriveWorkItemTypeCounts(
  lanes: TeamOpsQueueLanes,
): WorkItemTypeBucket[] {
  const blockedCount = lanes.blockedAtRisk.filter(
    (i) => i.severity === 'blocked',
  ).length;
  const atRiskCount = lanes.blockedAtRisk.length - blockedCount;
  return [
    { label: 'Blocked', value: blockedCount, tone: 'blocked' },
    { label: 'At risk', value: atRiskCount, tone: 'atRisk' },
    { label: 'Overdue tasks', value: lanes.overdueTasks.length, tone: 'atRisk' },
    {
      label: 'Outstanding docs',
      value: lanes.outstandingDocuments.length,
      tone: 'atRisk',
    },
    { label: 'Missing data', value: lanes.missingData.length, tone: 'atRisk' },
    { label: 'Stale', value: lanes.staleDeals.length, tone: 'atRisk' },
    {
      label: 'Pending review',
      value: lanes.pendingReviewDocs.length,
      tone: 'info',
    },
    {
      label: 'Due soon',
      value: lanes.dueSoonTasks.length,
      tone: 'info',
    },
    {
      label: 'Closing soon',
      value: lanes.closingSoon.length,
      tone: 'info',
    },
  ];
}

// ---------------------------------------------------------------------------
// Banker overdue / docs distributions
// ---------------------------------------------------------------------------

export interface BankerBarDatum {
  label: string;
  value: number;
}

export function deriveOverdueByBanker(
  workload: ReadonlyArray<TeamBankerWorkloadRow>,
): BankerBarDatum[] {
  return workload
    .filter((b) => b.overdueTaskCount > 0)
    .map((b) => ({ label: b.bankerName, value: b.overdueTaskCount }));
}

export function deriveOutstandingDocsByBanker(
  workload: ReadonlyArray<TeamBankerWorkloadRow>,
): BankerBarDatum[] {
  return workload
    .filter((b) => b.outstandingDocumentCount > 0)
    .map((b) => ({
      label: b.bankerName,
      value: b.outstandingDocumentCount,
    }));
}

// ---------------------------------------------------------------------------
// Risk distribution (local copy of the manager rule — Phase 48 isolation)
// ---------------------------------------------------------------------------

export interface RiskDistribution {
  blocked: number;
  atRisk: number;
  clear: number;
  unknown: number;
}

export function deriveRiskDistributionForTeam(
  vmRows: ReadonlyArray<TeamOpsVMRow>,
): RiskDistribution {
  const out: RiskDistribution = { blocked: 0, atRisk: 0, clear: 0, unknown: 0 };
  for (const r of vmRows) {
    switch (r.vm.blockerStatus) {
      case 'blocked':
        out.blocked += 1;
        break;
      case 'at-risk':
        out.atRisk += 1;
        break;
      case 'clear':
        out.clear += 1;
        break;
      default:
        out.unknown += 1;
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Closing forecast (local copy of the manager rule)
// ---------------------------------------------------------------------------

export interface ForecastBucket {
  label: string;
  year: number;
  month: number;
  dealCount: number;
  totalAmount: number;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

export function deriveClosingForecastForTeam(
  vmRows: ReadonlyArray<TeamOpsVMRow>,
  now: Date = new Date(),
  monthHorizon = 6,
): ForecastBucket[] {
  const buckets: ForecastBucket[] = [];
  const startYear = now.getUTCFullYear();
  const startMonth = now.getUTCMonth();
  for (let i = 0; i < monthHorizon; i += 1) {
    const year = startYear + Math.floor((startMonth + i) / 12);
    const month = (startMonth + i) % 12;
    buckets.push({
      label: monthLabel(year, month),
      year,
      month,
      dealCount: 0,
      totalAmount: 0,
    });
  }
  for (const r of vmRows) {
    if (!r.teamDeal.targetCloseDate) continue;
    const d = new Date(r.teamDeal.targetCloseDate);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getTime() < now.getTime()) continue;
    const dealY = d.getUTCFullYear();
    const dealM = d.getUTCMonth();
    const bucket = buckets.find((b) => b.year === dealY && b.month === dealM);
    if (!bucket) continue;
    bucket.dealCount += 1;
    if (
      typeof r.teamDeal.amount === 'number' &&
      Number.isFinite(r.teamDeal.amount)
    ) {
      bucket.totalAmount += r.teamDeal.amount;
    }
  }
  return buckets;
}

// MS_PER_DAY exported for tests that need to construct relative dates.
export { MS_PER_DAY };
