# Phase 133C — Executive primary-workspace provisioning seed

## Why this is provisioning, not app code

Phase 133B proved the reachability logic is already correct: the
Executive Workspace appears in the switcher and the gate admits
`/workspaces/executive` **only** when the signed-in Platform User's
primary workspace resolves to `"Executive Dashboard"`. Manager/team
entitlement is **not** a proxy (`useEntitledRoutes` never emits the
executive route).

So `mpaller@oldglorybank.com` still seeing Banker / Team / Manager /
Portfolio is a **Dataverse provisioning gap**, not an app bug. The fix
is to point that Platform User's primary-workspace lookup at the
"Executive Dashboard" workspace. **No React file changes** — `WorkspaceGate`,
`workspaceEntitlements`, `ExecutiveWorkspace`, and the bootstrap/route
logic are untouched (and their tests still pass).

This phase adds a **guarded operator script mode** that performs exactly
that one safe write:

```
--seed-executive-primary-workspace
```

It resolves one Platform User (by `cr664_email`) and at most one
"Executive Dashboard" Platform Workspace (by `cr664_workspacename`), then
PATCHes **only** `cr664_PrimaryWorkspace@odata.bind` on the Platform
User. It touches no Banker / Team / Loan Deal / Manager / Portfolio /
Executive data row. Dry-run is the default; the lone write requires an
explicit commit flag. It bails on zero or ambiguous rows and uses no
bypass / suppress / force headers.

## Dry-run command (default — no writes)

```sh
pac auth create --deviceCode        # one-time, select the LOS environment
node scripts/phase122-lookup-repair.mjs \
  --seed-executive-primary-workspace \
  --upn "mpaller@oldglorybank.com" \
  --workspace-name "Executive Dashboard"
```

The dry-run resolves the rows, prints the plan, and writes nothing.

## Commit command (the single guarded write)

```sh
node scripts/phase122-lookup-repair.mjs \
  --seed-executive-primary-workspace \
  --upn "mpaller@oldglorybank.com" \
  --workspace-name "Executive Dashboard" \
  --commit-seed-executive-primary-workspace
```

- If the "Executive Dashboard" Platform Workspace does not exist, it is
  created on commit with **only** `cr664_workspacename` (mirrors the
  existing team create-on-commit seed pattern).
- The Platform User PATCH body contains exactly one key:
  `cr664_PrimaryWorkspace@odata.bind`.
- It is idempotent — a no-op when the user already points at the
  resolved workspace.

## Expected output (commit, happy path)

```
Phase E — TEST executive primary-workspace seed
   UPN:             mpaller@oldglorybank.com
   Workspace name:  Executive Dashboard
   Mode:            COMMIT-SEED-EXECUTIVE-PRIMARY-WORKSPACE (will write)

   ✓ Platform user found:  cr664_platformuserid=<guid>
     current _cr664_primaryworkspace_value: <old-ws-guid or (unset)>
   ✓ Platform workspace exists:  cr664_platformworkspaceid=<ws-guid>
   (or)  ⚙ Platform workspace "Executive Dashboard" does not exist — will create on commit …

   Planned actions:
     [1] PATCH /api/data/v9.2/cr664_platformusers(<guid>)
         body: { "cr664_PrimaryWorkspace@odata.bind": "/cr664_platformworkspaces(<ws-guid>)" }
         PATCH body sets ONLY cr664_PrimaryWorkspace@odata.bind — no other Platform User column, and no Banker / Team / Loan Deal / Manager / Portfolio / Executive row, is touched.

   ⚙ PATCH cr664_platformusers(<guid>) cr664_PrimaryWorkspace@odata.bind …
   ✓ Platform user PATCH succeeded.

   ⚙ Re-reading the platform user to verify the new primary workspace …
     platform user _cr664_primaryworkspace_value:  <ws-guid>
     primary workspace formatted value:            Executive Dashboard
     ✓ Primary workspace lookup is linked to the Executive Dashboard workspace.

Summary:
   workspace created:  no (reused)
   workspace id:       <ws-guid>
   platform user id:   <guid>

After a hard browser refresh, this user should land on /workspaces/executive or see Executive Workspace according to the bootstrap route.

✓ Seed commit complete.
```

A dry-run prints the same plan and ends with:

```
   Dry-run only — no POST or PATCH issued.
   Re-run with `--commit-seed-executive-primary-workspace` to execute the plan above.
```

## Rollback — restore the previous primary workspace

The seed records the user's prior `_cr664_primaryworkspace_value` in the
dry-run/commit output — capture it before committing. To roll back, run
the same mode pointed at the previous workspace name. For example, to
return the user to the Banker Workspace:

```sh
node scripts/phase122-lookup-repair.mjs \
  --seed-executive-primary-workspace \
  --upn "mpaller@oldglorybank.com" \
  --workspace-name "Banker Workspace" \
  --commit-seed-executive-primary-workspace
```

Or to the Manager Command Center:

```sh
node scripts/phase122-lookup-repair.mjs \
  --seed-executive-primary-workspace \
  --upn "mpaller@oldglorybank.com" \
  --workspace-name "Manager Command Center" \
  --commit-seed-executive-primary-workspace
```

(Both `"Banker Workspace"` and `"Manager Command Center"` are existing
seeded Platform Workspace names — the mode reuses them and will not
create duplicates. The same single-lookup PATCH discipline applies.)

Alternatively, in the Maker Portal, edit the `cr664_platformuser` row's
**Primary Workspace** lookup back to the desired workspace.

## ⚠ Warning — one primary workspace per user

The platform supports **one primary workspace per user** today. Setting
Executive Dashboard as the primary workspace **changes this user's
default landing experience**: on next login they land on
`/workspaces/executive` instead of their previous default. If they also
need Banker/Manager/Team/Portfolio, those remain reachable via the
workspace switcher only insofar as they are otherwise entitled (e.g. the
manager probe), but their *default* workspace is now Executive. For a
pilot operator this is usually intended; confirm before committing.

## What changed

- `scripts/phase122-lookup-repair.mjs` — new mutually-exclusive
  `--seed-executive-primary-workspace` mode + `--workspace-name` /
  `--commit-seed-executive-primary-workspace` flags, four Platform
  helpers (`findPlatformUserByEmail`, `findPlatformWorkspaceByName`,
  `createPlatformWorkspace`, `patchPlatformUserPrimaryWorkspace`,
  `readPlatformUserPrimaryWorkspace`), and the
  `runSeedExecutivePrimaryWorkspace` runner.
- `src/shared/governance/phase122BScriptContract.test.ts` — extended the
  mutex-message pins and added a Phase 133C block (mode parsing, dry-run
  default, commit-required, required inputs, resolve-by-email-only,
  bail-on-zero/ambiguous, PATCH-only-primary-workspace, no
  banker/team/loan-deal table touched, no bypass headers).
- **No React / app entitlement code changed.** `WorkspaceGate`,
  `workspaceEntitlements`, `ExecutiveWorkspace`, `ExecutiveCommandCenter`,
  and the bootstrap flow are untouched.

## Acceptance

```
npm test -- phase122BScriptContract workspaceEntitlements WorkspaceGate Executive ExecutiveWorkspace
npm run build
```

Target suites: **388 tests pass** (incl. the 318-assertion script
contract). Full suite 3867. Build clean. No app-code permission
widening; no manager/team entitlement proxy; the only write the script
can make is the single Platform User primary-workspace lookup.
