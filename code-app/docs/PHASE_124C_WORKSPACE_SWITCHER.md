# Phase 124C — Workspace Switcher Entry Point

## 1. Problem

The Manager Bloomberg Control Panel (Phase 124A/124B) is mounted
behind `WORKSPACE_ROUTES.manager` and visually complete, but **there
is no visible UI entry point** for a banker who is also entitled to
the manager workspace to navigate there. The Lending OS sidebar pill
hardcodes the literal string "Banker Workspace" and is not a link, so
clicking it does nothing.

## 2. Goal

Add a safe, permission-before-render workspace switcher in the
Lending OS sidebar AND the Manager workspace header, so an entitled
user can move between workspaces without typing routes manually.

## 3. Constraints

- No Dataverse schema change.
- No `WORKSPACE_ROUTES` constant change.
- No banker cockpit refactor.
- No `ManagerBloombergControlPanel` refactor.
- No silent permission widening — the switcher must NEVER expose a
  workspace the user is not entitled to.

## 4. Design

The Phase 115 bootstrap chain surfaces **one** workspace per
signed-in user via `cr664_platformuser._cr664_primaryworkspace_value`.
The codebase does not carry a per-user "entitled workspaces" array.
Phase 124C takes the user's explicit fallback for that situation:

> Render a visible Manager Workspace link only when existing
> entitlement data already proves manager access. Do not hardcode a
> manager link for everyone.

The "existing entitlement data that proves manager access" is the
`loadManagerIdentity(upn)` probe (Phase 14) that `ManagerProvider`
already runs inside the manager workspace. If the probe returns
`kind: 'ready'`, the user is — by the same definition the manager
surface itself enforces — entitled to enter the manager workspace.

### 4.1 Module: `src/bootstrap/workspaceEntitlements.ts`

- `useManagerEntitlement()` — React hook that probes
  `loadManagerIdentity(upn)` once per UPN (module-level cache),
  returning `{ kind: 'loading' | 'entitled' | 'not-entitled' | 'failed' }`.
- `useEntitledRoutes()` — convenience hook that wraps
  `useManagerEntitlement` and returns
  `{ kind: 'loading' | 'ready'; routes: ReadonlyArray<string> }`.
  Today the only route ever appended is `WORKSPACE_ROUTES.manager`,
  and only when the manager probe returns `entitled`.
- `deriveWorkspaceLinks({ bootstrapRoute, currentRoute, entitledRoutes })` —
  pure function that returns an ordered `WorkspaceLink[]` (banker →
  team → manager → executive → admin catalog order; dedup; honest
  `isCurrent` flag).
- `_resetWorkspaceEntitlementCacheForTests()` — test-only helper to
  clear the module-level probe cache.

The cache means a manager-entitled banker who visits four pages in
the banker workspace and then clicks "Manager Workspace" pays exactly
one extra Dataverse round-trip across the entire session — and that
round-trip is the same `loadManagerIdentity` call `ManagerProvider`
was going to run anyway.

### 4.2 `WorkspaceGate` widening

[WorkspaceGate.tsx](../src/bootstrap/WorkspaceGate.tsx) was a hard
boundary that bounced any non-bootstrap-primary navigation. Phase
124C widens it honestly:

```
allow if:
  route === allowed                            // bootstrap-primary (unchanged)
  OR entitled.routes.includes(allowed)         // probed entitlement
otherwise:
  Navigate to bootstrap.route
while entitlement probe is loading:
  show loading state (don't bounce-then-render)
```

This avoids the failure mode where an entitled banker clicks the
manager link, the gate sees `route !== allowed`, and bounces them
back to banker before the entitlement probe has a chance to settle.

### 4.3 Shared `WorkspaceSwitcher` component

[WorkspaceSwitcher.tsx](../src/bootstrap/WorkspaceSwitcher.tsx)
renders the `WorkspaceLink[]` as:

- A `<nav aria-label="Workspace switcher">` wrapper.
- The current workspace as a `<span aria-current="page">`. Never a
  navigation link.
