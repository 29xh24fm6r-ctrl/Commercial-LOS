# Phase 127A — Team Ops Queue dense execution screen

## 1. Goal

Build the day-to-day team execution surface — a dense Team Ops
Queue that lets the team see what must be worked TODAY: overdue
tasks, due-soon tasks, outstanding documents, pending-review docs,
missing data, stale deals, blocked / at-risk deals, and closing-soon
items. Mirrors the Manager Bloomberg Command Center's visual
vocabulary but projects the team-scoped pipeline into an execution
lens instead of a leadership lens.

## 2. What ships

### 2.1 Shared command-cockpit chart primitives

The chart primitives that landed in `src/manager/ManagerChartPrimitives.tsx`
(Phase 124E / 125A) are relocated to
[src/shared/CommandChartPrimitives.tsx](../src/shared/CommandChartPrimitives.tsx)
so the Team Ops Queue and the Portfolio cockpit can reuse them.
The Phase 48 isolation rule prevents `src/team/` from importing
`src/manager/`; moving the primitives to `src/shared/` is the
lowest-churn fix.

`src/manager/ManagerChartPrimitives.tsx` is now a re-export shim:

```ts
export {
  VerticalBarChart,
  HorizontalBarChart,
  Histogram,
  DonutChart,
  ForecastSparkline,
} from '../shared/CommandChartPrimitives';
```

Every existing manager + portfolio import path continues to work
unchanged. All 64 manager + portfolio + chart-primitive tests stay
green.

### 2.2 `src/team/teamOpsQueueSnapshot.ts` — pure deriver

`deriveTeamOpsQueueSnapshot({ deals, tasks, documents, now? })`
projects the already-authorized team-scoped data into the dense
execution-queue shape the cockpit renders:

- **commandRibbon** — 10 KPIs:
  active deals, open tasks, overdue tasks, due-soon tasks (≤ 7
  days), outstanding documents, pending-review documents,
  blocked deals, at-risk deals, stale deals (no modify ≥ 14 days),
  closing next 30 days
- **lanes** — 8 work-queue lanes, each sorted by urgency:
  - `overdueTasks` (severity at-risk; most overdue first)
  - `dueSoonTasks` (severity info; soonest first)
  - `outstandingDocuments` (at-risk)
  - `pendingReviewDocs` (info)
  - `missingData` (at-risk — based on the team's 6-field manager-
    style catalog: Client / Loan amount / Target close / Stage /
    Status / Banker)
  - `staleDeals` (at-risk; most stale first)
  - `blockedAtRisk` (blocked first then at-risk, sorted by deal
    name)
  - `closingSoon` (info; soonest first)
- **bankerWorkload** — per-banker aggregation: active deals,
  open tasks, overdue tasks, outstanding docs, blocker/at-risk,
  closing 30. Sorted by overdue desc, then by blocker/at-risk
  desc, then by name. Unassigned bucket synthesized.
- **executionBoard** — every work item flattened and sorted by
  severity (blocked > atRisk > info > clear) then urgency. The
  cockpit caps the rendered list at 20 with an honest "+N more
  in the queue" footer.
- **vmRows** — exposed for chart helpers.
- **isEmpty** — true when zero deals are authorized.

Per-deal classification reuses the shared Phase-123A
`deriveDealIntelligenceViewModel` (single source of truth across
banker / manager / portfolio / team cockpits). Two loader-gap
filters are applied (same pattern Phase 124A uses on the manager
side):

- `filterOutLoaderGapSignals(blockers)` strips the
  `missing-required` signal so the loader's lack of `productType`
  doesn't pollute the queue. The team's own honest missing-fields
  catalog covers that concept.
- `muteLoaderGapNextBestAction(vm)` nulls the
  `populate-missing-fields` next-best-action for the same reason.

### 2.3 `src/team/teamOpsQueueDashboardCharts.ts` — chart adapters

Pure derivers producing chart-primitive datum shapes:

