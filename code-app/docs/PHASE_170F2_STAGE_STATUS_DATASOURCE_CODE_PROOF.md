# Phase 170F2 -- Stage/Status Typed Data-Source Code Proof

Date: 2026-06-15
Baseline: 56320b1 (Phase 170F). Code-side proof + reader + tests/docs.
No deploy, no tag movement, no Dataverse write, + New Deal stays disabled.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## Outcome: ACCEPTED (code-side typed registration reproduced; reader wired)

The existing typed per-table data-source pattern WAS reproduced in code
for `cr664_dealstagereferences` and `cr664_dealstatusreferences` without
the generic connector artifact, the build + full test suite are green, and
`newDealReferenceReader.ts` is wired to the typed generated services.
+ New Deal stays disabled (the reader is foundation only; not wired to any
create path; production reference rows not approved).

## Why The Toolchain Path Was Unavailable (170E / 170F recap)

- Power Apps Studio "Edit" is grayed out for this code app.
- `pac code pull` is not a command in PAC 2.7.4.
- `pac code add-data-source --apiId shared_commondataserviceforapps`
  produces the generic `MicrosoftDataverseService` + a
  `shared_commondataserviceforapps` connectionReference -- the REJECTED
  connector artifact (170E, reverted). The legacy `shared_commondataservice`
  apiId is also a connector path.
- `pac modelbuilder build` emits C#/VB, not the TS code-app services.

## Key Repo Fact: `.power/` Is Git-Ignored

`code-app/.power/` is gitignored (`.gitignore` line 21), so
`.power/schemas/appschemas/dataSourcesInfo.ts` and the per-table
`.power/schemas/dataverse/*.Schema.json` are NOT version-controlled for
ANY table -- they are downstream/local generated artifacts. The
COMMITTED registration for every existing table is therefore exactly:

1. `power.config.json` -> `databaseReferences."default.cds".dataSources`
   (tracked), and
2. `src/generated/models/*` + `src/generated/services/*` +
   `src/generated/index.ts` (tracked).

`dataSourcesInfo.ts` is regenerated downstream (driven by
`power.config.json` on `pac code push` / sync). It does not affect `tsc`
(the data-source name is an un-validated string) or tests (services are
mocked). NOTE: the LOCAL `dataSourcesInfo.ts` is currently polluted with a
`commondataserviceforapps` connector entry left by the earlier 170E/170F
`add-data-source` experiments; because `.power/` is gitignored, that
pollution is LOCAL ONLY and is never committed. Operator cleanup: delete
`code-app/.power/` and re-sync to regenerate it cleanly from
`power.config.json`.

## What Was Added (committed, tracked)

Matching the existing typed pattern exactly (templated on
`Cr664_bankers*`):

- `src/generated/models/Cr664_dealstagereferencesModel.ts` and
  `Cr664_dealstatusreferencesModel.ts` -- `Base` + read interfaces with
  `cr664_activeflag?`, `cr664_code?`, `cr664_<...>referenceid` (PK),
  `cr664_name`, standard state/status enums + system fields.
- `src/generated/services/Cr664_dealstagereferencesService.ts` and
  `Cr664_dealstatusreferencesService.ts` -- typed CRUD + `getAll`/`get`
  via `getClient(dataSourcesInfo)`, `dataSourceName` =
  `cr664_dealstagereferences` / `cr664_dealstatusreferences`.
- `src/generated/index.ts` -- model + service exports (alphabetical).
- `power.config.json` -> `databaseReferences."default.cds".dataSources`
  gains native `dealstagereferences` / `dealstatusreferences` entries
  (entitySet + logical, `isHidden: false`). NO connectionReference; NO
  `shared_commondataserviceforapps`.
- `src/deals/newDealReferenceReader.ts` -- concrete
  `NewDealReferenceReader` over the typed services (read-only,
  least-privilege `$select`), plus `resolveConfiguredNewDealReferences`.

## Accepted vs Rejected Diff Shape

Accepted (this phase): typed per-table model/service, native
`databaseReferences.default.cds` entries, `apis: {}`-style native binding,
index exports. Rejected (NOT present): `MicrosoftDataverseService` /
`MicrosoftDataverseModel`, any `shared_commondataserviceforapps` /
`shared_commondataservice` connectionReference in committed files.

Verification (committed tree):
```
grep -c shared_commondataserviceforapps power.config.json   # 0
grep -c MicrosoftDataverse src/generated/index.ts            # 0
ls src/generated/services | grep -iE "dealstage|dealstatus"  # 2 typed services
```

## Resolver Reader Behavior

`createNewDealReferenceReader()` calls the typed services' `getAll` with a
least-privilege select (`<id>,cr664_name,cr664_code,cr664_activeflag`),
maps rows to `ReferenceRow`, and throws on a non-success result.
`resolveConfiguredNewDealReferences()` passes the canonical
`STAGE_REFERENCE_SELECTION` / `STATUS_REFERENCE_SELECTION` (code + name,
GUID-free) into the fail-closed `resolveNewDealReferences`, which returns:
- `ready` only when exactly one ACTIVE Stage and one ACTIVE Status match;
  binds built from the verified row ids,
- `missingStage/Status`, `inactiveStage/Status`, `duplicateStage/Status`,
  `serviceError` otherwise.

Selection is by code/name only. The inspected record GUIDs appear in NO
source file (pinned by tests in `newDealReferenceReader.test.ts` and
`newDealReferenceTargets.test.ts`).

## Why + New Deal Remains Disabled

- The reader/resolver are foundation only -- NOT wired to any create path.
- Runtime data-source binding is not deploy-confirmed (no `pac code push`
  this phase); the resolver fails closed if the data source is unbound.
- The only active rows are TEST-environment labels
  (`REFERENCE_SELECTION_PRODUCTION_APPROVED = false`).
- `NOT_WIRED` still carries `new-deal-create`; the Admin New Deal panel
  still renders a disabled "Create deal" placeholder.

## Exact Next Steps

- Phase 170G: surface resolver readiness in the Admin panel (read-only)
  and prepare a governed, audited create that consumes a `ready`
  resolution -- still gated, create disabled until approved.
- Operator: on the next `pac code push`, confirm the deployed app binds
  `cr664_dealstagereferences` / `cr664_dealstatusreferences` (native, no
  connector) and that `resolveConfiguredNewDealReferences()` returns
  `ready` in the target environment; seed/approve PRODUCTION reference
  rows before enabling any create.

## Validation Results

- `npm test -- NewDeal Admin admin phase122 releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).
- `git status --short`: only the tracked files listed above.

## Deploy / Tag / Schema / Record

No deploy. No tag created or moved. No schema or migration. No Dataverse
record created or patched. No Dataverse write. No permission widening. No
connector / `MicrosoftDataverseService` / `shared_commondataserviceforapps`
committed. CRM / portfolio / admin write enablement unchanged.
