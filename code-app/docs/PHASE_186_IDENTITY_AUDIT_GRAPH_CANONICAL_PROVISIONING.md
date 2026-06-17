# Canonical identity / audit graph provisioning

## Why this exists

Banker New Deal create is a live controlled pilot and Loan Deal creation works,
but clean certification was blocked by the audit-actor **identity graph**, which
we kept discovering one level at a time:

1. `cr664_auditevents.cr664_ChangedBy` is required and targets `cr664_user`
   (not `systemuser`).
2. The acting Platform User is active but `cr664_CoreUser` is empty.
3. No existing `cr664_user` matches `mpaller@oldglorybank.com`.
4. `cr664_user` requires `cr664_primaryworkspace` + `cr664_role`.
5. `cr664_primaryworkspace` targets a workspace-type table.
6. That workspace-type table itself requires a workspace-context lookup.
7. … and the piecemeal scripts kept failing safely but never mapped the whole
   graph first — whack-a-mole.

This phase **stops the whack-a-mole**: one canonical, metadata-backed walker maps
the *entire* dependency graph before writing anything, then provisions it in
dependency order or stops with a precise no-write blocker.

Script/docs/tests only — no runtime app code change, no `pac code push`. The
banker pilot was left ON (audit still fails closed safely as today).

## The four canonical modes

```
# 1. Full read-only graph audit
node scripts/phase122-lookup-repair.mjs --inspect-identity-audit-graph --upn mpaller@oldglorybank.com

# 2. Full dry-run provisioning plan
node scripts/phase122-lookup-repair.mjs --plan-identity-audit-provisioning --upn mpaller@oldglorybank.com

# 3. Full commit provisioning
node scripts/phase122-lookup-repair.mjs --provision-identity-audit-graph --upn mpaller@oldglorybank.com --commit-provision-identity-audit-graph

# 4. Post-provision verification
node scripts/phase122-lookup-repair.mjs --verify-identity-audit-graph --upn mpaller@oldglorybank.com
```

All but the explicit commit are read-only / dry-run.

## What the walker does

Starting from `cr664_user`, it reads Dataverse metadata for each table
(EntitySetName, required-for-create fields, lookup nav property names + targets),
and **recursively** resolves every required lookup — so WorkspaceType →
WorkspaceContext (and any deeper required dependency, up to a depth guard) is
reached generically, not by a hand-coded stop. Each required-to-provide field is
classified lookup-vs-scalar by **probing the LookupAttributeMetadata cast**
(authoritative), not by the `$select`ed `AttributeType` — which can mislabel a
custom lookup such as `cr664_workspacetype.cr664_workspacecontext` and would
otherwise wrongly block WorkspaceType (see Phase 187). For each node it:

- classifies existing rows: `APPROVED` / `REJECTED_TEST` / `REJECTED_PHASE` /
  `REJECTED_DEMO` / `REJECTED_SAMPLE` / `REJECTED_INACTIVE` /
  `REJECTED_ADMIN_ONLY` / `REJECTED_AMBIGUOUS` / `REJECTED_UNSUPPORTED` /
  `REJECTED_MISSING_REQUIRED_FIELD` / `REJECTED_UNKNOWN_METADATA`;
- **prefers reuse**: a single APPROVED active production-safe row is reused;
- plans a **create** only when none is approved (with seed defaults below);
- fails closed on multiple approved rows (unless the platform user already points
  at one), unknown required fields, depth overflow, or metadata read failure;
- reports system-required-but-server-defaulted fields (ownerid/owneridtype/…)
  separately from truly application-required ones.

### Production-safe naming policy

- **WorkspaceContext**: Lending OS / Commercial Lending LOS / Commercial Lending
  / OGB LOS / Banker Workspace Context.
- **WorkspaceType**: Banker Workspace / Banker / Commercial Lending / Commercial
  Lending LOS / Lending OS Banker.
- **UserRole**: Banker / Commercial Banker / Lending Banker / Relationship
  Manager.
- Rejected everywhere: TEST / PHASE / demo / sample / System Super Admin /
  Administrator / admin-only / blank / inactive.

### Seed defaults (only when no production-safe row exists)

- WorkspaceContext: name `OGB LOS`, code `OGB_LOS` (if a code field exists),
  active `true` (if an active field exists).
- WorkspaceType: name `Banker Workspace`, code `BANKER_WORKSPACE`, active `true`,
  + the WorkspaceContext bind if required.
- UserRole: name `Banker`, code `BANKER`, active `true`.
- CoreUser (`cr664_user`): username = platform-user full name or UPN, email =
  UPN, `cr664_activeaccessflag` true (if the field exists), + PrimaryWorkspace
  and Role binds.

Each payload has its own allow-list; no generic arbitrary POST/PATCH. The only
mutation outside the new rows is the single
`cr664_platformuser.cr664_CoreUser@odata.bind` PATCH.

## Provisioning order (dependency-safe)

1. PlatformUser (resolve only).
2. WorkspaceContext (reuse/create).
3. WorkspaceType (reuse/create; bind WorkspaceContext if required).
4. UserRole (reuse/create).
5. `cr664_user` (create with WorkspaceType + Role binds, or reuse).
6. PATCH `cr664_platformuser.cr664_CoreUser`.
7. Verify. (No audit row and no Loan Deal are created here.)

## Operator runbook

1. `--inspect-identity-audit-graph` — read the full graph + classifications.
2. `--plan-identity-audit-provisioning` — confirm `PLAN STATUS: READY_TO_COMMIT`
   (or read the precise blocker).
3. If READY, `--provision-identity-audit-graph … --commit-provision-identity-audit-graph`.
4. `--verify-identity-audit-graph` → expect `GRAPH STATUS: READY` (PlatformUser
   active, CoreUser populated, cr664_user active, Role active+approved,
   PrimaryWorkspace active+approved, WorkspaceContext active+approved if
   required).
5. Only after `GRAPH STATUS: READY`, run exactly one final proof:
   `V1 Banker Create Proof - 2026-06-16 8`. Public create and all downstream
   automations remain disabled.
6. If clean, certify banker New Deal create as `PILOT_LIVE_CONTROLLED`, then do a
   separate audit-binding parity phase for the other governed writes.

## Relationship to the piecemeal modes

The earlier per-feature modes — `--inspect-audit-actor-bridge` /
`--seed-audit-actor-bridge` (183), `--inspect-coreuser-create-dependencies` /
`--seed-coreuser-for-platform-user` (184), `--inspect-coreuser-dependency-seeds`
/ `--seed-coreuser-dependencies` (185) — still work, but are **superseded** for
new operators by the canonical graph modes here. Use the canonical modes; reach
for the piecemeal modes only for a targeted single-step repair.

## Tests

Source-contract pins in
[phase186IdentityAuditGraphProvisioningContract.test.ts](../src/shared/governance/phase186IdentityAuditGraphProvisioningContract.test.ts)
(never runs the script / calls Dataverse): recursive walk reaches WorkspaceContext,
metadata required fields honored, reuse preferred, missing dependency → planned
create, unsupported required field blocks with the field name, multiple approved
block, admin/TEST/PHASE/demo/sample/inactive rejected, all eleven classification
tokens, dependency-safe create order, per-table allow-lists, platform PATCH only
CoreUser, commit-required, no Loan Deal / audit / gate, help text, no hardcoded
GUIDs.