- `deriveWorkItemTypeCounts(lanes)` — 9 vertical bars: Blocked /
  At risk / Overdue tasks / Outstanding docs / Missing data /
  Stale / Pending review / Due soon / Closing soon
- `deriveOverdueByBanker(workload)` — horizontal bars for bankers
  with overdue tasks > 0
- `deriveOutstandingDocsByBanker(workload)` — horizontal bars
- `deriveRiskDistributionForTeam(vmRows)` — { blocked, atRisk,
  clear, unknown } (local copy of the manager-side logic — Phase
  48 isolation)
- `deriveClosingForecastForTeam(vmRows, now?, monthHorizon=6)` —
  6 monthly buckets, past dates excluded, UTC month arithmetic

### 2.4 `src/team/TeamOpsQueue.tsx` — dense cockpit

Five sections:

1. Header — title, subtitle, read-only chip
2. KPI ribbon (10 tiles)
3. Lanes grid (8 lanes, each capped at 6 rows with "+N more" footer)
4. Banker workload matrix
5. Execution board (top 20)
6. Analytics row — 5 chart cards (work-items-by-type, overdue-by-
   banker, outstanding-docs-by-banker, risk-distribution donut,
   closings forecast)

Every drill-down rendering is a `<Link to="/deals/<id>">`. The
cockpit ships with zero `<button>` / `<form>` / `onClick` /
`onSubmit` (pinned by static-source tests). Fail-closed on any
failed slot. Honest empty state for zero-deal teams.

### 2.5 Mount in `TeamWorkspace`

[TeamWorkspace.tsx](../src/workspaces/TeamWorkspace.tsx) gains one
import + one mount line:

```tsx
import { TeamOpsQueue } from '../team/TeamOpsQueue';
…
<main style={styles.main}>
  <TeamOpsQueue />   {/* Phase 127A — first cockpit at the top */}
  <SharedWorkQueue />
  …existing 9 team cards unchanged…
</main>
```

Existing cards continue to render below the queue. No banker /
manager / portfolio regressions; their suites are untouched.

## 3. What does NOT change

- No Dataverse schema change.
- No new loader. `TeamDataProvider` is unchanged.
- No data-scope widening. Team queries scope by
  `_cr664_team_value` exactly as before.
- No banker / manager / portfolio cockpit change. All 64 manager
  + portfolio + chart-primitive tests still pass.
- No write affordance. Strictly read-only (no `<button>`,
  `<form>`, `onClick`, `onSubmit` — pinned).
- No fake fallback values. `'Unassigned'` / `'Not set'` /
  `'No amount'` / `'No date'` surface only when source is truly
  absent.
- No predictive language. Weighted exposure / win rate / approval
  odds explicitly forbidden by static-source pins.
- The Phase 48 isolation rule is preserved — the team module
  imports only from `src/shared/`, `src/deals/`, and itself.
- TeamWorkspace's custom shell is preserved (no LendingOSLayout
  wire in this phase). Shell restoration for team is documented
  as a Phase 127B follow-up so a banker / manager-entitled team
  user gets the workspace switcher visibility.

## 4. Tests landed (45 new)

| File | Tests | Pins |
|---|---|---|
| [src/team/teamOpsQueueSnapshot.test.ts](../src/team/teamOpsQueueSnapshot.test.ts) | 21 | Empty state; ribbon counts (open/overdue/due-soon/outstanding/pending-review/blocked/at-risk/stale/closing-30); lanes sort (overdue ascending, due-soon ascending, blocked-first, stale descending); banker workload aggregation + unassigned bucket + sort priority; execution board severity + urgency sort; honest "queue clear"; static-source (shared VM import, no manager import, no banker write surface, no fake fallbacks, no predictive vocabulary) |
| [src/team/teamOpsQueueDashboardCharts.test.ts](../src/team/teamOpsQueueDashboardCharts.test.ts) | 8 | Work-item-type buckets (9 in catalog order; blocked/at-risk split from lane); banker overdue / outstanding-docs filter zero-count rows; risk distribution honest unknown bucket; closing forecast 6 monthly buckets; year-rollover |
| [src/team/TeamOpsQueue.test.tsx](../src/team/TeamOpsQueue.test.tsx) | 16 | Cockpit shell + read-only chip; waits for 3 slots; fails closed; honest empty; KPI ribbon labels; lane drill-down `<Link>` to `/deals/<id>`; execution board severity sort; "queue clear" copy; banker workload renders per banker; 5-chart analytics row; static-source — shared CommandChartPrimitives import (not manager), no banker write surface, no `<button>/<form>/onClick/onSubmit`, no predictive vocabulary |

