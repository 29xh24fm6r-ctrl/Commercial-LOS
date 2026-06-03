# Phase 126A — Portfolio Command Center (foundation)

## 1. Goal

Stand up a Portfolio Command Center for the Commercial Lending LOS
using the same dense visual system that ships on the Manager
Bloomberg Command Center (Phase 124E / 125A / 125B). The cockpit
projects the same already-authorized records through an exposure /
concentration / risk lens, so a portfolio role can monitor the
team's deployed capital, the mix across product / loan structure /
pricing, and the concentration by banker — without any new
Dataverse schema or loader.

## 2. Why this lives in `src/portfolio/`

Phase 116 explicitly aliases the live env's `'Portfolio Management'`
Platform Workspace to the manager route (`WORKSPACE_ROUTES.manager`).
The Banker model's `cr664_roletype: PortfolioManager` enum value
(788190002) confirms portfolio managers participate in manager-style
workflows; their authorized data scope IS the team scope.

Phase 126A therefore:

- Adds `src/portfolio/` as the canonical home for the portfolio
  cockpit + derivers + tests.
- Reuses the manager `ManagerProvider` / `ManagerDataProvider`
  chain (the cockpit reads `useManagerData()` directly — no new
  context).
- Reuses the Phase 124A `deriveManagerPipelineSnapshot` projection
  to get per-deal VM rows, so the Portfolio + Manager surfaces stay
  on one source of truth.
- Does NOT add a new route, does NOT touch `App.tsx`, does NOT
  modify the Phase 116 alias. Route wiring is deferred to Phase 126B
  (where the option is a new `/workspaces/portfolio` route with its
  own gate widening, OR a manager-route variant detection — both
  are larger changes than this foundation phase).

## 3. What ships in Phase 126A

### 3.1 `src/portfolio/portfolioCommandSnapshot.ts` — pure deriver

`derivePortfolioCommandSnapshot({ teamPipeline, teamBankers, teamTasks, teamDocuments, now?, topN? })`:

- Internally calls `deriveManagerPipelineSnapshot` so per-deal
  classification (Phase 124A VM projection + Phase 122C
  formatted-value hydration + Phase 124E loader-gap mute) reuses the
  exact same logic the manager cockpit consumes.
- Re-projects the manager snapshot into a portfolio lens:
  - `commandRibbon` — 11 portfolio-scoped KPIs (active /
    exposure / closing-30 count + $ / blocked / at-risk / missing /
    docs / tasks / stale / avg days in stage)
  - `topExposures` — top N (default 8) deals by amount with
    `sharePct` (rounded share of total portfolio exposure)
  - `byProductType` / `byLoanStructure` / `byPricingType` /
    `byBanker` / `byStage` — concentration rows (count + exposure
    + share %) sorted by exposure desc; Unknown buckets sink to
    the bottom
  - `exceptions` — blocked + at-risk consolidated, sorted blocked
    first then by exposure desc; reason copy from the underlying
    blocker signal
  - `vmRows` — exposed for chart helpers
  - `isEmpty` — true when no authorized deals

### 3.2 `src/portfolio/portfolioDashboardCharts.ts` — chart adapters + one portfolio-specific deriver

- `concentrationToHorizontalBars(rows)` — exposure $ on the bar +
  count and share % on the secondary label; `Unknown` rows surface
  in `neutral` tone.
- `concentrationToVerticalBars(rows)` — deal count as the bar height;
  Unknown rows in `neutral` tone.
- `derivePortfolioExposureBands(rows)` — bucketize deals by amount
  into 4 fixed bands (`<$500K`, `$500K–$2M`, `$2M–$10M`, `$10M+`).
  Deals with undefined / NaN / negative amounts are excluded
  honestly. No portfolio-cockpit-counterpart on the manager side;
  this is the new portfolio-specific view.
- `exposureBandsToVerticalBars(bands)` — adapter into the
  `VerticalBarChart` datum shape.

The portfolio cockpit reuses the manager dashboard derivers (risk
distribution, aging histogram, closings forecast, missing fields,
data quality) directly — they all operate over the same
`ManagerVMRow[]` shape the portfolio snapshot exposes.

### 3.3 `src/portfolio/PortfolioCommandCenter.tsx` — cockpit component

Dense Bloomberg-style cockpit:

| # | Section | Surface |
|---|---|---|
| 1 | Header | "Portfolio Command Center" + "Live authorized portfolio exposure" + optional filter chip + read-only chip |
| 2 | KPI ribbon | 11 portfolio-scoped tiles |
| 3 | Analytics grid | 11 chart cards (Pipeline by stage, Exposure by product type, Loan structure mix, Pricing type mix, Exposure by banker, Deal size mix, Aging, Risk distribution, Closings forecast, Missing field concentration, Data quality) |
| 4 | Top exposures | Top N by amount with share % + product/loan/pricing meta + drill-down link |
| 5 | Exceptions | Blocked + at-risk consolidated; sorted blocked first then by exposure; reason copy from blocker signal |

The cockpit:

- Reuses `ManagerChartPrimitives` directly (no duplicate chart
  library).
- Inherits Phase 124B banker-filter integration via
  `useOptionalManagerBankerFilter()`; the entire portfolio view
  narrows consistently when a banker is selected.
- Top-exposure / exception rows are `<Link>`s to `/deals/<dealId>`
  (same drill-down path the manager cockpit uses).
- Conditionally renders Product / Loan structure / Pricing meta
  cells only when the loader returned a value — same honest-absence
  discipline as Phase 125B's manager top-deal row.
