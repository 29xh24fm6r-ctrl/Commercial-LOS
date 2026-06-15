# Phase 170B -- Operator Primary Workspace Provisioning

Date: 2026-06-15
Baseline: 50eff95 (Phase 170A). Operator script change + tests/docs only.
No deploy, no tag movement, no schema, no in-app write.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## Purpose

Add a generalized, governed operator script mode that assigns an EXISTING
platform user to a primary workspace by UPN/email + workspace name. App
access is driven by `cr664_platformuser.cr664_PrimaryWorkspace`
(Phase 170A), so this is the safe path to put an already-provisioned user
into the correct workspace.

The mode generalizes the Phase 133C executive seed
(`runSeedExecutivePrimaryWorkspace`) but tightens two safety rules:
- It NEVER creates a platform user (existing-user only).
- It NEVER creates a workspace (bails if the workspace is missing).

New mode: `--seed-primary-workspace`
Required args: `--upn <email>`, `--workspace-name <name>`
Commit flag: `--commit-seed-primary-workspace`
Default: dry-run (no writes).

## Command Examples

Dry run (no writes):

```
node scripts/phase122-lookup-repair.mjs --seed-primary-workspace --upn user@example.com --workspace-name "Banker Workspace"
```

Commit (PATCHes only the primary-workspace lookup, after every gate):

```
node scripts/phase122-lookup-repair.mjs --seed-primary-workspace --upn user@example.com --workspace-name "Banker Workspace" --commit-seed-primary-workspace
```

Both require the operator's `DATAVERSE_BEARER_TOKEN` (the script never
constructs credentials and never calls Microsoft Graph).

## What The Mode Does

1. Resolves the platform user by `cr664_email == upn` (exactly one).
2. Resolves the platform workspace by `cr664_workspacename == workspace-name`
   (exactly one; never created here).
3. If the user's `_cr664_primaryworkspace_value` already equals the
   resolved workspace id -> no-op success.
4. Otherwise plans (dry-run) or performs (commit) a PATCH that sets ONLY
   `cr664_PrimaryWorkspace@odata.bind` on the platform user.
5. On commit, re-reads the user and prints the formatted primary-workspace
   value to verify the link.

Output always prints: DRY RUN vs COMMIT, the resolved user, the resolved
workspace, the planned action, the no-op/patch/bail outcome, and (on
commit) the verification result.

## No-op / Bail Matrix

| Situation | Outcome |
| --- | --- |
| user exists + primary workspace already correct | no-op (success) |
| user exists + different / missing primary workspace | PATCH only `cr664_PrimaryWorkspace@odata.bind` (commit) / plan (dry-run) |
| user missing | BAIL ("provisions EXISTING users only; will not create a platform user") |
| duplicate user (>1 by email) | BAIL (operator resolves ambiguity) |
| workspace missing | BAIL ("this mode does NOT create a workspace") |
| duplicate workspace (>1 by name) | BAIL (operator resolves ambiguity) |
| `--upn` omitted | BAIL at parse time |
| `--workspace-name` omitted | BAIL at parse time |
| `--commit-seed-primary-workspace` without the mode | BAIL at parse time |
| any other mode passed alongside | BAIL (mutex) |

## What This Does NOT Do

- Does NOT create platform users (existing-user only this phase).
- Does NOT create workspaces (bails if the workspace is missing).
- Does NOT grant Dataverse / Microsoft tenant security roles.
- Does NOT write `cr664_workspaceentitlements` rows.
- Does NOT patch any platform-user field other than the primary-workspace
  lookup.
- Does NOT expose in-app provisioning (the Phase 169B admin panel stays
  read-only / preview-only).
- Does NOT call Microsoft Graph or any external HTTP endpoint.
- Does NOT hardcode any GUID (ids are resolved at runtime from stable
  names/emails).

## Test / Smoke Plan

1. Dry-run a known pilot user against an existing workspace; confirm the
   planned PATCH body is exactly the primary-workspace bind.
2. Commit to a single TEST user only; verify the PATCH succeeds and the
   re-read shows the new primary workspace.
3. Verify the user lands on the correct workspace route after a hard
   refresh; verify a non-entitled workspace still fails closed.
4. Rollback: re-run with the prior workspace name to PATCH the
   primary-workspace lookup back (captured in the pre-commit log). A
   single reversible lookup patch; no schema/record deletion.

## Validation Results

- `node --check scripts/phase122-lookup-repair.mjs`: syntax OK.
- Parse-time bails verified locally: missing `--upn`, missing
  `--workspace-name`, commit-flag-without-mode, and the mutex all bail;
  the valid dry-run prints `mode: SEED-PRIMARY-WORKSPACE (dry-run)`.
- `npm test -- phase122 releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Deploy / Tag / Schema / Record

No deploy. No tag created or moved. No schema, migration, or Dataverse
record created during implementation -- the script's commit path is
operator-run only and was not executed here. The implementation added a
script mode + tests + this doc; no Dataverse write occurred.
