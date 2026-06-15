# Phase 170F -- Typed Stage/Status Data-Source Registration Runbook

Date: 2026-06-15
Baseline: c17a4eb (Phase 170E). Docs + tests only. No deploy, no tag
movement, no schema, no Dataverse write, no generated files committed,
+ New Deal stays disabled.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## Purpose

Document the exact, safe, non-hand-edit procedure to register the two
Stage/Status reference tables as TYPED Dataverse data sources matching the
app's existing per-table pattern, plus the verification and rollback
commands. No generated file is hand-edited; no generic connector artifact
is committed.

Target tables (live metadata, evidence only -- no GUIDs):
- Stage: logical `cr664_dealstagereference`, entity set
  `cr664_dealstagereferences`, id `cr664_dealstagereferenceid`, name
  `cr664_name`, fields `cr664_name` / `cr664_code` / `cr664_activeflag`.
- Status: logical `cr664_dealstatusreference`, entity set
  `cr664_dealstatusreferences`, id `cr664_dealstatusreferenceid`, name
  `cr664_name`, fields `cr664_name` / `cr664_code` / `cr664_activeflag`.

## What Was Tried In 170E And Why It Was Wrong

170E ran:

```
pac code add-data-source --apiId shared_commondataserviceforapps \
  --connectionId shared-commondataser-bfdd1811-... \
  --table cr664_dealstagereferences
```

It "succeeded" but produced the CONNECTOR artifact, not a typed per-table
data source:
- a generic `MicrosoftDataverseService` (`GetOrganizations`,
  `executeAsync`, etc.) in `src/generated/services/`,
- a generic `MicrosoftDataverseModel`,
- a `shared_commondataserviceforapps` connectionReference in
  `power.config.json` (populated `apis`),
- no `Cr664_dealstagereferencesService`.

That was reverted in full. It is REJECTED here (see "Rejected diff shape").

## Phase 170F Toolchain Investigation (read-only + one discarded scratch branch)

- `pac code add-data-source --apiId shared_commondataserviceforapps` ->
  generic connector artifact (proven in 170E). REJECTED.
- `pac code add-data-source --apiId shared_commondataservice` (the legacy
  Dataverse connector) -> requires `--dataset`; it is also a CONNECTOR
  path and would produce a connector data source, not the native typed
  pattern. Proven on a throwaway branch
  `scratch/stage-status-datasource-proof` (no files written; the command
  errored on the missing `--dataset` before writing); the branch was
  deleted and master left clean. REJECTED.
- `pac modelbuilder build` -> generates C#/VB early-bound classes
  (`--language CS|VB`, default CS) into `--outdirectory`. It does NOT
  generate the TypeScript code-app services under `src/generated/`.
  Not applicable to the typed TS data sources.
- `package.json` has no SDK-generation script; `.power/` carries no
  modelbuilder settings file; `docs/CANONICAL_SOURCES.md` marks
  `src/generated/` as "regenerated; do not hand-edit".

Conclusion: **no safe non-manual `pac` command in this toolchain version
(PAC 2.7.4) reproduces the native typed per-table data source.** The
native `databaseReferences.default.cds` typed pattern is produced by the
Power Apps Studio Dataverse "Add data" binding (how the existing tables
were scaffolded in Phase 1), then pulled into code.

## Exact Existing Typed Data-Source Pattern (accepted)

For each table, the existing 28 tables show three coordinated, generator-
produced artifacts:

1. `power.config.json` -> `databaseReferences."default.cds".dataSources`
   gains a friendly-key entry, e.g.:
   ```
   "dealstagereferences": {
     "entitySetName": "cr664_dealstagereferences",
     "logicalName": "cr664_dealstagereference",
     "isHidden": false
   }
   ```
   (NO connectionReference; NO `shared_commondataserviceforapps`.)
2. `.power/schemas/appschemas/dataSourcesInfo.ts` gains an entity-set-keyed
   entry, e.g.:
   ```
   "cr664_dealstagereferences": {
     "tableId": "", "version": "", "primaryKey": "cr664_dealstagereferenceid",
     "dataSourceType": "Dataverse", "apis": {}
   }
   ```
   (`apis: {}` empty == native Dataverse, NOT a connector.)
3. `src/generated/models/Cr664_dealstagereferencesModel.ts` +
   `src/generated/services/Cr664_dealstagereferencesService.ts` (typed,
   per-table, `getClient(dataSourcesInfo)` + `getAll`/`get`), and an
   export line in `src/generated/index.ts`.

## Accepted Diff Shape