- Fails closed on any failed slot (no partial KPIs).
- Honest "Not yet wired" copy for Avg days in stage when no deal
  has a `stageEntryDate`.

## 4. Honest non-derivations

The brief lists multiple portfolio metrics. Two are **omitted
rather than faked** because the schema does not carry the inputs
honestly:

- **Weighted exposure** — would require a probability-by-stage
  table. The Dataverse schema does not carry one; inventing weights
  would be the most consequential fabricated number on the cockpit.
- **Win rate / pull-through** — the team-pipeline query excludes
  terminal deals (`statecode=0` + `cr664_isterminalstatus eq false
  or null`); no closed-won/closed-lost cohort is available
  client-side.

Both are explicitly forbidden by static-source contract tests.

## 5. What does NOT change in Phase 126A

- No Dataverse schema change.
- No new loader. `ManagerDataProvider` is unchanged.
- No new route. `App.tsx` is unchanged. `WorkspaceGate` is
  unchanged. Phase 116 alias is unchanged.
- No banker cockpit change.
- No Manager Bloomberg Control Panel change. All 311 manager-side
  tests still pass unchanged.
- No write affordance. Cockpit remains strictly read-only (no
  `<button>`, `<form>`, `onClick`, `onSubmit` — pinned by
  static-source tests).
- No fake fallback values. Honest empty / `Unknown` /
  `Unassigned` / `Unset stage` buckets only when source absent.

## 6. Tests landed

| File | Tests | Coverage |
|---|---|---|
| [src/portfolio/portfolioCommandSnapshot.test.ts](../src/portfolio/portfolioCommandSnapshot.test.ts) | 21 | empty state; command-ribbon counts (exposure / blocked / at-risk / stale / closing); avg days in stage honest absence; top exposures sort + share %; concentration derivers — product/loan/pricing/banker/stage all sum + sort; Unknown buckets sink to bottom; exceptions list blocked-first sort + reason copy; static-source pins (manager VM import, no banker write surface, no weighted/win-rate vocabulary) |
| [src/portfolio/portfolioDashboardCharts.test.ts](../src/portfolio/portfolioDashboardCharts.test.ts) | 10 | adapter helpers (horizontal + vertical bar mapping; Unknown → neutral tone; 1-deal vs N-deals copy); `derivePortfolioExposureBands` (4 fixed bands; deals with undefined / NaN / negative amounts excluded; exposure sum within band); exposure bands → vertical bars |
| [src/portfolio/PortfolioCommandCenter.test.tsx](../src/portfolio/PortfolioCommandCenter.test.tsx) | 21 | shell + title + read-only chip; waits for all 4 data slots; fails closed copy; honest empty (zero vs filtered-zero); KPI ribbon labels; analytics grid has 10+ chart regions; top-exposure name is `<Link>` to `/deals/<id>`; share % rendered; product/loan/pricing meta cells omitted when undefined; exceptions list with blocked-first sort + reason from signal; honest "Portfolio clear" copy; banker filter narrows view; static-source: imports manager VM projection + ManagerChartPrimitives; no banker write surface; no `<button>`/`<form>`/`onClick`/`onSubmit`; no predictive vocabulary |

Total new tests: **52**.

Existing tests still green:

- Phase 123A / B / C (shared VM)
- Phase 124A / B / C / D / E (manager cockpit + entitlement)
- Phase 125A / B (dense dashboard + hydration)

## 7. Phase 126B preview (route wiring)

When ready to wire the cockpit as a workspace route:

1. **Decide on the routing model.** Two clean options:
   - Add `WORKSPACE_ROUTES.portfolio = '/workspaces/portfolio'` +
     widen `useEntitledRoutes()` to include it for users whose
     `cr664_roletype === PortfolioManager` (788190002). Phase 116
     alias kept as a sensible default so Portfolio Management users
     still LAND on manager; the switcher lets them switch to
     portfolio.
   - Detect the bootstrap workspace name inside `ManagerWorkspace`
     and conditionally render `<PortfolioCommandCenter>` instead of
     `<ManagerBloombergControlPanel>`. Reuses every existing route
     and provider; minimum new surface. Risk: the role-vs-view
     coupling is implicit.
2. **Update `workspaceScreens.ts`** to reflect the new route key
   if option 1 is chosen.
3. **Add `<PortfolioWorkspace>`** mirroring `<ManagerWorkspace>`'s
   shell wrap if option 1 is chosen.
4. **No new derivers / no new tests for the cockpit itself** — the
   foundation is already complete.

## 8. Acceptance

- [x] `derivePortfolioCommandSnapshot` reuses the manager snapshot
      (single source of truth)
- [x] Concentration derivers for product / loan / pricing / banker
      / stage
- [x] `derivePortfolioExposureBands` — portfolio-specific deal-size
      mix
- [x] 11-tile KPI ribbon
- [x] 11-chart analytics grid (reuses manager chart primitives)
- [x] Top exposures with share %
- [x] Exceptions consolidated
- [x] Drill-down `<Link>` to `/deals/<id>`
- [x] Banker filter integration
- [x] Fails closed on any failed slot
- [x] Honest empty / Unknown / Unset buckets
- [x] No write affordance; no banker write surface imports
- [x] Weighted exposure / win rate explicitly omitted (no schema
      to honestly derive them)
- [x] 52 new portfolio tests pass; all existing manager + banker
      suites still green
- [x] `npm run build` clean
- [x] No Dataverse schema / loader / route change
