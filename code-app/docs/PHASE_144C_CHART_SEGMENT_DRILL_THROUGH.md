# Phase 144C — Chart Segment Drill-Through

> **Read-only chart exploration.** Adds drill-through to dashboard chart cards so a
> user can open the segment breakdown, source counts, and labels behind a
> visualization — or an honest unavailable reason — without any write, external
> call, or fake data. Builds on Phase 144A (contract) and 144B (legacy card
> retrofit), covering the chart visualizations 144B intentionally deferred.

## 1. What chart drill-through means

Every dashboard chart card (bar, slice, bin, trend) can be expanded to reveal a
read-only `DrillThroughPanel` listing each segment's label and value/count, the
contributing source counts, and any warnings — or a clear statement that the
chart has no contributing data in the current scope.

## 2. Chart-level vs segment-level drill-through

- **Chart-level** (`buildChartDrillThrough`) — the whole chart card exposes a
  segment breakdown: one detail row per bar/slice/bin/point plus source counts.
  This is what every retrofitted chart uses.
- **Segment-level** (`buildChartSegmentDrillThrough`) — an optional builder for a
  single legend/segment row that lists its contributing rows (e.g. deals) when a
  view model exposes them, or an honest unavailable reason when it does not. It is
  available for future per-segment wiring; the current pass uses chart-level
  drill-through to avoid brittle SVG/legend click handling.

## 3. Which workspaces were retrofitted

All shared-primitive chart cards in:

- **Manager** — Pipeline by stage, Pipeline by banker, Aging, Risk distribution,
  Open tasks by banker, Outstanding docs by banker, Closings forecast, Missing
  fields, Data quality.
- **Portfolio** — Pipeline by stage, Exposure by product type / loan structure /
  pricing / banker, Deal size mix, Aging, Risk distribution, Closings forecast,
  Missing field concentration, Data quality.
- **Team Ops** — Work items by type, Overdue tasks by banker, Outstanding docs by
  banker, Risk distribution, Closings forecast.
- **Executive** — Readiness distribution, Exposure by stage, Deals by stage,
  Closing forecast.

## 4. Which chart primitives / adapters were updated

- [chartDrillThrough.ts](../src/shared/drillthrough/chartDrillThrough.ts) — new
  `buildChartDrillThrough` / `buildChartSegmentDrillThrough` builders.
- [CommandChartPrimitives.tsx](../src/shared/CommandChartPrimitives.tsx) — the
  shared `ChartFrame` gained an optional read-only drill-through disclosure, and
  every chart (`VerticalBarChart`, `HorizontalBarChart`, `Histogram`,
  `DonutChart`, `ForecastSparkline`) gained an opt-in `drillThroughSurface` prop
  that derives the chart-level target from the chart's own `data`/`segments`/
  `points`.
- `ManagerChartPrimitives.tsx` re-exports the same primitives unchanged.

## 5. How chart details are derived from existing props/view-models

Each chart already receives a fully-derived `{label, value}` array (plus optional
secondary labels / amounts). The opt-in `drillThroughSurface` prop maps that exact
array into a read-only target — no new query, no new data. The chart name is NOT
copied into visible panel text (the panel heading is the generic "Chart details");
it is carried only in the disclosure's accessible name and the surrounding chart
header, so adding a panel does not collide with cockpit tests that match a chart
title by substring.

## 6. Accessibility behavior

- The chart-details affordance is a native `<details>`/`<summary>` — keyboard
  reachable and toggled by **Enter/Space**, no custom handler, no `<button>`.
- The `<summary>` has an `aria-label` of "View chart details: <chart name>".
- The revealed content is a `role="region"` labelled by the panel heading; the
  panel renders a real `<h3>` heading and can be collapsed again.
- Existing chart SVG/aria summaries are unchanged; the disclosure is additive.

## 7. Permission / auth posture

- No new route, no route bypassing WorkspaceGate / auth / entitlement rules, and
  nothing newly mounted.
- No permission, role, or scope widening. The opt-in prop is back-compatible:
  charts without `drillThroughSurface` render exactly as before.

## 8. No-fake-data posture

- Builders are pure functions of the chart's already-derived data; they embed no
  sample/mock/fake data.
- An all-zero / empty chart yields an honest, generic unavailable reason — never a
  fabricated segment row. Profitability / ROE remain availability-only (Phase
  142S); no profit / ROE / yield / margin figures are invented.

## 9. Deferred visualizations (with reasons)

- **Per-SVG-element click** (clicking an individual bar/slice) — deferred to avoid
  brittle layout/coordinate assumptions in tests; the chart-level disclosure plus
  the per-segment detail rows already expose the same underlying data.
- **Segment → contributing deal links** — the chart-level panel lists segment
  labels and counts; wiring each segment row to its contributing deal `<Link>`s
  requires per-segment source rows the current chart adapters do not thread, and
  is a focused follow-up (`buildChartSegmentDrillThrough` is ready for it).
- **Bespoke executive Stat tiles** (non-chart) — already covered by the Phase 144B
  KPI retrofit or rendered as plain read-only stats.

## 10. Future rule

Every new chart must either pass `drillThroughSurface` (so it exposes a read-only
chart-level breakdown) or, when no breakdown is meaningful, surface an honest
unavailable reason through the same disclosure. No chart may ship as a dead,
unexplorable visualization.

## 11. Acceptance commands

```
npm test -- chart charts drillThrough DrillThrough chartSegment manager portfolio team executive governance releaseCandidateSnapshot
npm run build
npm test
```
