# Phase 170I -- Runtime dataSourcesInfo Binding Repair (Stage/Status)

Date: 2026-06-15
Baseline: 63db8b1 (Phase 170H-A). Local `.power` repair + tracked repair
script + tests/docs (+ deploy). No Dataverse write, no records, + New Deal
stays disabled.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## Live Smoke Failure (Phase 170H)

In the deployed app: Admin -> Operations Console -> New Deal Intake ->
"Resolver readiness (read-only smoke)" rendered BLOCKED (fail-closed) with:

> Data source not found: Unable to find data source:
> cr664_dealstagereferences in data sources info.

+ New Deal remained disabled. This proved the runtime Stage/Status
data-source binding was still missing.

## Root Cause

`code-app/.power/` is gitignored. The bundled app resolves data sources
at runtime through `getClient(dataSourcesInfo)`, where `dataSourcesInfo`
is `.power/schemas/appschemas/dataSourcesInfo.ts` -- a LOCAL, gitignored
artifact bundled into the build. Phases 170F2/170G added the two tables to
`power.config.json` (tracked) and added typed generated services, but the
two entries were NEVER added to the local `dataSourcesInfo.ts`, and the
available toolchain does not regenerate that file from `power.config.json`
(`pac code add-data-source` produces connector artifacts; `pac code push`
bundles the existing local manifest as-is). So the runtime manifest lacked
`cr664_dealstagereferences` / `cr664_dealstatusreferences`, and the typed
`getAll` call failed closed.

## Exact Local .power Finding

Before repair, `.power/schemas/appschemas/dataSourcesInfo.ts` contained
zero entries for `cr664_dealstagereferences` / `cr664_dealstatusreferences`
(grep count 0) and zero connector pollution (the 170G `commondataserviceforapps`
removal held). Existing native entries follow the pattern:

```
"cr664_loandeals": {
  "tableId": "",
  "version": "",
  "primaryKey": "cr664_loandealid",
  "dataSourceType": "Dataverse",
  "apis": {}
},
```

## Was Local Repair Required?

Yes. The fix is local to the gitignored `.power` manifest. The two
required native entries were added:

```
"cr664_dealstagereferences": { ... "primaryKey": "cr664_dealstagereferenceid", "dataSourceType": "Dataverse", "apis": {} },
"cr664_dealstatusreferences": { ... "primaryKey": "cr664_dealstatusreferenceid", "dataSourceType": "Dataverse", "apis": {} },
```

No connector entry, no GUID, no per-table `dataverse/*.Schema.json`
(those are not imported by the generated services at runtime; the error
named `dataSourcesInfo` specifically).

## Tracked vs Local (why a script, not a committed .power)

`.power` is gitignored and MUST NOT be committed, but the local repair
would be lost on a clean checkout or any `.power` regeneration, silently
reintroducing the runtime failure. To make the repair reproducible without
committing `.power`, this phase adds a TRACKED, additive, offline,
idempotent repair script:

```
node scripts/sync-datasourcesinfo.mjs            # repair the local manifest
node scripts/sync-datasourcesinfo.mjs --check    # report only; exit 1 if missing
```

It reads `power.config.json` databaseReferences."default.cds" and inserts
any missing native entry into the local `dataSourcesInfo.ts`
(`primaryKey = "<logicalName>id"`, `dataSourceType: "Dataverse"`,
`apis: {}`). It is ADDITIVE only (never removes/rewrites existing entries,
so the Office365 Outlook connector entry is preserved), writes NO generic
MicrosoftDataverse / shared_commondataserviceforapps entry, hardcodes no
GUID, and performs no network/Dataverse call. Run it (or `--check`) before
`pac code push`.

## Exact Repair Steps

1. From `code-app/`, run `node scripts/sync-datasourcesinfo.mjs` (or apply
   the two native entries above to `.power/schemas/appschemas/dataSourcesInfo.ts`).
2. Verify: `node scripts/sync-datasourcesinfo.mjs --check` exits 0; the
   manifest has the two entries and zero `commondataserviceforapps` /
   `MicrosoftDataverse`.
3. `npm run build` (the build bundles the repaired manifest).
4. `pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d`.
5. Restore the EOL-only `power.config.json` change from push if present.

## Push Result

`pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d` run
after build with the repaired local manifest (see report). The
line-ending-only `power.config.json` change was verified content-identical
and restored.

## Smoke Result

In-app smoke is performed by the operator: Admin -> Operations Console ->
New Deal Intake -> "Resolver readiness". With the manifest repaired and
the deploy applied, the card is EXPECTED to show "Ready (TEST)" with Stage
`PHASE121_STAGE` and Status `PHASE121_STATUS` (the single active TEST
rows), the "TEST reference rows -- not production-approved" warning, and
"Create remains disabled". Any residual failure renders an honest
fail-closed state.

## + New Deal Remains Disabled

`NOT_WIRED` still carries `new-deal-create`;
`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`; the resolver/reader is
read-only and not wired to any create path; the readiness card adds no
create control; TEST reference rows are not production-approved
(`REFERENCE_SELECTION_PRODUCTION_APPROVED = false`).

## No Records / Writes / Tags Statement

No Dataverse record created, patched, or deleted. No Stage/Status record.
No schema or migration. No tag created or moved. No permission widening.
No generic connector artifact (committed, deployed, or local). The repair
edits only the gitignored local `dataSourcesInfo.ts` (not committed) plus a
tracked offline repair script.
