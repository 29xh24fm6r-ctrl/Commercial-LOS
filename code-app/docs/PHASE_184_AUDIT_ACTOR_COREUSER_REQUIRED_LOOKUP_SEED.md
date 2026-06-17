# BUGFIX — CoreUser required-lookup seed

## Why

[Phase 183](./PHASE_183_AUDIT_ACTOR_COREUSER_BRIDGE_SEED.md) added the audit-actor
bridge inspect/seed. Its inspection of `mpaller@oldglorybank.com` found:

- the `cr664_platformuser` exists and is active,
- `cr664_CoreUser` is empty,
- no existing active `cr664_user` matches the actor,
- a minimal `cr664_user` **cannot** be created because Dataverse requires two
  more lookups: `cr664_primaryworkspace` and `cr664_role`.

So the bridge seed correctly stopped. This phase adds a mode that resolves those
REQUIRED lookups via a fail-closed selection policy, creates (or reuses) one
valid `cr664_user`, and patches only `cr664_platformuser.cr664_CoreUser`. The
audit can then bind `cr664_ChangedBy = /cr664_users(<id>)`.

Script/docs/tests only — no runtime app code change, no `pac code push`.

## Modes

```
# 1. Inspect create dependencies (read-only)
node scripts/phase122-lookup-repair.mjs --inspect-coreuser-create-dependencies --upn mpaller@oldglorybank.com

# 2. Seed dry-run (plan only)
node scripts/phase122-lookup-repair.mjs --seed-coreuser-for-platform-user --upn mpaller@oldglorybank.com

# 3. Commit
node scripts/phase122-lookup-repair.mjs --seed-coreuser-for-platform-user --upn mpaller@oldglorybank.com --commit-seed-coreuser-for-platform-user
```

### Inspect (`--inspect-coreuser-create-dependencies`)

Pure GETs. Resolves exactly one active platform user (fail closed otherwise) and
prints: CoreUser state, the `cr664_user` `EntitySetName` + required-for-create
fields (and which are blocking beyond the allow-list), the platform user's
sourceable fields, the `cr664_primaryworkspace` / `cr664_role` lookup targets,
and the **classified** candidate rows:
`APPROVED` / `REJECTED_TEST` / `REJECTED_INACTIVE` / `REJECTED_AMBIGUOUS` /
`REJECTED_UNSUPPORTED`. No writes.

### Seed (`--seed-coreuser-for-platform-user`)

Dry-run by default. The `cr664_user` POST + CoreUser PATCH require
`--commit-seed-coreuser-for-platform-user`.

- CoreUser already valid → **no-op**.
- An existing active `cr664_user` matching the actor (email/username) → **reuse**
  it and PATCH only CoreUser.
- No match → **create** exactly one `cr664_user`. Selection policy
  (each fails closed on zero / multiple):
  - **PrimaryWorkspace** — prefer the platform user's own active, production-safe
    primary workspace; else exactly one active production-safe candidate
    (banker/lending-named preferred to disambiguate). TEST/PHASE/demo rejected.
  - **Role** — prefer the platform user's own active, approved role; else
    exactly one active approved banker role (`Banker`, `Commercial Banker`,
    `Lending Banker`, `Relationship Manager`). TEST/PHASE/demo and unsupported
    names rejected.

  The POST body is allow-listed: `cr664_username`, `cr664_email`,
  `cr664_activeaccessflag`, plus the two REQUIRED lookups bound by their
  metadata-read nav property names. If live metadata shows ANY other
  required-for-create field, the seed **stops** and never guesses.

It PATCHes ONLY `cr664_CoreUser@odata.bind`. It NEVER patches a Loan Deal, writes
an audit row, enables a gate, mutates other platform-user fields or any existing
role/workspace row, or creates a duplicate `cr664_user`.

### If dependencies can't be resolved

The mode stops with the exact operator action (e.g. "ensure exactly one active
approved banker role exists, then re-run"), creates no `cr664_user`, and does not
patch CoreUser. Banker create audit stays blocked until resolved.

## After commit

1. `--inspect-coreuser-create-dependencies --upn mpaller@oldglorybank.com`
2. `--seed-coreuser-for-platform-user --upn mpaller@oldglorybank.com` (dry-run)
3. If the dry-run shows exactly one safe create/patch plan, commit it.
4. `--inspect-audit-actor-bridge --upn mpaller@oldglorybank.com`
5. Expect `BRIDGE STATUS: READY`.

Only after `BRIDGE STATUS: READY`, run exactly one final proof:
`V1 Banker Create Proof - 2026-06-16 8`. Public create and all downstream
automations remain disabled.

## Tests

Source-contract pins in
[phase184AuditActorCoreUserLookupSeedContract.test.ts](../src/shared/governance/phase184AuditActorCoreUserLookupSeedContract.test.ts)
(never runs the script / calls Dataverse): dry-run default, commit-required,
fail-closed on missing/multiple/inactive platform users, existing-CoreUser
no-op, reuse-before-create, missing/duplicate/inactive PrimaryWorkspace + Role
blocks, TEST/PHASE/demo rejection, the create allow-list, PATCH-only-CoreUser,
no Loan Deal / audit / gate writes, help text, and no hardcoded GUIDs.
