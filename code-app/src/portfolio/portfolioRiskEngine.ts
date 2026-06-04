import type { ManagerVMRow } from '../manager/managerPipelineSnapshot';
import { MANAGER_STALE_DEAL_DAYS } from '../manager/managerPipelineSnapshot';
import type {
  PortfolioCommandSnapshot,
  PortfolioConcentrationRow,
} from './portfolioCommandSnapshot';

/**
 * Phase 132A — Portfolio risk & concentration engine.
 *
 * Pure projection layered on top of the already-derived
 * `PortfolioCommandSnapshot` (which itself reuses the manager pipeline
 * snapshot). It adds concentration statistics, internal operational
 * policy bands, a closing/maturity ladder, and ranked portfolio-level
 * findings.
 *
 * Discipline:
 *   - No IO, no React, no new Dataverse scope. Consumes only the
 *     already-authorized `vmRows` + ribbon the command snapshot exposes.
 *   - No fake values. Deals with undefined amount / client / product /
 *     banker bucket honestly (excluded from numeric stats; surfaced as
 *     'Unknown' / data-quality signals).
 *   - Injectable `now` for deterministic maturity / staleness tests.
 *   - INTERNAL, NON-REGULATORY bands only. These are operational
 *     indicators. They are NOT legal lending limits, CECL/ALLL,
 *     criticized/classified asset grades, covenant, yield, or
 *     participation analysis — those require source fields this schema
 *     does not carry.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortfolioBand = 'low' | 'watch' | 'elevated' | 'high';

/** Honest, non-regulatory dimension labels for the radar cards. */
export const PORTFOLIO_RISK_DIMENSION_LABELS = {
  concentration: 'Exposure concentration',
  concentrationWatch: 'Portfolio concentration watch',
  operational: 'Operational risk',
  dataQuality: 'Data quality risk',
  closing: 'Closing pipeline pressure',
} as const;

/** Internal operational threshold above which a single deal is "large". */
export const PORTFOLIO_LARGE_EXPOSURE_THRESHOLD = 5_000_000;

export interface PortfolioExposureStat {
  totalExposure: number;
  /** Mean over deals with a populated amount; undefined when none. */
  averageExposure: number | undefined;
  /** Median over deals with a populated amount; undefined when none. */
  medianExposure: number | undefined;
  largestExposure: number | undefined;
  largestDealId: string | undefined;
  largestDealName: string | undefined;
  /** Count of deals that carry a populated, finite amount. */
  exposureDealCount: number;
  /** Count of deals at or above the internal large-exposure threshold. */
  dealsAboveThresholdCount: number;
  threshold: number;
}

export interface PortfolioConcentrationStat {
  /** Largest single client's share of total exposure (0–100). */
  singleNamePct: number;
  singleNameClient: string | undefined;
  singleNameBand: PortfolioBand;
  /** Combined share of the top-5 client exposures (0–100). */
  top5Pct: number;
  top5Band: PortfolioBand;
  topProductPct: number;
  topProductLabel: string | undefined;
  topProductBand: PortfolioBand;
  topBankerPct: number;
  topBankerLabel: string | undefined;
  topBankerBand: PortfolioBand;
  /** Exposure aggregated by client/borrower, sorted desc (unknown last). */
  byClient: PortfolioConcentrationRow[];
}

export interface PortfolioMaturityBucket {
  label: string;
  /** Inclusive lower day bound (relative to now). -Infinity for overdue. */
  lowDays: number;
  /** Exclusive upper day bound; undefined for the open-ended bucket. */
  highDays: number | undefined;
  dealCount: number;
  totalExposure: number;
}

export interface PortfolioOperationalStat {
  staleDealCount: number;
  missingDataCount: number;
  blockedDealCount: number;
  atRiskDealCount: number;
  /** Deals carrying at least one outstanding document. */
  documentBottleneckDealCount: number;
  /** Deals carrying at least one open task. */
  taskBottleneckDealCount: number;
  outstandingDocumentCount: number;
  openTaskCount: number;
  operationalBand: PortfolioBand;
  dataQualityBand: PortfolioBand;
  closingPressureBand: PortfolioBand;
}

