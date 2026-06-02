# Phase 123A — Multi-screen Team Deployment Shell (Foundation)

## 1. Goal

Stand up the **shared foundation** the project needs to deploy the LOS as a
five-screen, role-scoped team rollout, without refactoring any existing
React workspace component. Phase 123A is **foundation-only**: it lands one
shared deriver and one navigation registry, plus tests and this doc.
The downstream phase (123B) will incrementally wire surfaces to consume
the foundation.

The five deployable screens this phase enumerates:

| # | Screen | Role | Workspace key | Route |
|---|--------|------|---------------|-------|
| 1 | Banker Deal Command Center | banker | `banker` | `/workspaces/banker` |
| 2 | Manager "Bloomberg" Control Panel | manager | `manager` | `/workspaces/manager` |
| 3 | Portfolio Command Center | manager | `manager` | `/workspaces/manager` (Phase 116 alias) |
| 4 | Team Work Queue / Exceptions Center | team | `team` | `/workspaces/team` |
| 5 | Executive Pipeline Snapshot | executive | `executive` | `/workspaces/executive` |

All five surfaces already exist as React components with working routes
landed by Phases 4 / 32 / 116 / 117–120. Phase 123A does **not** create
new screens; it lifts shared derivation into one source of truth so the
five surfaces can converge on consistent display logic in Phase 123B
without each one rediscovering completeness / next-best-action / blocker
roll-up math.

## 2. What ships in Phase 123A

### 2.1 `src/shared/dealIntelligenceViewModel.ts`

A pure, IO-free deriver — `deriveDealIntelligenceViewModel(input)` — that
projects already-authorized inputs onto one shared view-model shape:

- **Inputs**
  - `DealDetail` from one of the existing role-scoped loaders
    (`loadDealForBanker` / `loadDealForManager` / `loadDealForTeam` /
    `loadDealForExecutive`). Authorization is the loader's job;
    the deriver assumes the caller is authorized.
  - `DealCockpitMetrics` from the existing
    `deriveDealCockpitMetrics(...)` pipeline. The view-model never
    recomputes completeness / counts / freshness; it consumes them
    so the banker cockpit and the leadership roll-up cannot drift.
  - Optional `BlockersResult` from the existing
    `deriveBlockers(...)` pipeline.

- **Outputs**
  - Identity (`dealId`, `dealName`)
  - Phase-122-hydrated display values (`clientName`, `bankerName`,
    `stageName`, `statusName`, `productTypeName`, `loanStructureName`,
    `pricingTypeName`)
  - Quantitative fields (`amount`, `targetCloseDate`, `daysToClose`,
    `daysInStage`, `collateralSummary`)
  - `completeness` — populated / total / pct / missing labels
  - `openTaskCount`, `overdueTaskCount`, `outstandingDocumentCount`
  - `blockerStatus`, `blockerSignals`
  - `lastActivity` — iso / daysSince / state (`unknown` / `none` /
    `has-events`)
  - `nextBestAction` — one mechanical signal, or `undefined`
  - `closure` — `open` / `closed`

- **Discipline**
  - Pure function. No fetching, no service calls, no IO.
  - Honest absence: every nullable input maps to `undefined`, never
    `"Not set"` / `"N/A"` / `"—"` / `"TBD"`. The Phase 122C loader
    fix is upstream; the deriver does not paper over an empty lookup.
  - No predictive language. `nextBestAction` is a mechanical
    classification over the same signals the banker cockpit's
    autopilot panel already uses — not a deal score, not approval
    odds, not ranking.

### 2.2 `nextBestAction` priority ladder

The deriver fires the first rule that matches. Closed deals never
produce an action.

1. **Hard blocker** — `blockers.status === 'blocked'` with at least one signal
2. **Overdue tasks** — `taskOverdueCount > 0`
3. **Outstanding documents** — `docOutstandingCount > 0`
4. **Stale activity** — `daysSinceLastTouched >= STALE_ACTIVITY_DAYS` (14)
5. **Stale credit memo** (`memoState === 'stale'`) then **draft memo** (`memoState === 'draft'`)
6. **Open (non-overdue) tasks** — `taskOpenCount > 0`
7. **Profile-completeness nudge** — `completenessPct < COMPLETENESS_NUDGE_PCT` (50) AND at least one missing label

Tests in `dealIntelligenceViewModel.test.ts` pin the order, the
thresholds, the singular/plural copy variants, and the closure
short-circuit.

### 2.3 `src/navigation/workspaceScreens.ts`

A metadata-only registry of the five screens. Each entry carries:

- `id` (stable kebab-case slug, used as a key for nav menus / docs / tests)
- `label` (human-readable; unique)
- `role` (`banker` / `manager` / `team` / `executive`)
- `workspaceKey` (drawn from `WORKSPACE_ROUTES`)
- `route` (always equal to `WORKSPACE_ROUTES[workspaceKey]` — pinned)
- `description` (no marketing language, no hardcoded sample data)
- `consumesPerDealViewModel` (`true` only for the banker cockpit)

The registry does **not** register React Router routes (those still live
in `src/App.tsx`) and does **not** dispatch to components. It is
metadata-only so future navigation primitives, doc generators, and
contract tests have one source of truth for "what are the five screens,
where do they live, and what role does each serve".

`getWorkspaceScreen(id)` and `getWorkspaceScreensForRole(role)` helpers
support the obvious lookups.

### 2.4 Phase 116 portfolio alias preserved

