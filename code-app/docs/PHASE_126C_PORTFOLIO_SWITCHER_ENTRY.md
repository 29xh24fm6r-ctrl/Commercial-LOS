# Phase 126C — Portfolio Workspace switcher entry

## 1. Problem

Phase 126A built the Portfolio Command Center; Phase 126B made it
render only when the bootstrap workspace name is exactly
`'Portfolio Management'`. The live screen still shows the Manager
cockpit because the signed-in user isn't bootstrapped to Portfolio
Management. There's no visible entry point — no link in the
workspace switcher.

## 2. Goal

Expose a safe Portfolio Workspace entry in the workspace switcher
for users who are **already manager-entitled**, without changing
Dataverse schema, routes, or data scope.

## 3. Approach — query-marker rendering surface

The user offered two implementation options:

- **A** — query marker:
  `/workspaces/manager?surface=portfolio`
  `/workspaces/manager?surface=manager`
- **B** — nested route: `/workspaces/manager/portfolio`

Phase 126C ships **Option A**. It requires no `App.tsx` change, no
`WORKSPACE_ROUTES` change, no `WorkspaceGate` change, and no new
route definition. The portfolio surface is a rendering hint
attached to the existing manager route; `WorkspaceGate` continues
to admit the same path; `ManagerProvider` + `ManagerDataProvider`
mount unchanged.

## 4. What ships

### 4.1 `workspaceEntitlements.ts` — new portfolio link key

- `WorkspaceLinkKey` gains `'portfolio'`.
- New exported constants:
  - `PORTFOLIO_SURFACE_PARAM_NAME = 'surface'`
  - `PORTFOLIO_SURFACE_PARAM_VALUE = 'portfolio'`
  - `PORTFOLIO_SURFACE_URL = '/workspaces/manager?surface=portfolio'`
- New `LINK_META.portfolio` entry: route is `PORTFOLIO_SURFACE_URL`,
  label is `Portfolio Workspace`.
- `deriveWorkspaceLinks` gets two new optional input fields:
  - `includePortfolioSurface?: boolean` — caller opts in.
  - `currentSurface?: 'portfolio'` — caller signals the current
    rendering surface so `isCurrent` toggles correctly between
    `manager` and `portfolio` even though they share the same route
    path.

The deriver's portfolio inclusion rule is fail-closed:

```
isAllowed = (input.includePortfolioSurface ?? false) &&
            allowed.has(WORKSPACE_ROUTES.manager);
```

If the user does NOT already have the manager route in their
allowed set, the portfolio link is **not** added — even when the
caller opted in. Banker-only users never see the portfolio link.
Portfolio is a rendering surface, not a permission expansion.

The `isCurrent` rules:
- `portfolio` link: `currentSurface === 'portfolio'`
- `manager` link: on the manager route AND `currentSurface !== 'portfolio'`
- Other links: route-path equality (unchanged)

### 4.2 `ManagerWorkspace.tsx` — read the query, swap the cockpit

`ManagerWorkspaceContent` now:

```tsx
const [searchParams] = useSearchParams();
const surfaceParam = searchParams.get(PORTFOLIO_SURFACE_PARAM_NAME);
const isPortfolio =
  surfaceParam === PORTFOLIO_SURFACE_PARAM_VALUE ||
  (surfaceParam === null && isPortfolioWorkspaceName(bootstrap.workspaceName));
```

Cockpit-selection priority:

1. `?surface=portfolio` → Portfolio cockpit (always).
2. `?surface=manager` (or any other explicit value) → Manager
   cockpit (always — explicit query overrides the Phase 126B
   bootstrap default).
3. No query AND Phase 126B portfolio-workspace name → Portfolio
   cockpit (Phase 126B default preserved).
4. Otherwise → Manager cockpit.

`deriveWorkspaceLinks` is called with `includePortfolioSurface: true`
(the user is already on the manager route by virtue of having
reached `ManagerWorkspaceContent` — `WorkspaceGate` already
admitted them) and `currentSurface: isPortfolio ? 'portfolio' : undefined`.

### 4.3 `BankerWorkspace.tsx` — only surface portfolio for manager-entitled bankers

```tsx
const managerEntitled = entitled.routes.includes(WORKSPACE_ROUTES.manager);
const workspaceLinks = deriveWorkspaceLinks({
  bootstrapRoute: bootstrap.route,
  currentRoute: WORKSPACE_ROUTES.banker,
  entitledRoutes: entitled.routes,
  includePortfolioSurface: managerEntitled,
});
```

A banker-only user (the Phase 124C `useManagerEntitlement` probe
returns `not-entitled`) has `entitled.routes === []`, so
`managerEntitled === false`, so the portfolio link is never added.
A manager-entitled banker (probe returns `entitled`) sees Banker
(current) + Manager (link) + Portfolio (link) in the sidebar.

## 5. Permission-before-render preserved

Every Phase 122 / 124 / 126B guard still runs on every page load:

- `AuthGate` resolves UPN → `cr664_platformuser` → primary
  workspace.
- `WorkspaceGate` admits the manager route only when it is the
  user's bootstrap-primary OR they pass the Phase 124C entitlement
  probe.
