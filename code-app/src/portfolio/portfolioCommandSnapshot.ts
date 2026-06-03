import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from '../manager/managerQueries';
import {
  deriveManagerPipelineSnapshot,
  type ManagerVMRow,
} from '../manager/managerPipelineSnapshot';
import type { DealIntelligenceViewModel } from '../shared/dealIntelligenceViewModel';

/**
 * Phase 126A — Portfolio Command Center snapshot deriver.
 *
 * Reuses the Phase 124A `deriveManagerPipelineSnapshot` projection
 * to get the per-deal `ManagerVMRow`s (each row already has the
 * Phase 122C-hydrated TeamDeal + the shared VM + the manager-scoped
 * missing-field labels + per-deal task/doc counts). The portfolio
 * snapshot then layers exposure / concentration aggregations on
 * top, so the Manager surface and the Portfolio surface read from
 * one source of truth.
 *
 * Discipline:
 *   - No IO, no React state. Pure projection.
 *   - No fake values. Deals with undefined product / loan structure /
 *     pricing / banker bucket into 'Unknown' / 'Unassigned' honestly.
 *   - Injectable `now` for date-relative classifications (parity
 *     with the Phase 124A manager snapshot).
 *   - No predictive language. Exposure totals are sums of populated
 *     amounts; weighted exposure / win rate are explicitly omitted
 *     because the schema does not carry probability-by-stage or
 *     closed-deal history.
 *
 * Permission-before-render: the caller (PortfolioCommandCenter) mounts
 * inside the same ManagerProvider + ManagerDataProvider chain a
 * portfolio-entitled user reaches today (Phase 116 alias maps
 * 'Portfolio Management' → manager workspace). The deriver never
 * widens permission; it only re-shapes already-authorized records
 * into a portfolio-investment lens.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioCommandRibbon {
  /** Count of authorized active deals on the portfolio. */
  activeDealCount: number;
  /** Sum of populated deal amounts (the portfolio's "exposure"). */
  totalExposure: number;
  /** Count of deals with targetCloseDate within next 30 days. */
  closingNext30DayCount: number;
  /** Sum of populated amounts on deals closing in the next 30 days. */
  closingNext30DayAmount: number;
  /** Distinct count of deals whose blocker status is 'blocked'. */
  blockedDealCount: number;
  /** Distinct count of deals whose blocker status is 'at-risk'. */
  atRiskDealCount: number;
  /** Distinct count of deals with at least one missing required field. */
  missingDataCount: number;
  /** Total outstanding documents across the portfolio. */
  outstandingDocumentCount: number;
  /** Total open (non-completed) tasks across the portfolio. */
  openTaskCount: number;
  /** Distinct count of deals not modified for MANAGER_STALE_DEAL_DAYS+. */
  staleDealCount: number;
  /** Mean days-in-stage across deals with a populated stageEntryDate.
   *  Undefined when no deal has a stageEntryDate. */
  avgDaysInStage: number | undefined;
}

export interface PortfolioConcentrationRow {
  /** Human-readable bucket label (e.g. 'SBA 7(a)', 'Term Loan', banker name). */
  label: string;
  /** Count of deals in this bucket. */
  dealCount: number;
  /** Sum of populated amounts on those deals. */
  totalExposure: number;
  /** Share of total portfolio exposure (0–100, rounded). 0 when total is 0. */
  sharePct: number;
  /** True when the underlying source value was undefined / unset. */
  isUnknown: boolean;
}

export interface PortfolioTopExposureRow {
  dealId: string;
  dealName: string;
  clientName: string | undefined;
  bankerName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  productType: string | undefined;
  loanStructure: string | undefined;
  pricingType: string | undefined;
  amount: number | undefined;
  /** Share of total portfolio exposure (0–100, rounded). 0 when total is 0. */
  sharePct: number;
  blockerStatus: DealIntelligenceViewModel['blockerStatus'];
}

export interface PortfolioExceptionRow {
  dealId: string;
  dealName: string;
  bankerName: string | undefined;
  amount: number | undefined;
  /** Severity from the underlying blocker classification. */
  severity: 'blocked' | 'at-risk';
  /** Short reason taken from the top matching blocker signal. */
  reason: string;
}