Existing tests still green:
- Phase 124C workspace switcher / entitlement / layout
- Phase 124E + 125A + 125B manager cockpit (35 tests; chart-primitive re-export verified)
- Phase 126A + 126B + 126C portfolio cockpit + routing (21 + 19 + 23)
- Phase 84 / 88 team rollup + activity breakdown + shared work-queue rules

## 5. Walkthrough

1. Team member navigates to `/workspaces/team`. `WorkspaceGate`
   admits (bootstrap-primary route).
2. `<TeamWorkspace>` mounts. `TeamProvider` + `TeamDataProvider`
   resolve identity + fire six parallel queries.
3. `<TeamOpsQueue>` is the first cockpit rendered. Reads
   `useTeamData()`, fails closed if any of the three core slots
   (deals / tasks / documents) failed.
4. **KPI ribbon** shows the 10 execution metrics. Anything
   non-zero is tinted (overdue tasks atRisk, blocked blocked,
   etc.).
5. **Lanes grid** shows 8 lanes side-by-side; each lane caps at
   6 rows with "+N more on the execution board." footers for
   queue depth. Drill-down link per row.
6. **Banker workload matrix** lists every banker on the team
   with their queue load — sorted by overdue desc.
7. **Execution board** is the flat, urgency-ordered, all-severity
   queue. Top 20 rendered with severity chips and reason copy.
8. **Analytics row** reuses the shared CommandChartPrimitives to
   surface trends: work-items-by-type, overdue-by-banker,
   outstanding-docs-by-banker, risk distribution, closing
   forecast.
9. Existing team cards (SharedWorkQueue, TeamAutopilotRollup,
   TeamPipelineSummary, BottlenecksAgingByStage, etc.) continue
   to render below.

## 6. Phase 127B preview

Two follow-up items the user may want next:
- **Team workspace shell restoration.** Wrap `TeamWorkspaceContent`
  in `<LendingOSLayout>` (parity with Phase 124E manager shell
  restoration) so the dark sidebar + workspace switcher render
  consistently across team / manager / banker / portfolio
  surfaces. Workspace-entitled users could then switch into the
  team surface via the existing Phase 124C entitlement chain.
- **Per-banker filter integration.** The team-scoped data is
  already team-wide; adding a banker filter would let the queue
  narrow to one banker's load. Today the workload matrix is the
  per-banker view; a filter would let the user pick a banker and
  watch the entire ribbon / lanes / execution board narrow.

## 7. Acceptance

- [x] Dense Team Ops Queue mounts inside the existing
      `TeamWorkspace`
- [x] 10-tile command ribbon
- [x] 8 work-queue lanes with severity + drill-down `<Link>`s
- [x] Banker workload matrix
- [x] Execution board with severity + urgency sort
- [x] 5-chart analytics row reusing the shared chart primitives
- [x] Honest absence everywhere; no fake fallbacks
- [x] Fail-closed on any failed slot
- [x] No write affordance, no banker write-surface imports
- [x] No Dataverse schema, no new loader, no data-scope widening
- [x] No banker / manager / portfolio regression
- [x] Phase 48 isolation preserved (chart primitives migrated to
      `src/shared/`)
- [x] 45 new tests pass
- [x] `npm run build` clean