export type PortfolioFindingSeverity = 'high' | 'elevated' | 'watch' | 'info';

export type PortfolioFindingKind =
  | 'top-borrower-concentration'
  | 'concentrated-product-exposure'
  | 'concentrated-banker-exposure'
  | 'stale-high-dollar-deal'
  | 'high-exposure-outstanding-docs'
  | 'high-exposure-open-tasks'
  | 'high-exposure-missing-labels'
  | 'closing-soon-unresolved';

export interface PortfolioRiskFinding {
  id: string;
  kind: PortfolioFindingKind;
  label: string;
  severity: PortfolioFindingSeverity;
  /** Supporting deal/client names for the finding. */
  supportingNames: string[];
  /** The metric that produced the finding (human readable). */
  sourceMetric: string;
  /** Safe, read-only next action copy (never a write instruction). */
  nextAction: string;
  /** Deal route target when the finding is anchored to one deal. */
  dealId?: string;
  clientName?: string;
  /** Exposure backing the finding (used for ranking); 0 when none. */
  exposure: number;
}

export interface PortfolioRiskSnapshot {
  exposure: PortfolioExposureStat;
  concentration: PortfolioConcentrationStat;
  maturityLadder: PortfolioMaturityBucket[];
  operational: PortfolioOperationalStat;
  findings: PortfolioRiskFinding[];
  isEmpty: boolean;
}

