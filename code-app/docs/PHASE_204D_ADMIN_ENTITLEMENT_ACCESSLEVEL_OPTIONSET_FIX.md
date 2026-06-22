# Phase 204D — Admin Entitlement AccessLevel Option-Set Fix

## The live failure

After Phase 204C, Admin Workspace still did not appear for an operator whose
live Workspace Entitlements row visibly reads **AccessLevel = Admin**. Code
inspection found the cause in the live probe's access-level gate, **not** in the
authorization logic.

The probe selected and evaluated **`cr664_accesslevelname`** — the *formatted*
display name of the access-level choice. The generated Dataverse model
(`Cr664_workspaceentitlementsesModel.ts`) shows that the authoritative field is
the option-set **`cr664_accesslevel`**:

| Option-set value | Meaning |
|---|---|
| `788190000` | Full |
| `788190001` | ReadOnly |
| `788190002` | Admin |

`cr664_accesslevelname` lives on the *extended* (formatted) interface and is
**optional**. The Power Apps data client frequently does **not** return formatted
name fields unless explicitly annotated, so `accessLevelName` arrived `undefined`
at runtime. The gate `ADMIN_ACCESS_LEVEL_NAMES.has(accessLevelName)` then failed
even though the row's real `cr664_accesslevel` was `788190002` (Admin).

## The correction

1. **Select the authoritative field.** The live query now selects
   `cr664_accesslevel` (the numeric option-set) instead of the optional
   `cr664_accesslevelname`.
2. **Map the option-set.** `ACCESS_LEVEL_OPTION_SET` mirrors the generated model
   (`788190000→Full`, `788190001→ReadOnly`, `788190002→Admin`).
3. **Normalize to a kind.** `resolveAccessLevelKind(accessLevel, accessLevelName)`
   returns `'Full' | 'Admin' | 'ReadOnly' | 'Unknown'`, preferring the numeric
   option-set value, accepting a numeric string, and falling back to the string
   name **only** for pure unit tests. Anything unrecognized → `'Unknown'` (fail
   closed).
4. **Gate on the kind.** The deriver admits only `ADMIN_ACCESS_LEVEL_KINDS`
   (`Full`, `Admin`).

`AdminEntitlementCandidate` now carries `accessLevel?: number | string` (the
authoritative value) alongside the legacy `accessLevelName?: string` fallback.

## Authorization is unchanged in spirit

Authorization still passes only when **all** gates hold (defense in depth — never
from name, access level, or owner alone):

1. `active === true`;
2. the entitlement's LOS user profile matches the current user's profile (never
   the Owner field);
3. the access level resolves to **Admin or Full** — now from the authoritative
   numeric `cr664_accesslevel`, with the string name as a test-only fallback;
4. **EITHER** the Workspace name resolves to the admin route **OR** the entitlement
   name strictly resolves to admin access (`strictAdminEntitlementName`).

ReadOnly (`788190001`) and any unrecognized / missing value resolve to a
non-admin kind and never authorize. A different user's Admin row still never
authorizes the current user (profile gate). No email is hard-coded into app
authorization or rendering code; the probe derives the user from `bootstrap.upn`.

## Live query select (after 204D)

- `cr664_entitlementname`
- `cr664_accesslevel`  ← authoritative option-set (was `cr664_accesslevelname`)
- `cr664_workspacename`  ← still one of the two OR conditions
- `_cr664_losuserprofile_value`
- `statecode`

## Fail-closed behavior (preserved)

No current LOS profile ids → false. Query failure → `failed` → not entitled.
Inactive entitlement → false. ReadOnly / Unknown access → false. No widening for
non-admin users; the admin route stays an entitlement-gated additional route
behind `WorkspaceGate` + `isAdminConsoleAuthorized`.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
```
