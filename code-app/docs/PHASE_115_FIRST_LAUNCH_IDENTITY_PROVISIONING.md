# Phase 115 — First-Launch Identity Provisioning Unblock

**Status:** **Shipped (narrow code fix + provisioning recipe).** The
deployed app from Phase 113 was hitting an AuthGate dead-end —
"Access not provisioned — No LOS profile exists for
mpaller@oldglorybank.com" — because `bootstrapFlow.ts` was reading
from the legacy `cr664_user` table while the live environment had
only seeded the modern `cr664_platformuser` table. This phase
switches the bootstrap chain to the canonical seeded table, adds
the test coverage the bootstrap layer was missing, and documents
the minimal provisioning recipe an admin actually needs.

**This is Option B from the brief — a narrow bootstrap fix, not a
documentation-only recipe.** The schema inspection in §2 explains
why.

**No email-lane changes. No fallback dashboards. No weakening of
permission-before-render.** The new bootstrap chain still fails
closed on every broken link; AuthGate's NotProvisionedError and
UnresolvedWorkspaceError paths are unchanged.

Related canonical sources:
- [PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md) — the deployment runbook that produced the failure this phase fixes. §F.3 was updated in this commit to reference Phase 115 + the new provisioning recipe.
- [src/bootstrap/bootstrapFlow.ts](../src/bootstrap/bootstrapFlow.ts) — the modified file.
- [src/bootstrap/bootstrapFlow.test.ts](../src/bootstrap/bootstrapFlow.test.ts) — new test file, 12 assertions covering the new chain + fail-closed contract.
- [src/bootstrap/AuthGate.tsx](../src/bootstrap/AuthGate.tsx) — UNCHANGED. Same error states surface; only the underlying chain that triggers them changed.
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — one stale prose line in the borrower-portal compound NOT_WIRED entry updated to reflect Phase 115.

---

## 1. The problem (what was actually failing)

The Phase 113 §G.4 first-launch validation reached AuthGate, which
ran `runBootstrap()` — and stopped at:

```
Access not provisioned — No LOS profile exists for mpaller@oldglorybank.com.
```

That message comes from the `NotProvisionedError` path of
AuthGate; the underlying root cause was that the original chain
(Phases 4 / 8 / 32) queried:

```ts
// pre-Phase-115 chain
1. ctx.user.userPrincipalName                              // 'mpaller@oldglorybank.com'
2. Cr664_usersService.getAll({ filter: `cr664_email eq '<upn>'` })  // ← returns 0 rows
3. → throw NotProvisionedError(upn)
```

The next step would have been `Cr664_losuserprofilesService` —
but the chain never reached it because there was no `cr664_user`
row to join from.

**The admin attempted to populate `cr664_user` by hand and was
blocked** because the `cr664_PrimaryWorkspace@odata.bind` lookup
in the maker portal returns no selectable rows, even though
`cr664_platformworkspace` has seeded rows (Admin Control Center,
Banker Workspace, Manager Command Center, etc.). This is the
hard evidence that `cr664_user.PrimaryWorkspace` is not in fact
a working FK to `cr664_platformworkspace` in the live env — the
relationship target was never realigned.

Meanwhile, `cr664_platformuser` IS seeded in the live env, with
workspace and role data.

---

## 2. The schema inspection (why the fix is Option B, not Option A)

Both tables exist in the live env and both have generated typed
services (`Cr664_usersService` and `Cr664_platformusersService`).
The `power.config.json` data-source map lists both:

```jsonc
"users":         { entitySetName: "cr664_users",         logicalName: "cr664_user" },
"platformusers": { entitySetName: "cr664_platformusers", logicalName: "cr664_platformuser" },
```

A close read of the generated models clarifies which one is the
canonical surface:

### `cr664_user` (legacy / thin)
```ts
interface Cr664_usersBase {
  cr664_activeaccessflag?: boolean;
  cr664_email?: string;                       // OPTIONAL
  "cr664_PrimaryWorkspace@odata.bind": string;  // required (broken in live env)
  "cr664_Role@odata.bind": string;              // required
  "cr664_Team@odata.bind"?: string;
  cr664_userid: string;
  cr664_username: string;
  // ... statecode / ownership / timezone fields
}
```

