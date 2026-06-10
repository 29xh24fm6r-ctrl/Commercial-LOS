# Phase 144B — Legacy Cockpit Drill-Through Retrofit

> **Read-only retrofit.** Brings the older Manager, Portfolio, Team, Banker/Deal,
> and Executive cockpit cards under the Phase 144A drill-through contract. Every
> KPI tile retrofitted in this phase now opens a read-only drill-through panel
> explaining its contributing data, with no new writes, routes, permissions, or
> approval/voting/sync affordances.

## 1. What was retrofitted

Each cockpit's **KPI ribbon tiles** — previously dead summary `<div>`s — are now
wrapped in the shared `DrillThroughCard` (a native `<details>`/`<summary>`
disclosure) and open a read-only `DrillThroughPanel` derived from the cockpit's
already-computed view model. The Deal cockpit's **metric-deck tiles** (Loan
amount, Missing fields, Blockers, Tasks open, Documents, Target close) are
retrofitted the same way.

Per-cockpit drill-through adapters (pure, fully unit-tested) map existing data
into read-only targets:

| Workspace | Cockpit file | Adapter |
|---|---|---|
| Manager | [ManagerBloombergControlPanel.tsx](../src/manager/ManagerBloombergControlPanel.tsx) | [managerDrillThrough.ts](../src/manager/managerDrillThrough.ts) |
| Portfolio | [PortfolioCommandCenter.tsx](../src/portfolio/PortfolioCommandCenter.tsx) | [portfolioDrillThrough.ts](../src/portfolio/portfolioDrillThrough.ts) |
| Team | [TeamOpsQueue.tsx](../src/team/TeamOpsQueue.tsx) | [teamOpsQueueDrillThrough.ts](../src/team/teamOpsQueueDrillThrough.ts) |
| Banker/Deal | [DealMetricDeck.tsx](../src/deals/DealMetricDeck.tsx) | [dealCockpitDrillThrough.ts](../src/deals/dealCockpitDrillThrough.ts) |
| Executive | [ExecutiveCommandCenter.tsx](../src/executive/ExecutiveCommandCenter.tsx) | [executiveDrillThrough.ts](../src/executive/executiveDrillThrough.ts) |

## 2. Which workspaces now support drill-through

- **Manager** — all 12 KPI ribbon tiles (active deals, pipeline amount, closing,
  blocked, at-risk, missing data, stale, docs, open/overdue tasks, avg days).
- **Portfolio** — all 11 KPI ribbon tiles; blocked / at-risk tiles list their
  contributing exception deals. A chart-segment adapter
  (`portfolioChartTarget`) is provided for the analytics grid.
- **Team Ops** — all 10 KPI ribbon tiles.
- **Banker/Deal** — all 6 metric-deck tiles, including a populated-vs-missing
  field breakdown and overdue-task / outstanding-document contributors.
- **Executive** — all 10 KPI ribbon tiles.

## 3. How cards choose panel vs route vs unavailable reason

Each adapter builds a `DrillThroughTarget` via `buildDrillThroughTarget(...)`, and
`resolveDrillThroughAction` decides behaviour:

- **Panel** — when the tile has contributing source counts / fields / detail rows
  (the common case for KPI tiles).
- **Route** — reserved for tiles that map to an existing authorized deal route;
  the cockpits' top-deal / exposure / exception **rows already navigate** via the
  existing safe `<Link to="/deals/:id">`, so those were already compliant.
- **Unavailable** — honest reasons for genuinely-absent data, e.g. average
  days-in-stage with no stage-entry dates, an unset loan amount, or an empty
  chart segment set. No fabricated rows are ever shown.

## 4. Accessibility behavior

- Tiles are keyboard reachable and toggled by **Enter/Space** via the native
  `<summary>` (no `div`-only click target, no custom handler).
- The disclosure `<summary>` has an `aria-label` ("View details: …") and the
  revealed content is a `role="region"` labelled by the panel heading.
- The panel renders a real `<h3>` heading and can be collapsed again. The
  original tile `aria-label` and `data-*` attributes are preserved inside the
  disclosure face.

## 5. Permission / auth posture

- No new route, no route that bypasses WorkspaceGate / auth / entitlement rules,
  and nothing newly mounted. Route links reuse existing authorized deal routes.
- No permission, role, or scope widening. Adapters read only data the cockpit
  already received through current props/context.

## 6. No-fake-data posture

- Adapters are pure functions of the already-derived ribbons / snapshots /
  metrics. They embed no sample/mock/fake data.
- Absent data yields an honest `unavailableReason`; empty sections are omitted
  rather than padded with placeholder rows.

## 7. Deferred surfaces (with reasons)

- **Analytics chart cards (in-place wrapping)** — the Portfolio/Manager analytics
  grids already render their full segment data visually, and their tests match
  chart titles by substring; wrapping each chart in a disclosure whose heading
  repeats the title would create ambiguous matches and risk layout regressions.
  A chart-segment adapter (`portfolioChartTarget` / `portfolioSegmentChartTarget`)
  is shipped and governed so the wrapping can follow in a focused phase.
- **Exception / top-deal / workload rows** — already navigate to the existing
  authorized `/deals/:id` route via safe `<Link>`s, which already satisfies the
  contract; no retrofit was required.
- **Banker workload tables, exception tape sub-cards** — deferred to keep this
  pass focused on the dead KPI summary cards; their row links are already safe.

## 8. Future card compliance rule

A new or retrofitted cockpit summary card is compliant when it:

1. Builds a read-only `DrillThroughTarget` from its already-derived view model via
   a per-cockpit adapter (or `buildDrillThroughTarget`).
2. Renders the tile face inside `DrillThroughCard` (`unstyled` to keep the tile's
   own styling) so it is keyboard-activatable and accessibly named.
3. Resolves to panel content, a safe existing `routeHref`, or an honest
   `unavailableReason` — never a dead, clickable-looking, or blank card.
4. Adds no write, no live call, no new route, no permission widening, and no
   approve/deny/vote/sync-now/push-now/apply-now control.

## 9. Acceptance commands

```
npm test -- drillThrough DrillThrough legacyCockpit manager portfolio team banker deal executive governance releaseCandidateSnapshot
npm run build
npm test
```
