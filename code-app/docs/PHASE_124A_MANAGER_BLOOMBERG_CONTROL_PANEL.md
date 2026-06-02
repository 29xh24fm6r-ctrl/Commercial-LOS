# Phase 124A — Manager Bloomberg Control Panel (foundation)

## 1. Goal

Begin the **Manager Bloomberg Control Panel** as the first
management-facing command surface for the Commercial Lending LOS,
projecting the existing team-scoped manager data through the **same
Phase 123A shared deal-intelligence view-model** the banker cockpit
consumes. Phase 124A lands a dense, deployable foundation — no
schema changes, no new loaders, no banker-cockpit refactor.

Existing manager cards (TeamWorkQueue, TeamPipelineSummary,
DealsByStage, ClosingForecast, AtRiskBlockedDeals,
BankerWorkloadSummary, ActivitySummary, ManagerAutopilotRollup,
ManagerMorningCatchUp, ManagerRelationshipMemory) are **unchanged**
and continue to render below the new cockpit; future phases can
reconcile or retire them once the Bloomberg Control Panel has
absorbed their concerns.

## 2. What ships in Phase 124A

### 2.1 `src/manager/managerPipelineSnapshot.ts` — pure deriver

A pure function that projects already-authorized manager data into
one shared `ManagerPipelineSnapshot` shape:

```
deriveManagerPipelineSnapshot({
  teamPipeline,        // TeamDeal[]
  teamBankers,         // TeamBanker[]
  teamTasks,           // TeamScopedTask[]
  teamDocuments,       // TeamScopedDocument[]
  now?,                // injectable for tests
  topN?,               // default 5
}) => {
  commandStrip:    { activeDealCount, totalPipelineAmount,
                     missingDataCount, blockerAtRiskCount,
                     outstandingDocumentCount, openTaskCount },
  exceptionTape:   { blocked, atRisk, missingFields, stale },
  bankerWorkload:  BankerWorkloadRow[],
  topDeals:        ManagerTopDealRow[],
  isEmpty,
}
```

Per-deal classification routes through the **shared Phase-123A
`deriveDealIntelligenceViewModel`** (calling `deriveDealCockpitMetrics`
+ `deriveBlockers` first), so the manager rollup converges with the
banker cockpit on what "blocked" / "at-risk" / next-best-action mean.

#### Loader-gap handling

The team-pipeline query (Phase 14) does **not** fetch the 13-field
profile-completeness catalog or `productType` (cost decision). Two
adjustments make the shared deriver honest on the manager surface:

1. `filterOutLoaderGapSignals(blockers)` strips the
   `missing-required` signal from `deriveBlockers`'s output (which
   would always fire because `productType` is undefined on every
   team-pipeline row) before passing the result to the VM. Manager
   blocker status reflects real operational signals: past-target-close,
   stale-stage, overdue-tasks, overdue-documents.
2. `muteLoaderGapNextBestAction(vm)` nulls the
   `populate-missing-fields` next-best-action so the cockpit's
   "Next" column only surfaces signals the manager loader has real
   visibility into (resolve-blocker / open-overdue-tasks /
   follow-up-documents).

The manager surface gets its own honest **`managerMissingFieldLabels`**
list derived from a **manager-scoped catalog** of fields the
team-pipeline loader actually returns:

```
MANAGER_REQUIRED_TEAM_FIELDS = [
  Client, Loan amount, Target close, Stage, Status, Banker
]
```

That list feeds the **command strip's** `missingDataCount` and the
**exception tape's** missing-fields bucket.

#### Priority ladder for the exception tape

A deal lands in the **first** matching bucket; buckets are mutually
exclusive:

1. **Blocked** — `vm.blockerStatus === 'blocked'`
2. **At risk** — `vm.blockerStatus === 'at-risk'`
3. **Missing fields** — `managerMissingFieldLabels.length > 0`
4. **Stale** — `modifiedOn` is `MANAGER_STALE_DEAL_DAYS` (14) or
   more days ago

`MANAGER_STALE_DEAL_DAYS = 14` matches the banker cockpit's
`STALE_ACTIVITY_DAYS` so manager + banker surfaces agree on what
"stale" means.

### 2.2 `src/manager/ManagerBloombergControlPanel.tsx` — cockpit component

Dense, read-only, institutional management cockpit. Four sections:

1. **Pipeline Command Strip** — six KPI tiles across the team:
   active deals, total pipeline $, missing data, blocked/at-risk,
   outstanding docs, open tasks. Tonal accent stripes follow the
   shared severity palette.
2. **Exception Tape** — four buckets (Blocked / At risk / Missing
   fields / Stale) with per-deal rows: name, amount, banker, reason
   string from the underlying blocker signal or missing-fields
   summary.
3. **Banker Workload** — per-banker table: active deals, pipeline
   $, open tasks, outstanding docs, blocked/at-risk count. Roster
   bankers are retained even at zero load; deals with no banker
   bucket into a synthetic "Unassigned" row.