No `cr664_fullname`, no `cr664_identitystatus`, no
`cr664_lastlogin`, no `cr664_provisioningsource`, no
`cr664_normalizedemail`, no `cr664_createdat`/`cr664_updatedat`.
Just the minimum.

### `cr664_platformuser` (modern / rich)
```ts
interface Cr664_platformusersBase {
  cr664_activestatus: boolean;                  // required
  "cr664_CoreUser@odata.bind"?: string;          // OPTIONAL FK BACK TO cr664_user
  cr664_createdat: string;                      // required
  cr664_email: string;                          // REQUIRED
  cr664_fullname: string;                       // REQUIRED
  cr664_identitystatus: 'Active' | 'Pending' | 'Disabled' | 'Suspended';
  cr664_lastlogin?: string;
  cr664_normalizedemail?: string;
  cr664_platformuserid: string;
  "cr664_PrimaryWorkspace@odata.bind": string;  // required (WORKS in live env)
  cr664_provisioningsource?: string;
  "cr664_Role@odata.bind"?: string;
  "cr664_Team@odata.bind"?: string;
  cr664_updatedat?: string;
  // ... statecode / ownership / timezone fields
}
```

**The "extends Core User" pattern is explicit:**
`cr664_platformuser.cr664_CoreUser@odata.bind` is an optional FK
back to `cr664_user`. PlatformUser is the modern wrapper; CoreUser
is the legacy thin record.

### `cr664_losuserprofile`
```ts
interface Cr664_losuserprofilesBase {
  cr664_losuserprofileid: string;
  cr664_platformrole: string;            // string, not FK
  cr664_primaryworkspace: string;        // string, not FK
  cr664_profilename: string;
  cr664_status: 'Active' | 'Inactive';
  "cr664_User@odata.bind"?: string;       // OPTIONAL FK to cr664_user
  // ...
}
```

LOSUserProfile carries denormalized strings for `primaryworkspace`
and `platformrole` rather than typed FKs. Its only join-key into
the rest of the identity graph is the optional `cr664_User` link
to `cr664_user`. **If `cr664_user` is empty in the live env (as
it is), there is no way to chain to LOSUserProfile from a
PlatformUser row.**

### Verdict

- The live env seeded `cr664_platformuser` because that's the
  canonical identity table with a working `PrimaryWorkspace` FK.
- `cr664_user.PrimaryWorkspace` lookup is unsalvageable in the
  live env without re-aligning the relationship target — which
  would require a schema change outside the app.
- LOSUserProfile and WorkspaceEntitlements have no join key into
  the live env's identity graph because they depend on cr664_user.
- **Option A (doc-only "populate cr664_user manually") is
  infeasible.** The admin already tried and was blocked.
- **Option B (point bootstrap at PlatformUser) is the right
  call.** It matches the seeded data and uses the FK that
  actually works.

---

## 3. The minimal provisioning recipe (what the admin does)

After this phase ships, the operator path is:

### 3.1 Sign into the maker portal

`https://make.powerapps.com/environments/5f2d77a5-de50-edeb-9d74-5b2400a2320d/`

### 3.2 Open the Platform User table

