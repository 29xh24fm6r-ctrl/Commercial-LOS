# Phase 204B — Admin Workspace Live Reference Alignment

## Goal

Make Phase 204's admin entitlement probe recognize the live Platform Workspace
reference row **"Admin Control Center"** as the admin workspace route, and add an
idempotent operator data-repair that binds Matthew's Workspace Entitlement to that
existing row by GUID.

## Code alignment

### Canonical workspace-route resolver

`resolveWorkspaceRoute()` (`src/bootstrap/workspaceRoutes.ts`) is the canonical
resolver. It already maps the live Platform Workspace reference names to routes:

| Workspace Name (live reference row) | Route |
|---|---|
| Admin Control Center | `admin` |
| Banker Workspace | `banker` |
| Team Workspace | `team` |
| Manager Command Center | `manager` |
| Portfolio Management | `manager` (rendered as the portfolio surface) |
| Executive Dashboard | `executive` |

"Admin Workspace" also resolves to `admin` (substring fallback) for backward
compatibility.

### Authorization decision

`deriveHasAdminWorkspaceEntitlement({ userLosProfileIds, entitlements })`
(`src/admin/adminWorkspaceEntitlementQuery.ts`) authorizes admin **only** when an
entitlement satisfies **all four gates** — never from any single field:

1. **Active** entitlement (statecode = Active).
2. **Current LOS profile match** — the entitlement's `_cr664_losuserprofile_value`
   equals the signed-in user's resolved LOS profile id (not the owner field, not
   the entitlement name).
3. **Access level Admin or Full** (not ReadOnly).
4. **Resolved workspace route = admin** — the entitlement's workspace name passed
   through `resolveWorkspaceRoute()` equals the admin route (so the live "Admin
   Control Center" row counts; a non-admin workspace never does).

The live probe scopes the entitlement read to the user's LOS profile via the
chain `cr664_platformusers(email) → coreuser → cr664_losuserprofiles →
cr664_workspaceentitlements`, then re-checks all four gates in the pure decision.
A failed read returns `failed` → fail-closed (no link, no admin render).

**No email is hard-coded into app rendering** — the probe derives everything from
`bootstrap.upn`. Matthew's email appears only in the operator runbook below.

## Idempotent operator data repair

Run once by an authorized operator (Maker Portal at make.powerapps.com, or `pac`).
It is **idempotent**: it finds-or-updates a single entitlement and re-running it
makes no further change. It performs no schema change; it binds existing rows.

1. **Find the Platform Workspace** reference row where
   `Workspace Name = "Admin Control Center"`. Record its GUID
   (`<admin-control-center-workspace-id-redacted>`). Do **not** create a new
   workspace row — bind to the existing one by GUID.

2. **Find the LOS User Profile** for `mpaller@oldglorybank.com`
   (`cr664_losuserprofiles`, reached via the platform user's core user). Record
   its GUID (`<matthew-los-user-profile-id-redacted>`).

3. **Create or update** the Workspace Entitlement (`cr664_workspaceentitlements`)
   for that profile + workspace. If a row already exists for
   (LOS User Profile = Matthew, Workspace = Admin Control Center), **update** it;
   otherwise **create** it, with:
   - **Entitlement Name** = `Matthew Paller - Admin Full Access`
   - **AccessLevel** = `Admin`
   - **IsDefault** = `No`
   - **LOS User Profile** = Matthew's LOS User Profile (bind by GUID)
   - **Workspace** = Admin Control Center Platform Workspace (bind by GUID)
   - **Status** = `Active`

4. **Verify**: the entitlement is Active, AccessLevel Admin, bound to Matthew's
   LOS profile and the Admin Control Center workspace. After this + `pac code
   push`, the Admin Workspace link appears in Matthew's switcher and the admin
   surfaces (including the V1 Activation Readiness panel) render for him.

Redaction: GUIDs / environment ids are recorded **outside the repository** in the
operator's release record; the repo carries only redacted placeholders.

## What did not change

No schema, migration, or Dataverse metadata. No new route or entitlement field.
No app-rendered email. No fake/sample data. No broad write enablement. Admin
remains an entitlement-gated additional route, fail-closed for everyone else.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
pac code push   # operator-run; publishes the resolver/probe alignment to the live app
```
