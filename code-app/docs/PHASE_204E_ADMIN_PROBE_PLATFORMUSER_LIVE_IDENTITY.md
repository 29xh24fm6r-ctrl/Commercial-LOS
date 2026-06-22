# Phase 204E — Admin Probe Uses PlatformUser Live Identity

## Two different bugs, two different phases

- **Phase 204D** fixed the *access-level* gate: the probe read the optional
  formatted `cr664_accesslevelname` instead of the authoritative
  `cr664_accesslevel` option-set.
- **Phase 204E** fixes a *deeper* problem one layer up — the **identity chain**.

## The identity-chain mismatch

`bootstrapFlow.ts` documents the Phase 115 live contract: the deployed
environment seeds **`cr664_platformuser`**, not the legacy `cr664_user` table.
`cr664_user` is empty, and `cr664_losuserprofile` / `cr664_workspaceentitlements`
are no longer in the bootstrap resolution path.

The admin probe, however, still walked the **legacy chain**:

```
cr664_platformuser
  → _cr664_coreuser_value   (the legacy cr664_user link — BLANK in live env)
  → cr664_losuserprofiles   (by _cr664_user_value)
  → cr664_workspaceentitlements (by _cr664_losuserprofile_value)
```

Because `_cr664_coreuser_value` is blank on the live PlatformUser, the probe hit
`if (!coreUserId) return { kind: 'not-entitled' }` and **failed closed before it
ever looked at an entitlement** — even though the app boots normally and the
PlatformUser is valid. So Admin Workspace never appeared.

## The fix — align with the Phase 115 live identity

1. **Canonical identity = active PlatformUser.** The probe resolves
   `cr664_platformuser` by `cr664_email` (exactly like `bootstrapFlow.ts`) and
   treats that row — `{ upn, platformUserId, fullName }` — as the current user.
2. **No legacy requirement.** A blank `_cr664_coreuser_value` no longer fails the
   probe. The legacy LOS-profile lookup is now an **optional** signal, attempted
   only when the core-user link happens to be present, and a failed/empty optional
   read is non-fatal.
3. **No PlatformUser FK on entitlements.** `cr664_workspaceentitlements` carries no
   PlatformUser foreign key, so the probe queries **active Admin/Full** rows
   server-side (`statecode eq 0 and (cr664_accesslevel eq 788190002 or eq
   788190000)`) and attributes a row to the current user **client-side**.

## Identity attribution — strongest available SAFE signal

`matchesCurrentUserIdentity(currentUser, entitlement)` authorizes attribution iff
**any** of:

- **(a) profile-id match** — the entitlement's `_cr664_losuserprofile_value` is in
  the user's resolved LOS-profile id set (legacy chain; usually empty live);
- **(b) profile-label match** — `cr664_losuserprofilename` equals the UPN exactly
  (case-insensitive); the live LOS-profile label is the user's UPN;
- **(c) user-specific entitlement name** — the name begins with the user's full
  name or email followed by `" - Admin"` (e.g. `"Matthew Paller - Admin Full
  Access"`).

The **owner field is never an identity signal.** It is carried only for
diagnostics.

## Full authorization gate (after 204E)

An entitlement authorizes admin reachability iff **all** hold:

1. `active` (statecode = 0);
2. access level resolves to **Admin or Full** from the authoritative numeric
   `cr664_accesslevel` option-set (Phase 204D);
3. **EITHER** Workspace resolves to the admin route **OR** the entitlement name
   strictly resolves to admin (Phase 204C);
4. the row is **attributed to the current user** by a safe identity signal
   (Phase 204E).

This still rejects, by construction:

- another user's admin row (e.g. ckingma) — fails the identity gate;
- a generic `"Executive Admin Access"` row with no current-user signal;
- `Owner = <current user>` alone;
- Banker/Team Full rows (fail the admin name/workspace gate);
- inactive / ReadOnly rows.

## Fail-closed (preserved)

No UPN → false. Inactive PlatformUser or no PlatformUser → not-entitled. Entitlement
read failure → `failed` → not entitled. Unknown/missing access level → not
authorized. No widening for non-admin users; the admin route stays gated behind
`WorkspaceGate` + `isAdminConsoleAuthorized`. No email is hard-coded into app
authorization or rendering code — the probe derives the user from `bootstrap.upn`.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
```
