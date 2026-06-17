# BUGFIX — CoreUser dependency seed

> **Superseded for new operators** by the canonical
> [identity / audit graph provisioning](./PHASE_186_IDENTITY_AUDIT_GRAPH_CANONICAL_PROVISIONING.md).
> The modes below still work for a targeted single-step repair.

## Why

[Phase 184](./PHASE_184_AUDIT_ACTOR_COREUSER_REQUIRED_LOOKUP_SEED.md) tried to
create a `cr664_user` for `mpaller@oldglorybank.com` but stopped: Dataverse
requires two lookups whose TARGET tables had no production-safe rows —
`cr664_primaryworkspace` (→ a workspace-type table) and `cr664_role` (→ a
user-role table). The dependency inspection found:

- no approved production-safe PrimaryWorkspace candidate,
- the only Role candidate was **System Super Admin** (rejected as unsupported
  for a banker create-audit identity).

So `cr664_user` creation is blocked until those dependency rows exist. This
phase adds modes to inspect and (guardedly) reuse-or-create exactly one
production-safe row in each target table. It deliberately does **not** create
the `cr664_user` or patch CoreUser — that stays with
`--seed-coreuser-for-platform-user`, run afterwards.

Script/docs/tests only — no runtime app code change, no `pac code push`.

## Modes

```
# 1. Inspect dependency targets (read-only)
node scripts/phase122-lookup-repair.mjs --inspect-coreuser-dependency-seeds --upn mpaller@oldglorybank.com

# 2. Seed dry-run (plan only)
node scripts/phase122-lookup-repair.mjs --seed-coreuser-dependencies --upn mpaller@oldglorybank.com

# 3. Commit
node scripts/phase122-lookup-repair.mjs --seed-coreuser-dependencies --upn mpaller@oldglorybank.com --commit-seed-coreuser-dependencies
```

### Inspect (`--inspect-coreuser-dependency-seeds`)

Pure GETs. Resolves one active platform user (fail closed otherwise), prints the
`cr664_user` required-for-create fields, and for each dependency target
(PrimaryWorkspace, Role): the lookup target + entity set, the detected create
fields (name / optional code / optional active), any blocking required field,
and the **classified** existing rows —
`APPROVED` / `REJECTED_TEST` / `REJECTED_PHASE` / `REJECTED_DEMO` /
`REJECTED_INACTIVE` / `REJECTED_UNSUPPORTED` / `REJECTED_AMBIGUOUS` — plus the
would-reuse / would-create decision. No writes.

### Seed (`--seed-coreuser-dependencies`)

Dry-run by default. Row creates require `--commit-seed-coreuser-dependencies`.
For PrimaryWorkspace and Role each:

- **Reuse** the single APPROVED active production-safe row, else
- **Create** exactly one:
  - PrimaryWorkspace — name `Banker Workspace`, code `BANKER_WORKSPACE` (only if
    a code field exists), active `true` (only if an active field exists);
  - Role — name `Banker`, code `BANKER` (if a code field exists), active `true`
    (if an active field exists).

**Approved names** — Workspace: `Banker Workspace` / `Banker` /
`Commercial Lending` / `Commercial Lending LOS` / `Lending OS`. Role: `Banker` /
`Commercial Banker` / `Lending Banker` / `Relationship Manager`.

**Fail closed** on: TEST/PHASE/demo/sample rows, inactive rows, System Super
Admin / admin-only roles (not in the approved list), more than one approved row
(`REJECTED_AMBIGUOUS`), or a target table whose required-for-create fields the
seed cannot fill (prints the exact required fields, never guesses).

The POST body is allow-listed (name + optional code + optional active only). It
NEVER patches `PlatformUser.CoreUser`, NEVER creates a `cr664_user`, NEVER
mutates an existing row (System Super Admin, TEST/PHASE rows, …), and never
touches a Loan Deal / audit / gate.

## After commit

1. `--inspect-coreuser-dependency-seeds --upn mpaller@oldglorybank.com`
2. `--seed-coreuser-dependencies --upn mpaller@oldglorybank.com` (dry-run)
3. If clean, add `--commit-seed-coreuser-dependencies`.
4. `--seed-coreuser-for-platform-user --upn mpaller@oldglorybank.com` (dry-run) —
   should now show a safe `cr664_user` create + CoreUser patch plan; then add
   `--commit-seed-coreuser-for-platform-user`.
5. `--inspect-audit-actor-bridge --upn mpaller@oldglorybank.com` → expect
   `BRIDGE STATUS: READY`.

Only after `BRIDGE STATUS: READY`, run exactly one final proof:
`V1 Banker Create Proof - 2026-06-16 8`. Public create and all downstream
automations remain disabled.

## Tests

Source-contract pins in
[phase185AuditActorCoreUserDependencySeedContract.test.ts](../src/shared/governance/phase185AuditActorCoreUserDependencySeedContract.test.ts)
(never runs the script / calls Dataverse): dry-run default, commit-required,
inspect-no-writes, all seven classification tokens, System Super Admin /
TEST/PHASE/demo rejection, reuse-single-approved, create-when-zero,
multiple-approved fail-closed, unknown-required-field stop, pinned create
allow-lists, no CoreUser patch / cr664_user / Loan Deal / audit / gate, help
text, and no hardcoded GUIDs.
