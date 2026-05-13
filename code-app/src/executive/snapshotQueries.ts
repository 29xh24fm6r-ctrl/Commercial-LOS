import { Cr664_profitabilitysnapshot1sService } from '../generated/services/Cr664_profitabilitysnapshot1sService';
import { Cr664_dealreadinesssnapshotsService } from '../generated/services/Cr664_dealreadinesssnapshotsService';
import { Cr664_performancemetricsService } from '../generated/services/Cr664_performancemetricsService';
import { Cr664_profitabilityrefreshstatusesService } from '../generated/services/Cr664_profitabilityrefreshstatusesService';

/**
 * Executive Workspace — governed snapshot queries ONLY.
 *
 * Per SPEC W2 (Executive live-data hardening):
 *   "All executive/board workspace surfaces use only snapshot-sourced,
 *    as-of-labeled data, so freshness, state, and official context are
 *    always visible and traceable."
 *
 * Every read in this file targets a governed snapshot entity. Live
 * operational tables (cr664_loandeal, cr664_loanprofitability, etc.)
 * are not imported here. Where the schema doesn't yet have a snapshot
 * for a card, see operationalFallbackQueries.ts — that file is
 * deliberately separate and clearly labeled as transitional.
 *
 * Snapshot-state filtering: SnapshotStateFlag eq Official (788190000).
 * Executive views never include Draft or Superseded snapshots.
 */

const SNAPSHOT_STATE_OFFICIAL = 788190000;

// ---------------------------------------------------------------------------
// Portfolio Profitability snapshot
// ---------------------------------------------------------------------------

export type ProfitabilitySnapshotStateKey = 'Official' | 'Superseded' | 'Draft';

export interface ProfitabilitySnapshotRow {
  id: string;
  asOfDate: string;
  relationshipName: string | undefined;
  totalLoanBalance: number;
  totalDeposits: number;
  totalLoanRevenue: number | undefined;
  totalRelationshipRevenue: number | undefined;
  feeIncomeYtd: number | undefined;
  roe: number | undefined;
  estimatedVsActual: string | undefined;
  snapshotFreshness: string;
  snapshotVersion: string;
  staleDataFlag: boolean;
  snapshotState: ProfitabilitySnapshotStateKey | undefined;
}

const PROFITABILITY_STATE_MAP: Record<number, ProfitabilitySnapshotStateKey> = {
  788190000: 'Official',
  788190001: 'Superseded',
  788190002: 'Draft',
};
function lookupProfitabilityState(v: unknown): ProfitabilitySnapshotStateKey | undefined {
  if (typeof v === 'number') return PROFITABILITY_STATE_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return PROFITABILITY_STATE_MAP[Number(v)];
  return undefined;
}

/**
 * Load all Official cr664_ProfitabilitySnapshot1 rows. Each row is a
 * per-relationship snapshot; portfolio totals are sums across rows for
 * the latest shared AsOfDate. The caller (or the consuming card)
 * picks the latest as-of group.
 */
