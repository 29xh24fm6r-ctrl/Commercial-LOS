# Phase 204C — Admin Entitlement Live Row Shape Resolver

## Why Phase 204 / 204B was insufficient

Phase 204/204B authorized admin reachability by resolving the entitlement's
**Workspace** lookup to the admin route. The live Maker Portal data proves that is
**not the live row shape**:

- `cr664_workspaceentitlements.Workspace` is **optional** and is frequently
  **blank** on real rows (e.g. "Banker Full Access", "Team Member Full Access",
  "Manager ReadOnly Access", "Executive Admin Access").
- The inline Workspace lookup does **not** return "Admin Control Center" even
  though that row exists in Platform Workspace.

So a probe that *requires* `Workspace → admin` would never authorize a real admin
whose entitlement carries meaning in its **name** with Workspace blank.

## Strict live-row-shape authorization model

`deriveHasAdminWorkspaceEntitlement({ userLosProfileIds, entitlements })`
(`src/admin/adminWorkspaceEntitlementQuery.ts`) authorizes admin reachability iff
at least one entitlement satisfies **all** of:

1. the entitlement is **Active** (statecode = Active);
2. its **LOS User Profile** matches the current user's resolved LOS profile id(s)
   — never the Owner field;
3. its **AccessLevel** is **Admin or Full** (not ReadOnly);
4. **EITHER** its Workspace name resolves (via the canonical `resolveWorkspaceRoute`)
   to the admin route **OR** its **Entitlement Name strictly resolves to admin
   access** (`strictAdminEntitlementName`).

`strictAdminEntitlementName(name)` is true when the name contains the standalone
word **"admin"** (case-insensitive, word-boundary), so:

| Entitlement Name | Resolves to admin name? |
|---|---|
| Matthew Paller - Admin Full Access | ✅ |
| Admin Full Access | ✅ |
| Admin Access | ✅ |
| Executive Admin Access | ✅ |
| Admin Control Center Access | ✅ |
| Banker Full Access | ❌ |
| Team Member Full Access | ❌ |
| Manager ReadOnly Access | ❌ |
| Administrator Reporting Access (unsafe substring) | ❌ |

## No owner / name / access-only authorization

The name resolver is **not** authorization on its own. The name path only
contributes to gate 4; gates 1–3 (active + current LOS profile match + Admin/Full)
must independently pass. Therefore:

- Entitlement **name alone** never authorizes (profile/active/access still gate).
- **AccessLevel alone** never authorizes (workspace OR name must resolve admin).
- **Owner = Matthew** never authorizes without a LOS-profile match.
- A different user's admin row (e.g. ckingma's) never authorizes Matthew.
- The **Workspace lookup is not required** — blank Workspace is fully supported.

## Fail-closed behavior (preserved)

No current LOS profile ids → false. Query failure → `failed` → not entitled.
Inactive entitlement → false. ReadOnly access → false. No widening for non-admin
users; the admin route stays an entitlement-gated additional route behind
`WorkspaceGate` + `isAdminConsoleAuthorized`.

## Live operator row shape (target)

The single Active entitlement that authorizes Matthew:

- **AccessLevel** = `Admin`
- **Entitlement Name** = `Matthew Paller - Admin Full Access`
- **IsDefault** = `No`
- **LOS User Profile** = `mpaller@oldglorybank.com`'s LOS profile (bind by GUID)
- **Workspace** = blank is acceptable (optional lookup)
- **Status** = `Active`

GUIDs / environment ids are recorded **outside the repository** in the operator
release record; the repo carries only redacted placeholders. No email is
hard-coded into app authorization or rendering code — the probe derives the user
from `bootstrap.upn`.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
```