`Portfolio Command Center` deliberately points at the `manager`
workspaceKey (and therefore the `/workspaces/manager` route) per the
Phase 116 explicit-alias decision: the manager workspace's card stack
(team work queue, banker filter, pipeline summary, deals-by-stage,
closing forecast, at-risk / blocked deals, banker workload, manager
activity summary, autopilot rollup, morning catch-up) is the closest
functional fit for a portfolio-oversight role today. The banker model's
`cr664_roletype: PortfolioManager` enum value (788190002) confirms
portfolio managers participate in manager-style workflows. See
[PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](./PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md) §2.

The screen still has its own stable id (`portfolio-command-center`) so
leadership / nav primitives can refer to "Portfolio Command Center" by
name; under the hood it resolves to the same React shell as the Manager
Command Center.

## 3. What does NOT ship in Phase 123A

This phase intentionally **does not**:

- Refactor `BankerDealWorkspace`, `ManagerDealWorkspace`, `SharedWorkQueue`,
  `TeamDealWorkspace`, `ExecutiveWorkspace`, or any other existing
  surface to consume the shared view-model. Phase 123B will wire the
  banker cockpit as the pilot integration, then propagate.
- Change React Router route behavior. The metadata registry is
  read-only and additive; `src/App.tsx` is unchanged.
- Touch Phase 122 Dataverse field mapping — `mapDealDetail` in
  `dealQueries.ts` is unchanged.
- Add fake / sample data, mock fallbacks, fixture borrowers, or
  placeholder strings.
- Change Dataverse schema, the lookup-repair script, the seed modes,
  or any of the Phase 122 governance pins.
- Modify the cockpit metrics or blocker rules pipelines (the deriver
  consumes them as-is).

## 4. Why one shared deriver and not five one-off query stacks

Without a shared layer, every roll-up surface (Manager / Portfolio /
Team / Executive) would have to:

1. Re-implement profile-completeness arithmetic
2. Re-implement next-best-action classification
3. Re-implement task / document / memo / activity threshold copy
4. Risk drifting from the banker cockpit's own display

The deriver collapses all four risks. The banker cockpit and the
leadership roll-ups can compute identical values from identical inputs
because the projection is one function.

## 5. Permission-before-render is unchanged

The view-model is derived **after** the caller's loader has authorized
the deal. The deriver does not re-check authorization — by contract it
only receives `DealDetail` shapes the caller is allowed to display.
This preserves the existing per-role gating:

- Banker surfaces use `loadDealForBanker` (matches assigned banker)
- Manager surfaces use `loadDealForManager` (matches team)
- Team surfaces use `loadDealForTeam`
- Executive surfaces use `loadDealForExecutive`

Phase 123B's wiring step will continue to call these loaders first
and then hand the authorized `DealDetail` to the deriver.

## 6. Tests landed in Phase 123A

- `src/shared/dealIntelligenceViewModel.test.ts`
  - Identity + Phase-122 hydration pass-through
  - Honest absence (undefined survives, no fake strings injected)
  - Completeness + work-counts mirror cockpit metrics
  - Blocker pass-through (provided + omitted)
  - `lastActivity` classification (unknown / none / has-events)
  - Closure (open / closed)
  - `nextBestAction` priority ladder, including the closure
    short-circuit and threshold edge cases (14-day staleness boundary,
    50% completeness boundary)
  - Static-source discipline: no SDK / service / fetch imports, no
    fake-fallback strings, no hardcoded borrower names, thresholds
    pinned to source constants

- `src/navigation/workspaceScreens.test.ts`
  - Five canonical screens present and in order
  - Registry frozen, ids unique, labels unique
  - Every route equals `WORKSPACE_ROUTES[workspaceKey]`
  - Portfolio → Manager alias pin
  - Role and `consumesPerDealViewModel` assignments
  - Helper behavior (`getWorkspaceScreen`, `getWorkspaceScreensForRole`)
  - Static-source discipline: no SDK / service / fetch imports, no
    hardcoded route literals (sourced from `WORKSPACE_ROUTES`), no
    hardcoded borrower / sample-deal names, ids pinned in source

## 7. Migration path — Phase 123B preview

Phase 123B will be the **wiring** phase. Suggested order:

1. **Pilot: BankerDealWorkspace.** Compute the view-model once per
   loaded deal and pass it to the existing children that already
   consume `DealDetail` + `DealCockpitMetrics`. No new UI; verify
   identical render against the current snapshot.
2. **Manager + Portfolio.** `ManagerDealWorkspace` already consumes
   cockpit metrics for its per-deal cards; route them through the
   view-model so the per-deal display matches the banker cockpit.
3. **Team Work Queue.** The team queue renders multi-deal rows;
   compute view-models per row and use them for the right-rail
   counters and the "next best action" column.
4. **Executive Snapshot.** The lightest surface — read amount,
   targetCloseDate, blockerStatus, completeness from the view-model
   for top deals, no cockpit per se.

Each step is small, independently shippable, and protected by the
existing per-surface contract tests. Nothing in Phase 123A locks the
wiring order; the foundation is additive.

## 8. Acceptance criteria

- [x] `src/shared/dealIntelligenceViewModel.ts` lands as a pure deriver
- [x] `src/navigation/workspaceScreens.ts` lands as a metadata-only
      registry sourced from `WORKSPACE_ROUTES`
- [x] Portfolio Command Center resolves to the manager workspace
      per the Phase 116 alias
- [x] No existing surface component is refactored in this phase
- [x] Phase 122 field mapping (`mapDealDetail`) is untouched
- [x] No new Dataverse schema, no new seed mode, no script change
- [x] No fake / mock / sample data, no fabricated fallbacks
- [x] Full test suite + production build green (pre-existing
      DealAutopilotPanel date-dependent failures noted separately;
      not caused by this phase)