export async function loadProfitabilitySnapshots(): Promise<ProfitabilitySnapshotRow[]> {
  const result = await Cr664_profitabilitysnapshot1sService.getAll({
    filter: [
      `cr664_snapshotstateflag eq ${SNAPSHOT_STATE_OFFICIAL}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_asofdate desc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load profitability snapshots');
  }

  return (result.data ?? []).map(
    (r): ProfitabilitySnapshotRow => ({
      id: r.cr664_profitabilitysnapshot1id,
      asOfDate: r.cr664_asofdate,
      relationshipName: r.cr664_relationshipname,
      totalLoanBalance: r.cr664_totalloanbalance,
      totalDeposits: r.cr664_totaldeposits,
      totalLoanRevenue: r.cr664_totalloanrevenue,
      totalRelationshipRevenue: r.cr664_totalrelationshiprevenue,
      feeIncomeYtd: r.cr664_feeincomeytd,
      roe: r.cr664_roe,
      estimatedVsActual: r.cr664_estimatedvsactualname,
      snapshotFreshness: r.cr664_snapshotfreshnesstimestamp,
      snapshotVersion: r.cr664_snapshotversion,
      staleDataFlag: r.cr664_staledataflag === true,
      snapshotState: lookupProfitabilityState(r.cr664_snapshotstateflag),
    }),
  );
}

// ---------------------------------------------------------------------------
// Deal Readiness snapshot
// ---------------------------------------------------------------------------

export type ReadinessBandKey = 'High' | 'Medium' | 'Low' | 'Blocked';

export interface DealReadinessSnapshotRow {
  id: string;
  dealId: string | undefined;
  dealName: string | undefined;
  snapshotAt: string;
  readinessBand: ReadinessBandKey | undefined;
  readinessBandLabel: string | undefined;
  readinessScore: number | undefined;
  missingDocsCount: number;
  openBlockersCount: number;
  pendingApprovalsCount: number;
  staleItemsCount: number;
}

const READINESS_BAND_MAP: Record<number, ReadinessBandKey> = {
  788190000: 'High',
  788190001: 'Medium',
  788190002: 'Low',
  788190003: 'Blocked',
};
function lookupReadinessBand(v: unknown): ReadinessBandKey | undefined {
  if (typeof v === 'number') return READINESS_BAND_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return READINESS_BAND_MAP[Number(v)];
  return undefined;
}

/**
 * Load all active cr664_DealReadinessSnapshot rows ordered newest
 * first. Aggregation to "latest per deal" happens in the consuming
 * card so the executive UI sees one count per band rather than the
 * full historical series.
 */
export async function loadDealReadinessSnapshots(): Promise<DealReadinessSnapshotRow[]> {
  const result = await Cr664_dealreadinesssnapshotsService.getAll({
    filter: `statecode eq 0`,
    orderBy: ['cr664_snapshotat desc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load deal readiness snapshots');
  }

  return (result.data ?? []).map(
    (r): DealReadinessSnapshotRow => ({
      id: r.cr664_dealreadinesssnapshotid,
      dealId: r._cr664_deal_value,
      dealName: r.cr664_dealname,
      snapshotAt: r.cr664_snapshotat,
      readinessBand: lookupReadinessBand(r.cr664_readinessband),
      readinessBandLabel: r.cr664_readinessbandname,
      readinessScore: r.cr664_readinessscore,
      missingDocsCount: r.cr664_missingdocscount ?? 0,
      openBlockersCount: r.cr664_openblockerscount ?? 0,
      pendingApprovalsCount: r.cr664_pendingapprovalscount ?? 0,
      staleItemsCount: r.cr664_staleitemscount ?? 0,
    }),
  );
}

// ---------------------------------------------------------------------------
// Performance metrics (banker production rollup)
// ---------------------------------------------------------------------------

export interface PerformanceMetricRow {
  id: string;
  bankerId: string | undefined;
  bankerName: string | undefined;
  metricName: string;
  metricType: string | undefined;
  periodStart: string;
  periodEnd: string;
  value: number;
}

export async function loadPerformanceMetrics(): Promise<PerformanceMetricRow[]> {
  const result = await Cr664_performancemetricsService.getAll({
    filter: `statecode eq 0`,
    orderBy: ['cr664_periodend desc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load performance metrics');
  }

  return (result.data ?? []).map(
    (r): PerformanceMetricRow => ({
      id: r.cr664_performancemetricid,
      bankerId: r._cr664_banker_value,
      bankerName: r.cr664_bankername,
      metricName: r.cr664_metricname,
      metricType: r.cr664_metrictypename,
      periodStart: r.cr664_periodstart,
      periodEnd: r.cr664_periodend,
      value: r.cr664_value,
    }),
  );
}

// ---------------------------------------------------------------------------
// Profitability refresh status (data freshness banner)
// ---------------------------------------------------------------------------

export interface RefreshStatusRow {
  id: string;
  lastRefreshDate: string;
  nextScheduledRefresh: string | undefined;
  refreshCadence: string | undefined;
  refreshStatusName: string;
  staleDataFlag: boolean;
  staleThresholdHours: number;
}

export async function loadLatestRefreshStatus(): Promise<RefreshStatusRow | null> {
  const result = await Cr664_profitabilityrefreshstatusesService.getAll({
    filter: `statecode eq 0`,
    orderBy: ['cr664_lastrefreshdate desc'],
    top: 1,
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load refresh status');
  }

  const r = result.data?.[0];
  if (!r) return null;

  return {
    id: r.cr664_profitabilityrefreshstatusid,
    lastRefreshDate: r.cr664_lastrefreshdate,
    nextScheduledRefresh: r.cr664_nextscheduledrefresh,
    refreshCadence: r.cr664_refreshcadencename,
    refreshStatusName: r.cr664_refreshstatusname,
    staleDataFlag: r.cr664_staledataflag === true,
    staleThresholdHours: r.cr664_staledatathresholdhours,
  };
}
