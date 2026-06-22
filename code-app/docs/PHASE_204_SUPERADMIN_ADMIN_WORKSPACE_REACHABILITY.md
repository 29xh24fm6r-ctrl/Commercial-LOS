# Phase 204 — Superadmin / Admin Workspace Reachability

## Goal

Make the existing `AdminWorkspace` reachable in the live PAC-published app for
authorized **superadmin / admin** users only, via the workspace switcher —
without widening access for non-admin users.

## Problem

The workspace switcher (`deriveWorkspaceLinks` in
`src/bootstrap/workspaceEntitlements.ts`) renders Banker / Team / Manager /
Portfolio for `mpaller@oldglorybank.com`, but never Admin. Admin was the only
workspace key with **no entitlement probe**: the switcher shows the admin link
only when the admin route is in the user's allowed set, and the allowed set was
`{ bootstrap primary route } ∪ { manager-probe routes }`. Admin was therefore
reachable only when admin was the user's *primary* workspace — never as an
additional entitlement — so a banker-primary superadmin never saw it.

## Root cause

`useEntitledRoutes()` only ran the manager probe (`loadManagerIdentity`) and
pushed `manager` + `team`. There was no admin entitlement probe, and
`isAdminConsoleAuthorized(route)` only accepted admin as the **primary** route.

## What changed

1. **Admin entitlement probe** — `src/admin/adminWorkspaceEntitlementQuery.ts`:
   `loadAdminWorkspaceEntitlement(upn)` (read-only, fail-closed) resolves whether
   the user holds an existing **Admin-workspace entitlement** (workspace resolves
   to admin AND access level is `Full`/`Admin`) via the existing entitlement
   chain `cr664_platformusers → coreuser → cr664_losuserprofiles →
   cr664_workspaceentitlements`. A pure `deriveHasAdminWorkspaceEntitlement()`
   makes the decision testable. No new schema, no write, SDK loaded via dynamic
   import.

2. **Entitled routes** — `src/bootstrap/workspaceEntitlements.ts`: added
   `useAdminEntitlement()` (module-cached, like the manager probe) and extended
   `useEntitledRoutes()` to push `WORKSPACE_ROUTES.admin` **only** when the admin
   probe returns `entitled`. The switcher then surfaces the Admin Workspace link
   automatically (admin was already in `LINK_META` / `LINK_ORDER`).

3. **Console authorization** — `isAdminConsoleAuthorized(route, adminEntitled?)`
   now also authorizes admin-entitled users (the same probe that let
   `WorkspaceGate` admit them). `AdminOperationsConsole` passes the entitlement
   flag. `adminEntitled` defaults to `false` → fail-closed for any caller that
   omits it.

## Fail-closed guarantees (preserved)

- Non-admin users get `not-entitled` / `failed` from the probe → admin route is
  **never** added to `entitledRoutes` → no Admin link in the switcher.
- `WorkspaceGate allowed={admin}` still bounces any user who is neither
  primary-admin nor admin-entitled → non-admin users cannot render AdminWorkspace
  by direct navigation.
- A failed probe is reported as `failed` (never coerced to entitled) — no link is
  leaked on error.
- The V1 Activation Readiness panel (Phase 203) remains mounted only inside the
  admin-gated `AdminWorkspace`; it renders only for users who can reach the admin
  route, never for non-admin users.
- Manager / team / portfolio-only users (manager probe entitled, admin probe
  not) do not receive the admin route.

## What did NOT change

No new schema, migrations, or Dataverse metadata. No new route, entitlement
field, or workspace access rule (the admin probe surfaces an entitlement the user
already holds; the workspace route count is unchanged at 5). No fake/sample data,
no write capability, no connector dependency, no Salesforce/nCino user-facing
copy. `AdminProvider` and the existing admin-only surfaces are unchanged.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
pac code push   # operator-run: publishes the workspace-switcher change to the live app
```

`pac code push` is operator-run against the authenticated environment; it is the
step that makes the Admin Workspace link appear in the live switcher for
authorized admins. Live entitlement data (the user's Admin-workspace entitlement)
is verified by the operator after push.
