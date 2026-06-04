import type {
  DealReadinessSnapshotRow,
  PerformanceMetricRow,
  ReadinessBandKey,
} from './snapshotQueries';
import type {
  StageAggregate,
  MonthBucketAggregate,
} from './operationalFallbackQueries';

/**
 * Phase 133A — Executive Command Center snapshot deriver.
 *
 * Pure projection over the data the Executive Workspace ALREADY loads
 * via ExecutiveDataProvider:
 *   - governed deal-readiness snapshots (per-deal readiness band +
 *     operational counts; NO dollar amount on these rows);
 *   - the transitional pipeline-by-stage + closing-forecast aggregates
 *     (count + total amount per stage / month; aggregate only — no
 *     per-deal identifiers or amounts);
 *   - performance metric rows.
 *
 * Discipline / honest omissions:
 *   - This deriver does NOT consume manager / banker / portfolio
 *     operational providers (SPEC W2 isolation invariant — the
 *     Executive surface stays isolated). It only re-shapes the
 *     already-authorized executive data.
 *   - Per-deal dollar exposure, exposure-by-product, exposure-by-banker,
 *     open/overdue task counts, and average-days-in-stage are NOT
 *     present in the executive snapshot and are deliberately omitted
 *     (the UI renders honest "requires additional source fields" copy).
 *   - No profitability, yield, approval-probability, win-rate, or
 *     predictive ranking is derived. `top deals` are ranked by readiness
 *     concern, never by a fabricated score.
 *   - No raw GUIDs leave the snapshot except `dealId` (used solely for a
 *     /deals/<id> drill-down link, never rendered as text).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutiveKpiRibbon {
  /** Active deals across the pipeline-by-stage aggregate. */
  totalActiveDeals: number;
  /** Sum of stage-aggregate amounts (the exposure the snapshot exposes). */
  totalExposure: number;
  /** Exposure in the nearest future closing-forecast bucket. */
  closingWindowExposure: number;
  /** Human label of that bucket (e.g. 'July 2026'); undefined when none. */
  closingWindowLabel: string | undefined;
  /** Deals at readiness band 'Blocked'. */
  blockedCount: number;
  /** Deals at readiness band 'Low' (lowest non-blocked readiness tier). */
  atRiskCount: number;
  /** Sum of per-deal stale-item counts across readiness rows. */
  staleItemCount: number;
  /** Sum of per-deal missing-document counts (outstanding docs proxy). */
  outstandingDocumentCount: number;
  /** Sum of per-deal open-blocker counts. */
  openBlockerCount: number;
  /** Sum of per-deal pending-approval counts. */
  pendingApprovalCount: number;
  /** Readiness rows that carry a resolved band. */
  readinessScoredCount: number;
  /** Readiness rows with no resolved band (a data-quality signal). */
  readinessUnknownCount: number;
}

export interface ExecutiveRiskDistribution {
  high: number;
  medium: number;
  low: number;
  blocked: number;
  unknown: number;
}

export interface ExecutiveStageExposureRow {
  stage: string;
  dealCount: number;
  totalExposure: number;
  sharePct: number;
  isUnknown: boolean;
}

export interface ExecutiveClosingBucket {
  label: string;
  dealCount: number;
  totalExposure: number;
  past: boolean;
}

export interface ExecutiveTopDealRow {
  /** Used only for a /deals/<id> link; never rendered as text. */
  dealId: string | undefined;
  dealName: string;
  readinessBand: ReadinessBandKey | undefined;
  readinessBandLabel: string | undefined;
  openBlockersCount: number;
  missingDocsCount: number;
  pendingApprovalsCount: number;
  staleItemsCount: number;
}

export interface ExecutiveDataQuality {
  /** Readiness rows with a resolved band. */
  readinessScored: number;
  /** Readiness rows missing a band. */
  readinessUnknown: number;
  /** Deals carrying at least one missing document. */
  dealsWithMissingDocs: number;
  /** Deals carrying at least one stale item. */
  dealsWithStaleItems: number;
}

export interface ExecutiveCommandSnapshot {
  ribbon: ExecutiveKpiRibbon;
  riskDistribution: ExecutiveRiskDistribution;
  exposureByStage: ExecutiveStageExposureRow[];
  closingForecast: ExecutiveClosingBucket[];
  /** Readiness-ranked deals to watch (deal links). NOT a dollar ranking. */
  topDeals: ExecutiveTopDealRow[];
  /** Deals with the most open blockers (operational bottlenecks). */
  topBlockers: ExecutiveTopDealRow[];
  dataQuality: ExecutiveDataQuality;
  /** Count of performance metric rows available (honest; not exposure). */
  performanceMetricCount: number;
  /** True when neither stage aggregates nor readiness rows are present. */
  isEmpty: boolean;
}

