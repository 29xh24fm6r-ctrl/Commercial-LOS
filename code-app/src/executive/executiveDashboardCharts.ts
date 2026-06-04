import type {
  VerticalBarDatum,
  HorizontalBarDatum,
  DonutSegment,
  ForecastPoint,
} from '../shared/CommandChartPrimitives';
import type {
  ExecutiveCommandSnapshot,
  ExecutiveRiskDistribution,
} from './executiveCommandSnapshot';

/**
 * Phase 134B — Executive dashboard chart adapters (pure).
 *
 * Converts the already-derived `ExecutiveCommandSnapshot` into the
 * chart-primitive datum shapes the cockpit renders, plus a couple of
 * honest count-based derivations (stage deal-count bars + an exception
 * tape). Every value here traces back to data the Executive Workspace
 * has ALREADY loaded (readiness snapshots + stage / closing-forecast
 * aggregates).
 *
 * Discipline:
 *   - Pure. No IO, no fetch, no mutation, no new Dataverse scope.
 *   - No invented metrics. Exposure comes only from stage aggregates;
 *     readiness counts come only from readiness rows. No weighted
 *     pipeline, win rate, profitability, yield, margin, ROA, or revenue
 *     is synthesized here.
 *   - Honest absence: unknown stage / band buckets keep a `neutral`
 *     tone so they read as catalog gaps, not risk signals.
 */

// ---------------------------------------------------------------------------
// Stage distribution
// ---------------------------------------------------------------------------

/** Deal COUNT by stage (a distinct view from the $ exposure bars). */
export function stageCountBars(
  snapshot: ExecutiveCommandSnapshot,
): VerticalBarDatum[] {
  return snapshot.exposureByStage.map((s) => ({
    label: s.stage,
    value: s.dealCount,
    tone: s.isUnknown ? 'neutral' : 'info',
  }));
}

/** Exposure ($) by stage, with deal count + share as a secondary label. */
export function stageExposureBars(
  snapshot: ExecutiveCommandSnapshot,
): HorizontalBarDatum[] {
  return snapshot.exposureByStage.map((s) => ({
    label: s.stage,
    value: s.totalExposure,
    secondaryLabel: `${s.dealCount} · ${s.sharePct}%`,
    tone: s.isUnknown ? 'neutral' : 'info',
  }));
}

// ---------------------------------------------------------------------------
// Readiness / risk distribution
// ---------------------------------------------------------------------------

export function readinessDonutSegments(
  risk: ExecutiveRiskDistribution,
): DonutSegment[] {
  return [
    { label: 'High', value: risk.high, tone: 'clear' },
    { label: 'Medium', value: risk.medium, tone: 'info' },
    { label: 'Low', value: risk.low, tone: 'atRisk' },
    { label: 'Blocked', value: risk.blocked, tone: 'blocked' },
    { label: 'Unknown', value: risk.unknown, tone: 'neutral' },
  ];
}

// ---------------------------------------------------------------------------
// Closing forecast
// ---------------------------------------------------------------------------

/** Upcoming (non-past) closing-forecast buckets as sparkline points. */
export function closingForecastPoints(
  snapshot: ExecutiveCommandSnapshot,
): ForecastPoint[] {
  return snapshot.closingForecast
    .filter((b) => !b.past)
    .map((b) => ({
      label: b.label,
      dealCount: b.dealCount,
      totalAmount: b.totalExposure,
    }));
}

// ---------------------------------------------------------------------------
// Executive exception tape
// ---------------------------------------------------------------------------

export type ExecutiveExceptionTone = 'blocked' | 'atRisk' | 'info' | 'clear';

export interface ExecutiveExceptionBucket {
  key: string;
  label: string;
  /** Honest count from the snapshot; 0 buckets are kept (rendered clear). */
  count: number;
  tone: ExecutiveExceptionTone;
}

/**
 * Compact exception tape derived from already-computed snapshot counts.
 * Every bucket is a real count — no fabricated category. A zero count is
 * surfaced honestly (tone `clear`) rather than hidden, so an executive
 * reads the full posture at a glance.
 */
export function executiveExceptionTape(
  snapshot: ExecutiveCommandSnapshot,
): ExecutiveExceptionBucket[] {
  const r = snapshot.ribbon;
  const dq = snapshot.dataQuality;
  const buckets: Array<Omit<ExecutiveExceptionBucket, 'tone'> & {
    badTone: ExecutiveExceptionTone;
  }> = [
    { key: 'blocked', label: 'Blocked readiness', count: r.blockedCount, badTone: 'blocked' },
    { key: 'low-readiness', label: 'Low readiness', count: r.atRiskCount, badTone: 'atRisk' },
    { key: 'missing-docs', label: 'Deals missing docs', count: dq.dealsWithMissingDocs, badTone: 'atRisk' },
    { key: 'stale', label: 'Stale deals', count: dq.dealsWithStaleItems, badTone: 'atRisk' },
    { key: 'no-band', label: 'No readiness band', count: r.readinessUnknownCount, badTone: 'atRisk' },
  ];
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    count: b.count,
    tone: b.count > 0 ? b.badTone : 'clear',
  }));
}
