# Phase 126B — Portfolio Command Center routing / entry point

## 1. Goal

Make the Phase 126A `PortfolioCommandCenter` reachable from the app
without breaking the existing Manager route or permission model.

## 2. Approach chosen — Option A (cockpit swap)

The user offered two routing models:

- **Option A — safer / faster.** Inside `ManagerWorkspace`, detect
  whether the bootstrap workspace name represents Portfolio /
  Portfolio Management. If yes, render `<PortfolioCommandCenter>`
  as the primary cockpit; otherwise render
  `<ManagerBloombergControlPanel>` as today.
- **Option B — more complete.** Add a distinct
  `/workspaces/portfolio` route + widen `WorkspaceGate`.

Phase 126B implements **Option A**. The Phase 116 alias already
maps `'Portfolio Management'` → `WORKSPACE_ROUTES.manager`; the
bootstrap chain preserves the original workspace name string on
`BootstrapResult.workspaceName`. The cockpit swap is therefore a
single in-component check inside `ManagerWorkspace` — no schema
change, no route change, no `WorkspaceGate` change, no
`workspaceScreens` registry change.

Option B remains the cleaner long-term shape (separate route, separate
gate, separate workspace registry entry), and is sketched in
section 6.

## 3. What ships

### 3.1 `isPortfolioWorkspaceName(name)` predicate

[workspaceRoutes.ts](../src/bootstrap/workspaceRoutes.ts) gains a
small predicate that wraps a private `PORTFOLIO_WORKSPACE_NAMES_LOWER`
set. Today the set contains only `'portfolio management'` — the
Phase 116 canonical alias.

Behavior pins:

- Returns `true` for `'Portfolio Management'` (exact case).
- Case-insensitive + whitespace-trimmed.
- Returns `false` for `'Manager Command Center'`, `'Banker Workspace'`,
  every other canonical name.
- Returns `false` for `undefined` / empty / whitespace-only input.
- **NOT substring** — `'Portfolio Manager Office'` and `'My Portfolio'`
  both return `false`. The predicate is name-exact (case/whitespace
  tolerant), not substring.
- **Route-preserving** — the predicate does NOT change
  `resolveWorkspaceRoute('Portfolio Management')`. That still
  returns `WORKSPACE_ROUTES.manager`, exactly as Phase 116 §2
  decided. The predicate governs which cockpit
  `ManagerWorkspace` mounts inside the manager route; it does NOT
  govern routing.

### 3.2 Conditional cockpit mount in `ManagerWorkspace`

[ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx) now:

```ts
const isPortfolio = isPortfolioWorkspaceName(bootstrap.workspaceName);
```

When true, the workspace:

- Swaps the lead cockpit from `<ManagerBloombergControlPanel>` to
  `<PortfolioCommandCenter>`.
- Swaps the header `<h1>` from `Manager Command Center` to
  `Portfolio Command Center`.
- Swaps the subtitle from
  `'Team pipeline health, banker production, and risk roll-up.'`
  to
  `'Live authorized portfolio exposure, mix, and risk roll-up.'`.
- Swaps the LendingOSLayout `workspaceName` prop from
  `'Manager Workspace'` to `'Portfolio Workspace'` (matters when
  a portfolio-primary user has no other entitlement and sees the
  static pill).
- Swaps the inline workspace-switcher aria-label from
  `'Manager workspace switcher'` to
  `'Portfolio workspace switcher'`.
- Swaps the identity-context block aria-label from
  `'Manager context'` to `'Portfolio context'`.

Everything else stays the same:

- `ManagerProvider` + `ManagerDataProvider` +
  `ManagerBankerFilterProvider` continue to mount.
- The Lending OS dark sidebar + workspace switcher continue to
  mount.
- The existing nine manager cards
  (`TeamWorkQueue`, `TeamPipelineSummary`, `DealsByStage`,
  `ClosingForecast`, `AtRiskBlockedDeals`, `BankerWorkloadSummary`,
  `ActivitySummary`, `ManagerAutopilotRollup`,
  `ManagerMorningCatchUp`, `ManagerRelationshipMemory`) continue
  to render below the lead cockpit in both modes — their data
  scope is the same team-scoped pipeline either way.

## 4. Permission-before-render preserved

The Portfolio cockpit reaches Dataverse through the **same**
authorization chain a manager-name user does:

- `AuthGate` + `BootstrapProvider` resolve the signed-in UPN
  against `cr664_platformuser` + `cr664_platformworkspace` (Phase
  115). No widening.
- `WorkspaceGate` admits the manager route only if it is the user's
  bootstrap-primary OR they pass the Phase 124C entitlement probe.
  No widening.
- `ManagerProvider` resolves `loadManagerIdentity(upn)` and gates
  on the banker row + team FK (Phase 14). No widening.
- `ManagerDataProvider` scopes every query by `_cr664_team_value`.
  No widening.

The portfolio cockpit is a **rendering choice**, not a data scope
choice. A portfolio-primary user sees exactly the team-scoped
records a manager-primary user with the same team FK would see.