4. **Top Deals** — top N (default 5) by amount with VM-projected
   `blockerStatus` chip + `nextBestAction` label. Honest empty
   copy ("Not set" / "Unassigned" / "No amount") for missing
   fields; "No mechanical signal" when the VM has no next-best-action.

The panel:
- Mounts inside `ManagerProvider` + `ManagerDataProvider`. Both
  already enforce team-scoped authorization.
- Waits for **all four** core slots (`teamPipeline`, `teamBankers`,
  `teamTasks`, `teamDocuments`) to be `ready` before rendering the
  aggregate. Partial loads render the loading strip; **any** slot
  reporting `failed` renders an alert and refuses to show a
  partial KPI strip (fail closed).
- Renders an **honest empty state** — "No authorized manager
  pipeline records found." — when the team has zero deals.
- Carries no write affordances. No buttons, no forms, no
  `onClick`/`onSubmit` handlers. The cockpit is observational only.

### 2.3 Wiring

[ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx) gains
two minimal modifications:

- New import for `ManagerBloombergControlPanel`.
- The new cockpit mounts as the **first** card in
  `ManagerWorkspaceContent` (above `TeamWorkQueue`). Every existing
  card below it is unchanged in this phase.

## 3. What does NOT change in Phase 124A

- No Dataverse schema change.
- No new loader. `ManagerDataProvider` is unchanged; the snapshot
  deriver reuses `teamPipeline` / `teamBankers` / `teamTasks` /
  `teamDocuments` exactly as ManagerDataProvider already exposes them.
- No banker cockpit change. DealHeader / DealMetricDeck /
  DealAutopilotPanel / DealBlockers / BankerDealWorkspace etc.
  are untouched.
- No Portfolio / Team / Executive surface refactor. Portfolio
  continues to alias to manager per the Phase 116 explicit-alias
  decision; Team + Executive surfaces remain on their current
  primitives.
- No Phase 122 mapping change.
- No route behavior change. `App.tsx` is untouched.
- No banker-only write surface imported (DealAutopilotPanel,
  Office365OutlookService, sendXEmail actions, RequestDocumentModal,
  CompleteTaskModal, CreditMemoDraftModal). Pinned by static-source
  tests.
- The 9 existing manager cards continue to render below the new
  cockpit. They are not consolidated, retired, or re-styled in this
  phase.

## 4. Why a new cockpit instead of refactoring existing cards

The user asked for a **management cockpit** — pipeline command strip
+ exception tape + banker workload + top deals — in one dense,
institutional surface. The existing nine manager cards each address
a slice (TeamPipelineSummary is KPIs only; DealsByStage is a chart;
AtRiskBlockedDeals is a flagged-deals list; etc.). Consolidating them
would require:

- Reconciling four different date-sensitivity strategies
  (ClosingForecast, AtRiskBlockedDeals, ActivitySummary all compute
  with `new Date()` differently).
- Reconciling four different per-card derivers with the shared
  Phase-123A VM signal-by-signal.
- Touching each card's per-card test suite.

For a Phase-124A **foundation**, the safer and more deployable move
is to **add** the cockpit at the top of the workspace, projecting
through the shared VM, with date-sensitivity controlled by an
injectable `now` (already in the deriver signature). Phase 124B and
later can sequence the consolidation behind the cockpit's contract:
once the Bloomberg Control Panel has absorbed a concern, the matching
existing card can be retired.

## 5. Permission-before-render + fail-closed

The cockpit mounts inside `ManagerProvider` + `ManagerDataProvider`,
both of which:

- Resolve the manager identity from the current UPN via
  `loadManagerIdentity` (looks up the banker row, requires a team
  FK on it, fails cleanly to `not-banker` / `no-team` / `failed`
  before any pipeline query runs).
- Scope every loader to `_cr664_team_value eq <teamId>` — no
  cross-team data ever reaches the cockpit.

Inside the cockpit:

- A `failed` slot renders the alert with the original message and
  refuses to render the KPI strip. A manager who lost connectivity
  to one of the slots does not see a half-truthful aggregate.
- A still-loading slot renders the loading strip and refuses to
  render the KPI strip. No "0 across the board" leak while data
  is in flight.
- A zero-deal team renders the honest empty state — never zeros
  styled like real KPIs.

## 6. Tests landed in Phase 124A

