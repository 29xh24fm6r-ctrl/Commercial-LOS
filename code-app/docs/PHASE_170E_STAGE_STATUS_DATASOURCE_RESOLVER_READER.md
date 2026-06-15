# Phase 170E -- Stage/Status Data Source Registration + Resolver Reader

Date: 2026-06-15
Baseline: 8935569 (Phase 170D-R). Code/config + tests/docs only. No
deploy, no tag movement, no schema, no Dataverse write, + New Deal stays
disabled.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## Outcome: registration blocked via the available toolchain; resolver stays notConfigured (no reader wired)

The two reference tables could NOT be registered as typed per-table data
sources using the available `pac code add-data-source` flow, so no reader
was wired and the resolver remains `notConfigured`. + New Deal stays
disabled. The exact registration runbook + blocker are below.

## Live Inspection Values (EVIDENCE ONLY -- never hardcoded)

From the read-only `--inspect-stage-status-values` run on 2026-06-15
(pure GET; no writes):

Stage references -- `cr664_dealstagereferences`, exactly 1 ACTIVE row:
- code = `PHASE121_STAGE`
- name = `TEST - Stage Phase 121`
- id   = (observed, NOT stored in source)

Status references -- `cr664_dealstatusreferences`, exactly 1 ACTIVE row:
- code = `PHASE121_STATUS`
- name = `TEST — Status Phase 121`
- id   = (observed, NOT stored in source)

These are CURRENT TEST-ENVIRONMENT reference rows (note the "Phase 121"
labels), not approved production labels. The observed record GUIDs are
inspection evidence only; a test pins that neither GUID appears anywhere
in source. Resolution is by unique active code/name, never by id.

## Were Data Sources / Generated Services Added?

No. `pac code add-data-source --apiId shared_commondataserviceforapps
--connectionId <dataverse> --table cr664_dealstagereferences` ran
successfully but produced the WRONG artifact: it added the generic
**Microsoft Dataverse connector** (`MicrosoftDataverseService` with
`GetOrganizations` / `executeAsync`, a `commondataserviceforapps`
connectionReference in `power.config.json`), NOT a typed
`Cr664_dealstagereferencesService` matching the app's existing
`databaseReferences.default.cds` per-table pattern (e.g.
`Cr664_loandealsService`). The `--table` argument did not yield a typed
table service.

That output was reverted in full (no connector reference, no generic
service, no index changes) because it is inconsistent with the
established typed-service pattern and would change the app's connector
footprint. No generated file was hand-edited.

## Generator / Toolchain Command -- Blocker

- Available: PAC CLI 2.7.4; an authenticated Dataverse connection
  (`shared_commondataserviceforapps`, id
  `shared-commondataser-bfdd1811-ce5b-49e1-8eab-7776eb9ae0f1`).
- Blocker: the connector-based `add-data-source` does not reproduce the
  native `databaseReferences.default.cds` typed per-table registration
  that the existing 28 tables use. The correct registration of
  `cr664_dealstagereferences` / `cr664_dealstatusreferences` as typed
  Dataverse data sources must be performed via the SAME Dataverse
  data-source flow that produced the existing tables (the Power Apps Code
  App Dataverse data-source authoring path / model regeneration), then
  committed as generator-produced files. That flow could not be
  reproduced safely and non-interactively in this context, so it is left
  as an explicit operator/toolchain step.

## Registration Runbook (operator/toolchain step)

1. From the code-app directory, authenticated to environment
   `5f2d77a5-de50-edeb-9d74-5b2400a2320d`, add the two Dataverse tables
   as TYPED data sources using the same flow that registered the existing
   `cr664_loandeals` etc. (matching `databaseReferences.default.cds`),
   for `cr664_dealstagereferences` and `cr664_dealstatusreferences`.
2. Confirm the generator produced (do NOT hand-edit):
   - `power.config.json` database references for both tables,
   - `.power/schemas/appschemas/dataSourcesInfo.ts` entries,
   - `src/generated/models/Cr664_dealstagereferencesModel.ts` +
     `...statusreferences...` and matching `...Service.ts`.
