# BUGFIX — audit actor CoreUser bridge inspect + guarded seed

## Why

Banker New Deal create now creates the Loan Deal successfully, but the audit
stays `audit_failed_partial`. `cr664_auditevents.cr664_ChangedBy` is a REQUIRED
lookup to the custom `cr664_user` table, so the runtime resolver
([newDealAuditActorResolver.ts](../src/deals/newDealAuditActorResolver.ts))
derives a `cr664_user` id from the acting banker's `cr664_platformusers` row via
its `cr664_CoreUser` lookup, and binds
`cr664_ChangedBy = /cr664_users(<id>)`.

The live banner proved the resolver is correct and fail-closed:
- the actor / platform-user match exists,
- `cr664_CoreUser` is **empty**,
- the audit correctly fails closed (no invalid audit row is written).

So the fix is **data**, not code: populate the Platform User → Core User bridge
for the approved banker. This adds two guarded operator modes to
[scripts/phase122-lookup-repair.mjs](../scripts/phase122-lookup-repair.mjs) to
inspect and (with an explicit commit flag) repair that bridge. No app runtime
code changes; no `pac code push`.

## Modes

All three default to **no write**. The seed mode only writes with
`--commit-seed-audit-actor-bridge`.

```
# 1. Inspect (read-only)
node scripts/phase122-lookup-repair.mjs --inspect-audit-actor-bridge --upn mpaller@oldglorybank.com

# 2. Seed/repair dry-run (plan only, no write)
node scripts/phase122-lookup-repair.mjs --seed-audit-actor-bridge --upn mpaller@oldglorybank.com

# 3. Commit the seed/repair
node scripts/phase122-lookup-repair.mjs --seed-audit-actor-bridge --upn mpaller@oldglorybank.com --commit-seed-audit-actor-bridge
```

### Inspect behaviour (`--inspect-audit-actor-bridge`)

Pure GETs. Resolves exactly one `cr664_platformusers` row by `cr664_email` /
`cr664_normalizedemail`, then reports:
- whether exactly one platform user exists (fail closed on zero / multiple),
- whether it is active (fail closed on inactive),
- whether `cr664_CoreUser` is populated,
- if populated, whether the referenced `cr664_user` exists and is active,
- the `cr664_user` create metadata the seed relies on: the `cr664_CoreUser`
  lookup `Targets[]` (confirms it targets `cr664_user`), the `cr664_user`
  `EntitySetName`, and the required-for-create fields.

It ends with a `BRIDGE STATUS: READY | BLOCKED` line. No write of any kind.

### Seed behaviour (`--seed-audit-actor-bridge`)

Dry-run by default. The lone write — PATCH `cr664_platformuser.cr664_CoreUser`
(plus, at most, ONE minimal `cr664_user` POST) — requires
`--commit-seed-audit-actor-bridge`.

- Platform user with an active, valid `CoreUser` already → **no-op success**.
- `CoreUser` populated but its target is missing/inactive → **fails closed**
  (refuses to silently re-point a populated bridge; operator must investigate).
- `CoreUser` empty:
  1. **Reuse** — find one existing active `cr664_user` matched by email /
     username and bind it (no create). Multiple distinct matches → fail closed.
  2. **Create** — only if no match AND live metadata shows the
     required-for-create set is fully covered by the allow-list
     (`cr664_username`, `cr664_email`, `cr664_activeaccessflag`). The POST sets
     ONLY those fields; Dataverse defaults the PK / owner / state.
  3. Otherwise → **stop** with operator instructions listing the exact
     required fields it will not guess. Banker create audit stays blocked.

It PATCHes ONLY `cr664_CoreUser@odata.bind`. It NEVER patches a Loan Deal,
writes an audit row, enables any gate, mutates any other platform-user field,
or creates a duplicate `cr664_user`.

## After operator repair

1. Re-run inspect:
   `node scripts/phase122-lookup-repair.mjs --inspect-audit-actor-bridge --upn mpaller@oldglorybank.com`
2. Expect: platform user found, active, `CoreUser` populated, target
   `cr664_user` active → `BRIDGE STATUS: READY`.
3. Then run exactly one final banker create proof:
   `V1 Banker Create Proof - 2026-06-16 8`. Public create and all downstream
   automations remain disabled.

## Tests

Source-contract pins in
[phase183AuditActorBridgeSeedContract.test.ts](../src/shared/governance/phase183AuditActorBridgeSeedContract.test.ts)
(the suite never runs the script or calls Dataverse): dry-run default,
commit-required-for-write, fail-closed on zero/multiple/inactive platform users
and multiple `cr664_user` matches, existing-CoreUser no-op, broken-CoreUser
fail-closed, reuse-before-create, metadata-gated allow-listed create that never
guesses, PATCH-only-`cr664_CoreUser`, no Loan Deal / audit / gate writes, help
text, and no hardcoded GUIDs.