export interface ExecutiveCommandSnapshotInput {
  readiness: ReadonlyArray<DealReadinessSnapshotRow>;
  pipelineByStage: ReadonlyArray<StageAggregate>;
  closingForecast: ReadonlyArray<MonthBucketAggregate>;
  performance: ReadonlyArray<PerformanceMetricRow>;
  /** Cap on the top-deals / top-blockers lists. Default 8. */
  topN?: number;
}

export const DEFAULT_EXECUTIVE_TOP_N = 8;

// Readiness band ranking for "needs attention first" ordering.
const BAND_RANK: Record<ReadinessBandKey, number> = {
  Blocked: 0,
  Low: 1,
  Medium: 2,
  High: 3,
};

// ---------------------------------------------------------------------------
// Public deriver
// ---------------------------------------------------------------------------

export function deriveExecutiveCommandSnapshot(
  input: ExecutiveCommandSnapshotInput,
): ExecutiveCommandSnapshot {
  const topN = input.topN ?? DEFAULT_EXECUTIVE_TOP_N;
  const readiness = input.readiness;

  const totalExposure = input.pipelineByStage.reduce(
    (acc, s) => acc + safeAmount(s.totalAmount),
    0,
  );
  const totalActiveDeals = input.pipelineByStage.reduce(
    (acc, s) => acc + s.count,
    0,
  );

  const exposureByStage = buildStageExposure(input.pipelineByStage, totalExposure);
  const closingForecast = buildClosingForecast(input.closingForecast);
  const nextWindow = closingForecast.find((b) => !b.past);

  const riskDistribution = buildRiskDistribution(readiness);

  let staleItemCount = 0;
  let outstandingDocumentCount = 0;
  let openBlockerCount = 0;
  let pendingApprovalCount = 0;
  let dealsWithMissingDocs = 0;
  let dealsWithStaleItems = 0;
  for (const r of readiness) {
    staleItemCount += r.staleItemsCount;
    outstandingDocumentCount += r.missingDocsCount;
    openBlockerCount += r.openBlockersCount;
    pendingApprovalCount += r.pendingApprovalsCount;
    if (r.missingDocsCount > 0) dealsWithMissingDocs += 1;
    if (r.staleItemsCount > 0) dealsWithStaleItems += 1;
  }

  const ribbon: ExecutiveKpiRibbon = {
    totalActiveDeals,
    totalExposure,
    closingWindowExposure: nextWindow?.totalExposure ?? 0,
    closingWindowLabel: nextWindow?.label,
    blockedCount: riskDistribution.blocked,
    atRiskCount: riskDistribution.low,
    staleItemCount,
    outstandingDocumentCount,
    openBlockerCount,
    pendingApprovalCount,
    readinessScoredCount:
      riskDistribution.high +
      riskDistribution.medium +
      riskDistribution.low +
      riskDistribution.blocked,
    readinessUnknownCount: riskDistribution.unknown,
  };

  const topDeals = rankReadiness(readiness)
    .slice(0, Math.max(0, topN))
    .map(toTopDealRow);

  const topBlockers = readiness
    .filter((r) => r.openBlockersCount > 0)
    .slice()
    .sort((a, b) => {
      if (b.openBlockersCount !== a.openBlockersCount) {
        return b.openBlockersCount - a.openBlockersCount;
      }
      return dealLabel(a).localeCompare(dealLabel(b));
    })
    .slice(0, Math.max(0, topN))
    .map(toTopDealRow);

  return {
    ribbon,
    riskDistribution,
    exposureByStage,
    closingForecast,
    topDeals,
    topBlockers,
    dataQuality: {
      readinessScored: ribbon.readinessScoredCount,
      readinessUnknown: ribbon.readinessUnknownCount,
      dealsWithMissingDocs,
      dealsWithStaleItems,
    },
    performanceMetricCount: input.performance.length,
    isEmpty: input.pipelineByStage.length === 0 && readiness.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildStageExposure(
  rows: ReadonlyArray<StageAggregate>,
  totalExposure: number,
): ExecutiveStageExposureRow[] {
  return rows
    .map((s) => {
      const label = s.stage.trim();
      const isUnknown =
        label.length === 0 || label === '(no stage)' || label === 'Unset stage';
      return {
        stage: label.length === 0 ? '(no stage)' : label,
        dealCount: s.count,
        totalExposure: safeAmount(s.totalAmount),
        sharePct: sharePct(safeAmount(s.totalAmount), totalExposure),
        isUnknown,
      };
    })
    .sort((a, b) => {
      if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1;
      if (b.totalExposure !== a.totalExposure) {
        return b.totalExposure - a.totalExposure;
      }
      return a.stage.localeCompare(b.stage);
    });
}

function buildClosingForecast(
  rows: ReadonlyArray<MonthBucketAggregate>,
): ExecutiveClosingBucket[] {
  return rows.map((b) => ({
    label: b.label,
    dealCount: b.count,
    totalExposure: safeAmount(b.totalAmount),
    past: b.past,
  }));
}

function buildRiskDistribution(
  readiness: ReadonlyArray<DealReadinessSnapshotRow>,
): ExecutiveRiskDistribution {
  const dist: ExecutiveRiskDistribution = {
    high: 0,
    medium: 0,
    low: 0,
    blocked: 0,
    unknown: 0,
  };
  for (const r of readiness) {
    switch (r.readinessBand) {
      case 'High':
        dist.high += 1;
        break;
      case 'Medium':
        dist.medium += 1;
        break;
      case 'Low':
        dist.low += 1;
        break;
      case 'Blocked':
        dist.blocked += 1;
        break;
      default:
        dist.unknown += 1;
    }
  }
  return dist;
}

function rankReadiness(
  readiness: ReadonlyArray<DealReadinessSnapshotRow>,
): DealReadinessSnapshotRow[] {
  return readiness.slice().sort((a, b) => {
    const ra = a.readinessBand ? BAND_RANK[a.readinessBand] : 4;
    const rb = b.readinessBand ? BAND_RANK[b.readinessBand] : 4;
    if (ra !== rb) return ra - rb;
    if (b.openBlockersCount !== a.openBlockersCount) {
      return b.openBlockersCount - a.openBlockersCount;
    }
    if (b.missingDocsCount !== a.missingDocsCount) {
      return b.missingDocsCount - a.missingDocsCount;
    }
    return dealLabel(a).localeCompare(dealLabel(b));
  });
}

function toTopDealRow(r: DealReadinessSnapshotRow): ExecutiveTopDealRow {
  return {
    dealId: r.dealId,
    dealName: dealLabel(r),
    readinessBand: r.readinessBand,
    readinessBandLabel: r.readinessBandLabel,
    openBlockersCount: r.openBlockersCount,
    missingDocsCount: r.missingDocsCount,
    pendingApprovalsCount: r.pendingApprovalsCount,
    staleItemsCount: r.staleItemsCount,
  };
}

// ---------------------------------------------------------------------------
// Copilot summary (pure; labels + counts only — no GUIDs)
// ---------------------------------------------------------------------------

/**
 * Executive Copilot summary lines derived from the snapshot. Counts +
 * labels + percentages only — never a record id / GUID.
 */
export function executiveCopilotSummaries(
  snapshot: ExecutiveCommandSnapshot,
): string[] {
  const r = snapshot.ribbon;
  const d = snapshot.riskDistribution;
  return [
    `Active deals: ${r.totalActiveDeals}`,
    `Total exposure (stage aggregate): ${formatUsdCompact(r.totalExposure)}`,
    `Blocked: ${r.blockedCount} · At risk (low readiness): ${r.atRiskCount}`,
    `Readiness — High ${d.high} · Medium ${d.medium} · Low ${d.low} · Blocked ${d.blocked} · Unknown ${d.unknown}`,
    `Open blockers: ${r.openBlockerCount} · Outstanding docs: ${r.outstandingDocumentCount} · Pending approvals: ${r.pendingApprovalCount}`,
    `Data quality — scored ${snapshot.dataQuality.readinessScored}, unknown ${snapshot.dataQuality.readinessUnknown}`,
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dealLabel(r: DealReadinessSnapshotRow): string {
  const name = r.dealName?.trim();
  return name && name.length > 0 ? name : 'Unnamed deal';
}

function safeAmount(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function sharePct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function formatUsdCompact(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}