export interface PortfolioRiskSnapshotOptions {
  now?: Date;
  /** Internal large-exposure threshold. Default 5,000,000. */
  threshold?: number;
  /** Cap on the byClient list. Default 8. */
  topClientN?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Internal, non-regulatory band thresholds. Each profile lists the
// [watchAt, elevatedAt, highAt] cut points (percent, inclusive lower).
const SINGLE_NAME_PCT = [10, 20, 35] as const;
const GROUP_PCT = [40, 60, 80] as const;
const SEGMENT_PCT = [25, 40, 60] as const;
const RATIO_PCT = [10, 25, 40] as const;

// ---------------------------------------------------------------------------
// Public deriver
// ---------------------------------------------------------------------------

export function derivePortfolioRiskSnapshot(
  command: PortfolioCommandSnapshot,
  options: PortfolioRiskSnapshotOptions = {},
): PortfolioRiskSnapshot {
  const now = options.now ?? new Date();
  const threshold = options.threshold ?? PORTFOLIO_LARGE_EXPOSURE_THRESHOLD;
  const topClientN = options.topClientN ?? 8;
  const rows = command.vmRows;
  const totalExposure = command.commandRibbon.totalExposure;

  const exposure = deriveExposureStat(rows, totalExposure, threshold);
  const concentration = deriveConcentrationStat(
    rows,
    command,
    totalExposure,
    topClientN,
  );
  const maturityLadder = deriveMaturityLadder(rows, now);
  const operational = deriveOperationalStat(rows, command);
  const findings = deriveFindings({
    rows,
    command,
    exposure,
    concentration,
    threshold,
    now,
  });

  return {
    exposure,
    concentration,
    maturityLadder,
    operational,
    findings,
    isEmpty: command.isEmpty,
  };
}

// ---------------------------------------------------------------------------
// Exposure statistics
// ---------------------------------------------------------------------------

function deriveExposureStat(
  rows: ReadonlyArray<ManagerVMRow>,
  totalExposure: number,
  threshold: number,
): PortfolioExposureStat {
  const amounts: number[] = [];
  let largestExposure: number | undefined;
  let largestDealId: string | undefined;
  let largestDealName: string | undefined;
  let dealsAboveThresholdCount = 0;

  for (const r of rows) {
    const amt = r.teamDeal.amount;
    if (typeof amt !== 'number' || !Number.isFinite(amt)) continue;
    amounts.push(amt);
    if (largestExposure === undefined || amt > largestExposure) {
      largestExposure = amt;
      largestDealId = r.teamDeal.id;
      largestDealName = r.teamDeal.name;
    }
    if (amt >= threshold) dealsAboveThresholdCount += 1;
  }

  const exposureDealCount = amounts.length;
  const averageExposure =
    exposureDealCount > 0 ? totalExposure / exposureDealCount : undefined;
  const medianExposure = median(amounts);

  return {
    totalExposure,
    averageExposure,
    medianExposure,
    largestExposure,
    largestDealId,
    largestDealName,
    exposureDealCount,
    dealsAboveThresholdCount,
    threshold,
  };
}

// ---------------------------------------------------------------------------
// Concentration statistics
// ---------------------------------------------------------------------------

function deriveConcentrationStat(
  rows: ReadonlyArray<ManagerVMRow>,
  command: PortfolioCommandSnapshot,
  totalExposure: number,
  topClientN: number,
): PortfolioConcentrationStat {
  const byClient = buildClientConcentration(rows, totalExposure);
  const topClients = byClient.filter((c) => !c.isUnknown);

  const singleName = topClients[0];
  const singleNamePct = singleName?.sharePct ?? 0;
  const top5Pct = clampPct(
    topClients.slice(0, 5).reduce((acc, c) => acc + c.sharePct, 0),
  );

  const topProduct = command.byProductType.find((b) => !b.isUnknown);
  const topBanker = command.byBanker.find((b) => !b.isUnknown);

  return {
    singleNamePct,
    singleNameClient: singleName?.label,
    singleNameBand: classifyBand(singleNamePct, SINGLE_NAME_PCT),
    top5Pct,
    top5Band: classifyBand(top5Pct, GROUP_PCT),
    topProductPct: topProduct?.sharePct ?? 0,
    topProductLabel: topProduct?.label,
    topProductBand: classifyBand(topProduct?.sharePct ?? 0, SEGMENT_PCT),
    topBankerPct: topBanker?.sharePct ?? 0,
    topBankerLabel: topBanker?.label,
    topBankerBand: classifyBand(topBanker?.sharePct ?? 0, SEGMENT_PCT),
    byClient: byClient.slice(0, Math.max(0, topClientN)),
  };
}

function buildClientConcentration(
  rows: ReadonlyArray<ManagerVMRow>,
  totalExposure: number,
): PortfolioConcentrationRow[] {
  type Acc = {
    label: string;
    dealCount: number;
    totalExposure: number;
    isUnknown: boolean;
  };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const raw = r.teamDeal.clientName;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    const isUnknown = trimmed.length === 0;
    const label = isUnknown ? 'Unknown client' : trimmed;
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
      if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1;
      if (b.totalExposure !== a.totalExposure) {
        return b.totalExposure - a.totalExposure;
      }
      return a.label.localeCompare(b.label);
    });
}

// ---------------------------------------------------------------------------
// Closing / maturity ladder
// ---------------------------------------------------------------------------

const MATURITY_SPEC: ReadonlyArray<{
  label: string;
  lowDays: number;
  highDays: number | undefined;
}> = [
  { label: 'Overdue close', lowDays: -Infinity, highDays: 0 },
  { label: '0–30d', lowDays: 0, highDays: 31 },
  { label: '31–60d', lowDays: 31, highDays: 61 },
  { label: '61–90d', lowDays: 61, highDays: 91 },
  { label: '91–180d', lowDays: 91, highDays: 181 },
  { label: '180d+', lowDays: 181, highDays: undefined },
];

