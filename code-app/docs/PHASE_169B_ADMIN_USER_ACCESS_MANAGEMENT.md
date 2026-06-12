# Phase 169B -- Admin User & Access Management

Date: 2026-06-12
Baseline: c18b587 (Phase 169A). V1.0 tag v1.0.0-controlled-pilot at faf26d6.

## Investigation Result: CASE B (read path exists; no safe governed write)

A read path for app-level users and entitlements exists and is now
surfaced read-only. A safe, governed app-level entitlement WRITE path is
NOT proven, so the grant action stays preview-only with an explicit
blocker.

### Why Case B, not Case A

The generated SDK does expose `create()` / `update()` for
`Cr664_platformusersService` and `Cr664_workspaceentitlementsesService`.
That is a raw CRUD service, not a safe governed write, for three reasons:

1. Access is driven by `cr664_platformuser.cr664_PrimaryWorkspace`
   (Phase 115 single-workspace-per-user bootstrap), NOT by the
   `cr664_workspaceentitlements` table -- `src/bootstrap/workspaceEntitlements.ts`
   states the bootstrap does not read an entitlements array. Writing an
   entitlement record would therefore NOT grant a user access. Presenting
   it as "grant access" would be a misleading write.
2. Creating a `cr664_platformuser` requires a non-optional
   `cr664_PrimaryWorkspace@odata.bind` plus `ownerid` / `owneridtype`,
   `cr664_identitystatus`, `cr664_activestatus`, and `cr664_createdat`.
   That is high-impact identity provisioning, which the codebase
   deliberately routes through governed operator seed scripts
   (Phase 115 / Phase 121), not the app runtime.
3. No governed, audited app-level entitlement write adapter exists. Every
   GOVERNED_WRITES entry today is deal / document / memo / activity.

Standing up an access-granting live write is therefore its own dedicated,
audited governed-write phase. Phase 169B does not enable any write.

## Exact Tables / Services Found

Read (registered data sources, generated `getAll` services):

- `cr664_platformusers` (`Cr664_platformusersService.getAll`) -- app users.
- `cr664_workspaceentitlementses`
  (`Cr664_workspaceentitlementsesService.getAll`) -- entitlement records.
- `cr664_platformworkspaces`, `cr664_losuserprofiles`, `cr664_bankers`,
  `cr664_teams` -- registered, available for future bind resolution.

Write (present in SDK but NOT safely usable here):

- `Cr664_platformusersService.create/update` -- requires a resolved
  `PrimaryWorkspace` bind + identity fields (see above).
- `Cr664_workspaceentitlementsesService.create/update` -- does not drive
  access; misleading as a "grant".

## What Is Read-Only (delivered)

`src/admin/UserAccessManagementPanel.tsx` (mounted inside the authorized
branch of `AdminOperationsConsole`) shows:

- Real summary counts (app users, workspace entitlements). "Not available"
  on read failure (fail closed); "Loading..." while in flight.
- A read-only users table (name, email, primary workspace, active status).
- A read-only entitlements table (entitlement, access level, workspace,
  profile).
- Least-privilege reads: each query selects only display fields, orders
  deterministically, and caps rows at `ADMIN_USER_ACCESS_ROW_CAP` (100).

No fabricated counts or sample users -- every row comes from a live read.

## What Is Writable

Nothing. `USER_ACCESS_LIVE_WRITE_ENABLED = false`. The grant form is
preview-only: the inputs are editable so an admin can see the required
data, but the submit button is disabled and the blocker is shown. The
pure `buildGrantAccessPreview()` plans only allowed app-level fields
(`cr664_email`, `cr664_fullname`, `cr664_entitlementname`,
`cr664_accesslevel`), never emits a GUID, and describes lookups as
server-side resolution by stable identifier.

## Exact Blocker (preview-only)

> No governed app-level entitlement write adapter exists yet. App access
> is driven by cr664_platformuser.cr664_PrimaryWorkspace (Phase 115), not
> the entitlements table, and creating a platform user requires a resolved
> PrimaryWorkspace bind plus identity fields that are provisioned through
> governed operator seed scripts (Phase 115 / 121). A live grant must wait
> for a dedicated, audited governed-write phase.

Next safe step (future phase): build a governed, admin-gated, audited
write that (a) resolves `PrimaryWorkspace` from a stable workspace name
(no hardcoded GUID, fail closed on zero/multiple), (b) sets the user's
`cr664_PrimaryWorkspace` to actually change access, (c) writes a
`cr664_AuditEvent` with the admin's resolved `systemUserId`, (d) returns
a typed outcome union, and (e) is gated on the admin write identity.

## Dataverse Security Role Disclaimer

The panel keeps a visible disclaimer: this manages LOS app-level
entitlements only; it does not grant Microsoft tenant access or Dataverse
security roles, which must be managed in the Power Platform admin center.

## Guardrails Honored

- No Dataverse security bypass; no Microsoft tenant or Dataverse security
  role assignment.
- No Graph; no external HTTP/fetch (pinned by source tests).
- No hardcoded GUIDs (pinned by source + preview tests).
- No fake users / no fake entitlements -- reads are live, fail closed.
- No permission widening; admin-gated by the existing route + console gate.
- + New Deal untouched and still disabled.
- Portfolio / CRM write enablement untouched.
- No bulk import.
- No live write enabled.

## Files Changed

- `src/admin/adminUserAccessModel.ts` -- preview model + disclaimers + blocker.
- `src/admin/adminUserAccessQueries.ts` -- read-only loaders (fail closed).
- `src/admin/UserAccessManagementPanel.tsx` -- read-only panel + preview form.
- `src/admin/AdminOperationsConsole.tsx` -- mounts the panel.
- `src/admin/adminUserAccessModel.test.ts`,
  `src/admin/adminUserAccessQueries.test.ts`,
  `src/admin/UserAccessManagementPanel.test.tsx` -- tests.
- `src/admin/AdminOperationsConsole.test.tsx` -- updated for the panel.
- `src/shared/governance/releaseCandidateSnapshot.test.ts` -- doc pin.
- `docs/PHASE_169B_ADMIN_USER_ACCESS_MANAGEMENT.md` -- this doc.

## Route Delta

0. The panel renders inside the existing `/workspaces/admin` route. No
router file changed; no new route added.

## Validation

- `npm test -- Admin admin releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Deploy / Tag / Connector

No deploy in this phase. No tag created or moved
(`v1.0.0-controlled-pilot` stays at `faf26d6`). No runtime connector
enabled. No schema, migration, or Dataverse record created. No permission
widened.