## 5. What does NOT change

- No `WORKSPACE_ROUTES` constant change.
- No `App.tsx` change.
- No `WorkspaceGate` change.
- No `workspaceScreens` registry change.
- No banker / executive / admin / team workspace change.
- No new Dataverse schema, no new loader.
- No write affordance added.
- No Phase 116 alias change — `resolveWorkspaceRoute('Portfolio Management')`
  still returns the manager route.
- The Phase 124C workspace switcher continues to surface "Manager
  Workspace" + "Banker Workspace" links for a multi-entitled
  banker; portfolio-primary users continue to see the manager
  route inside the switcher (because that's what the alias still
  resolves to).

## 6. Why not Option B (separate route) — yet

Option B would:

1. Add `WORKSPACE_ROUTES.portfolio = '/workspaces/portfolio'`.
2. Update the Phase 116 alias to point `'Portfolio Management'` at
   `WORKSPACE_ROUTES.portfolio`.
3. Widen `WorkspaceGate` for portfolio-entitled users.
4. Add a `<PortfolioWorkspace>` shell wrap mirroring
   `<ManagerWorkspace>`.
5. Update `workspaceScreens` registry for the new route.
6. Re-publish `useEntitledRoutes` to optionally include the new
   route.

That is a larger surface than Phase 126B's scope (the user
explicitly asked for "the lowest-risk route wiring that fits the
current Phase 116 alias behavior"). Option B can land in a
follow-up phase once we have a portfolio-entitlement signal that
honestly proves portfolio access independent of manager identity —
today the only such signal is `cr664_roletype === PortfolioManager`
(788190002), but the bootstrap chain doesn't currently surface
`cr664_roletype`. Adding that surface is its own phase.

## 7. Tests landed

| File | New tests | Pins |
|---|---|---|
| [src/bootstrap/workspaceRoutes.test.ts](../src/bootstrap/workspaceRoutes.test.ts) | +6 | `isPortfolioWorkspaceName('Portfolio Management') === true`; case-insensitive + trim; `false` for other canonical names; `false` for undefined / empty / whitespace; `false` for non-exact substrings (`'Portfolio Manager Office'`, `'My Portfolio'`); route-preserving check (`resolveWorkspaceRoute('Portfolio Management')` still returns the manager route) |
| [src/workspaces/ManagerWorkspace.test.tsx](../src/workspaces/ManagerWorkspace.test.tsx) | +6 | Manager-name workspaces still render the Bloomberg Control Panel; non-portfolio names (e.g. `'Banker Workspace'`) keep the Manager cockpit; `'Portfolio Management'` swaps to `<PortfolioCommandCenter>`; header `<h1>` becomes `Portfolio Command Center`; case-insensitive swap; LendingOS shell + ManagerDataProvider stay mounted |

Total new pins: **12**.

Existing tests still green:

- Phase 116 workspace-route resolver
- Phase 124E manager shell restoration
- Phase 124C workspace switcher
- Phase 126A portfolio cockpit (all 52 unchanged)
- Every other manager / banker / portfolio test suite

## 8. Live walkthrough

1. A user whose `cr664_platformuser._cr664_primaryworkspace_value`
   points at the `'Portfolio Management'` Platform Workspace row
   signs in.
2. `AuthGate` → `runBootstrap()` returns
   `{ workspaceName: 'Portfolio Management', route: '/workspaces/manager' }`
   (Phase 116 alias).
3. Router navigates to `/workspaces/manager`. `WorkspaceGate`
   admits (it's the user's bootstrap-primary route).
4. `<ManagerWorkspace>` mounts. `useBootstrap()` returns the
   workspaceName verbatim; `isPortfolioWorkspaceName('Portfolio Management')`
   returns `true`.
5. The shell renders with the dark Lending OS sidebar, the
   identity block, the workspace switcher (if entitled), and the
   header now reading **Portfolio Command Center** with the
   portfolio subtitle.
6. The lead cockpit is the **Portfolio Command Center** (KPI ribbon
   + 11 chart cards + top exposures + exceptions). The nine
   existing manager cards render below it.

For a user whose primary is `'Manager Command Center'`, every
behavior matches Phase 124E + 125A as before — no regression.

## 9. Acceptance

- [x] `PortfolioCommandCenter` is reachable for users whose
      bootstrap workspace name is `'Portfolio Management'` (case-
      insensitive)
- [x] Manager users still see `ManagerBloombergControlPanel`
- [x] Banker workspace unchanged
- [x] Permission-before-render preserved (`AuthGate` /
      `WorkspaceGate` / `ManagerProvider` /
      `ManagerDataProvider` chain unchanged)
- [x] No `WORKSPACE_ROUTES` / `App.tsx` / `WorkspaceGate` / route
      change
- [x] No new Dataverse schema / loader
- [x] No write affordance added
- [x] `npm test -- Portfolio ManagerWorkspace workspaceScreens WorkspaceGate`
      green
- [x] `npm run build` green
