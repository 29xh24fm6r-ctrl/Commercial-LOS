# Phase 170G -- Stage/Status Runtime Binding Proof

Date: 2026-06-15
Baseline: 4d9b29b (Phase 170F2). Local `.power` cleanup + controlled
`pac code push` + post-push read-only checks + docs/tests. No Dataverse
write, no records, + New Deal stays disabled.

Runtime tags (unchanged by this phase):
- v1.0.0-controlled-pilot -> faf26d6
- v1.0.1-admin-console-rollout -> 4b21dd8

## .power Cleanup Performed

`code-app/.power/` is gitignored (never committed). Its local
`schemas/appschemas/dataSourcesInfo.ts` carried a `commondataserviceforapps`
(`dataSourceType: "Connector"`) block left by the earlier 170E/170F
`pac code add-data-source` experiments.

- Backed up and deleted the local `.power` directory before push.
- `pac code push` succeeded WITHOUT a local `.power` (see below), proving
  the push derives the deployed data sources from `power.config.json`
  (native, clean) and not from the local connector-polluted file.
- It did NOT regenerate `.power`, so the backup was restored (the
  generated services import `dataSourcesInfo` and the local build needs
  it).
- The single `commondataserviceforapps` connector block (lines 8-3545 of
  the restored `dataSourcesInfo.ts`) was removed; the legitimate Office365
  Outlook connector entry was retained. `npm run build` is green after the
  edit. Result: local `.power` now has zero
  `commondataserviceforapps` / `MicrosoftDataverse` entries.

The local `.power` remains gitignored and was NOT committed.

## Pre-Push Verification

- `git status --short`: clean.
- `power.config.json`: native `databaseReferences."default.cds".dataSources`
  entries for `cr664_dealstagereferences` and `cr664_dealstatusreferences`;
  no `shared_commondataserviceforapps`, no `MicrosoftDataverse`.
- `src/generated/`: typed `Cr664_dealstagereferencesService` /
  `Cr664_dealstatusreferencesService` present (tracked); no
  `MicrosoftDataverseService`; no `shared_commondataserviceforapps`.

## Validation Results (pre-push)

- `npm test -- NewDeal Admin admin phase122 releaseCandidateSnapshot`: passed (47 files / 1597 tests).
- `npm test`: passed, 462 files / 7895 tests.
- `npm run build`: passed (existing Vite chunk-size warning only).
- `git status --short`: clean.

## pac code push Result

```
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d
```

Succeeded (exit 0): "App pushed successfully." Play URL:
`https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/app/63858e09-3d0b-47c9-b1d2-65cef742fda4`.
It pushed cleanly with no local `.power` present, confirming the deployed
data sources come from `power.config.json` (the two native typed
Stage/Status entries; no connector). The push made a line-ending-only
change to `power.config.json`, which was verified content-identical and
restored, so the tracked tree stayed clean.

## Post-Push Stage/Status Inspection Result

`node scripts/phase122-lookup-repair.mjs --inspect-stage-status-values`
could NOT complete in this non-interactive context: the read-only Web API
GET requires a `DATAVERSE_BEARER_TOKEN`, which is not available here, and
the command timed out acquiring credentials. The TABLE/row facts remain as
captured by the operator's earlier read-only inspection (evidence only):
one ACTIVE Stage row (`code=PHASE121_STAGE`) and one ACTIVE Status row
(`code=PHASE121_STATUS`), no duplicates -- TEST-environment labels.

## Generic Connector Artifacts: Absent

- Committed repo: no `MicrosoftDataverseService` / `MicrosoftDataverseModel`;
  `power.config.json` has zero `shared_commondataserviceforapps`.
- Deployed app: registered from `power.config.json` (native, clean) -- the
  connector pollution was never in `power.config` and the push ran without
  the polluted local `.power`.
- Local `.power` (gitignored): the `commondataserviceforapps` connector
  block was removed; only the legitimate Office365 Outlook connector
  remains.

## + New Deal Remains Disabled

`NOT_WIRED` still carries `new-deal-create`; the resolver reader is
foundation only (not wired to any create path); the Admin New Deal panel
still renders a disabled "Create deal" placeholder; the TEST reference
rows are not approved for production
(`REFERENCE_SELECTION_PRODUCTION_APPROVED = false`).

## Runtime Resolver Readiness: NOT Directly Proven Here

The push bound the two native typed data sources in the deployed app, but
runtime resolver readiness was NOT directly proven from this context:

- The resolver runs inside the deployed app; it is not wired to any UI
  surface yet, so there is no in-app surface to exercise it.
- The external `--inspect-stage-status-values` probe needs a bearer token
  (unavailable here) and confirms only that the TABLES/rows exist, not
  that the APP has the data sources bound.

EXPECTATION: given exactly one ACTIVE Stage (`PHASE121_STAGE`) and one
ACTIVE Status (`PHASE121_STATUS`) row with no duplicates,
`resolveConfiguredNewDealReferences()` is EXPECTED to return `ready` once
the binding is exercised in-app. Proving it requires either (a) an
operator run of `--inspect-stage-status-values` with a token plus an
in-app resolver smoke, or (b) Phase 170G+ surfacing resolver readiness in
a read-only admin display followed by an in-app smoke. + New Deal stays
disabled until then and until production reference rows are approved.

## Rollback Command

```
git checkout v1.0.1-admin-console-rollout
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d
git checkout master
```

This restores the `4b21dd8` runtime (admin console rollout) without the
Stage/Status data sources. Because nothing consumes the resolver at
runtime and no records were written, a rollback has no data to reconcile.

## Schema / Record / Write / Tag Statement

No schema or migration. No Dataverse record created or patched. No
Stage/Status record created. No Dataverse write. No tag created or moved
(`v1.0.0-controlled-pilot` -> `faf26d6`, `v1.0.1-admin-console-rollout` ->
`4b21dd8`). No permission widening. No CRM/portfolio/admin write
enablement change. The only deploy was the `pac code push` above
(read/native-data-source binding from `power.config.json`).
