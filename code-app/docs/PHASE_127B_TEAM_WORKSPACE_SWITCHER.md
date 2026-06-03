# Phase 127B — Team Workspace switcher entry

## 1. Problem

Phase 127A built `TeamOpsQueue` and mounted it inside `TeamWorkspace`,
but the live sidebar surfaces only:

- Banker Workspace
- Manager Workspace
- Portfolio Workspace

There was no visible Team Workspace entry, so a manager-entitled user
had no path to reach the new dense Team Ops Queue. The route exists
(`/workspaces/team`, registered in [App.tsx](../src/App.tsx)), but
`useEntitledRoutes()` did not list it, so `WorkspaceGate` never
admitted the team route for a non-team-bootstrap user and
`deriveWorkspaceLinks` never surfaced the team link in any switcher.

## 2. Fix

Two small changes — both use the **existing** Phase 124C
`loadManagerIdentity` probe and the **existing** team route. No
Dataverse schema change, no new loader, no broader route topology.

### 2.1 `useEntitledRoutes()` — admit the team route

[src/bootstrap/workspaceEntitlements.ts:122-141](../src/bootstrap/workspaceEntitlements.ts#L122-L141)

```ts
export function useEntitledRoutes(): EntitledRoutesState {
  const m = useManagerEntitlement();
  if (m.kind === 'loading') return { kind: 'loading', routes: [] };
  const routes: string[] = [];
  if (m.kind === 'entitled') {
    routes.push(WORKSPACE_ROUTES.manager);
    routes.push(WORKSPACE_ROUTES.team);   // ← Phase 127B
  }
  return { kind: 'ready', routes };
}
```

Why this is honest:

- The probe's success condition (`loadManagerIdentity` returns
  `kind: 'ready'`) is **the same** condition `TeamProvider` enforces
  when the user actually navigates to the team workspace
  ([TeamProvider.tsx](../src/team/TeamProvider.tsx) runs
  `loadTeamIdentity(upn)`, which requires a `cr664_Banker` row with
  a populated `cr664_Team` lookup — the exact same predicate the
  manager probe checks).
- Adding the team route to `entitledRoutes` therefore does NOT widen
  data access. The team route's own provider chain
  (`TeamProvider` + `TeamDataProvider`) still re-verifies identity
  before rendering anything, and team queries continue to scope by
  `_cr664_team_value` exactly as Phase 84 / 116 wired them.
- Banker-only users (probe → `not-entitled`) never receive the team
  route. Probe-failed users (probe → `failed`) never receive it
  either (fail honest — no fake widening on error).

### 2.2 `TeamWorkspace` — mount the inline workspace switcher

[src/workspaces/TeamWorkspace.tsx](../src/workspaces/TeamWorkspace.tsx)

The team header gains the same inline `<WorkspaceSwitcher>` pattern
the manager workspace already uses, so manager-entitled users who
arrived via the Phase 127B widening can navigate back. Mounted only
when `workspaceLinks.length >= 2` (the same gate the other workspaces
apply), so single-link team-bootstrap users see no degenerate
single-item nav.

Portfolio surface inclusion follows the same rule as
`BankerWorkspace`: portfolio link appears only when the user has the
manager route in their allowed set. Banker-only or team-only users
never see the portfolio link.

## 3. What does NOT change

- No Dataverse schema change.
- No new loader. The Phase 124C `loadManagerIdentity` probe is the
  single source of truth; it is shared with the manager-entitlement
  flow and module-cached by UPN.
- No new route. `/workspaces/team` already exists in `App.tsx`.
- No data-scope widening. `TeamDataProvider` continues to scope by
  `_cr664_team_value`. The widening is at the switcher + gate layer
  only.
- No new permission system. The same `cr664_Banker` row + `cr664_Team`
  FK that already determine manager entitlement determine team
  entitlement.
- No write affordance. `TeamWorkspace` ships with zero
  `<button>`/`<form>` (pinned).
- No banker / manager / portfolio regression. All 44 existing
  workspace + switcher + LendingOSLayout tests still pass; the only
  observable change is the additional team route appearing in the
  entitled-route list for already-manager-entitled users.

## 4. Behavior matrix