export interface PortfolioCommandSnapshot {
  commandRibbon: PortfolioCommandRibbon;
  topExposures: PortfolioTopExposureRow[];
  byProductType: PortfolioConcentrationRow[];
  byLoanStructure: PortfolioConcentrationRow[];
  byPricingType: PortfolioConcentrationRow[];
  byBanker: PortfolioConcentrationRow[];
  byStage: PortfolioConcentrationRow[];
  exceptions: PortfolioExceptionRow[];
  /** Per-deal projected rows — exposed for chart helpers. */
  vmRows: ReadonlyArray<ManagerVMRow>;
  /** True when there are zero authorized active deals on the portfolio. */
  isEmpty: boolean;
}

export interface PortfolioCommandSnapshotInput {
  teamPipeline: ReadonlyArray<TeamDeal>;
  teamBankers: ReadonlyArray<TeamBanker>;
  teamTasks: ReadonlyArray<TeamScopedTask>;
  teamDocuments: ReadonlyArray<TeamScopedDocument>;
  /** Injectable now for deterministic tests; defaults to new Date(). */
  now?: Date;
  /** Cap on the topExposures list. Default 8. */
  topN?: number;
}

/** Default number of top exposures rendered on the cockpit. */
export const DEFAULT_TOP_EXPOSURES = 8;

// ---------------------------------------------------------------------------
// Public deriver
// ---------------------------------------------------------------------------

