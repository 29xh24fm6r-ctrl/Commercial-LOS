import type { ManagerVMRow } from '../manager/managerPipelineSnapshot';
import type { PortfolioConcentrationRow } from './portfolioCommandSnapshot';
import type {
  HorizontalBarDatum,
  VerticalBarDatum,
} from '../manager/ManagerChartPrimitives';

/**
 * Phase 126A — Portfolio dashboard chart adapters + portfolio-specific
 * derivers.
 *
 * The portfolio cockpit's risk-distribution / aging-histogram /
 * closings-forecast / missing-fields / data-quality charts are all
 * derived by the same pure helpers the manager cockpit uses
 * (`deriveRiskDistribution`, `deriveAgingHistogram`,
 * `deriveClosingForecast`, `deriveMissingFieldsDistribution`,
 * `deriveDataQualityDistribution`); they live in `managerDashboardCharts.ts`
 * and operate over the same `ManagerVMRow[]` shape the portfolio
 * snapshot already exposes via `vmRows`.
 *
 * This file:
 *   - converts `PortfolioConcentrationRow`s into chart-primitive
 *     datum shapes; and
 *   - introduces one portfolio-specific deriver
 *     (`derivePortfolioExposureBands`) for a "deal size mix" view
 *     that has no manager-cockpit counterpart.
 */

// ---------------------------------------------------------------------------
// Adapters: ConcentrationRow → chart primitive shape
// ---------------------------------------------------------------------------

/**
 * Convert PortfolioConcentrationRow[] into HorizontalBarDatum[] for
 * the Mix charts. `Unknown` rows render with `neutral` tone so they
 * read as catalog gaps, not as risk signals.
 *
 * The primary metric is the total exposure (dollar) — secondaryLabel
 * carries the deal count so the chart card communicates both at
 * once without needing a second axis.
 */
export function concentrationToHorizontalBars(
  rows: ReadonlyArray<PortfolioConcentrationRow>,
): HorizontalBarDatum[] {
  return rows.map((r) => ({
    label: r.label,
    value: r.totalExposure,
    secondaryLabel:
      r.dealCount === 1
        ? `${r.dealCount} deal · ${r.sharePct}%`
        : `${r.dealCount} deals · ${r.sharePct}%`,
    tone: r.isUnknown ? 'neutral' : 'info',
  }));
}

/**
 * Convert PortfolioConcentrationRow[] into VerticalBarDatum[] for the
 * Pipeline-by-Stage column chart. Primary metric is the deal count;
 * unknown bucket uses `neutral` tone.
 */
export function concentrationToVerticalBars(
  rows: ReadonlyArray<PortfolioConcentrationRow>,
): VerticalBarDatum[] {
  return rows.map((r) => ({
    label: r.label,
    value: r.dealCount,
    tone: r.isUnknown ? 'neutral' : 'info',
  }));
}

// ---------------------------------------------------------------------------
// Portfolio-specific deriver: exposure bands
// ---------------------------------------------------------------------------

export interface ExposureBand {
  /** Bucket label (e.g. '<$500K', '$10M+'). */
  label: string;
  /** Inclusive lower bound in dollars. */
  lowAmount: number;
  /** Exclusive upper bound; undefined for the top open-ended bucket. */
  highAmount: number | undefined;
  /** Count of deals whose amount fell in this band. */
  dealCount: number;
  /** Sum of amounts of those deals. */
  totalExposure: number;
}

const EXPOSURE_BAND_SPEC: ReadonlyArray<{
  label: string;
  lowAmount: number;
  highAmount: number | undefined;
}> = [
  { label: '<$500K', lowAmount: 0, highAmount: 500_000 },
  { label: '$500K–$2M', lowAmount: 500_000, highAmount: 2_000_000 },
  { label: '$2M–$10M', lowAmount: 2_000_000, highAmount: 10_000_000 },
  { label: '$10M+', lowAmount: 10_000_000, highAmount: undefined },
];

/**
 * Bucket the portfolio's authorized deals by amount band. Deals with
 * `undefined` / `NaN` amounts are excluded (honest absence — they
 * surface separately in the missing-data KPI tile and the data-quality
 * chart). The bucket spec is fixed; future tuning can extend the
 * spec without changing the deriver shape.
 */
export function derivePortfolioExposureBands(
  rows: ReadonlyArray<ManagerVMRow>,
): ExposureBand[] {
  const bands: ExposureBand[] = EXPOSURE_BAND_SPEC.map((s) => ({
    ...s,
    dealCount: 0,
    totalExposure: 0,
  }));
  for (const r of rows) {
    const amt = r.teamDeal.amount;
    if (typeof amt !== 'number' || !Number.isFinite(amt)) continue;
    if (amt < 0) continue;
    for (const b of bands) {
      const inLow = amt >= b.lowAmount;
      const inHigh = b.highAmount === undefined ? true : amt < b.highAmount;
      if (inLow && inHigh) {
        b.dealCount += 1;
        b.totalExposure += amt;
        break;
      }
    }
  }
  return bands;
}

/**
 * Convert ExposureBand[] into VerticalBarDatum[] for the deal-size
 * mix chart. Bar height tracks the count; the cockpit can render
 * the dollar total as a subtitle.
 */
export function exposureBandsToVerticalBars(
  bands: ReadonlyArray<ExposureBand>,
): VerticalBarDatum[] {
  return bands.map((b) => ({
    label: b.label,
    value: b.dealCount,
    tone: 'info',
  }));
}