| User type | Bootstrap route | Manager probe | Sees Team Workspace? |
|---|---|---|---|
| Team-bootstrap user | `/workspaces/team` | n/a | yes (own route — was already visible) |
| Banker-bootstrap manager-entitled user | `/workspaces/banker` | `entitled` | **yes (Phase 127B)** |
| Manager-bootstrap manager-entitled user | `/workspaces/manager` | `entitled` | **yes (Phase 127B)** |
| Portfolio-bootstrap manager-entitled user | `/workspaces/manager` (alias) | `entitled` | **yes (Phase 127B)** |
| Banker-only user | `/workspaces/banker` | `not-entitled` | no (no widening) |
| Probe-failed user | any | `failed` | no (fail honest) |

## 5. Tests landed (11 new)

| File | Tests | Pins |
|---|---|---|
| [src/bootstrap/workspaceEntitlements.test.tsx](../src/bootstrap/workspaceEntitlements.test.tsx) | 7 (3 entitled-routes + 4 switcher-link) | `useEntitledRoutes` returns both `manager` and `team` when probe is `entitled`; team route NOT in routes when probe is `not-entitled` or `failed`; `deriveWorkspaceLinks` surfaces `Team Workspace` only when `team` is in the allowed set; team link route is exactly `/workspaces/team`; team link `isCurrent` toggles on `currentRoute` |
| [src/bootstrap/WorkspaceGate.test.tsx](../src/bootstrap/WorkspaceGate.test.tsx) | 3 | gate admits the team workspace for a manager-entitled banker; bounces banker-only users away from `/workspaces/team`; bounces on probe failure (no fake widening on error) |
| [src/workspaces/TeamWorkspace.test.tsx](../src/workspaces/TeamWorkspace.test.tsx) | 8 | TeamOpsQueue mounts as the first cockpit; team identity header renders; inline switcher renders for manager-entitled users; banker/manager/portfolio switch links exposed with correct hrefs; Team Workspace entry marked `aria-current="page"`; switcher hidden honestly when no additional entitlements exist; portfolio link suppressed for banker-only/team-only users; no `<button>` / `<form>` in the team workspace shell |

Existing tests still green:
- Phase 124C entitlements + switcher + LendingOSLayout (23 tests)
- Phase 124E + 126B + 126C manager / portfolio workspace (19 tests)
- Phase 127A TeamOpsQueue + snapshot + dashboard-charts (45 tests)

## 6. Walkthrough

1. Manager-entitled banker signs in. Bootstrap resolves to
   `/workspaces/banker` (their Power Apps primary workspace).
2. `BankerWorkspace` mounts. `useEntitledRoutes()` fires the
   Phase 124C `loadManagerIdentity` probe.
3. Probe returns `kind: 'ready'`. `useEntitledRoutes` now returns
   `routes: [/workspaces/manager, /workspaces/team]`.
4. `deriveWorkspaceLinks` in the banker workspace expands the
   switcher to include Banker (current), **Team**, Manager, Portfolio.
5. User clicks **Team Workspace**. Router navigates to
   `/workspaces/team`.
6. `WorkspaceGate(allowed=/workspaces/team)` reads
   `useEntitledRoutes()`. The team route is in the entitled set, so
   the gate admits.
7. `TeamWorkspace` mounts. `TeamProvider` independently runs
   `loadTeamIdentity(upn)` (the team route's own hard contract). The
   same banker row + team FK that made the manager probe succeed
   makes the team probe succeed. Team identity resolves.
8. `TeamDataProvider` fires its six team-scoped queries (scoped by
   `_cr664_team_value` — same as Phase 84).
9. **TeamOpsQueue** renders first inside the team workspace
   (Phase 127A ordering preserved). The inline workspace switcher in
   the team identity block shows Banker / **Team (current)** /
   Manager / Portfolio so the user can navigate back.

## 7. Acceptance

- [x] Team Workspace appears in the workspace switcher for users who
      are manager/team-entitled
- [x] Banker-only users do not see Team Workspace
- [x] WorkspaceGate admits the team route for entitled users
- [x] WorkspaceGate fails closed for banker-only or probe-failed users
- [x] Team Workspace link points to the existing `/workspaces/team`
      route (no new route added)
- [x] TeamWorkspace renders TeamOpsQueue first
- [x] Manager + Portfolio switcher behavior preserved
- [x] No Dataverse schema change, no new loader, no data-scope
      widening
- [x] No write affordance, no banker write-surface imports
- [x] No banker / manager / portfolio regression (all 44 existing
      workspace + switcher + layout tests still pass)
- [x] 18 new tests pass (7 entitlements + 3 gate + 8 TeamWorkspace)
- [x] `npm run build` clean