- Each non-current workspace as a `<Link to={route}>`.
- Each item carries `data-workspace-link-key` (stable id) and
  `data-workspace-link-current` ("true" / "false") for tests.

Two visual tones:

- `tone="dark"` — for the Lending OS dark sidebar (rendered in the
  banker workspace).
- `tone="light"` — for the Manager workspace header (white surface).

The switcher does NOT compute entitlements itself. Callers pass the
already-derived `links` so each shell controls its own surface.

### 4.4 `LendingOSLayout` integration

[LendingOSLayout.tsx](../src/banker/LendingOSLayout.tsx) gains an
optional `workspaceLinks?: ReadonlyArray<WorkspaceLink>` prop.

- `undefined` OR `length <= 1` → render the existing static
  `CurrentWorkspacePill` (preserve current visual; do not imply the
  card is clickable).
- `length >= 2` → render the `WorkspaceSwitcher` in `tone="dark"`
  instead of the pill.

### 4.5 `BankerWorkspace` wiring

[BankerWorkspace.tsx](../src/workspaces/BankerWorkspace.tsx) computes
`workspaceLinks` via `useEntitledRoutes()` + `deriveWorkspaceLinks()`
and forwards them through `BankerShell` → `LendingOSLayout`.
Single-workspace bankers continue to see the static pill (`links`
has length 1).

### 4.6 `ManagerWorkspace` header

[ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx)
computes the same `workspaceLinks` and renders the `WorkspaceSwitcher`
(in `tone="light"`) above the Manager identity / team block when
`links.length >= 2`. This is the return-navigation path so an
entitled banker can switch back to their bootstrap-primary workspace
from inside the manager workspace.

## 5. What does NOT change

- No banker cockpit refactor (DealHeader / DealMetricDeck /
  DealAutopilotPanel / DealBlockers / BankerDealWorkspace untouched).
- No `ManagerBloombergControlPanel` refactor — it continues to render
  as the first card in `ManagerWorkspaceContent`, unchanged.
- No Portfolio / Team / Executive surface refactor.
- No new Dataverse schema. The `loadManagerIdentity` probe is the
  same row read `ManagerProvider` already runs.
- No new route. The switcher links to existing
  `WORKSPACE_ROUTES.banker` / `WORKSPACE_ROUTES.manager` etc.
- No `BankerDealWorkspace` modification. The per-deal Lending OS
  shell continues to render the static workspace pill; users navigate
  back to the workspace home via the existing breadcrumb to reach the
  switcher. Adding the switcher to the per-deal shell would require
  threading `useBootstrap()` through the deal route, which is out of
  Phase 124C scope.
- No write affordance anywhere. The switcher is pure navigation.

## 6. Tests landed in Phase 124C

| File | Tests | Coverage |
|---|---|---|
| [src/bootstrap/workspaceEntitlements.test.tsx](../src/bootstrap/workspaceEntitlements.test.tsx) | 16 | Pure `deriveWorkspaceLinks` (catalog order, dedup, isCurrent, unknown-route guard); `useManagerEntitlement` (loading / entitled / not-entitled — not-banker / no-team / failed / throws / cache shared per upn); `useEntitledRoutes` (loading wait, manager route inclusion only when entitled) |
| [src/bootstrap/WorkspaceGate.test.tsx](../src/bootstrap/WorkspaceGate.test.tsx) | 5 | Bootstrap-primary fast path; entitlement widening for manager-entitled banker; loading state during probe; fail-closed bounce when not entitled; no widening on probe failure |
| [src/bootstrap/WorkspaceSwitcher.test.tsx](../src/bootstrap/WorkspaceSwitcher.test.tsx) | 3 | Current item is a static `<span aria-current>` (never a link); non-current items are `<Link>`s to their route; light + dark tones render with distinct `data-workspace-switcher` attributes |
| [src/banker/LendingOSLayout.test.tsx](../src/banker/LendingOSLayout.test.tsx) | 6 | Static pill preserved for undefined / single-link cases; switcher rendered for 2+ links in dark tone; manager link `href` matches `WORKSPACE_ROUTES.manager`; no manager link leaks when only banker is supplied; existing dark sidebar nav + identity card preserved |