3. Then (next phase) add `src/deals/newDealReferenceReader.ts` that calls
   the generated services' `getAll` with a code/name filter, maps rows to
   `ReferenceRow`, and passes them to `resolveNewDealReferences` with
   `STAGE_REFERENCE_SELECTION` / `STATUS_REFERENCE_SELECTION`.

## Resolver Reader Behavior (planned; not wired this phase)

The fail-closed `resolveNewDealReferences` (Phase 170D) already returns
the typed union and emits `@odata.bind` paths only from a verified unique
active row id. A future reader will:
- read active Stage rows by `STAGE_REFERENCE_SELECTION.code` (then name),
- read active Status rows by `STATUS_REFERENCE_SELECTION.code` (then name),
- pass rows into `resolveNewDealReferences`,
- map a service/transport failure to `serviceError`, and an absent/
  unregistered service to `notConfigured`,
- never use a GUID constant.

Until that reader exists, app callers pass no reader, so the resolver
returns `notConfigured`.

## Code/Name Selection Rules (added this phase, config only)

`src/deals/newDealReferenceTargets.ts` now exports the TEST-environment
selectors (GUID-free): `STAGE_REFERENCE_SELECTION`
(`PHASE121_STAGE`) and `STATUS_REFERENCE_SELECTION`
(`PHASE121_STATUS`), plus `REFERENCE_SELECTION_IS_TEST_ENVIRONMENT = true`
and `REFERENCE_SELECTION_PRODUCTION_APPROVED = false`. Selection is by
unique active code (preferred) or name; a future reader resolves the id
at read time and never hardcodes it.

## Why Inspected GUIDs Are Not Hardcoded

App access and create binds must resolve to a single ACTIVE row at run
time; hardcoding a GUID would break if the row is deactivated, replaced,
or differs per environment, and would be a fabricated default. A test
pins that the two inspected GUIDs appear in NO source file.

## Why + New Deal Remains Disabled

- The Stage/Status tables are not registered as typed data sources, so no
  reader can be constructed; the resolver returns `notConfigured`.
- The only active rows are TEST-environment labels; production
  Stage/Status references are not seeded/approved
  (`REFERENCE_SELECTION_PRODUCTION_APPROVED = false`).
- `NOT_WIRED` still carries `new-deal-create`; the Admin New Deal panel
  still renders a disabled "Create deal" placeholder.

## Exact Next Step To A Controlled New Deal Create Smoke

1. Register the two typed data sources via the toolchain (runbook above).
2. Wire `newDealReferenceReader.ts` and confirm
   `resolveNewDealReferences` returns `ready` in the TEST environment.
3. Seed/approve PRODUCTION Stage/Status reference rows and update the
   selection (or flip `REFERENCE_SELECTION_PRODUCTION_APPROVED`).
4. Only then, in a separate governed phase, wire an audited New Deal
   create that consumes a `ready` resolution (entitlement gate, the two
   resolved binds, a `cr664_AuditEvent`, typed outcome, payload tests).

## Files Changed

- `src/deals/newDealReferenceTargets.ts` -- added GUID-free TEST-env
  code/name selection config + posture flags.
- `src/deals/newDealReferenceTargets.test.ts` -- selection + no-inspected-
  GUID pins.
- `src/shared/governance/releaseCandidateSnapshot.test.ts` -- 170E doc pin.
- `docs/PHASE_170E_STAGE_STATUS_DATASOURCE_RESOLVER_READER.md` -- this doc.

No generated file was added or hand-edited (the connector attempt was
reverted in full).

## Validation Results

- `npm test -- NewDeal Admin admin phase122 releaseCandidateSnapshot`: passed.
- `npm test`: passed (full suite).
- `npm run build`: passed (existing Vite chunk-size warning only).

## Deploy / Tag / Schema / Record

No deploy. No tag created or moved. No schema, migration, or Dataverse
record created. No data source registered (the connector attempt was
reverted). No Dataverse write performed. No permission widening. CRM /
portfolio / admin write enablement unchanged.
