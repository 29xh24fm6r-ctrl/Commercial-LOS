/**
 * Phase 71: shared derived-analytics primitives.
 *
 * Pure functions. No SDK import, no role-module import, no clock
 * outside the caller-supplied `now`. Each function takes
 * already-authorized deal rows (loaded by ManagerDataProvider or
 * TeamDataProvider) and returns deterministic, source-field-backed
 * summaries — never a "score", never a "ranking", never a
 * predictive claim.
 *
 * Conservative copy discipline (Phase 71 brief + Phase 45 standing):
 *   - Use: "derived from current records", "active pipeline",
 *     "workload", "open items", "pending review",
 *     "estimated from available fields".
 *   - Avoid: "score", "ranking", "predictive", "AI-generated",
 *     "official performance rating", "underperforming".
 *
 * Field source — only fields present on TeamDeal / TeamDealRow are
 * read here. Adding a new metric that requires a field not in those
 * shapes is out of scope without an upstream query-shape change.
 */

// ---------------------------------------------------------------------------
// Structural input shape — both TeamDeal (manager) and TeamDealRow (team)
// satisfy this. Defining a structural type here keeps the analytics module
// from depending on either role's queries module.
// ---------------------------------------------------------------------------

export interface AnalyticsDeal {
  id: string;
  name: string;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  assignedBankerId: string | undefined;
  assignedBankerName: string | undefined;
}

