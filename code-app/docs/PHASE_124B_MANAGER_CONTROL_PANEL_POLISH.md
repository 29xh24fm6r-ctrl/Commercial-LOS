# Phase 124B — Manager Bloomberg Control Panel launch polish

## 1. Goal

Make the [Manager Bloomberg Control Panel](../src/manager/ManagerBloombergControlPanel.tsx)
from Phase 124A team-demo ready without changing schema, routes, or
loaders. Phase 124B adds the integrations that make the cockpit feel
like a real management tool — banker filter awareness, drill-down
navigation, sharper copy, and tighter visual grouping — while
preserving every Phase 124A invariant (no write surface, no fake
fallbacks, fail-closed, no banker-cockpit refactor).

## 2. What ships in Phase 124B

### 2.1 Banker filter integration

[ManagerBankerFilter.tsx](../src/manager/ManagerBankerFilter.tsx)
gains an opt-in hook `useOptionalManagerBankerFilter()` (mirrors
Phase 123B's `useOptionalDealIntelligence`). Returns the filter view
when the existing `<ManagerBankerFilterProvider>` is mounted (which
the manager workspace already wraps the page in), `undefined`
otherwise.

[ManagerBloombergControlPanel.tsx](../src/manager/ManagerBloombergControlPanel.tsx)
reads the optional hook and, when the active selection is **not**
`{ kind: 'all' }`, narrows the inputs to the snapshot deriver:

- `teamPipeline` filtered by `dealMatchesBankerFilter(deal, selection)`
- `teamTasks` filtered to dealIds that survived the pipeline filter
- `teamDocuments` filtered to dealIds that survived the pipeline filter

Every section (command strip, exception tape, banker workload, top
deals) reflects the filter because the deriver runs over the
filtered inputs. The filter never widens permission — it only
narrows already-authorized records.

A new "Filtered to X" chip renders in the header when a non-`all`
selection is active. No chip when the provider is absent or the
selection is `all`.

The honest empty state now distinguishes:

- "No authorized manager pipeline records found." — zero deals on
  the team
- "No authorized records match the current banker filter." — the
  current selection yields zero matches

### 2.2 Drill-down navigation

Two read-only navigation affordances:

- **Top deals** — each top-deal name renders as
  `<Link to="/deals/<dealId>">` (existing route from `App.tsx`).
  Aria-label: `Open <name> in the deal workspace`. Data attribute:
  `data-manager-drilldown-deal=<dealId>`.
- **Exception tape rows** — each row name renders as the same
  `<Link to="/deals/<dealId>">` with the same aria-label and data
  attribute.

Both surfaces use **navigation anchors**, not write buttons. The
cockpit still ships with zero `<button>`, zero `<form>`, zero
`onClick` / `onSubmit` (pinned by static-source tests).

The `/deals/:dealId` route dispatches to the role-appropriate
workspace (`DealRoute.tsx`); a manager who clicks through to a deal
sees `ManagerDealWorkspace` (read-only) because the route picks the
workspace based on the caller's role.

### 2.3 Launch copy + visual grouping

Header now carries three layers:

- **Eyebrow:** `Management Cockpit` (Bloomberg-style label-cap)
- **Title:** `Manager Bloomberg Control Panel`
- **Subtitle:** `Live authorized pipeline snapshot`

Trailing meta cluster on the right: optional `Filtered to X` chip +
`Read-only` chip (unchanged from Phase 124A).

Failure copy is sharper and reinforces the discipline:

```
Could not load <slot>. The cockpit is failing closed.
<original error message>
No partial KPIs are shown across a failed load. Refresh to retry.
```

Visual grouping inside the cockpit body:

1. **Command Strip** — top
2. **Exception Tape** — prominent second row
3. **Banker Workload | Top Deals** — two-column grid (auto-fit min 380px;
   collapses to a single column on narrow viewports) at the bottom

All tokens come from the existing `palette` / `radius` / `shadow` /
`spacing` / `typography` / `severityPalette` exports; no new colors,
no new spacing primitives, no `index.css` change. The filter chip
uses `palette.primaryBg` / `palette.primaryFg` / `palette.primaryDim`
for cobalt-tinted institutional treatment.

### 2.4 What does NOT change in Phase 124B

- No Dataverse schema change.
- No new loader. `ManagerDataProvider` unchanged.
- No banker cockpit change (DealHeader / DealMetricDeck /
  DealAutopilotPanel / DealBlockers / BankerDealWorkspace
  untouched).
- No Portfolio / Team / Executive surface refactor.
- No Phase 122 mapping change.
- No route behavior change; `App.tsx` untouched. The `/deals/:dealId`
  route the cockpit links to is the same one that already existed.
- No banker-only write surface imported.
- The nine existing manager cards continue to render below the
  cockpit, unchanged.
- No sample / mock / fake-fallback data injected.

## 3. Why an opt-in hook for the filter

The same reasoning as Phase 123B for the deal-intelligence
provider: the cockpit needs to be **standalone-mountable** so its
own per-card test file can render it without setting up the full
`ManagerProvider` / `ManagerDataProvider` /
`ManagerBankerFilterProvider` stack. `useOptionalManagerBankerFilter`
falls back to "all team" semantics when no provider is mounted, so
tests that mount the panel directly continue to render the full
authorized pipeline.

## 4. Tests landed in Phase 124B

[ManagerBloombergControlPanel.test.tsx](../src/manager/ManagerBloombergControlPanel.test.tsx)
now covers 29 cases (17 carried over from Phase 124A + 12 new):

- **Cockpit shell + copy** — title, subtitle, read-only chip,
  loading wait, fail-closed copy ("failing closed" + "no partial
  KPIs"), zero-deal empty state, filtered-zero empty state
- **Command strip** — six KPIs populated from authorized records
- **Filter integration (Phase 124B)** — selection narrows command
  strip aggregates; narrows top-deals list; narrows exception tape;
  filter chip rendered for non-`all` selection; no chip when
  provider absent; `{ kind: 'all' }` is a no-op
- **Exception tape** — four buckets from shared deriver, no
  sample data, "None." copy in empty buckets
- **Drill-down (Phase 124B)** — top-deal name is a Link to
  `/deals/<dealId>`; exception-row name is a Link to
  `/deals/<dealId>`; no `<button>` / `<form>` in the rendered DOM
- **Honest absence** — "Not set" / "Unassigned" / "No amount" copy;
  no TBD / N/A / placeholder vocabulary
- **Shared VM next-best-action** — surfaces overdue-task label;
  "No mechanical signal" copy when none fires
- **Static-source discipline** — imports the snapshot deriver, the
  optional filter hook, and `Link` from react-router-dom; does
  NOT import any banker write surface; no `<button>`/`<form>`/
  `onClick`/`onSubmit`; no sample data; no predictive vocabulary

[managerPipelineSnapshot.test.ts](../src/manager/managerPipelineSnapshot.test.ts)
is unchanged (28 tests, all green) — the deriver itself didn't
change; the filter is applied at the call site.

## 5. Deploy / demo checklist

Use this to walk a team through the cockpit on first ship.

### 5.1 Pre-flight

- [ ] Manager has a `cr664_Banker` row with a `cr664_Team` lookup
      populated. Without a team, `loadManagerIdentity` returns
      `no-team` and the manager surface short-circuits before the
      cockpit ever mounts.
- [ ] `cr664_LoanDeal` records on the team are in non-terminal state
      (`statecode=0`, `cr664_isterminalstatus` false or null). The
      Phase 14 pipeline filter excludes terminal deals.
- [ ] Browser supports `Intl.NumberFormat('USD')` (every modern
      browser does — IE11 is unsupported by Power Apps Code App).
- [ ] Network reachability to Dataverse — no special CORS / VPN
      config needed beyond what the rest of the LOS already needs.

### 5.2 First demo walkthrough

1. **Navigate to** `/workspaces/manager`.
2. Identity resolves; `ManagerDataProvider` fires the six parallel
   loaders (Phase 14 + 87 + 95).
3. The cockpit appears at the top of the workspace with the
   subtitle "Live authorized pipeline snapshot" and a `Read-only`
   chip on the right.
4. The **Pipeline Command Strip** shows six KPIs.
5. The **Exception Tape** shows four buckets (Blocked / At risk /
   Missing fields / Stale). Click any deal name to drill into the
   read-only manager deal workspace.
6. Use the existing **Focus on banker** filter (rendered just below
   the cockpit). Pick a banker. The cockpit's command strip,
   exception tape, and top deals narrow; the "Filtered to X" chip
   appears in the cockpit header.
7. Switch back to "All team" — the chip disappears; the cockpit
   re-widens.
8. The **Top Deals** list (default 5 by amount) shows the shared
   Phase-123A view-model's `nextBestAction` label when a mechanical
   signal fires (overdue tasks, outstanding documents, past target
   close) or "No mechanical signal" when none does.
9. The **Banker Workload** table shows one row per roster banker
   with the deal count, total amount, open tasks, outstanding
   documents, and blocked/at-risk count for that banker's deals.

### 5.3 Edge cases to walk through

- **Empty team:** point the demo at a team with zero active deals.
  The cockpit renders the honest empty state copy
  ("No authorized manager pipeline records found.") instead of
  zeros across the strip.
- **Filtered to zero matches:** select a banker who has no deals on
  the team. The cockpit renders
  "No authorized records match the current banker filter."
- **Failed slot:** simulate a partial OData failure (e.g. block the
  tasks endpoint via dev tools). The cockpit shows the alert
  ("Could not load team tasks. The cockpit is failing closed.")
  and refuses to render KPI aggregates — no "0 across the board"
  leak.
- **Drill-through:** click any deal name. The route navigates to
  `/deals/<dealId>` and the existing `DealRoute` dispatcher renders
  the role-appropriate workspace (`ManagerDealWorkspace` for a
  manager-authorized caller, read-only).

### 5.4 What stays out of the demo (deliberately)

- No write affordances anywhere in the cockpit. No
  "approve / send / complete / draft" buttons. The cockpit is
  observational; write actions still live in the per-deal banker
  workspace.
- No predictive language. No "approval odds", no "deal score", no
  "AI-generated", no "predicted close". The next-best-action label
  is the same mechanical signal the banker cockpit's
  DealAutopilotPanel emits.
- No fake placeholder vocabulary. Missing client / banker / amount
  surface as the deliberate empty-state copy
  ("Not set" / "Unassigned" / "No amount").

### 5.5 Rollback

- The cockpit is purely additive — it mounts as the first card in
  the existing manager workspace grid. To roll back, revert the two
  line addition in
  [ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx)
  (the import + the `<ManagerBloombergControlPanel />` mount).
  The cockpit's files (`ManagerBloombergControlPanel.tsx`,
  `managerPipelineSnapshot.ts`, and their tests) can stay in the
  repo without rendering.
- No schema state to roll back; no seed migration ran.

## 6. What remains for follow-up

### Phase 124C
- Reorder / consolidate the existing nine manager cards now that
  the cockpit absorbs pipeline / exception / workload concerns.
  Likely retirees: `TeamPipelineSummary`, `AtRiskBlockedDeals`,
  `BankerWorkloadSummary` — each is a slice of what the cockpit
  now renders denser.
- Lift the `now` injection through `ClosingForecast` /
  `AtRiskBlockedDeals` / `ActivitySummary` so their date-sensitive
  derivers can be tested reproducibly the same way the cockpit's
  deriver already is.

### Phase 125 (lifting the cockpit pattern)
- Stand up parallel cockpits on `TeamWorkspace` (team work queue
  view) and `ExecutiveWorkspace` (pipeline snapshot view), reusing
  the same shared Phase-123A VM projection.

## 7. Acceptance criteria

- [x] `useOptionalManagerBankerFilter()` added (opt-in mirror of
      Phase 123B pattern)
- [x] Cockpit consumes the optional filter and narrows command
      strip / exception tape / top deals / banker workload through
      pre-deriver input filtering
- [x] "Filtered to X" chip in the header when a non-`all` selection
      is active; no chip when no provider or selection is `all`
- [x] Filter-aware empty-state copy
- [x] Top-deal name + exception-tape row name are `<Link>`s to
      `/deals/<dealId>`
- [x] No `<button>`, no `<form>`, no `onClick` / `onSubmit` (still
      read-only)
- [x] Subtitle "Live authorized pipeline snapshot" + sharper failure
      copy + grouped bottom row
- [x] Phase 124A invariants preserved (no fake fallbacks, no banker
      write imports, no schema/route change, fail-closed on any
      failed slot)
- [x] 57 cockpit + deriver tests pass
- [x] `npm run build` green
- [x] Full suite shows only the 6 pre-existing
      `DealAutopilotPanel.test.tsx` date-flakes (carried in from
      Phase 122; out of Phase 124B scope per user instruction)
