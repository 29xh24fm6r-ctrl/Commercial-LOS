import type { ManagerVMRow } from './managerPipelineSnapshot';

/**
 * Phase 124E / 125A — Manager dashboard chart derivers.
 *
 * Pure projections over the same per-deal VM rows the Bloomberg
 * Control Panel snapshot already computed (`ManagerPipelineSnapshot.vmRows`).
 * Every deriver is O(rows) and synchronous; no IO, no React state.
 *
 * Discipline:
 *   - No fake values. Deals with missing fields contribute to the
 *     'Unset' / 'Unassigned' / 'Unknown' buckets honestly; they are
 *     never coerced into a real category.
 *   - Stable sort. Ties broken by name ASC so chart output is
 *     deterministic for golden tests.
 *   - Injectable `now` for every time-relative deriver so the
 *     dashboard's date-sensitive visuals stay testable with frozen
 *     fixtures (parity with Phase 124A's `deriveManagerPipelineSnapshot`).
 *   - No predictive language. Aging buckets are pure day-count
 *     ranges; missing-fields buckets are catalog labels; forecast
 *     buckets are monthly groupings.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Stage distribution
// ---------------------------------------------------------------------------

export interface StageDistributionRow {
  stage: string;
  dealCount: number;
  totalAmount: number;
}

export function deriveStageDistribution(
  rows: ReadonlyArray<ManagerVMRow>,
): StageDistributionRow[] {
  const acc = new Map<string, StageDistributionRow>();
  for (const r of rows) {
    const stage = r.teamDeal.stage?.trim() || 'Unset';
    let bucket = acc.get(stage);
    if (!bucket) {
      bucket = { stage, dealCount: 0, totalAmount: 0 };
      acc.set(stage, bucket);
    }
    bucket.dealCount += 1;
    if (
      typeof r.teamDeal.amount === 'number' &&
      Number.isFinite(r.teamDeal.amount)
    ) {
      bucket.totalAmount += r.teamDeal.amount;
    }
  }
  return Array.from(acc.values()).sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
    return a.stage.localeCompare(b.stage);
  });
}

// ---------------------------------------------------------------------------
// Banker amount distribution (count + amount + at-risk count)
// ---------------------------------------------------------------------------

export interface BankerAmountRow {
  bankerId: string;
  bankerName: string;
  dealCount: number;
  totalAmount: number;
  atRiskCount: number;
  /** Open tasks across this banker's deals (computed from vmRows). */
  openTaskCount: number;
  /** Overdue tasks across this banker's deals. */
  overdueTaskCount: number;
  /** Outstanding documents across this banker's deals. */
  outstandingDocumentCount: number;
  /** Stale deals (modifiedOn >= 14d ago). */
  staleDealCount: number;
  /**
   * Readiness — fraction of this banker's deals with 0 manager-side
   * missing fields. 0..100 inclusive. `undefined` when the banker has
   * no deals (degenerate division).
   */
  readinessPct: number | undefined;
}

const UNASSIGNED_BANKER_KEY = '__unassigned__';
const STALE_DAYS = 14;

export function deriveBankerAmountDistribution(
  rows: ReadonlyArray<ManagerVMRow>,
  now: Date = new Date(),
): BankerAmountRow[] {
  const acc = new Map<string, BankerAmountRow & { readyDealCount: number }>();
  for (const r of rows) {
    const id = r.teamDeal.assignedBankerId ?? UNASSIGNED_BANKER_KEY;
    const name =
      r.teamDeal.assignedBankerName ??
      (id === UNASSIGNED_BANKER_KEY ? 'Unassigned' : id);
    let bucket = acc.get(id);
    if (!bucket) {
      bucket = {
        bankerId: id,
        bankerName: name,
        dealCount: 0,
        totalAmount: 0,
        atRiskCount: 0,
        openTaskCount: 0,
        overdueTaskCount: 0,
        outstandingDocumentCount: 0,
        staleDealCount: 0,
        readinessPct: 0,
        readyDealCount: 0,
      };
      acc.set(id, bucket);
    }
    bucket.dealCount += 1;
    if (
      typeof r.teamDeal.amount === 'number' &&
      Number.isFinite(r.teamDeal.amount)
    ) {
      bucket.totalAmount += r.teamDeal.amount;
    }
    if (r.vm.blockerStatus === 'blocked' || r.vm.blockerStatus === 'at-risk') {
      bucket.atRiskCount += 1;
    }
    bucket.openTaskCount += r.openTaskCount;
    bucket.overdueTaskCount += r.overdueTaskCount;
    bucket.outstandingDocumentCount += r.outstandingDocumentCount;
    if (r.managerMissingFieldLabels.length === 0) {
      bucket.readyDealCount += 1;
    }
    if (r.teamDeal.modifiedOn) {
      const m = new Date(r.teamDeal.modifiedOn).getTime();
      if (!Number.isNaN(m)) {
        const days = Math.floor((now.getTime() - m) / MS_PER_DAY);
        if (days >= STALE_DAYS) bucket.staleDealCount += 1;
      }
    }
  }
  return Array.from(acc.values())
    .map(({ readyDealCount, ...rest }) => ({
      ...rest,
      readinessPct:
        rest.dealCount === 0
          ? undefined
          : Math.round((readyDealCount / rest.dealCount) * 100),
    }))
    .sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      return a.bankerName.localeCompare(b.bankerName);
    });
}

// ---------------------------------------------------------------------------
// Aging histogram — days in stage buckets
// ---------------------------------------------------------------------------