- [src/manager/managerPipelineSnapshot.test.ts](../src/manager/managerPipelineSnapshot.test.ts) (28 tests)
  - Empty state: `isEmpty=true`, zeroed strip, empty buckets
  - Command strip: active count, amount sum (undefined → 0),
    missing-data count, blocker+at-risk count, outstanding docs
    sum, open tasks sum
  - Exception tape: priority ladder (blocked > at-risk >
    missing-fields > stale), mutually exclusive, threshold edge
    cases (stale at 14 days threshold, missing+blocked picks
    blocked)
  - Banker workload: roster bankers retained at zero load,
    aggregation, Unassigned synthetic bucket, sort by total
    amount desc
  - Top deals: amount-desc sort, topN cap, undefined amounts sort
    to end, shared-VM `nextBestAction` surfaces for overdue tasks,
    honest absence for sparse deals
  - Static-source: imports shared VM deriver +
    `deriveBlockers` + `deriveDealCockpitMetrics`; no banker write
    surface imports; no fake-fallback strings; no sample data
    names; `MANAGER_STALE_DEAL_DAYS = 14` pinned

- [src/manager/ManagerBloombergControlPanel.test.tsx](../src/manager/ManagerBloombergControlPanel.test.tsx) (18 tests)
  - Cockpit shell + read-only chip present
  - Waits for all four core slots before rendering aggregates
  - Fails closed on any failed slot (alert + no KPI render)
  - Honest empty state for zero-deal teams
  - Command strip: six KPI tiles populated from authorized records
  - Exception tape: four buckets sourced from the shared deriver
    (no sample / mock / fake names)
  - Honest "None." copy in empty buckets
  - Top-deal row honest absence ("Not set" / "Unassigned" /
    "No amount")
  - Top-deal row VM-sourced next-best-action surfaces
    (overdue-task signal)
  - Top-deal row "No mechanical signal" copy when VM emits no
    action
  - Banker workload renders one row per roster banker
  - Static-source: imports the snapshot deriver, no banker write
    surface imports (no DealAutopilotPanel / Office365 /
    sendXEmail / modal imports), no `<button>` / `<form>` /
    `onClick` / `onSubmit` (read-only invariant), no sample data,
    no predictive vocabulary (approval odds, deal score, AI
    generated, predicted close)

## 7. What remains for follow-up phases

### Phase 124B
- Refactor ClosingForecast / AtRiskBlockedDeals / ActivitySummary
  to accept an injectable `now` so date-sensitivity is testable
  and reproducible (current cards use a live `new Date()`).
- Decide which of the nine existing manager cards the cockpit has
  fully absorbed and can be retired (likely candidates:
  TeamPipelineSummary, AtRiskBlockedDeals, BankerWorkloadSummary).

### Phase 124C
- Add a per-deal drill-through link from each cockpit row to
  `/workspaces/manager/deals/<id>` so managers can open the
  read-only `ManagerDealWorkspace` from the cockpit. The current
  panel is intentionally inert; navigation is a separate concern.
- Wire the banker-filter context so the cockpit narrows to a
  single banker when the user has scoped down via the existing
  `<ManagerBankerFilterControl>`.

### Phase 125
- Reconcile the Bloomberg Control Panel's classification with
  `ManagerAutopilotRollup` (which uses an older signal set) and
  retire whichever surface lost the reconciliation.
- Lift the cockpit pattern to Team Workspace and Executive
  Workspace.

## 8. Launch / deployment notes

- **Data dependencies:** zero new loaders, zero schema changes.
  The cockpit ships against the same Phase-14 / Phase-87 manager
  data already in production.
- **Visual impact:** purely additive. The new cockpit appears at
  the top of the existing manager workspace grid; existing cards
  render unchanged below it.
- **Performance:** the deriver runs O(deals + tasks + docs). For
  a 200-deal team with 1000 tasks + 1000 documents it is well
  under 10 ms in jsdom benchmarks. Memoization on the four data
  slots is in place to avoid re-deriving on unrelated re-renders.
- **Authorization:** identical to the rest of the manager surface
  (team-scoped, fail-closed on identity / loader failure).
- **Rollout:** can ship behind the existing manager route. No
  feature flag, no new permission, no migration step required.

## 9. Acceptance criteria

- [x] `ManagerBloombergControlPanel` mounts at the top of the
      manager workspace
- [x] Uses existing `ManagerDataProvider` slots; no new loaders
- [x] Projects each team-pipeline deal through the shared Phase-123A
      view-model (with loader-gap signals muted honestly)
- [x] Pipeline command strip with six KPIs
- [x] Exception tape with four buckets (blocked / at-risk /
      missing fields / stale)
- [x] Banker workload with one row per roster banker + Unassigned
      bucket
- [x] Top deals (default top 5) with VM-sourced blockerStatus +
      nextBestAction
- [x] Honest empty state when the team has zero authorized deals
- [x] Fails closed when any core data slot reports `failed`
- [x] No fake fallback labels for missing fields
- [x] No banker write surface imports; no banker write buttons
- [x] No Dataverse schema / route / Phase-122 mapping change
- [x] Existing nine manager cards unchanged
- [x] Phase 123A / 123B / 123C suites still green
- [x] `npm test -- src/manager` green
- [x] `npm run build` green