export function derivePortfolioCommandSnapshot(
  input: PortfolioCommandSnapshotInput,
): PortfolioCommandSnapshot {
  const now = input.now ?? new Date();
  const topN = input.topN ?? DEFAULT_TOP_EXPOSURES;

  // Reuse the manager snapshot's per-deal VM projection — same VM,
  // same blocker classification, same manager-scoped missing-fields
  // catalog. The portfolio surface re-projects the snapshot into
  // exposure / mix shape rather than duplicating per-deal IO.
  const managerSnapshot = deriveManagerPipelineSnapshot({
    teamPipeline: input.teamPipeline,
    teamBankers: input.teamBankers,
    teamTasks: input.teamTasks,
    teamDocuments: input.teamDocuments,
    now,
  });
  const vmRows = managerSnapshot.vmRows;

  const totalExposure = vmRows.reduce(
    (acc, r) => acc + amountOrZero(r.teamDeal.amount),
    0,
  );

  const commandRibbon: PortfolioCommandRibbon = {
    activeDealCount: managerSnapshot.commandStrip.activeDealCount,
    totalExposure,
    closingNext30DayCount: managerSnapshot.commandStrip.closingNext30DayCount,
    closingNext30DayAmount:
      managerSnapshot.commandStrip.closingNext30DayAmount,
    blockedDealCount: managerSnapshot.commandStrip.blockedDealCount,
    atRiskDealCount: managerSnapshot.commandStrip.atRiskDealCount,
    missingDataCount: managerSnapshot.commandStrip.missingDataCount,
    outstandingDocumentCount:
      managerSnapshot.commandStrip.outstandingDocumentCount,
    openTaskCount: managerSnapshot.commandStrip.openTaskCount,
    staleDealCount: managerSnapshot.commandStrip.staleDealCount,
    avgDaysInStage: managerSnapshot.commandStrip.avgDaysInStage,
  };

  return {
    commandRibbon,
    topExposures: buildTopExposures(vmRows, totalExposure, topN),
    byProductType: buildConcentration(
      vmRows,
      totalExposure,
      (r) => r.teamDeal.productType,
      'Unknown product',
    ),
    byLoanStructure: buildConcentration(
      vmRows,
      totalExposure,
      (r) => r.teamDeal.loanStructure,
      'Unknown loan structure',
    ),
    byPricingType: buildConcentration(
      vmRows,
      totalExposure,
      (r) => r.teamDeal.pricingType,
      'Unknown pricing',
    ),
    byBanker: buildConcentration(
      vmRows,
      totalExposure,
      (r) => r.teamDeal.assignedBankerName,
      'Unassigned',
    ),
    byStage: buildConcentration(
      vmRows,
      totalExposure,
      (r) => r.teamDeal.stage,
      'Unset stage',
    ),
    exceptions: buildExceptions(vmRows),
    vmRows,
    isEmpty: vmRows.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildTopExposures(
  vmRows: ReadonlyArray<ManagerVMRow>,
  totalExposure: number,
  topN: number,
): PortfolioTopExposureRow[] {
  const sorted = vmRows.slice().sort((a, b) => {
    const amA = amountOrNegInfinity(a.teamDeal.amount);
    const amB = amountOrNegInfinity(b.teamDeal.amount);
    if (amA !== amB) return amB - amA;
    return a.teamDeal.name.localeCompare(b.teamDeal.name);
  });
  return sorted.slice(0, Math.max(0, topN)).map((r) => ({
    dealId: r.teamDeal.id,
    dealName: r.teamDeal.name,
    clientName: r.teamDeal.clientName,
    bankerName: r.teamDeal.assignedBankerName,
    stage: r.teamDeal.stage,
    status: r.teamDeal.status,
    productType: r.teamDeal.productType,
    loanStructure: r.teamDeal.loanStructure,
    pricingType: r.teamDeal.pricingType,
    amount: r.teamDeal.amount,
    sharePct: sharePct(amountOrZero(r.teamDeal.amount), totalExposure),
    blockerStatus: r.vm.blockerStatus,
  }));
}

function buildConcentration(
  vmRows: ReadonlyArray<ManagerVMRow>,
  totalExposure: number,
  pick: (r: ManagerVMRow) => string | undefined,
  unknownLabel: string,
): PortfolioConcentrationRow[] {
  type Acc = {
    label: string;
    dealCount: number;
    totalExposure: number;
    isUnknown: boolean;
  };
  const acc = new Map<string, Acc>();
  for (const r of vmRows) {
    const raw = pick(r);
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    const isUnknown = trimmed.length === 0;
    const label = isUnknown ? unknownLabel : trimmed;
    let bucket = acc.get(label);
    if (!bucket) {
      bucket = { label, dealCount: 0, totalExposure: 0, isUnknown };
      acc.set(label, bucket);
    }
    bucket.dealCount += 1;
    bucket.totalExposure += amountOrZero(r.teamDeal.amount);
  }
  return Array.from(acc.values())
    .map((b) => ({
      label: b.label,
      dealCount: b.dealCount,
      totalExposure: b.totalExposure,
      sharePct: sharePct(b.totalExposure, totalExposure),
      isUnknown: b.isUnknown,
    }))
    .sort((a, b) => {
      // Unknown buckets sink to the bottom regardless of exposure
      // so a Portfolio reader does not have to mentally filter out
      // catalog gaps when scanning the top mix concentrations.
      if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1;
      if (b.totalExposure !== a.totalExposure) {
        return b.totalExposure - a.totalExposure;
      }
      return a.label.localeCompare(b.label);
    });
}

function buildExceptions(
  vmRows: ReadonlyArray<ManagerVMRow>,
): PortfolioExceptionRow[] {
  const rows: PortfolioExceptionRow[] = [];
  for (const r of vmRows) {
    if (r.vm.blockerStatus !== 'blocked' && r.vm.blockerStatus !== 'at-risk') {
      continue;
    }
    const top = r.vm.blockerSignals.find(
      (s) => s.severity === r.vm.blockerStatus,
    ) ?? r.vm.blockerSignals[0];
    rows.push({
      dealId: r.teamDeal.id,
      dealName: r.teamDeal.name,
      bankerName: r.teamDeal.assignedBankerName,
      amount: r.teamDeal.amount,
      severity: r.vm.blockerStatus,
      reason: top?.label ?? `Deal classified ${r.vm.blockerStatus}.`,
    });
  }
  rows.sort((a, b) => {
    // Blocked before at-risk, then by exposure desc.
    if (a.severity !== b.severity) return a.severity === 'blocked' ? -1 : 1;
    const amA = amountOrNegInfinity(a.amount);
    const amB = amountOrNegInfinity(b.amount);
    if (amA !== amB) return amB - amA;
    return a.dealName.localeCompare(b.dealName);
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function amountOrZero(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function amountOrNegInfinity(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : -Infinity;
}

function sharePct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}
