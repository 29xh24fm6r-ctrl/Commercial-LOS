# Phase 170A -- Governed Platform User / Primary Workspace Provisioning Design

Date: 2026-06-15
Baseline: 4b21dd8 (Phase 169F). Design + certification only -- no code
behavior change, no deploy, no tag movement.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## 1. Executive Summary

- Real app access is governed by the signed-in user's PLATFORM USER
  PRIMARY WORKSPACE (`cr664_platformuser.cr664_PrimaryWorkspace`), which
  resolves to exactly one workspace route. Onboarding a person to the app
  means giving them a `cr664_platformuser` row whose primary workspace
  resolves to the workspace they should land in.
- App-level entitlement DISPLAY alone is insufficient. Writing
  `cr664_workspaceentitlements` rows does NOT grant access, because the
  bootstrap does not read an entitlements array -- it reads the single
  primary-workspace lookup. The Phase 169B admin panel therefore stays
  read-only/preview-only.
- Dataverse / Microsoft tenant SECURITY ROLES remain OUTSIDE the app.
  They must be assigned in the Power Platform admin center. No in-app or
  operator-script path grants security roles, and this design does not
  add one.

## 2. Current Runtime Access Model (confirmed)

Source of truth: `src/bootstrap/bootstrapFlow.ts`,
`src/bootstrap/WorkspaceGate.tsx`, `src/bootstrap/workspaceEntitlements.ts`.

1. Signed-in UPN -> platform user: bootstrap queries
   `cr664_platformusers` filtered by `cr664_email eq '<upn>'`. No row ->
   `NotProvisionedError` (the user cannot enter the app). This is the
   single gate that "adding a person" must satisfy.
2. Primary workspace -> route: bootstrap reads the user's primary
   workspace name and calls `resolveWorkspaceRoute(workspaceName)`
   (`src/bootstrap/workspaceRoutes.ts`), which maps a workspace name to
   one of `/workspaces/{banker,team,manager,executive,admin}` via an
   explicit alias map + conservative keyword fallback. Unmapped name ->
   `UnresolvedWorkspaceError` (fail closed; no default workspace).
3. WorkspaceGate enforces the boundary: a route renders only if it equals
   the bootstrap-resolved primary route OR an entitled additional route
   from `useEntitledRoutes()`. Today the only entitled additional routes
   are manager + team, and ONLY when `loadManagerIdentity(upn)` returns
   `ready` (a banker row with a populated team FK). Admin and executive
   are reached only as the bootstrap-PRIMARY route.
4. What `cr664_workspaceentitlements` does and does not do: it is a
   display/record table. The runtime access decision never reads it. So a
   "grant access" write must change the primary-workspace lookup (and/or
   the manager-identity predicate), NOT just add an entitlement row.
   Writing entitlement rows alone would be misleading.

## 3. Tables / Services / Fields

Known from the generated models (`src/generated/models/`) and the
operator script. Unknowns are marked explicitly -- nothing is invented.

### cr664_platformuser (`Cr664_platformusersService`)
Create (`Cr664_platformusersBase`, minus the PK) requires, per the
generated model:
- `cr664_email` (string) -- the UPN match key.
- `cr664_fullname` (string) -- display name.
- `cr664_activestatus` (boolean).
- `cr664_identitystatus` (choice `Cr664_platformuserscr664_identitystatus`).
- `cr664_createdat` (string / datetime).
- `cr664_PrimaryWorkspace@odata.bind` (string) -- REQUIRED lookup to
  `cr664_platformworkspaces`. This is the access driver.
- `ownerid` + `owneridtype` (required on the generated Base).
- `statecode` (choice).
Optional / unknown-at-design-time: `cr664_normalizedemail`,
`cr664_provisioningsource`, `cr664_CoreUser@odata.bind`,
`cr664_Role@odata.bind`, `cr664_Team@odata.bind`, `cr664_lastlogin`.
The exact accepted enum values for `cr664_identitystatus` and the
required-vs-defaulted behavior of `ownerid`/`owneridtype`/`statecode` at
the live Web API layer are UNKNOWN at design time and must be confirmed
against environment metadata before any create commit.

### cr664_platformworkspace (`Cr664_platformworkspacesService`)
- `cr664_workspacename` -- the name `resolveWorkspaceRoute` maps. The
  operator script's executive seed creates a workspace on commit with
  ONLY `cr664_workspacename` (mirrors the team create-on-commit pattern).
- `cr664_platformworkspaceid` -- PK used for the `@odata.bind`.

### cr664_workspaceentitlements (`Cr664_workspaceentitlementsesService`)
- Present and readable; NOT part of the access decision (see section 2).
  Out of scope for granting access. Display only.

### cr664_losuserprofile (`Cr664_losuserprofilesService`)
- Registered/readable. Relationship to platform user is UNKNOWN at design
  time; not required for the primary-workspace access path. Mark as a
  follow-up to confirm before any profile-linked write.

### Bind / identity fields summary
- Access bind: `cr664_PrimaryWorkspace@odata.bind` =
  `/cr664_platformworkspaces(<resolved id>)` -- the id is resolved at
  runtime from a stable workspace NAME, never hardcoded.
- Email/UPN field: `cr664_email`.
- Display name field: `cr664_fullname`.
- Active/status fields: `cr664_activestatus`, `cr664_identitystatus`,
  `statecode` (semantics to confirm in-environment).
- Owner: `ownerid` / `owneridtype` -- requirement to confirm in-environment
  (Dataverse usually defaults owner to the caller; the generated Base
  marks them required, so the script must handle both cases).

## 4. Proposed Operator-Safe Provisioning Flow