- `databaseReferences.default.cds` includes `dealstagereferences` and
  `dealstatusreferences` (entitySet + logical).
- `dataSourcesInfo.ts` includes `cr664_dealstagereferences` and
  `cr664_dealstatusreferences` with `dataSourceType: "Dataverse"`,
  `apis: {}`.
- `src/generated/.../Cr664_dealstagereferencesService.ts` and
  `...statusreferences...` exist; `index.ts` exports them.
- NO `MicrosoftDataverseService` / `MicrosoftDataverseModel`.
- NO `shared_commondataserviceforapps` (or `shared_commondataservice`)
  connectionReference.

## Rejected Diff Shape

- Any `MicrosoftDataverseService` / `MicrosoftDataverseModel`.
- Any `shared_commondataserviceforapps` / `shared_commondataservice`
  connectionReference, or populated `apis` on the new dataSourcesInfo
  entries.
- Hand-edited generated files.

## Operator Procedure (Power Apps Studio -- the working path)

1. Open the app in Power Apps Studio (make.powerapps.com -> the
   "Commercial Lending LOS (Rebuild)" code app, environment
   `5f2d77a5-de50-edeb-9d74-5b2400a2320d`).
2. Left rail -> Data -> "Add data".
3. Choose the Dataverse (Tables) source (the native Dataverse, NOT a
   connector tile).
4. Select both tables: "Deal Stage Reference"
   (`cr664_dealstagereference`) and "Deal Status Reference"
   (`cr664_dealstatusreference`).
5. Save the app.
6. Pull the updated source to this repo via the code-app sync the team
   uses to obtain generated files (the same path that produced the
   existing typed services), so `power.config.json`,
   `.power/schemas/appschemas/dataSourcesInfo.ts`, and
   `src/generated/.../Cr664_dealstage|statusreferences*` are written by
   the toolchain.
7. Review the diff against "Accepted diff shape" above. If anything
   matches "Rejected diff shape", discard and re-do.

## Verification Commands

```
# typed services exist
ls src/generated/services | grep -iE "dealstage|dealstatus"
ls src/generated/models   | grep -iE "dealstage|dealstatus"

# native database references present (entitySet + logical)
grep -nE "dealstagereferences|dealstatusreferences" power.config.json
grep -nE "cr664_dealstagereferences|cr664_dealstatusreferences" \
  .power/schemas/appschemas/dataSourcesInfo.ts

# NO generic connector artifact remains
test ! -f src/generated/services/MicrosoftDataverseService.ts && echo OK-no-connector-service
grep -c "shared_commondataserviceforapps" power.config.json   # expect 0
grep -c "MicrosoftDataverse" src/generated/index.ts            # expect 0
```

## Rollback Commands

```
# discard a bad/partial registration before commit
git checkout -- power.config.json src/generated/index.ts \
  .power/schemas/appschemas/dataSourcesInfo.ts
git clean -f src/generated/models src/generated/services
git status --short   # expect clean
```

## Confirming No Generic Connector Artifact Remains

After any attempt: `git status --short` clean; the three `grep`/`test`
checks above return the "expect 0 / OK" results. The current repo at this
phase has none (confirmed: `power.config.json` has 0
`shared_commondataserviceforapps`; no `MicrosoftDataverse*` files).

## Why + New Deal Remains Disabled

No typed data source was registered in this phase (the safe path is the
operator Studio step above). The resolver stays `notConfigured`, no reader
is wired, `NOT_WIRED` still carries `new-deal-create`, and the Admin New
Deal panel keeps its disabled "Create deal" placeholder. The TEST-env
Stage/Status rows remain unapproved for production
(`REFERENCE_SELECTION_PRODUCTION_APPROVED = false`).

## Next Phase After Successful Registration

Phase 170G -- wire `src/deals/newDealReferenceReader.ts` over the
generated `Cr664_dealstagereferencesService` / `...statusreferences...`
`getAll`, select active rows by `STAGE_REFERENCE_SELECTION` /
`STATUS_REFERENCE_SELECTION` (code/name, never id), pass to
`resolveNewDealReferences`, and surface readiness in the Admin panel.
+ New Deal create stays disabled until a separate governed, audited
create phase (and production reference rows are approved).

## Validation Results

- Toolchain investigation: read-only help + one discarded scratch branch;
  master left clean; no generated files committed.
- `npm test -- releaseCandidateSnapshot NewDeal Admin admin`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Deploy / Tag / Schema / Record

No deploy. No tag created or moved. No schema, migration, or Dataverse
record created. No data source registered (documentation only). No
Dataverse write. No permission widening. No generated file committed.
