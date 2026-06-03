# Phase 127C — Team Workspace shell restoration + ops queue polish

## 1. Goals

Phase 127A built `TeamOpsQueue` and mounted it inside `TeamWorkspace`.
Phase 127B made the team workspace reachable from the workspace
switcher. The live screenshot confirmed the queue renders, but the
team workspace was missing the dark Lending OS sidebar, and the
queue itself was leaking banker GUIDs and stripping context from the
execution board.

This phase:

- **Part A** — restores the full Lending OS shell on the team
  workspace, matching banker / manager / portfolio parity.
- **Part B** — polishes `TeamOpsQueue` for demo readiness: stops the
  banker-GUID leak, hydrates the execution board with stage / status,
  and splits the kind + severity badges so each row is scannable.
- **Part C** — preserves the single shared chart system
  (`src/shared/CommandChartPrimitives.tsx` from Phase 127A); no
  second chart system is introduced.

## 2. Part A — Lending OS shell

[src/workspaces/TeamWorkspace.tsx](../src/workspaces/TeamWorkspace.tsx)

`TeamWorkspaceContent` is now wrapped in `<LendingOSLayout>`, same
pattern as Phase 124E / 126B for the manager + portfolio surfaces:

```tsx
<LendingOSLayout
  activeNav="dashboard"
  fullName={fullName}
  email={email}
  workspaceName="Team Workspace"
  workspaceLinks={workspaceLinks}
>
  <div style={styles.page}>
    <header style={styles.header}>…team identity block + inline switcher…</header>
    <main style={styles.main}>
      <TeamOpsQueue />
      …existing 9 team cards unchanged…
    </main>
  </div>
</LendingOSLayout>
```

What this brings:

- The dark left sidebar with the Lending OS brand block, the
  workspace switcher, and the My Pipeline / Work Queue / Relationships
  / Resources nav rails.
- The signed-in identity card at the bottom of the sidebar.
- Visual parity with banker / manager / portfolio.
- The existing team header (Team / Signed in / email) and the inline
  workspace switcher Phase 127B introduced both render inside the
  shell, same as Manager. Two switchers (sidebar + inline) are
  intentional — Manager already does this, and the two surfaces target
  different scan modes (sidebar for global navigation, inline for
  same-context reference).

`onNavSelect` is intentionally omitted — the sidebar nav rails are
banker-coded and remain non-interactive on the team surface for now
(same posture as Manager / Portfolio).

## 3. Part B — Ops queue polish

### 3.1 Banker label hydration (no GUID leak)

[src/team/teamOpsQueueSnapshot.ts](../src/team/teamOpsQueueSnapshot.ts) — `buildBankerWorkload`

Old behavior (Phase 127A):

```ts
const name =
  r.teamDeal.assignedBankerName ??
  (id === UNASSIGNED ? 'Unassigned' : id);   // ← LEAKED THE RAW GUID
```

Phase 127C — honest three-state fallback:

```ts
const name =
  r.teamDeal.assignedBankerName ??
  (id === UNASSIGNED ? 'Unassigned' : 'Unknown banker');
```

Rule:
- `assignedBankerName` present → use it.
- FK present but name didn't hydrate → `'Unknown banker'`.
- No FK at all → `'Unassigned'`.

The cockpit applies the same rule on every row via the new
`displayOwner(item)` helper in
[TeamOpsQueue.tsx](../src/team/TeamOpsQueue.tsx):

```ts
function displayOwner(item: WorkItem): string {
  if (item.ownerName) return item.ownerName;
  if (item.ownerId) return 'Unknown banker';
  return 'Unassigned';
}
```

This kills the GUID leak in both the lane rows and the execution
board, and it propagates through the chart adapters
(`deriveOverdueByBanker` / `deriveOutstandingDocsByBanker` consume
`bankerName` directly from the workload, so chart labels are now
honest by construction — no separate chart fix needed).

### 3.2 Stage + status on every WorkItem

`WorkItem` (the queue row shape consumed by lanes / execution board /
chart adapters) now carries `stage: string | undefined` and
`status: string | undefined`. Every constructor in
[teamOpsQueueSnapshot.ts](../src/team/teamOpsQueueSnapshot.ts)
copies them from the source `TeamDealRow`. Honest absence is
preserved — `stage` / `status` are `undefined` when the source row
doesn't carry them.

The Phase 127A missing-data lane still uses
`TEAM_REQUIRED_DEAL_FIELDS` (Client / Loan amount / Target close /
Stage / Status / Banker) to flag deals where the fields are missing,
so we never over-flag or under-flag — the snapshot's honest-absence
rule is unchanged.

### 3.3 Execution board polish

[src/team/TeamOpsQueue.tsx](../src/team/TeamOpsQueue.tsx) — execution board renders:

- **Title link** — the work-item title (task / doc / deal name).
- **Deal-name sub-line** — only when the title differs from the deal
  name (collapses duplication on deal-level rows like blocked / stale
  / closing-soon).
