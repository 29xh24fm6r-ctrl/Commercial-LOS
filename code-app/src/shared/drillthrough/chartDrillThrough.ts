/**
 * Phase 144C — chart drill-through builders.
 *
 * Pure mappers that turn a dashboard chart's already-derived `{label, value}`
 * segment data into read-only {@link DrillThroughTarget}s so a chart card can
 * expose the counts/labels behind the visualization, or an honest unavailable
 * reason when there is nothing to show. No new loader, no Dataverse query, no
 * write, no fake data.
 *
 * Visible panel text is deliberately generic (heading "Chart details",
 * section "Segments") — the chart name is carried only in the disclosure's
 * accessible name and the surrounding chart card header, so adding a panel does
 * not collide with cockpit tests that match a chart title by substring.
 */

import {
  buildDrillThroughTarget,
  type DetailRow,
  type DrillThroughSourceCount,
  type DrillThroughSurface,
  type DrillThroughTarget,
} from './drillThroughTypes';

/** One chart segment (bar / slice / bin / trend point). */
export interface ChartSegmentInput {
  label: string;
  value: number;
  /** Optional secondary descriptor already shown on the chart (e.g. "$2.5M · 38%"). */
  secondary?: string;
  /** Honest per-segment warning (e.g. "unknown / unset bucket"). */
  warning?: string;
}

export interface ChartDrillThroughInput {
  chartTitle: string;
  surface: DrillThroughSurface;
  segments: readonly ChartSegmentInput[];
  /** Unit word for the value, default "count" (e.g. "deals", "tasks"). */
  unit?: string;
  nextReviewStep?: string;
  /** Overrides the default unavailable reason when there is no data. */
  unavailableReason?: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chart';
}

/**
 * Builds a chart-level drill-through target. When every segment is zero / there
 * are no segments, the target resolves to an honest unavailable reason rather
 * than a blank panel.
 */
export function buildChartDrillThrough(input: ChartDrillThroughInput): DrillThroughTarget {
  const unit = input.unit ?? 'count';
  const nonZero = input.segments.filter((s) => s.value !== 0);
  const total = input.segments.reduce((sum, s) => sum + s.value, 0);
  const rows: DetailRow[] = input.segments.map((s) => ({
    label: s.label,
    value: s.secondary ? `${s.value} · ${s.secondary}` : `${s.value}`,
    source: `chart ${unit}`,
    warning: s.warning,
  }));
  const sourceCounts: DrillThroughSourceCount[] = input.segments.map((s) => ({ label: s.label, count: s.value }));
  const hasData = nonZero.length > 0;
  return buildDrillThroughTarget({
    id: `chart-${slug(input.chartTitle)}`,
    // Generic heading on purpose — see file header.
    title: 'Chart details',
    subtitle: 'Read-only chart detail',
    surface: input.surface,
    entityKind: 'chart',
    summary: hasData
      ? `Breakdown of ${nonZero.length} segment(s); total ${total} ${unit}.`
      : 'No chart data in the current scope.',
    sourceCounts: hasData ? sourceCounts : undefined,
    detailSections: hasData ? [{ title: 'Segments', rows }] : undefined,
    nextReviewStep: hasData ? input.nextReviewStep : undefined,
    unavailableReason: hasData
      ? undefined
      : input.unavailableReason ?? 'This chart has no contributing data in the current scope.',
  });
}

/**
 * Builds a segment-level drill-through target for a legend/segment row, listing
 * the contributing source rows (e.g. deals) when available, or an honest
 * unavailable reason when the per-segment rows are not exposed by the view model.
 */
export function buildChartSegmentDrillThrough(input: {
  chartTitle: string;
  surface: DrillThroughSurface;
  segmentLabel: string;
  value: number;
  unit?: string;
  contributingRows?: readonly DetailRow[];
  routeHrefForRow?: never;
  unavailableReason?: string;
}): DrillThroughTarget {
  const unit = input.unit ?? 'count';
  const rows = input.contributingRows ?? [];
  const hasRows = rows.length > 0;
  return buildDrillThroughTarget({
    id: `chart-seg-${slug(input.chartTitle)}-${slug(input.segmentLabel)}`,
    title: `Segment details`,
    subtitle: input.segmentLabel,
    surface: input.surface,
    entityKind: 'chart_segment',
    summary: `${input.segmentLabel}: ${input.value} ${unit}.`,
    // Only carry content when per-row detail exists; otherwise resolve to an
    // honest unavailable reason rather than a value-only "panel".
    sourceCounts: hasRows ? [{ label: input.segmentLabel, count: input.value }] : undefined,
    detailSections: hasRows ? [{ title: 'Contributing rows', rows }] : undefined,
    unavailableReason: hasRows
      ? undefined
      : input.unavailableReason ?? `Per-row detail for "${input.segmentLabel}" is not available from this chart.`,
  });
}