function deriveMaturityLadder(
  rows: ReadonlyArray<ManagerVMRow>,
  now: Date,
): PortfolioMaturityBucket[] {
  const buckets: PortfolioMaturityBucket[] = MATURITY_SPEC.map((s) => ({
    ...s,
    dealCount: 0,
    totalExposure: 0,
  }));
  // Honest catalog-gap bucket for deals with no target close date.
  const noDate: PortfolioMaturityBucket = {
    label: 'No close date',
    lowDays: NaN,
    highDays: undefined,
    dealCount: 0,
    totalExposure: 0,
  };

  for (const r of rows) {
    const iso = r.teamDeal.targetCloseDate;
    const parsed = iso ? new Date(iso) : undefined;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      noDate.dealCount += 1;
      noDate.totalExposure += amountOrZero(r.teamDeal.amount);
      continue;
    }
    const days = Math.floor((parsed.getTime() - now.getTime()) / MS_PER_DAY);
    for (const b of buckets) {
      const inLow = days >= b.lowDays;
      const inHigh = b.highDays === undefined ? true : days < b.highDays;
      if (inLow && inHigh) {
        b.dealCount += 1;
        b.totalExposure += amountOrZero(r.teamDeal.amount);
        break;
      }
    }
  }
  return [...buckets, noDate];
}

// ---------------------------------------------------------------------------
// Operational / data-quality statistics
// ---------------------------------------------------------------------------

function deriveOperationalStat(
  rows: ReadonlyArray<ManagerVMRow>,
  command: PortfolioCommandSnapshot,
): PortfolioOperationalStat {
  const ribbon = command.commandRibbon;
  const active = ribbon.activeDealCount;

  let documentBottleneckDealCount = 0;
  let taskBottleneckDealCount = 0;
  for (const r of rows) {
    if (r.outstandingDocumentCount > 0) documentBottleneckDealCount += 1;
    if (r.openTaskCount > 0) taskBottleneckDealCount += 1;
  }

  const blockedDealCount = ribbon.blockedDealCount;
  const atRiskDealCount = ribbon.atRiskDealCount;

  const operationalRatio = pct(blockedDealCount + atRiskDealCount, active);
  const dataQualityRatio = pct(ribbon.missingDataCount, active);

  return {
    staleDealCount: ribbon.staleDealCount,
    missingDataCount: ribbon.missingDataCount,
    blockedDealCount,
    atRiskDealCount,
    documentBottleneckDealCount,
    taskBottleneckDealCount,
    outstandingDocumentCount: ribbon.outstandingDocumentCount,
    openTaskCount: ribbon.openTaskCount,
    operationalBand: classifyBand(operationalRatio, RATIO_PCT),
    dataQualityBand: classifyBand(dataQualityRatio, RATIO_PCT),
    closingPressureBand: classifyClosingPressure(rows),
  };
}

/** Closing pressure: count of closing-soon (≤30d) deals with unresolved
 *  docs/tasks. Count-based bands (deterministic, non-regulatory). */
function classifyClosingPressure(
  rows: ReadonlyArray<ManagerVMRow>,
): PortfolioBand {
  // We don't recompute closing windows here beyond the finding builder;
  // operational closing-pressure uses the count of at-risk/blocked deals
  // that also have outstanding docs/tasks as a proxy for pipeline stress.
  let pressured = 0;
  for (const r of rows) {
    const unresolved = r.outstandingDocumentCount > 0 || r.openTaskCount > 0;
    const flagged =
      r.vm.blockerStatus === 'blocked' || r.vm.blockerStatus === 'at-risk';
    if (unresolved && flagged) pressured += 1;
  }
  if (pressured >= 6) return 'high';
  if (pressured >= 3) return 'elevated';
  if (pressured >= 1) return 'watch';
  return 'low';
}

// ---------------------------------------------------------------------------
// Ranked portfolio findings
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<PortfolioFindingSeverity, number> = {
  high: 0,
  elevated: 1,
  watch: 2,
  info: 3,
};

const CLOSING_SOON_DAYS = 30;