Tables → search "Platform User" → open. Confirm Platform Workspace
rows already exist. The live environment seeds **six** canonical
rows — the authoritative list is in
[PHASE_116 §1](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md#1-the-live-environments-six-platform-workspace-names):

| Live `cr664_workspacename` | Maps to route |
| --- | --- |
| `Admin Control Center` | `/workspaces/admin` |
| `Banker Workspace` | `/workspaces/banker` |
| `Executive Dashboard` | `/workspaces/executive` |
| `Manager Command Center` | `/workspaces/manager` |
| `Portfolio Management` | `/workspaces/manager` (Phase 116 decision) |
| `Team Workspace` | `/workspaces/team` |

Phase 116 added an explicit alias map in
[src/bootstrap/workspaceRoutes.ts](../src/bootstrap/workspaceRoutes.ts)
so each of those six exact names resolves to its expected route,
and the resolver no longer depends on the legacy substring-regex
heuristic. The substring regex is preserved as a defensive
fallback for non-alias names that contain a role keyword
(e.g. "Senior Banker Office" still resolves to banker). Names
that match neither path still fail closed at AuthGate's
`UnresolvedWorkspaceError`.

### 3.3 Create one Platform User row per Code App user

> **Read [PHASE_116 §3.3](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md#33-recommended-provisioning-approach-avoiding-the-grid-pitfall)
> BEFORE starting this step.** The maker portal's inline grid
> editor can silently drop a newly-created row if hidden required
> fields like `cr664_createdat` aren't visible. Use the row form
> editor, not the grid, OR clone an existing seeded row.

Required fields:

| Field | Value | Notes |
| --- | --- | --- |
| `cr664_email` | the user's UPN (e.g. `mpaller@oldglorybank.com`) | EXACT match against `ctx.user.userPrincipalName`. |
| `cr664_fullname` | user's display name | Surfaces in BootstrapResult.profileName + downstream UI. |
| `cr664_PrimaryWorkspace` | one of the Platform Workspace rows from §3.2 | The maker portal's lookup will show these. |
| `cr664_identitystatus` | `Active` (788190000) | Future-phase candidate to gate Pending / Disabled / Suspended explicitly — see §6. |
| `cr664_activestatus` | `true` | |
| `cr664_createdat` | now (ISO 8601) | Maker portal usually defaults this. |

Optional fields:
- `cr664_Role` — used by future phases; not required by Phase 115 bootstrap.
- `cr664_Team` — same.
- `cr664_CoreUser` — leave EMPTY. Linking back to a (broken)
  legacy `cr664_user` row provides no benefit and may confuse
  future operators.
- `cr664_normalizedemail`, `cr664_provisioningsource`, `cr664_lastlogin` — informational only.

**Do NOT create:**
- `cr664_user` rows — the legacy table, no longer in the bootstrap
  chain.
- `cr664_losuserprofile` rows — only meaningful with a populated
  `cr664_user` chain; bootstrap no longer reads it.
- `cr664_workspaceentitlements` rows — same.

### 3.4 Refresh the app

The signed-in user should now bypass the AuthGate
"Access not provisioned" error and land on their primary
workspace.

If the AuthGate now renders "Workspace not recognized — Your
assigned workspace `<name>` is not a known landing target":
the workspace name doesn't match any of the regexes in §3.2's
route table. Either rename the Platform Workspace row or update
`workspaceRoutes.ts` (a future phase, not Phase 115 scope).

---

## 4. The new bootstrap chain

`src/bootstrap/bootstrapFlow.ts`:

```ts
async function runBootstrap(): Promise<BootstrapResult> {
  const ctx = await getContext();
  const upn = ctx.user.userPrincipalName;
  const fullName = ctx.user.fullName ?? upn ?? 'Unknown user';
  if (!upn) throw new NotProvisionedError('(no UPN in context)');

  const platformUsers = await Cr664_platformusersService.getAll({
    filter: `cr664_email eq '${escapeOData(upn)}'`,
    top: 1,
  });
  const platformUser = platformUsers.data?.[0];
  if (!platformUser) throw new NotProvisionedError(upn);

  const workspaceId = platformUser._cr664_primaryworkspace_value;
  if (!workspaceId) throw new UnresolvedWorkspaceError(undefined);

  const workspace = await Cr664_platformworkspacesService.get(workspaceId);
  const workspaceName = workspace.data?.cr664_workspacename;
  const route = resolveWorkspaceRoute(workspaceName);
  if (!route) throw new UnresolvedWorkspaceError(workspaceName);

  return {
    upn, fullName,
    entraObjectId: ctx.user.objectId,
    profileId: platformUser.cr664_platformuserid,
    profileName: platformUser.cr664_fullname,
    workspaceId,
    workspaceName: workspaceName ?? '',
    route,
  };
}
```

### Differences from pre-Phase-115

| Dimension | Pre-Phase-115 | Phase 115 |
| --- | --- | --- |
| Entry-point service | `Cr664_usersService.getAll` (legacy) | `Cr664_platformusersService.getAll` (canonical) |
| Match field | `cr664_email eq '<upn>'` on `cr664_user` | `cr664_email eq '<upn>'` on `cr664_platformuser` |
| Profile lookup | `Cr664_losuserprofilesService.getAll` by `_cr664_user_value` | (removed — `cr664_platformuser.cr664_fullname` is the display name) |
| Workspace resolution | Either default entitlement's workspace OR profile's `cr664_primaryworkspace` string | `cr664_platformuser._cr664_primaryworkspace_value` directly |
| Entitlement lookup | `Cr664_workspaceentitlementsesService.getAll` by `_cr664_losuserprofile_value` | (removed — single PrimaryWorkspace FK on PlatformUser is the source of truth) |
| Workspace name read | `Cr664_platformworkspacesService.get(workspaceId)` | UNCHANGED |
| Route resolution | `resolveWorkspaceRoute(name)` | UNCHANGED |

### `BootstrapResult` shape

**Unchanged.** The returned shape still has eight fields: `upn`,
`fullName`, `entraObjectId`, `profileId`, `profileName`,
`workspaceId`, `workspaceName`, `route`. Downstream consumers
(AdminProvider, BankerProvider, ManagerProvider, TeamProvider,
ExecutiveProvider, CreditMemo, WorkspaceGate, HomeRedirect) work
without modification.

The two semantic changes inside the shape:
- `profileId` is now `cr664_platformuserid` (was
  `cr664_losuserprofileid`). No downstream consumer reads
  `profileId` in production code, verified by grep — but the
  field name was kept so any future addition that reads "the
  identity row id" works regardless of the change.
- `profileName` is now `cr664_platformuser.cr664_fullname` (was
  `cr664_losuserprofile.cr664_profilename`). Same display purpose,
  populated from the canonical seeded source.

### Fail-closed contract

UNCHANGED. The new chain throws on every broken link:

| Broken link | Throws | What AuthGate renders |
| --- | --- | --- |
| No UPN in Power Apps context | `NotProvisionedError('(no UPN in context)')` | "Access not provisioned" with the literal `(no UPN in context)` |
| No PlatformUser row matched | `NotProvisionedError(upn)` | "Access not provisioned — No LOS profile exists for `<upn>`" |
| PlatformUser has no PrimaryWorkspace FK | `UnresolvedWorkspaceError(undefined)` | "Workspace not recognized — No primary workspace is assigned to your profile" |
| PrimaryWorkspace name not in route table | `UnresolvedWorkspaceError(workspaceName)` | "Workspace not recognized — Your assigned workspace `<name>` is not a known landing target" |

No default landing workspace. No silent demotion. Permission-
before-render preserved.

---

## 5. Test coverage

`src/bootstrap/bootstrapFlow.test.ts` — **12 assertions across 3
describe blocks** (pre-Phase-115 there were zero bootstrap tests;
the chain was unverified by CI).

### Happy path (5 tests)
- UPN → PlatformUser → PrimaryWorkspace → route returns the full BootstrapResult with correct field mappings.
- OData literal escaping: a UPN with an apostrophe is doubled per spec (`o''malley@oldglorybank.com`).
- Static-source check: `bootstrapFlow.ts` no longer references `Cr664_usersService`, `Cr664_losuserprofilesService`, or `Cr664_workspaceentitlementsesService` anywhere.
- Manager Command Center → `/workspaces/manager`.
- Admin Control Center → `/workspaces/admin`.

### Fail-closed paths (6 tests)
- No UPN → `NotProvisionedError`. PlatformUser lookup is not called.
- No PlatformUser → `NotProvisionedError`. PlatformWorkspace lookup is not called.
- NotProvisionedError carries the UPN so AuthGate can render it.
- PlatformUser without PrimaryWorkspace → `UnresolvedWorkspaceError(undefined)`. PlatformWorkspace lookup is not called.
- Workspace name doesn't match any route → `UnresolvedWorkspaceError(<name>)`. The unrecognized name flows to AuthGate.
- An untracked workspace surface does NOT default to any known route. Catches the hypothetical "helpful" regression where someone adds `route ?? '/workspaces/banker'`.

### Shape stability (1 test)
- The eight-field `BootstrapResult` shape is unchanged from pre-Phase-115. Downstream consumers don't break.

---

## 6. Remaining gaps / future-phase candidates

Phase 115 deliberately did not address these. Each is a future
brief candidate; none is implied as next.

### 6.1 `cr664_identitystatus` enforcement

Today's bootstrap matches the PlatformUser row regardless of its
`cr664_identitystatus` (Active / Pending / Disabled / Suspended).
A user whose row is `Disabled` or `Suspended` should be turned
away at AuthGate, not silently allowed in. A future small phase
could add a fail-closed check after the PlatformUser match:

```ts
if (platformUser.cr664_identitystatus !== 788190000) { // 'Active'
  throw new NotProvisionedError(upn); // or a new IdentityStatusError
}
```

This requires adding a new error class or expanding
NotProvisionedError to carry the status reason, plus a test pin
per status value. Not in Phase 115 scope.

### 6.2 LOS profile + entitlement re-introduction

If the bank later decides to populate LOSUserProfile +
WorkspaceEntitlements for multi-workspace bankers (e.g. a banker
who also has read-only Exec access), the bootstrap chain can be
extended to query those tables AFTER resolving PlatformUser.
Today PrimaryWorkspace is the single landing target; entitlements
would surface secondary workspaces in a navigation UI that
doesn't exist yet.

### 6.3 Legacy `cr664_user` table

The legacy table is no longer in the bootstrap chain but is still
in `power.config.json`'s data-source map. Removing it would
require a `power.config.json` edit + a republish, and is purely
cosmetic. Leave it for now; the table can be deprecated later if
the bank decides to retire it from the solution.

### 6.4 Workspace name regex flexibility

`workspaceRoutes.ts` matches case-insensitive substrings
(banker, team, manager, executive|board, admin). The five
canonical Platform Workspace names in §3.2 all match. If the
bank seeds an unconventional name (e.g. "RM Workspace" for
Relationship Manager), routing will fail and the user will see
"Workspace not recognized". That's the honest behavior — but a
future phase could expand the regex set or add an explicit
synonym map.

---

## 7. What Phase 115 does NOT do

- **No email-lane changes.** Phase 104–110 communication lock
  remains intact; the consolidated lock test file passes.
- **No new governed write.** GOVERNED_WRITES count unchanged
  (still 12).
- **No fallback dashboards.** Every failure path still throws
  and renders AuthGate's ErrorState.
- **No weakening of permission-before-render.** The new chain
  fails closed at every link; the test file pins this.
- **No schema changes.** The repo did not add or rename any
  Dataverse fields; the live env's `cr664_platformuser` table
  already had the fields the new chain reads.
- **No access-model changes.** Workspace gating (`WorkspaceGate`),
  role isolation, and per-role providers are byte-identical.

---

## 8. Verification

### CI gates

- New test file: **12/12 assertions pass** in
  `src/bootstrap/bootstrapFlow.test.ts`.
- Full suite: passes including the Phase 110 communication-lane
  lock (134 assertions) — bootstrap fix doesn't touch the email
  surface.
- `npm run build`: clean.

### Operator verification (after `pac code push`)

Run the brief's command verbatim:

```bash
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS
```

Then:

1. Sign into the deployed app with `mpaller@oldglorybank.com`.
2. Confirm AuthGate no longer shows "Access not provisioned".
3. Confirm the app lands on the workspace matching the user's
   `cr664_platformuser.cr664_PrimaryWorkspace` (e.g. Admin Control
   Center → Admin Workspace).
4. Continue with Phase 113 §G.4 first-launch validation and
   Phase 112 operator validation.

If §G.4 / §E.1–E.8 of Phase 113 still surface errors, the
failure is no longer identity-chain — it's likely a different
layer (env-var, connector consent, Dataverse permission). Triage
via Phase 113 §F.

---

## 9. Cross-references

- [PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md) — §F.3 updated in this phase. The failure triage row now points operators at Phase 115 §3 (the provisioning recipe).
- [PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md](PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md) — §B.3 "Permission-before-render posture is visible" is the in-app check that Phase 115's fail-closed contract preserves.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — unaffected by Phase 115; the consolidated 134-assertion lock test remains green.
- `src/bootstrap/workspaceRoutes.ts` — the route table the new chain feeds into. Unchanged.
- `src/shared/governance/platformInventory.ts` — borrower-portal compound NOT_WIRED entry blocker (1) text updated to reference `cr664_platformuser` (was: `cr664_users`). Single-line stale-label fix.