export interface AgingBucket {
  /** Inclusive lower bound (days). */
  lowDays: number;
  /** Inclusive upper bound; `undefined` for the open-ended top bucket. */
  highDays: number | undefined;
  /** Display label. */
  label: string;
  /** Count of deals whose daysInStage falls in this bucket. */
  dealCount: number;
}

const AGING_BUCKET_SPEC: ReadonlyArray<{
  lowDays: number;
  highDays: number | undefined;
  label: string;
}> = [
  { lowDays: 0, highDays: 7, label: '0–7 d' },
  { lowDays: 8, highDays: 14, label: '8–14 d' },
  { lowDays: 15, highDays: 30, label: '15–30 d' },
  { lowDays: 31, highDays: 60, label: '31–60 d' },
  { lowDays: 61, highDays: 90, label: '61–90 d' },
  { lowDays: 91, highDays: undefined, label: '90+ d' },
];

export function deriveAgingHistogram(
  rows: ReadonlyArray<ManagerVMRow>,
  now: Date = new Date(),
): AgingBucket[] {
  const buckets: AgingBucket[] = AGING_BUCKET_SPEC.map((s) => ({
    ...s,
    dealCount: 0,
  }));
  for (const r of rows) {
    if (!r.teamDeal.stageEntryDate) continue;
    const t = new Date(r.teamDeal.stageEntryDate).getTime();
    if (Number.isNaN(t)) continue;
    const days = Math.floor((now.getTime() - t) / MS_PER_DAY);
    if (days < 0) continue;
    for (const b of buckets) {
      if (days >= b.lowDays && (b.highDays === undefined || days <= b.highDays)) {
        b.dealCount += 1;
        break;
      }
    }
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Risk distribution — blocked / at-risk / clear / unknown
// ---------------------------------------------------------------------------

export interface RiskDistribution {
  blocked: number;
  atRisk: number;
  clear: number;
  /** Deals whose vm.blockerStatus is undefined (e.g. caller did not run blockers). */
  unknown: number;
}

export function deriveRiskDistribution(
  rows: ReadonlyArray<ManagerVMRow>,
): RiskDistribution {
  const out: RiskDistribution = { blocked: 0, atRisk: 0, clear: 0, unknown: 0 };
  for (const r of rows) {
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
// Closings forecast — count + amount per month bucket
// ---------------------------------------------------------------------------

export interface ForecastBucket {
  /** Month bucket label, e.g. "Jun 2026". */
  label: string;
  /** Year (YYYY). */
  year: number;
  /** Month index (0-11). */
  month: number;
  /** Count of deals with targetCloseDate in this month. */
  dealCount: number;
  /** Sum of populated amounts for those deals. */
  totalAmount: number;
}

export function deriveClosingForecast(
  rows: ReadonlyArray<ManagerVMRow>,
  now: Date = new Date(),
  monthHorizon = 6,
): ForecastBucket[] {
  // Build buckets for the next `monthHorizon` months starting with
  // the month containing `now` (inclusive). Deals with target close
  // dates in the past are surfaced separately on the exception tape
  // and are deliberately excluded here.
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
  for (const r of rows) {
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

// ---------------------------------------------------------------------------
// Missing-fields distribution — count of deals missing each catalog field
// ---------------------------------------------------------------------------

export interface MissingFieldRow {
  label: string;
  dealCount: number;
}

export function deriveMissingFieldsDistribution(
  rows: ReadonlyArray<ManagerVMRow>,
): MissingFieldRow[] {
  const acc = new Map<string, number>();
  for (const r of rows) {
    for (const label of r.managerMissingFieldLabels) {
      acc.set(label, (acc.get(label) ?? 0) + 1);
    }
  }
  return Array.from(acc.entries())
    .map(([label, dealCount]) => ({ label, dealCount }))
    .sort((a, b) => {
      if (b.dealCount !== a.dealCount) return b.dealCount - a.dealCount;
      return a.label.localeCompare(b.label);
    });
}

// ---------------------------------------------------------------------------
// Data quality distribution — completeness buckets
// ---------------------------------------------------------------------------

export interface DataQualityBucket {
  label: string;
  /** Inclusive lower bound of populated-percentage; 0-100. */
  lowPct: number;
  /** Exclusive upper bound; `undefined` for the "100%" bucket. */
  highPct: number | undefined;
  dealCount: number;
}

const TOTAL_MANAGER_CATALOG_FIELDS = 6; // see MANAGER_REQUIRED_TEAM_FIELDS

const DATA_QUALITY_SPEC: ReadonlyArray<{
  label: string;
  lowPct: number;
  highPct: number | undefined;
}> = [
  { label: 'Sparse (<50%)', lowPct: 0, highPct: 50 },
  { label: 'Partial (50–74%)', lowPct: 50, highPct: 75 },
  { label: 'Mostly populated (75–99%)', lowPct: 75, highPct: 100 },
  { label: 'Complete (100%)', lowPct: 100, highPct: undefined },
];

export function deriveDataQualityDistribution(
  rows: ReadonlyArray<ManagerVMRow>,
): DataQualityBucket[] {
  const buckets: DataQualityBucket[] = DATA_QUALITY_SPEC.map((s) => ({
    ...s,
    dealCount: 0,
  }));
  for (const r of rows) {
    const missing = r.managerMissingFieldLabels.length;
    const populated = TOTAL_MANAGER_CATALOG_FIELDS - missing;
    const pct = Math.round((populated / TOTAL_MANAGER_CATALOG_FIELDS) * 100);
    for (const b of buckets) {
      const inLow = pct >= b.lowPct;
      const inHigh = b.highPct === undefined ? pct >= 100 : pct < b.highPct;
      if (inLow && inHigh) {
        b.dealCount += 1;
        break;
      }
    }
  }
  return buckets;
}