// ---------------------------------------------------------------------------
// Date math (vendored — workQueue/primitives.ts has the same shape but lives
// in workQueue land; the analytics module stays independent so it can be
// imported by either lane without picking up workQueue deps).
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function daysBetween(thenMs: number, nowMs: number): number {
  return Math.floor((nowMs - thenMs) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// 1. Stage-aging summary
// ---------------------------------------------------------------------------

/**
 * Days a deal sits in its current stage before we flag the row as
 * "may require review" for analytics purposes. Mirrors the manager
 * teamSignals.ts at-risk threshold so the same deal that flips amber
 * on the manager deal page also counts here.
 */
export const STAGE_AGING_AT_RISK_DAYS = 30;

export interface StageAgingSummary {
  /** Number of deals for which we could derive a stage-entry day count
   *  (i.e. cr664_stageentrydate was present and parseable). */
  countedDeals: number;
  /** Average days in stage across countedDeals. 0 when none counted. */
  averageDaysInStage: number;
  /** Median days in stage across countedDeals. 0 when none counted. */
  medianDaysInStage: number;
  /** Max days in stage across countedDeals. 0 when none counted. */
  maxDaysInStage: number;
  /** Count of deals whose days-in-stage is >= STAGE_AGING_AT_RISK_DAYS. */
  atRiskCount: number;
  /** Count of deals where stageEntryDate was missing or unparseable;
   *  surfaced honestly so the consumer can communicate the gap. */
  missingStageEntryDateCount: number;
}

export function summarizeStageAging(
  deals: readonly AnalyticsDeal[],
  now: Date,
): StageAgingSummary {
  const nowMs = now.getTime();
  const ages: number[] = [];
  let missing = 0;
  for (const d of deals) {
    const stageEntryMs = parseIso(d.stageEntryDate);
    if (stageEntryMs == null) {
      missing++;
      continue;
    }
    const days = daysBetween(stageEntryMs, nowMs);
    // Negative ages (stage entry in the future) are nonsensical for
    // analytics; drop them but count as "missing" so the gap is
    // honest in the rendered fact.
    if (days < 0) {
      missing++;
      continue;
    }
    ages.push(days);
  }
  if (ages.length === 0) {
    return {
      countedDeals: 0,
      averageDaysInStage: 0,
      medianDaysInStage: 0,
      maxDaysInStage: 0,
      atRiskCount: 0,
      missingStageEntryDateCount: missing,
    };
  }
  const sorted = [...ages].sort((a, b) => a - b);
  const sum = ages.reduce((acc, n) => acc + n, 0);
  const median =
    sorted.length % 2 === 1
      ? sorted[Math.floor(sorted.length / 2)]!
      : Math.round(
          (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2,
        );
  return {
    countedDeals: ages.length,
    averageDaysInStage: Math.round(sum / ages.length),
    medianDaysInStage: median,
    maxDaysInStage: sorted[sorted.length - 1]!,
    atRiskCount: ages.filter((d) => d >= STAGE_AGING_AT_RISK_DAYS).length,
    missingStageEntryDateCount: missing,
  };
}

// ---------------------------------------------------------------------------
// 2. Pipeline-mix summary
// ---------------------------------------------------------------------------

export interface PipelineMixSummary {
  /** Number of distinct stage names across the deal set. Empty stage
   *  values (undefined / blank) are excluded from the distinct count
   *  and surfaced separately in missingStageCount. */
  distinctStages: number;
  /** Number of distinct banker ids across the deal set. */
  distinctBankers: number;
  /** Number of deals with no assigned banker (assignedBankerId
   *  undefined or empty). Surfaced honestly. */
  unassignedDealCount: number;
  /** Number of deals with no stage value. Surfaced honestly. */
  missingStageCount: number;
  /** Top banker's share of total pipeline volume (sum of amount), as
   *  a percentage rounded to the nearest integer. 0 when no banker
   *  carries any amount (or no amount data is present). The metric is
   *  a concentration indicator, not a ranking — the brief explicitly
   *  forbids ranking language. */
  topBankerPipelineSharePct: number;
  /** Top banker's share of total deal count, as a percentage rounded
   *  to the nearest integer. Same conservative framing as above. */
  topBankerDealCountSharePct: number;
}

export function summarizePipelineMix(
  deals: readonly AnalyticsDeal[],
): PipelineMixSummary {
  const stages = new Set<string>();
  const bankerIds = new Set<string>();
  let unassigned = 0;
  let missingStage = 0;
  const byBankerAmount = new Map<string, number>();
  const byBankerCount = new Map<string, number>();
  let totalAmount = 0;
  for (const d of deals) {
    if (d.stage && d.stage.trim().length > 0) {
      stages.add(d.stage);
    } else {
      missingStage++;
    }
    const bankerId = d.assignedBankerId?.trim();
    if (bankerId) {
      bankerIds.add(bankerId);
      byBankerCount.set(bankerId, (byBankerCount.get(bankerId) ?? 0) + 1);
      if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
        byBankerAmount.set(
          bankerId,
          (byBankerAmount.get(bankerId) ?? 0) + d.amount,
        );
      }
    } else {
      unassigned++;
    }
    if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
      totalAmount += d.amount;
    }
  }
  let topBankerAmount = 0;
  for (const v of byBankerAmount.values()) {
    if (v > topBankerAmount) topBankerAmount = v;
  }
  let topBankerCount = 0;
  for (const v of byBankerCount.values()) {
    if (v > topBankerCount) topBankerCount = v;
  }
  const topBankerPipelineSharePct =
    totalAmount > 0
      ? Math.round((topBankerAmount / totalAmount) * 100)
      : 0;
  const totalAssignedCount = [...byBankerCount.values()].reduce(
    (acc, n) => acc + n,
    0,
  );
  const topBankerDealCountSharePct =
    totalAssignedCount > 0
      ? Math.round((topBankerCount / totalAssignedCount) * 100)
      : 0;
  return {
    distinctStages: stages.size,
    distinctBankers: bankerIds.size,
    unassignedDealCount: unassigned,
    missingStageCount: missingStage,
    topBankerPipelineSharePct,
    topBankerDealCountSharePct,
  };
}

// ---------------------------------------------------------------------------
// 3. Per-banker workload derivation
// ---------------------------------------------------------------------------

/**
 * Window inside which the closing-soon flag fires for an analytics
 * row. Matches the closing-soon threshold the banker work-queue uses
 * (CLOSING_SOON_DAYS = 14 in shared/workQueue/primitives.ts) so the
 * same deal that surfaces in the queue is reflected in the analytics
 * row.
 */
export const CLOSING_SOON_DAYS = 14;

export interface PerBankerActivity {
  bankerId: string;
  bankerName: string;
  /** Number of active deals assigned to the banker. */
  totalDeals: number;
  /** Sum of amount across the banker's deals, in raw currency units.
   *  Deals with missing amount are silently skipped — surfaced via
   *  the dealsMissingAmount field. */
  totalAmount: number;
  /** Count of the banker's deals with no parseable amount. */
  dealsMissingAmount: number;
  /** Average days the banker's deals have spent in their current
   *  stage. 0 when no stage-entry-date data was available. */
  averageDaysInStage: number;
  /** Count of the banker's deals at >= STAGE_AGING_AT_RISK_DAYS days
   *  in current stage. */
  stageAtRiskCount: number;
  /** Count of the banker's deals whose target close date is within
   *  CLOSING_SOON_DAYS calendar days from `now`. */
  closingSoonCount: number;
}

export function derivePerBankerActivity(
  deals: readonly AnalyticsDeal[],
  now: Date,
): PerBankerActivity[] {
  const nowMs = now.getTime();
  const byBanker = new Map<string, AnalyticsDeal[]>();
  for (const d of deals) {
    const bankerId = d.assignedBankerId?.trim();
    if (!bankerId) continue;
    const existing = byBanker.get(bankerId) ?? [];
    existing.push(d);
    byBanker.set(bankerId, existing);
  }
  const rows: PerBankerActivity[] = [];
  for (const [bankerId, list] of byBanker) {
    const name = list[0]!.assignedBankerName ?? '(unnamed banker)';
    let totalAmount = 0;
    let dealsMissingAmount = 0;
    const ages: number[] = [];
    let stageAtRisk = 0;
    let closingSoon = 0;
    for (const d of list) {
      if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
        totalAmount += d.amount;
      } else {
        dealsMissingAmount++;
      }
      const stageEntryMs = parseIso(d.stageEntryDate);
      if (stageEntryMs != null) {
        const days = daysBetween(stageEntryMs, nowMs);
        if (days >= 0) {
          ages.push(days);
          if (days >= STAGE_AGING_AT_RISK_DAYS) stageAtRisk++;
        }
      }
      const targetMs = parseIso(d.targetCloseDate);
      if (targetMs != null) {
        const daysUntilClose = Math.floor((targetMs - nowMs) / MS_PER_DAY);
        if (daysUntilClose >= 0 && daysUntilClose <= CLOSING_SOON_DAYS) {
          closingSoon++;
        }
      }
    }
    const averageDaysInStage =
      ages.length > 0
        ? Math.round(ages.reduce((acc, n) => acc + n, 0) / ages.length)
        : 0;
    rows.push({
      bankerId,
      bankerName: name,
      totalDeals: list.length,
      totalAmount,
      dealsMissingAmount,
      averageDaysInStage,
      stageAtRiskCount: stageAtRisk,
      closingSoonCount: closingSoon,
    });
  }
  // Sort by total deals desc, then by name asc — deterministic and
  // useful at-a-glance (heaviest workload first). NOT a ranking
  // judgment; the brief explicitly forbids ranking language.
  rows.sort((a, b) => {
    if (b.totalDeals !== a.totalDeals) return b.totalDeals - a.totalDeals;
    return a.bankerName.localeCompare(b.bankerName);
  });
  return rows;
}