function deriveFindings(args: {
  rows: ReadonlyArray<ManagerVMRow>;
  command: PortfolioCommandSnapshot;
  exposure: PortfolioExposureStat;
  concentration: PortfolioConcentrationStat;
  threshold: number;
  now: Date;
}): PortfolioRiskFinding[] {
  const { rows, concentration, threshold, now } = args;
  const findings: PortfolioRiskFinding[] = [];

  // Portfolio-level concentration findings.
  if (concentration.singleNameClient && concentration.singleNameBand !== 'low') {
    findings.push({
      id: 'top-borrower-concentration',
      kind: 'top-borrower-concentration',
      label: `Top borrower concentration: ${concentration.singleNameClient} (${concentration.singleNamePct}% of exposure)`,
      severity: bandToSeverity(concentration.singleNameBand),
      supportingNames: [concentration.singleNameClient],
      sourceMetric: `Single-name concentration ${concentration.singleNamePct}%`,
      nextAction:
        'Review the borrower relationship and consider diversification before adding exposure.',
      clientName: concentration.singleNameClient,
      exposure: concentration.byClient[0]?.totalExposure ?? 0,
    });
  }
  if (concentration.topProductLabel && concentration.topProductBand !== 'low') {
    findings.push({
      id: 'concentrated-product-exposure',
      kind: 'concentrated-product-exposure',
      label: `Concentrated product exposure: ${concentration.topProductLabel} (${concentration.topProductPct}%)`,
      severity: bandToSeverity(concentration.topProductBand),
      supportingNames: [concentration.topProductLabel],
      sourceMetric: `Product concentration ${concentration.topProductPct}%`,
      nextAction:
        'Review product mix; concentration is an operational indicator, not a limit breach.',
      exposure: 0,
    });
  }
  if (concentration.topBankerLabel && concentration.topBankerBand !== 'low') {
    findings.push({
      id: 'concentrated-banker-exposure',
      kind: 'concentrated-banker-exposure',
      label: `Concentrated banker exposure: ${concentration.topBankerLabel} (${concentration.topBankerPct}%)`,
      severity: bandToSeverity(concentration.topBankerBand),
      supportingNames: [concentration.topBankerLabel],
      sourceMetric: `Banker concentration ${concentration.topBankerPct}%`,
      nextAction: 'Review workload distribution across the team.',
      exposure: 0,
    });
  }

  // Per-deal findings (only for material / large exposures).
  for (const r of rows) {
    const amt = r.teamDeal.amount;
    const isLarge = typeof amt === 'number' && Number.isFinite(amt) && amt >= threshold;
    const exposure = amountOrZero(amt);

    if (isLarge && isStale(r, now)) {
      findings.push({
        id: `stale-high-dollar-${r.teamDeal.id}`,
        kind: 'stale-high-dollar-deal',
        label: `Stale high-dollar deal: ${r.teamDeal.name}`,
        severity: 'high',
        supportingNames: [r.teamDeal.name],
        sourceMetric: `No record activity in ${MANAGER_STALE_DEAL_DAYS}+ days at ${formatUsd(exposure)}`,
        nextAction: 'Re-engage the deal team; confirm the deal is still active.',
        dealId: r.teamDeal.id,
        clientName: r.teamDeal.clientName,
        exposure,
      });
    }
    if (isLarge && r.outstandingDocumentCount > 0) {
      findings.push({
        id: `high-exposure-docs-${r.teamDeal.id}`,
        kind: 'high-exposure-outstanding-docs',
        label: `High exposure with outstanding documents: ${r.teamDeal.name}`,
        severity: 'elevated',
        supportingNames: [r.teamDeal.name],
        sourceMetric: `${r.outstandingDocumentCount} outstanding doc(s) at ${formatUsd(exposure)}`,
        nextAction: 'Prioritize document collection on this large exposure.',
        dealId: r.teamDeal.id,
        clientName: r.teamDeal.clientName,
        exposure,
      });
    }
    if (isLarge && r.openTaskCount > 0) {
      findings.push({
        id: `high-exposure-tasks-${r.teamDeal.id}`,
        kind: 'high-exposure-open-tasks',
        label: `High exposure with open tasks: ${r.teamDeal.name}`,
        severity: 'watch',
        supportingNames: [r.teamDeal.name],
        sourceMetric: `${r.openTaskCount} open task(s) at ${formatUsd(exposure)}`,
        nextAction: 'Review the open task queue on this large exposure.',
        dealId: r.teamDeal.id,
        clientName: r.teamDeal.clientName,
        exposure,
      });
    }
    if (isLarge && r.managerMissingFieldLabels.length > 0) {
      findings.push({
        id: `high-exposure-missing-${r.teamDeal.id}`,
        kind: 'high-exposure-missing-labels',
        label: `High exposure missing key fields: ${r.teamDeal.name}`,
        severity: 'elevated',
        supportingNames: [r.teamDeal.name],
        sourceMetric: `Missing: ${r.managerMissingFieldLabels.join(', ')}`,
        nextAction: 'Complete the deal record so risk views are accurate.',
        dealId: r.teamDeal.id,
        clientName: r.teamDeal.clientName,
        exposure,
      });
    }
    if (
      isClosingSoon(r, now) &&
      (r.outstandingDocumentCount > 0 || r.openTaskCount > 0)
    ) {
      findings.push({
        id: `closing-unresolved-${r.teamDeal.id}`,
        kind: 'closing-soon-unresolved',
        label: `Closing soon with unresolved items: ${r.teamDeal.name}`,
        severity: 'elevated',
        supportingNames: [r.teamDeal.name],
        sourceMetric: `${r.outstandingDocumentCount} doc(s) / ${r.openTaskCount} task(s) before close`,
        nextAction: 'Clear outstanding items ahead of the target close date.',
        dealId: r.teamDeal.id,
        clientName: r.teamDeal.clientName,
        exposure,
      });
    }
  }

  findings.sort((a, b) => {
    if (a.severity !== b.severity) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (b.exposure !== a.exposure) return b.exposure - a.exposure;
    return a.label.localeCompare(b.label);
  });
  return findings;
}

