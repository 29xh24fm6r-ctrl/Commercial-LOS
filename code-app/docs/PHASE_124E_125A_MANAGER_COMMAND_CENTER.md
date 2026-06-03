# Phase 124E + 125A — Manager shell restoration + dense command center

## 1. Problems solved

**Phase 124E** — the manager workspace rendered with no left toolbar
because `ManagerWorkspace` had its own custom header instead of
mounting the same `LendingOSLayout` shell the banker workspace uses.
The page felt like a detached HTML document, not a first-class
workspace inside the Lending OS.

**Phase 125A** — the manager surface, even after Phase 124A/B/C/D,
showed only ~4 sections (command strip, exception tape, banker
workload, top deals). Operationally it was thin: a real loan-team
manager needs many simultaneous signals (stage distribution, banker
load, aging, risk mix, closings forecast, data quality, missing
fields, overdue tasks per banker, outstanding docs per banker) in
one screen.

## 2. What ships

### 2.1 Shell restoration (124E)

[ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx) now
wraps its content in `<LendingOSLayout>` — the same dark navy sidebar
+ branded chrome the banker workspace uses. Both the dark-tone
sidebar workspace switcher (Phase 124C) AND the inline light-tone
switcher in the manager identity block render so the cross-workspace
navigation is visible from any viewport. `onNavSelect` is intentionally
undefined — the Lending OS sidebar nav items (Dashboard, Active
Deals, etc.) are banker-coded and stay non-interactive on the
manager surface for now.

### 2.2 Dense Bloomberg control panel (125A)

The [ManagerBloombergControlPanel](../src/manager/ManagerBloombergControlPanel.tsx)
now renders five vertically-stacked sections inside one cockpit:

| # | Section | Surface |
|---|---|---|
| 1 | KPI ribbon (11 tiles) | Active deals · Pipeline $ · Closing 30d · Closing 30d $ · Blocked · At risk · Missing data · Stale · Outstanding docs · Open tasks · Overdue tasks · Avg days in stage |
| 2 | **Analytics grid** | 9 chart cards in an auto-fit grid |
| 3 | Exception tape | Blocked / At risk / Missing fields / Stale buckets (Phase 124A) |
| 4 | Banker workload table | Per banker (Phase 124A) |
| 5 | Top deals by amount | VM-sourced next-best-action (Phase 124A/B) |

### 2.3 Honest non-derivations

The brief listed "Weighted pipeline $" and "Win rate / pull-through"
as desired KPIs. Both are **omitted** rather than faked:

- **Weighted pipeline $** — would require a probability-by-stage
  table; the Dataverse schema doesn't carry one. Adding it would
  invent the most consequential number on the cockpit.
- **Win rate / pull-through** — would require closed-won and
  closed-lost history. The Phase 14 `loadTeamPipeline` filter
  excludes terminal deals (`statecode=0` and
  `cr664_isterminalstatus eq false or null`). No closed-deal cohort
  is loaded client-side.

`Avg days in stage` is shown as **"Not yet wired"** for teams whose
deals all have an undefined `stageEntryDate`, rather than `0` —
zero would imply "every deal just entered its stage", which is
false.

### 2.4 Analytics grid — 9 chart cards

[managerDashboardCharts.ts](../src/manager/managerDashboardCharts.ts)
provides 7 pure derivers:

- `deriveStageDistribution(rows)` — count + total amount per stage,
  sorted by amount desc; unset stages bucket to `'Unset'` honestly
- `deriveBankerAmountDistribution(rows, now)` — per-banker count,
  amount, at-risk, open tasks, overdue tasks, outstanding docs,
  stale, readiness %; unassigned deals bucket to `Unassigned`
- `deriveAgingHistogram(rows, now)` — 6 fixed buckets (0–7, 8–14,
  15–30, 31–60, 61–90, 90+ days)
- `deriveRiskDistribution(rows)` — blocked / at-risk / clear / unknown
- `deriveClosingForecast(rows, now, monthHorizon=6)` — month-by-month
  count + amount (past dates excluded; they live on the exception
  tape)
- `deriveMissingFieldsDistribution(rows)` — count of each missing
  manager-catalog field across deals
- `deriveDataQualityDistribution(rows)` — Complete (100%) / Mostly
  populated / Partial / Sparse buckets

[ManagerChartPrimitives.tsx](../src/manager/ManagerChartPrimitives.tsx)
provides 5 inline-SVG primitives:

- `<VerticalBarChart>` — pipeline by stage
- `<HorizontalBarChart>` — banker / tasks / docs / missing / quality
- `<Histogram>` — aging buckets
- `<DonutChart>` — risk distribution
- `<ForecastSparkline>` — closings forecast

Every primitive carries:
- `aria-label` summary capturing all data points
- Honest "No data yet." empty-state copy when every value is zero
- `data-manager-chart-*` attributes per bar / segment / month for
  golden tests
- No external chart library; everything renders against the existing
  `severityPalette` tones (info / clear / atRisk / blocked / neutral)

### 2.5 Filter integration preserved

The Phase 124B banker filter still applies BEFORE the snapshot
deriver runs (`teamPipeline` / `teamTasks` / `teamDocuments` are all
narrowed when the selection is not `{ kind: 'all' }`). All 9 chart
cards re-derive from the filtered `vmRows`, so picking a single
banker narrows the entire dashboard consistently.

### 2.6 Visual density

- KPI ribbon: `repeat(auto-fit, minmax(140px, 1fr))` — tightens from
  Phase 124A's 160px so more tiles fit on one row
- Analytics grid: `repeat(auto-fit, minmax(280px, 1fr))` — 3 columns
  on a typical viewport, 2 on narrower, 1 on mobile
