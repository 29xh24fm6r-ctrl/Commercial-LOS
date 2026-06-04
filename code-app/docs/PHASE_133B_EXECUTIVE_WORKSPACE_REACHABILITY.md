# Phase 133B — Executive Workspace reachability & entitlement seed

## Problem

Phase 133A built `ExecutiveCommandCenter` and mounted it in
`ExecutiveWorkspace`, but the live UI still shows only Banker / Team /
Manager / Portfolio. Executive Workspace is not visible in the switcher
and is not reachable.

## Root cause — it's a provisioning gap, not a code gap

The reachability code **already gates Executive correctly**. After
tracing the entitlement model end-to-end:

- **`workspaceRoutes.ts`** maps the Platform Workspace name
  `"Executive Dashboard"` → `/workspaces/executive` (pinned).
- **`bootstrapFlow.ts`** resolves the signed-in user via
  `cr664_platformuser` (matched by `cr664_email`), follows
  `_cr664_primaryworkspace_value` → `cr664_platformworkspace.cr664_workspacename`
  → `resolveWorkspaceRoute`, and sets `bootstrap.route`.
- **`deriveWorkspaceLinks`** builds the switcher from
  `allowed = { bootstrapRoute, ...entitledRoutes }`. When a user's
  bootstrap-primary route **is** `/workspaces/executive`, the Executive
  link is included and marked current.
- **`useEntitledRoutes`** only ever adds the **manager + team** routes
  (when the manager probe resolves `ready`). It **never** adds the
  executive route — so manager entitlement is *not* an executive proxy.
- **`WorkspaceGate`** admits `/workspaces/executive` only when it is the
  bootstrap-primary route, or when it is in `entitledRoutes` (which it
  never is). So non-executive users are bounced.

**Net:** an Executive-Workspace link/admission appears only for users
whose **primary workspace is "Executive Dashboard"**. The current test
user's primary workspace is not Executive Dashboard, so — correctly —
they see no Executive link. The fix is to **provision** the test user's
primary workspace, not to change the gating code.

## Entitlement representation

The platform supports **one primary workspace per user** today (Phase
115). There is no per-user "entitled workspaces" array. So Executive
entitlement is represented as:

> **`cr664_platformuser._cr664_primaryworkspace_value` → a
> `cr664_platformworkspace` whose `cr664_workspacename` = "Executive
> Dashboard".**

Per the spec, **manager/team entitlement is NOT used as a proxy** for
executive access — and the code already enforces that (`useEntitledRoutes`
never emits the executive route).

## What changed in this phase

- **No production code change.** `WorkspaceGate`, `workspaceEntitlements`,
  `workspaceRoutes`, `ExecutiveWorkspace`, and `ExecutiveDataProvider`
  are unchanged — the gating already behaves correctly.
- **Tests** added to pin the reachability contract (below).
- **This runbook** to provision an Executive-primary pilot user.
- The 6000-line operator script (`scripts/phase122-lookup-repair.mjs`)
  was **left untouched** — the platform-only-primary-workspace case is
  satisfied by the documented seed (spec Task 3, option 1), and the
  script's contract suite stays green.

## Operator runbook — make a pilot user Executive-primary

> **Discipline:** read first, write last. Confirm there is exactly one
> matching PlatformUser row and at most one "Executive Dashboard"
> PlatformWorkspace row before patching. Patch **only** the
> primary-workspace lookup. Use no bypass / suppress / force headers.

### Option A — Maker Portal (no script)

1. **Ensure the workspace exists.** Tables → `cr664_platformworkspace`.
   Confirm a single row with **Workspace name = "Executive Dashboard"**.
   If absent, create one row, setting **only** `cr664_workspacename =
   "Executive Dashboard"`. (The name must match the alias exactly — that
   is what `resolveWorkspaceRoute` maps to the executive route.)
2. **Find the user.** Tables → `cr664_platformuser`. Filter
   `cr664_email = <pilot user UPN>`. Confirm **exactly one** row. If zero
   or more than one, stop and resolve the ambiguity first.
3. **Set primary workspace.** On that single PlatformUser row, set the
   **Primary Workspace** lookup to the "Executive Dashboard" workspace
   from step 1. Save. Change no other field.
4. **Verify.** Have the pilot user re-launch the app. They should land
   on `/workspaces/executive`, see the Executive Command Center, and see
   the Executive item in the workspace switcher.

### Option B — direct OData PATCH (read-only-first)

Read first (confirm single rows):

```http
GET {env}/api/data/v9.2/cr664_platformusers?$select=cr664_platformuserid,cr664_email,_cr664_primaryworkspace_value&$filter=cr664_email eq '<UPN>'
GET {env}/api/data/v9.2/cr664_platformworkspaces?$select=cr664_platformworkspaceid,cr664_workspacename&$filter=cr664_workspacename eq 'Executive Dashboard'
```

If the PlatformUser query returns ≠ 1 row, or the workspace query
returns > 1 row, **stop**. If the workspace query returns 0 rows, create
exactly one with only the name:

```http
POST {env}/api/data/v9.2/cr664_platformworkspaces
{ "cr664_workspacename": "Executive Dashboard" }
```

Then patch **only** the primary-workspace lookup:

```http
PATCH {env}/api/data/v9.2/cr664_platformusers(<platformuserid>)
{ "cr664_PrimaryWorkspace@odata.bind": "/cr664_platformworkspaces(<workspaceid>)" }
```

The PATCH body contains **only** `cr664_PrimaryWorkspace@odata.bind`. No
other column is touched. No bypass headers.

> A future phase may add a `--seed-executive-entitlement` mode to
> `scripts/phase122-lookup-repair.mjs` (mirroring the guarded
> `--seed-manager-entitlement` mode: dry-run default, `--commit-…` flag,
> bail on ambiguous rows, minimal PATCH body, no bypass headers). It is
> intentionally **not** added here to keep this phase code-free and the
> script's pinned contract suite untouched.

## Reachability contract (pinned by tests)

- **`workspaceEntitlements.test.tsx` (Phase 133B):**
  - executive-primary user → `deriveWorkspaceLinks` includes the
    Executive link as current;
  - manager/team-entitled (non-executive) users get **no** Executive
    link;
  - `useEntitledRoutes` never emits the executive route even when the
    user is manager-entitled (no proxy).
- **`WorkspaceGate.test.tsx` (Phase 133B):**
  - executive-primary user is admitted to `/workspaces/executive`;
  - a manager-entitled non-executive user is **bounced** from
    `/workspaces/executive`;
  - a non-entitled user hitting the URL directly **fails closed**.
- **`workspaceRoutes.test.ts`:** "Executive Dashboard" → executive route
  (existing).
- **`ExecutiveWorkspace.test.tsx` (Phase 133A):** uses
  `ExecutiveDataProvider` only; no Manager/Banker operational provider
  imports (W2 isolation); data provider nested inside the identity
  boundary.

## Acceptance

```
npm test -- Executive ExecutiveWorkspace workspaceEntitlements WorkspaceGate workspaceRoutes phase122BScriptContract
npm run build
```

All target suites pass (399 tests in the target set; full suite 3847).
Build clean. **No permission widening. No manager/team entitlement proxy.
No Dataverse schema change. No write action shipped in the app.**

## Follow-up backlog

- Optional `--seed-executive-entitlement` guarded script mode (the
  scripted equivalent of the runbook above).
- A real per-user multi-workspace entitlement table, if/when the
  platform needs users to hold more than one workspace without the
  manager-probe derivation.