This generalizes the EXISTING, certified Phase 133C executive
primary-workspace seed (`runSeedExecutivePrimaryWorkspace` in
`scripts/phase122-lookup-repair.mjs`), which already implements the patch
half of this flow safely.

Inputs: `--upn` (email), `--workspace-name`, optional `--full-name`,
optional role/profile info ONLY if confirmed supported.

1. Dry-run by default. No write occurs without an explicit, mode-specific
   `--commit-*` flag (matching the existing script discipline). Even with
   the commit flag, every safety gate below must hold or the script bails.
2. Resolve the platform WORKSPACE by `cr664_workspacename`:
   - exactly one -> use its id.
   - zero -> require an existing workspace by default; create-on-commit is
     allowed ONLY with `cr664_workspacename` (the existing executive-seed
     pattern) and only when the resolved route is intended.
   - more than one -> BAIL (ambiguous).
3. Resolve the platform USER by `cr664_email`:
   - exactly one -> candidate for a primary-workspace patch.
   - zero -> CREATE is allowed ONLY when every required field in section 3
     is known and confirmed in-environment; otherwise BAIL with the exact
     missing-field list. (The current executive seed deliberately BAILS on
     a missing user; user-create is the net-new capability this design
     gates behind field confirmation.)
   - more than one -> BAIL (ambiguous).
4. If the user exists and its `_cr664_primaryworkspace_value` already
   equals the resolved workspace id -> NO-OP success (idempotent).
5. If the user exists and the primary workspace differs/missing -> plan a
   PATCH of ONLY `cr664_PrimaryWorkspace@odata.bind`, after confirmation.
   Never patch unrelated fields.
6. Verify by RE-READING the platform user and the resolved workspace and
   confirming the link, and (manually) that the user can open the intended
   workspace route. Print a verify log.
7. Audit: the script prints a full plan + exact Web API payloads in
   dry-run, and the verify read after commit, as the operator audit
   record (consistent with the existing script). No silent writes.

## 5. Idempotency Matrix

| Situation | Action |
| --- | --- |
| user exists + primary workspace already correct | no-op (success) |
| user exists + different / missing primary workspace | planned PATCH of `cr664_PrimaryWorkspace@odata.bind` only |
| user missing + workspace exists | planned CREATE only if all required platform-user fields are confirmed; else BAIL |
| workspace missing | BAIL by default; create-on-commit allowed only with `cr664_workspacename` and an intended route |
| duplicate user (>1 by email) | BAIL (operator resolves ambiguity) |
| duplicate workspace (>1 by name) | BAIL (operator resolves ambiguity) |
| missing required owner / profile / team / identity-status value | BAIL with the exact missing-field list |
| Dataverse security role absent | WARN only; never grant (out of app scope) |

## 6. In-App Admin Future

- The Phase 169B Admin User & Access panel stays READ-ONLY / preview-only
  until the operator script path is certified on a real pilot user.
- A future in-app write would require: a governed server-side / Custom API
  or Dataverse write adapter; a confirmation UI; an audit event written
  with the admin's resolved `systemUserId`; permission checks; and a
  fail-closed resolver for the workspace bind. It must reuse the same
  resolve-and-patch contract as the operator script.
- The in-app surface must NEVER claim to grant Power Platform / Dataverse
  security roles; that handoff stays in the Power Platform admin center.

## 7. Test / Smoke Plan

1. Dry-run one known pilot user (`--upn` + `--workspace-name`, no commit);
   confirm the planned PATCH/CREATE payload is correct and GUID-free in
   source (ids resolved at runtime).
2. Commit to a single TEST user only (mode-specific `--commit-*` flag).
3. Verify the test user can open the correct workspace route after
   sign-in.
4. Verify a non-entitled workspace still fails closed (WorkspaceGate
   bounce / `UnresolvedWorkspaceError`).
5. Verify the Admin console read-only User & Access list reflects the new
   primary workspace on next read.
6. Rollback: re-run the script to PATCH the primary workspace back to the
   prior value (captured in the pre-commit verify log). No schema or
   record deletion required; the operation is a single reversible lookup
   patch.

## 8. Proposed Future Phases

- 170A2 / 170B: implement the operator dry-run/commit script mode for
  general platform-user primary-workspace provisioning (generalize the
  executive seed; add the gated user-create only after the section-3
  required fields are confirmed in-environment).
- 170C: live test with one pilot user (dry-run, then commit to a test
  user, then verify sign-in + fail-closed).
- Later: in-app provisioning DESIGN only, after the operator path is
  certified -- never before.

## Existing Operator Script: Can It Be Extended Safely?

YES. `scripts/phase122-lookup-repair.mjs` is the established dry-run-first,
`--commit`-gated governed script. It ALREADY provisions a primary
workspace for executives (`runSeedExecutivePrimaryWorkspace`, Phase 133C)
and seeds manager entitlement (`runSeedManagerEntitlement`, Phase 124D),
both using the resolve-by-email / resolve-by-name / bail-on-ambiguity /
idempotent-no-op / patch-only-PrimaryWorkspace pattern this design
requires. The safe extension is to generalize that mode to any role's
primary workspace, and to add a GATED user-create branch only once the
section-3 required platform-user fields are confirmed in-environment. A
brand-new script is NOT needed.

## Safety Statement

No live in-app user provisioning. No users created. No `cr664_platformuser`
or `cr664_PrimaryWorkspace` patched. No `cr664_workspaceentitlements`
written. No Dataverse security roles granted. No Microsoft Graph. No
external HTTP/fetch. No schema/migrations. No hardcoded GUIDs. No
permission widening. No route change. No deploy. No tag created or moved.
This phase is design + governance documentation only.
