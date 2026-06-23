# Phase 204K — Four-Field Workspace Entitlement Read

## Direct Dataverse Web API evidence

The entity set is confirmed: `cr664_workspaceentitlements` →
`cr664_workspaceentitlementses`.

A direct Web API `$select` against this table establishes exactly which columns are
readable:

| `$select` includes | Result |
|---|---|
| `cr664_workspacename` | ❌ **query fails** |
| `cr664_losuserprofilename` | ❌ **query fails** |
| `cr664_entitlementname`, `cr664_accesslevel`, `_cr664_losuserprofile_value`, `statecode` | ✅ **query succeeds** |

The successful four-field response returns Matthew's **real** admin row:

- `cr664_entitlementname = "Matthew Paller - Admin Full Access"`
- `cr664_accesslevel = 788190002` (Admin)
- `statecode = 0` (Active)
- `_cr664_losuserprofile_value` = populated

So both formatted display/name fields are non-selectable on this table, and the
entitlement **name** is the live admin-workspace signal.

## What changed

The admin entitlement probe and the 204G diagnostic now read **exactly four
fields** from `cr664_workspaceentitlements`:

- `cr664_entitlementname`
- `cr664_accesslevel`
- `_cr664_losuserprofile_value`
- `statecode`

`cr664_workspacename` is **removed** from every `getAll` select list and is no
longer mapped onto candidates (Phase 204K). `cr664_losuserprofilename` was already
removed in Phase 204H. `workspaceName` stays optional/undefined on candidates so
the pure deriver's workspace branch and unit tests are unaffected.

The unchanged filter still narrows server-side to active Admin/Full rows:
`statecode eq 0 and (cr664_accesslevel eq 788190002 or cr664_accesslevel eq 788190000)`.

## Admin shape is the entitlement name

With no readable workspace label, admin shape is carried by
`strictAdminEntitlementName(entitlementName)` — the standalone word **"admin"**.
A row is then attributed to the current user by the entitlement-name prefix
(`fullName`/email + `" - Admin"`) or the optional legacy profile-id signal. This
still rejects, by construction:

- generic `"Executive Admin Access"` with no current-user signal;
- another user's row (e.g. ckingma);
- owner-only rows (owner is never an authorization signal);
- Banker/Team rows and inactive/ReadOnly rows.

No operator email is hard-coded into app code.

## Diagnostic

The 204G diagnostic now shows `workspaceName` as **"(not selected)"** and carries a
note: *"Workspace display name not selected; entitlement-name gate used."* A missing
workspace label is not a query failure. The visible build stamp is updated to:

```
Diagnostic build: Phase 204K / four-field workspace entitlement read / master 6d806e3
```

## Verification

```bash
pnpm test
npm run build
Get-ChildItem -Path dist/assets -Recurse -Include *.js | Select-String -Pattern "cr664_losuserprofilename|cr664_workspacename"
git diff --check
git status --short
```