Existing tests still green:

- [BankerShell.test.tsx](../src/banker/BankerShell.test.tsx) — 15 tests (Phase 125F shell invariants)
- [bootstrapFlow.test.ts](../src/bootstrap/bootstrapFlow.test.ts) — 12 tests
- [workspaceRoutes.test.ts](../src/bootstrap/workspaceRoutes.test.ts) — 25 tests
- [BankerDealWorkspace.test.tsx](../src/deals/BankerDealWorkspace.test.tsx) — 10 tests
- [BankerDealWorkspace.intelligence.test.tsx](../src/deals/BankerDealWorkspace.intelligence.test.tsx) — 8 tests
- Phase 123A/B/C + Phase 124A/B suites — all green

## 7. Deploy / demo checklist

### 7.1 Pre-flight

- [ ] Manager-entitled tester has a `cr664_Banker` row with a
      populated `cr664_Team` lookup. `loadManagerIdentity` returns
      `kind: 'ready'` for that UPN.
- [ ] Banker-only tester has a `cr664_Banker` row WITHOUT a team
      lookup, OR no banker row at all. `loadManagerIdentity` returns
      `not-banker` or `no-team`.

### 7.2 Walkthrough

1. **Banker-only user** signs in. The Lending OS sidebar shows the
   existing static workspace pill (Banker Workspace + the bootstrap
   workspace name). No Manager link. Typing `/workspaces/manager`
   into the address bar bounces back to `/workspaces/banker` (the
   existing W3 contract).
2. **Manager-entitled banker** signs in. While the entitlement probe
   resolves (one Dataverse round-trip), the static pill renders.
   When the probe settles to `entitled`, the sidebar replaces the
   pill with a workspace switcher showing **Banker Workspace** (current,
   aria-current="page") and **Manager Workspace** (link).
3. Click **Manager Workspace**. Navigation goes to
   `/workspaces/manager`; `WorkspaceGate` admits because
   `entitled.routes.includes(allowed)`. `ManagerWorkspace` mounts
   and renders the Bloomberg Control Panel.
4. In the manager workspace header, the same switcher renders in
   light tone with **Banker Workspace** as a link and **Manager
   Workspace** as the aria-current item. Click Banker Workspace to
   return.

### 7.3 Edge cases

- **Probe in flight on a direct-URL manager visit.** The gate renders
  the loading state ("Resolving workspace entitlements…") instead of
  bouncing. Once the probe settles, the manager workspace mounts.
- **Probe failed.** The switcher hides the manager link. The gate
  bounces direct-URL navigation back to banker. No silent widening
  on failure.
- **Single-workspace user.** The switcher does not render; the
  static pill stays.

### 7.4 Rollback

- Remove the `<WorkspaceSwitcher>` block from
  `ManagerWorkspaceContent` and revert `BankerWorkspace.tsx` to
  pass `workspaceLinks={undefined}` (or remove the prop entirely).
  The pill returns; the workspace gate is the only file that
  carries the entitlement-widened allow check.
- The full rollback of the widening is a one-line revert in
  `WorkspaceGate.tsx`. Bootstrap remains untouched.

## 8. Acceptance

- [x] Manager-entitled bankers can reach the Manager Bloomberg Control
      Panel from a visible UI element (the sidebar switcher).
- [x] Banker-only users do NOT see a Manager link.
- [x] Direct-URL navigation to `/workspaces/manager` works for entitled
      bankers; bounces to banker for non-entitled.
- [x] No fake widening when the entitlement probe fails or returns
      `not-banker` / `no-team`.
- [x] `npm test -- src/bootstrap src/banker/LendingOSLayout src/banker/BankerShell`
      green.
- [x] `npm run build` green.
- [x] Phase 123A/B/C + Phase 124A/B suites all still green.
