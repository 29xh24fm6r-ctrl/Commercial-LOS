/**
 * Phase 124E / 125A — Manager dashboard chart primitives.
 *
 * Phase 127A relocated the actual implementation to
 * `src/shared/CommandChartPrimitives.tsx` so the Team Ops Queue (and
 * any future role-scoped cockpit) can reuse the same primitives
 * without violating the Phase 48 isolation rule (src/team/ may not
 * import from src/manager/). This file now re-exports every symbol
 * verbatim so every existing
 * `import … from '../manager/ManagerChartPrimitives'` keeps working
 * unchanged — including the static-source contract pins in the
 * manager + portfolio cockpit tests.
 */

export {
  VerticalBarChart,
  HorizontalBarChart,
  Histogram,
  DonutChart,
  ForecastSparkline,
} from '../shared/CommandChartPrimitives';

export type {
  VerticalBarDatum,
  HorizontalBarDatum,
  HistogramDatum,
  DonutSegment,
  ForecastPoint,
} from '../shared/CommandChartPrimitives';