- `ManagerProvider` runs `loadManagerIdentity` and gates on a banker
  row + team FK.
- `ManagerDataProvider` scopes every query by `_cr664_team_value`.

None of these guards know or care about the `?surface=...` query
string. The Portfolio surface IS the same authorization scope as
the Manager surface; only the projection on the client changes.

## 6. What does NOT change

- No `WORKSPACE_ROUTES` constant change.
- No `App.tsx` change. No new route.
- No `WorkspaceGate` change.
- No `workspaceScreens` registry change.
- No new Dataverse schema. No new loader. No data-scope widening.
- No write affordance.
- No banker / team / executive / admin / shared cockpit change.
- Phase 124C `Manager Workspace` link route remains
  `/workspaces/manager` (no query) for callers that don't opt into
  portfolio.
- Phase 126B bootstrap-name default behavior is preserved when no
  surface query is present.

## 7. Edge case: portfolio-bootstrap user clicks "Manager Workspace"

When a portfolio-bootstrap user (workspaceName = 'Portfolio
Management') clicks the Manager Workspace link in the switcher, the
URL becomes `/workspaces/manager` (no query). Phase 126B's
bootstrap-name default kicks in → Portfolio cockpit still renders.

To explicitly request the Manager cockpit, a portfolio-bootstrap
user can navigate to `/workspaces/manager?surface=manager`.
Future polish (Phase 126D) could give the Manager Workspace link an
explicit `?surface=manager` URL when the switcher is rendered from
the portfolio surface. Phase 126C explicitly defers this so the
Phase 124C-tested `Manager Workspace` link route stays unchanged.

## 8. Tests landed (12 new)

| File | New tests | Pins |
|---|---|---|
| [src/bootstrap/workspaceEntitlements.test.tsx](../src/bootstrap/workspaceEntitlements.test.tsx) | +7 | Portfolio link absent without opt-in; absent for banker-only users even with opt-in; present for manager-entitled bankers; present for manager-bootstrap users; `isCurrent` toggles correctly via `currentSurface`; portfolio link route shares the manager path + appends `?surface=portfolio` |
| [src/workspaces/ManagerWorkspace.test.tsx](../src/workspaces/ManagerWorkspace.test.tsx) | +5 | `?surface=portfolio` query renders Portfolio cockpit (manager bootstrap); default no-query renders Manager cockpit (manager bootstrap); `?surface=manager` overrides a portfolio bootstrap (Phase 126B default skipped); Portfolio Workspace switcher link visible for manager-bootstrap users; data provider chain unchanged on the portfolio surface |

Existing tests still green:
- Phase 124C workspace switcher (3 tests) — link rendering unchanged
- Phase 124C `WorkspaceGate` (5 tests) — route-only check unchanged
- Phase 124C `LendingOSLayout` (6 tests) — hand-crafted link fixtures unchanged
- Phase 124E manager shell + Phase 126B bootstrap-name swap — all preserved
- Phase 126A portfolio cockpit (52 tests) — unchanged

Total Phase 126C pins added: **12** across two files.

## 9. Live walkthrough

1. **Manager-entitled banker** signs in to `/workspaces/banker`.
   Phase 124C entitlement probe returns `entitled`. Sidebar
   switcher now shows three links: **Banker Workspace** (current),
   **Manager Workspace**, **Portfolio Workspace**.
2. Click **Portfolio Workspace**. URL navigates to
   `/workspaces/manager?surface=portfolio`. `WorkspaceGate` admits
   (route is in entitled routes). `ManagerWorkspaceContent`
   reads the query → renders `<PortfolioCommandCenter>`. Switcher
   marks Portfolio as current.
3. Click **Manager Workspace**. URL navigates to
   `/workspaces/manager`. `ManagerWorkspaceContent` reads the empty
   query, falls through to Phase 126B default (manager bootstrap →
   Manager cockpit). Switcher marks Manager as current.
4. Click **Banker Workspace**. URL navigates to
   `/workspaces/banker`. BankerWorkspace mounts. Sidebar switcher
   shows the three links again.

For a **banker-only** user, the Portfolio Workspace link is **never
added**. Direct-URL navigation to
`/workspaces/manager?surface=portfolio` is bounced by
`WorkspaceGate` back to `/workspaces/banker` — exactly as
`/workspaces/manager` would be bounced today.

## 10. Acceptance

- [x] Manager-entitled users see a Portfolio Workspace switcher
      entry (banker workspace AND manager workspace sidebars)
- [x] Clicking Portfolio Workspace renders Portfolio Command Center
- [x] Clicking Manager Workspace renders Manager Bloomberg Control
      Panel (under default bootstrap behavior)
- [x] Both surfaces remain inside the ManagerProvider /
      ManagerDataProvider chain
- [x] Data remains team-scoped (no widening)
- [x] Banker-only users do NOT see the Portfolio link
- [x] `WorkspaceGate` still fails closed for non-entitled users
- [x] No write affordance added
- [x] No `WORKSPACE_ROUTES` change, no `App.tsx` change
- [x] `npm run build` clean
- [x] Targeted test suites pass — workspaceEntitlements (23),
      WorkspaceSwitcher (3), ManagerWorkspace (19), Portfolio (52),
      workspaceRoutes (31)