// ---------------------------------------------------------------------------
// Copilot summary lines (pure; labels + counts + percentages only)
// ---------------------------------------------------------------------------

/**
 * Phase 132A — risk/concentration summary lines for the Portfolio
 * Copilot context. Derived entirely from the already-computed risk
 * snapshot. Contains labels, counts, and percentages only — never a
 * record id / GUID — so it is safe to forward to the assistant.
 */
export function portfolioRiskCopilotSummaries(
  risk: PortfolioRiskSnapshot,
): string[] {
  const c = risk.concentration;
  const e = risk.exposure;
  const lines = [
    `Single-name concentration: ${c.singleNamePct}% (${c.singleNameBand})`,
    `Top-5 concentration: ${c.top5Pct}% (${c.top5Band})`,
    `Largest exposure: ${formatUsdCompact(e.largestExposure ?? 0)}`,
    `Deals above internal threshold: ${e.dealsAboveThresholdCount}`,
    `Operational band: ${risk.operational.operationalBand} · Data quality band: ${risk.operational.dataQualityBand}`,
  ];
  if (risk.findings.length > 0) {
    lines.push(`Risk findings: ${risk.findings.length}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isStale(r: ManagerVMRow, now: Date): boolean {
  const iso = r.teamDeal.modifiedOn;
  if (!iso) return false;
  const m = new Date(iso).getTime();
  if (Number.isNaN(m)) return false;
  const days = Math.floor((now.getTime() - m) / MS_PER_DAY);
  return days >= MANAGER_STALE_DEAL_DAYS;
}

function isClosingSoon(r: ManagerVMRow, now: Date): boolean {
  const iso = r.teamDeal.targetCloseDate;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const delta = t - now.getTime();
  return delta >= 0 && delta <= CLOSING_SOON_DAYS * MS_PER_DAY;
}

function bandToSeverity(band: PortfolioBand): PortfolioFindingSeverity {
  switch (band) {
    case 'high':
      return 'high';
    case 'elevated':
      return 'elevated';
    case 'watch':
      return 'watch';
    case 'low':
    default:
      return 'info';
  }
}

/** value < watchAt → low; < elevatedAt → watch; < highAt → elevated; else high. */
function classifyBand(
  value: number,
  [watchAt, elevatedAt, highAt]: readonly [number, number, number],
): PortfolioBand {
  if (value >= highAt) return 'high';
  if (value >= elevatedAt) return 'elevated';
  if (value >= watchAt) return 'watch';
  return 'low';
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function amountOrZero(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function sharePct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function formatUsd(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatUsdCompact(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}