- **Item-kind chip** — `labelForKind()` ("Overdue task", "Missing
  data", "Pending review", etc.). Carries `data-team-execution-kind`.
- **Severity dot** — a colored circle paired with an aria-label.
  Carries `data-team-execution-severity`. Splits severity from the
  kind label so screen-reader-readable summary text is doubled.
- **Meta line**: client · stage · status · banker · urgency · reason.

Honest-absence labels:
- Client missing → `'Not set'`
- Stage missing → `'Stage not set'`
- Status missing → `'Status not set'`
- Banker missing FK → `'Unassigned'`; FK present but name missing →
  `'Unknown banker'`

The lane rows also pick up the new `displayOwner` helper, so single
lane cards no longer collapse a populated banker into `'Unassigned'`
just because the name didn't hydrate.

## 4. What does NOT change

- No Dataverse schema change.
- No new loader. `TeamDataProvider` is unchanged.
- No new data-scope widening.
- No route change.
- No banker / manager / portfolio regression. All 66 banker /
  manager / portfolio / switcher / gate / entitlement tests still
  pass.
- No write affordance inside the team body. `TeamOpsQueue` continues
  to ship with zero `<button>` / `<form>` / `onClick` / `onSubmit`
  in the rendered cockpit body (pinned by static-source). The
  Lending OS sidebar carries placeholder `<button disabled>` items
  by design — same posture as Banker / Manager / Portfolio.
- No second chart system. `TeamOpsQueue`'s analytics row continues
  to consume `src/shared/CommandChartPrimitives.tsx` (relocated in
  Phase 127A).

## 5. Tests landed (15 new)

| File | New tests | Pins |
|---|---|---|
| [src/team/teamOpsQueueSnapshot.test.ts](../src/team/teamOpsQueueSnapshot.test.ts) | 6 | Banker workload renders `Unknown banker` when FK present but name missing (no GUID leak); `Unassigned` when no FK; hydrated banker name passes through unchanged; WorkItem `stage` + `status` copied from source deal for blocked / at-risk and overdue-task lanes; honest absence preserved (undefined when source is empty) |
| [src/team/TeamOpsQueue.test.tsx](../src/team/TeamOpsQueue.test.tsx) | 6 | Execution board renders stage / status labels when present; hydrated banker name appears (not the GUID); 'Unknown banker' appears for unhydrated FK rows (raw GUID never rendered); 'Unassigned' appears for no-FK rows; 'Stage not set' / 'Status not set' honest-absence labels; both item-kind chip and severity dot present on every execution row |
| [src/workspaces/TeamWorkspace.test.tsx](../src/workspaces/TeamWorkspace.test.tsx) | 3 (new Phase 127C describe block) | Lending OS dark sidebar mounts (brand block + nav + signed-in card); `workspaceName="Team Workspace"` flows to the sidebar; dark + light switchers both render for manager-entitled users |

Existing tests still green:
- Phase 124C entitlements + switcher + LendingOSLayout (23)
- Phase 124E + 126B + 126C manager + portfolio workspace (19)
- Phase 127A TeamOpsQueue snapshot + dashboard charts + cockpit (45)
- Phase 127B TeamWorkspace switcher + Gate + entitlements (18)

The Phase 127B "read-only discipline" test was rescoped to the team
body (`main` element), since the LendingOS sidebar carries
`<button disabled>` placeholders by design. The team body itself
remains pinned to zero `<button>` / `<form>`.

## 6. Walkthrough

1. Team-bootstrap user signs in. WorkspaceGate admits
   `/workspaces/team`. TeamWorkspace mounts.
2. `TeamProvider` resolves identity; `TeamDataProvider` fires the
   six team-scoped queries.
3. **Lending OS shell renders**: dark sidebar on the left with brand
   block, workspace switcher (or static pill for single-entitlement
   team users), nav rails, signed-in identity card. Same chrome the
   user sees on the banker / manager / portfolio surfaces.
4. **Team header** renders inside the shell with the team identity
   block (Team / Signed in / email) and the inline workspace
   switcher (when ≥ 2 entitled routes).
5. **Team Ops Queue** renders first inside the main body. KPI ribbon,
   8 lanes, banker workload matrix, execution board (top 20),
   analytics row.
6. **Execution board rows** now show:
   `[Title link]   [Item-kind chip] [severity dot]`
   `Client · Stage · Status · Banker · Urgency · Reason`
7. **Banker names** are always human-readable. FK-without-name rows
   say `'Unknown banker'`, never the raw GUID.
8. **Existing team cards** (SharedWorkQueue, TeamAutopilotRollup,
   TeamPipelineSummary, BottlenecksAgingByStage, etc.) render below
   the queue inside the same shell.

## 7. Acceptance

- [x] Team Workspace renders the same persistent dark Lending OS
      sidebar as banker / manager / portfolio.
- [x] Workspace switcher entry shows Banker / Team (current) /
      Manager / Portfolio for manager-entitled users.
- [x] Banker-only users still fail closed via WorkspaceGate; no
      unauthorized team link is leaked.
- [x] TeamOpsQueue renders human banker labels, never GUIDs.
- [x] Execution board carries hydrated client / stage / status /
      banker labels when available; honest absence labels otherwise.
- [x] No fake fallback labels.
- [x] No write buttons / forms / `onClick` / `onSubmit` introduced
      inside the team body.
- [x] No banker / manager / portfolio regression (66 existing tests
      still pass).
- [x] Single shared chart system preserved.
- [x] 15 new tests pass (6 snapshot + 6 cockpit + 3 workspace shell).
- [x] `npm run build` clean.
