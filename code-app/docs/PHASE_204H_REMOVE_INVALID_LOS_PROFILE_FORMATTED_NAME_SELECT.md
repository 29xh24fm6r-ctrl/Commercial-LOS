# Phase 204H — Remove Invalid LOS Profile Formatted-Name Select

## The live failure (found by the 204G diagnostic)

The Phase 204G read-only diagnostic printed the exact production error from the
admin entitlement query:

```
Could not find a property named 'cr664_losuserprofilename'
on type 'Microsoft.Dynamics.CRM.cr664_workspaceentitlements'.
```

The whole entitlement query failed — so the probe returned `failed`/`not-entitled`
and Admin Workspace never appeared.

## Root cause — generated model vs. live $select

The generated TypeScript model (`Cr664_workspaceentitlementsesModel.ts`) exposes
`cr664_losuserprofilename` as an **optional formatted/convenience property** on the
*extended* interface. But Dataverse does **not** allow that formatted property in a
`$select` for this table. Phase 204E added it to the live `$select` to use the
profile label as an identity signal; that select is rejected by Dataverse and
fails the entire request.

Formatted lookup labels like `…name` are generally returned via OData annotations
(`@OData.Community.Display.V1.FormattedValue`), not as selectable columns — so
naming them in `$select` is invalid for this entity.

## The fix

`cr664_losuserprofilename` is removed from **both** live `$select` lists (the
authorization probe and the 204G diagnostic) and is no longer mapped from the live
row. The live query now selects only valid fields:

- `cr664_entitlementname`
- `cr664_accesslevel`
- `cr664_workspacename`
- `_cr664_losuserprofile_value`
- `statecode`

with the unchanged filter `statecode eq 0 and (cr664_accesslevel eq 788190002 or
cr664_accesslevel eq 788190000)`.

The `AdminEntitlementCandidate.losUserProfileName` field is **kept** for pure
tests / backward compatibility, and `classifyCurrentUserIdentityMatch` still
supports the `profile-label-upn` signal for any candidate that naturally carries
the label. The live probe simply no longer requests or maps it.

## Identity attribution after 204H

With the profile label gone from live reads, a live admin row is attributed to the
current user by:

1. **user-specific entitlement name** — the name begins with the current user's
   full name (or email) + `" - Admin"`, e.g. `"Matthew Paller - Admin Full
   Access"`; **and/or**
2. **optional legacy profile-id** — when legacy LOS profile ids resolve for the
   user, `_cr664_losuserprofile_value` matching one of them.

All other gates are unchanged: active, Admin/Full option-set, admin workspace OR
strict admin name, and — still rejected — ckingma rows, generic
`"Executive Admin Access"`, owner-only rows, and inactive/ReadOnly rows. Owner is
never an authorization signal. No operator email is hard-coded into app code.

## Diagnostic behavior

A missing `losUserProfileName` is **not** a query failure: the diagnostic shows the
per-row profile label as `(blank)` and still reports `entitlementQuerySuccess:
true` when rows are returned.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
```
