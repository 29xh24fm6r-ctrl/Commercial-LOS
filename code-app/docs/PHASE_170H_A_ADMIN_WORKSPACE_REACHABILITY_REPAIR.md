# Phase 170H-A -- Admin Workspace Reachability & Provisioning Repair

Date: 2026-06-15
Baseline: aa979a8 (Phase 170H). Operator script modes + tests/docs only.
No deploy, no tag movement, no Dataverse write during implementation,
+ New Deal stays disabled.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## Purpose

Give the operator safe commands to (1) list Platform Workspace rows,
(2) seed a missing Admin Workspace row, and then route Matt to it using
the EXISTING `--seed-primary-workspace` command. Routing is NOT automated
here -- it remains a deliberate, separate operator step.

## Commands Added (scripts/phase122-lookup-repair.mjs)

### 1. `--list-platform-workspaces` (read-only)
Pure GET of `cr664_platformworkspace` rows
(`cr664_platformworkspaceid`, `cr664_workspacename`), ordered by name.
Never writes.

```
node scripts/phase122-lookup-repair.mjs --list-platform-workspaces
```

### 2. `--seed-platform-workspace --workspace-name "<name>"` (dry-run default)
Resolves `cr664_platformworkspace` by `cr664_workspacename`:
- exactly one -> no-op success;
- more than one -> bail (operator resolves ambiguity);
- zero -> plan a create (POST `{ "cr664_workspacename": "<name>" }`).

Dry-run by default; no POST without the commit flag.

```
node scripts/phase122-lookup-repair.mjs --seed-platform-workspace --workspace-name "Admin Workspace"
```

### 3. `--commit-seed-platform-workspace`
Only valid alongside `--seed-platform-workspace`. POSTs ONLY
`cr664_workspacename` (reuses the existing `createPlatformWorkspace`
helper -- the same minimal-field create used by the executive seed), then
verifies by re-reading. No unrelated fields, no bypass/suppress/force
headers, no security role.

```
node scripts/phase122-lookup-repair.mjs --seed-platform-workspace --workspace-name "Admin Workspace" --commit-seed-platform-workspace
```

## Suggested Operator Flow (manual, not automated)

1. `--list-platform-workspaces` -> confirm whether an Admin Workspace row
   exists and its exact name.
2. If missing: `--seed-platform-workspace --workspace-name "<exact admin
   name>"` (dry-run), review the plan, then re-run with
   `--commit-seed-platform-workspace`.
3. Route Matt with the EXISTING existing-user-only command:
   `--seed-primary-workspace --upn mpaller@oldglorybank.com --workspace-name
   "<exact admin name>"` (dry-run, then `--commit-seed-primary-workspace`).
   This patches ONLY `cr664_platformuser.cr664_PrimaryWorkspace`; it never
   creates a user and bails if the workspace is missing.

Do not guess the admin workspace name -- use the exact name from step 1.

## Safety / Mutex

All three flags are mutually exclusive with every other script mode. The
commit flag fails without its seed mode; the seed mode requires
`--workspace-name`. `--seed-primary-workspace` is unchanged and remains
existing-user only (still requires `--upn`; never calls
`createPlatformWorkspace`).

## Guardrails Honored

- No automated routing of Matt (operator runs the seed-primary-workspace
  step deliberately).
- No New Deal change; no deal created; + New Deal stays disabled
  (`new-deal-create` still in `NOT_WIRED`).
- No Dataverse security roles granted.
- No deploy; no tag moved.
- No Graph / external HTTP (reuses the script's existing Web API GET/POST
  helpers).
- No hardcoded GUIDs (resolution is by `cr664_workspacename`).
- POST body is `cr664_workspacename` only; verify-by-re-read; no bypass
  headers.

## Validation Results

- `node --check scripts/phase122-lookup-repair.mjs`: syntax OK; parse-time
  bails (commit-without-mode, seed-without-workspace-name), mutex, and
  read-only/dry-run banners verified locally.
- `npm test -- phase122 releaseCandidateSnapshot Admin admin NewDeal`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## No Deploy / Tag / Schema / Record / Write Statement

No deploy. No tag created or moved. No schema or migration. No Dataverse
record created or patched during implementation (the new commit path is
operator-run only and was not executed here). No permission widening. No
CRM/portfolio/admin write enablement change.
