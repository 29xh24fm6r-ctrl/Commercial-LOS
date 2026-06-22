# Phase 204F — Admin Probe PlatformUser Active-Gate Alignment

## The mismatch

Phase 204E aligned the admin probe's **identity source** with the live Phase 115
bootstrap (PlatformUser, not the legacy core-user chain). But the probe still
applied a **stricter activeness gate** than `bootstrapFlow.ts`:

```ts
// admin probe (before 204F)
if (!user || user.cr664_activestatus !== true) return { kind: 'not-entitled' };
```

`bootstrapFlow.ts` does **not** read `cr664_activestatus` at all. It boots a user
on the strength of:

1. a `cr664_platformuser` row matched by `cr664_email`, and
2. a resolvable primary workspace (`_cr664_primaryworkspace_value`).

So a user whose `cr664_activestatus` is `false`, `undefined`, or simply not
returned by the data client **boots the app normally** but **failed the admin probe
before entitlement evaluation** — the probe was stricter than the front door.

## The fix — align, but stay fail-closed on explicit deactivation

`resolvePlatformUserUsableForAdminProbe(user)` replaces the `activestatus === true`
gate. The PlatformUser is **usable** unless it is *explicitly* deactivated:

| Condition | Result |
|---|---|
| no user row | ❌ not usable |
| `statecode === 1` (Inactive) | ❌ not usable |
| `cr664_identitystatus` = Disabled (788190002) | ❌ not usable |
| `cr664_identitystatus` = Suspended (788190003) | ❌ not usable |
| `statecode 0` + identity Active + `activestatus` **undefined** | ✅ usable |
| `statecode 0` + identity Active + `activestatus` **false** | ✅ usable |
| `activestatus` true | ✅ usable |
| missing `statecode` / `identitystatus` (not explicitly deactivated) | ✅ usable |
| identity **Pending** (788190001) | ✅ usable (not Disabled/Suspended) |

`cr664_activestatus` is **no longer a required gate** — its absence or a `false`
value must not block a user who can boot the app. Explicit deactivation
(`statecode` Inactive, or `identitystatus` Disabled/Suspended) still fails closed,
and explicit deactivation wins even when `activestatus` is `true`.

The probe now selects the fields it needs to make this decision:
`cr664_platformuserid`, `cr664_email`, `cr664_fullname`, `cr664_activestatus`,
`cr664_identitystatus`, `statecode`, `_cr664_coreuser_value`.

## Entitlement gates unchanged

Once the PlatformUser is deemed usable, **every** entitlement gate from 204C–204E
is unchanged:

- access level resolves to **Admin or Full** from the authoritative
  `cr664_accesslevel` option-set (204D);
- the entitlement is **Active**;
- **EITHER** Workspace resolves to the admin route **OR** the entitlement name
  strictly resolves to admin (204C);
- the row is **attributed to the current user** by a safe identity signal — profile
  id, profile label == UPN, or user-specific entitlement name (204E);
- the **owner field is never** an authorization signal.

A ckingma row, a generic "Executive Admin Access" row, an owner-only row, a
Banker/Team row, and any inactive/ReadOnly row all still fail. No email is
hard-coded into app authorization or rendering code.

## Verification

```bash
pnpm test
npm run build
git diff --check
git status --short
```