- Compact typography across charts (`xs` labels, `mono` value text)
- Aging buckets ≥ 31 days render in `atRisk` tone; missing-field
  bars render in `atRisk` tone; data-quality `Complete (100%)`
  renders in `clear`, `Sparse` in `blocked`

## 3. What does NOT change

- No new Dataverse schema, no new loader, no permission widening.
- No banker workspace change — Phase 125F banker shell + cockpit
  surfaces continue untouched. `BankerShell.test.tsx` still passes
  unchanged.
- No `ManagerProvider` / `ManagerDataProvider` change. Charts read
  the same `teamPipeline` / `teamBankers` / `teamTasks` /
  `teamDocuments` slots Phase 14 / 87 already exposes.
- No write affordance added. The cockpit remains strictly read-only
  (zero `<button>` / `<form>` / `onClick` / `onSubmit` — pinned by
  static-source tests).
- No fake fallback values. Missing categories surface as `Unset` /
  `Unassigned` / `Unknown` honestly; non-derivable KPIs are
  omitted or render `Not yet wired`.
- The nine existing manager cards
  (`TeamWorkQueue`, `TeamPipelineSummary`, `DealsByStage`,
  `ClosingForecast`, `AtRiskBlockedDeals`, `BankerWorkloadSummary`,
  `ActivitySummary`, `ManagerAutopilotRollup`,
  `ManagerMorningCatchUp`, `ManagerRelationshipMemory`) continue to
  render below the cockpit, unchanged. A future phase can retire
  the ones the cockpit has absorbed.

## 4. Tests landed

| File | Tests | Pins |
|---|---|---|
| [src/workspaces/ManagerWorkspace.test.tsx](../src/workspaces/ManagerWorkspace.test.tsx) | 8 | Lending OS sidebar mounts; both dark + light workspace switchers render; Command Center heading inside the shell; Bloomberg Control Panel first cockpit; identity block preserved; static-source LendingOSLayout import + props + no onNavSelect |
| [src/manager/managerPipelineSnapshot.test.ts](../src/manager/managerPipelineSnapshot.test.ts) | +7 (36 total) | Split blocked/at-risk counts; overdueTaskCount; staleDealCount ≥ 14d; closingNext30Day count + amount; avgDaysInStage undefined / rounded mean; snapshot exposes `vmRows` |
| [src/manager/managerDashboardCharts.test.ts](../src/manager/managerDashboardCharts.test.ts) | 20 | All 7 derivers — stable sort, honest "Unset"/"Unassigned" bucketing, injectable `now`, year-rollover, empty-input behavior, readinessPct undefined for empty bankers |
| [src/manager/ManagerChartPrimitives.test.tsx](../src/manager/ManagerChartPrimitives.test.tsx) | 7 | Each chart primitive: aria-label summary, empty-state "No data yet.", data-attribute IDs, donut center total, forecast sparkline em-dash for `$0` months |
| [src/manager/ManagerBloombergControlPanel.test.tsx](../src/manager/ManagerBloombergControlPanel.test.tsx) | +3 (33 total) | 11-tile KPI ribbon labels; "Not yet wired" for missing stageEntryDate; analytics grid renders 6 distinct chart regions; hides in empty / failed / loading states |

Total new + extended pins: 45 across 5 files.

Existing tests still green:

- Phase 123A / 123B / 123C
- Phase 124A / 124B / 124C / 124D
- Phase 125F banker shell (BankerShell.test.tsx, 15 tests)

## 5. Deploy / demo walkthrough

1. **Banker-only user** (no Phase 124D seed yet): navigates to
   `/workspaces/banker`. Sidebar shows the standard pill (single
   workspace). No manager link.
2. **Manager-entitled banker** (Phase 124D seed has been run):
   navigates to `/workspaces/banker`. Sidebar shows the workspace
   switcher with Banker (current) + Manager (link). Clicks Manager.
3. Lands on `/workspaces/manager`. **Same dark sidebar still
   renders.** Switcher now shows Banker (link) + Manager (current).
4. Below the breadcrumb / identity block, the **dense cockpit**
   renders:
   - 11-tile KPI ribbon across the top
   - 9 chart cards in the analytics grid (3 columns on wide
     viewports)
   - Exception tape with four buckets
   - Banker workload table (left) + top deals (right)
5. **Filter to a single banker** via the existing
   `<ManagerBankerFilterControl>` (mounted below the cockpit by
   Phase 124B). Every section narrows consistently.
6. **Click a deal name** anywhere on the cockpit → drill to
   `/deals/<dealId>` (Phase 124B).
7. **Resize narrower** — the analytics grid collapses to 2 columns
   then 1; the KPI ribbon wraps; no overflow or clipping.

## 6. Acceptance criteria

- [x] Manager Workspace renders inside the same Lending OS dark
      sidebar as Banker Workspace (Phase 124E)
- [x] Workspace switcher remains visible in both dark sidebar and
      inline light treatment
- [x] Multiple chart cards present (9 chart regions in the analytics
      grid)
- [x] KPI ribbon dense and operational (11 tiles)
- [x] Exception tape / banker workload / top deals preserved
- [x] Banker filter narrows the entire dashboard
- [x] Drill-down navigation preserved
- [x] Fail-closed behavior preserved (analytics grid hidden in
      loading / failed / empty states)
- [x] No fake fallback values; non-derivable KPIs omitted or marked
      "Not yet wired"
- [x] No banker workspace regression (Phase 125F + Phase 123B/C
      tests still green)
- [x] `npm run build` clean
- [x] No new schema / loader / write surface
