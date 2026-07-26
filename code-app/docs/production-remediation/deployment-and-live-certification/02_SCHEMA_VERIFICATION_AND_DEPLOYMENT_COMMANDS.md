# Schema Verification Sweep and Final Deployment Commands

## Schema verification sweep (run after applying all four migrations in `01_MIGRATION_RUNBOOK.md`)

### Existing schema, still valid (unchanged by this arc — run to confirm nothing regressed)

```
powershell -File scripts/dataverse/verify-full-schema.ps1
powershell -File scripts/dataverse/verify-pac-table-access.ps1
```

Both are **read-only**, both fail closed (`verify-full-schema.ps1` prints PASS/BLOCKED/UNKNOWN per
domain; `verify-pac-table-access.ps1` proves live table reachability via `pac org fetch` and writes
evidence to `scripts/dataverse/evidence/pac-table-access.<domain>.json`).

### This arc's four new migrations

```
# Migration 1 (N-01/N-16)
powershell -File scripts/dataverse/create-document-requirement-lifecycle-fields.ps1

# Migrations 2-4 (require DATAVERSE_URL / DATAVERSE_ACCESS_TOKEN in the environment)
node scripts/schema-migrations/pr138-crm-industry-projection/verify-columns.mjs
node scripts/schema-migrations/pr142-test-record-field/verify-columns.mjs
node scripts/schema-migrations/pr123-closing-document-persistence/verify-entity.mjs
```

Every one of these four commands is read-only / dry-run and exits 0 only when its columns/table
are confirmed present with the expected type — see `01_MIGRATION_RUNBOOK.md` for the full detail
on each.

### Expected results before proceeding to deployment

- Existing schema: PASS on both `verify-full-schema.ps1` and `verify-pac-table-access.ps1`.
- All four new migrations: exit 0 (present), not exit 1 (missing).

If any of the four new-migration verifies fails, **stop and re-run its create/apply command** from
`01_MIGRATION_RUNBOOK.md` before proceeding — do not deploy code against an unconfirmed schema.

## Final deployment commands

**This exact command sequence is copied from `docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md`
(Step 4) — it is not new, and this document does not modify it.** Included here so an operator
executing this remediation arc's deployment doesn't have to cross-reference a second document
mid-sequence.

```
cd code-app
npm run build
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS
```

Before running this:
- Confirm `pac org who` resolves to the expected environment (`5f2d77a5-de50-edeb-9d74-5b2400a2320d`
  / `org3a57b8d4.crm.dynamics.com`) — a mismatch here means deploying to the wrong environment.
- Confirm the schema verification sweep above passed.
- Confirm the plugin build/registration steps in
  `docs/operator-runbooks/DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md` and
  `dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md` are complete (this arc's PR
  A did not touch the plugin — no new plugin build is required for THIS arc's changes specifically,
  but the existing plugin must already be correctly registered per those documents' own gates).

After running this:
- Follow `docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md`'s Step 5 (verify app loads) and
  Step 5a (connector verification, including the SharePoint 21-step runbook in
  `docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md` if SharePoint document storage is being activated
  as part of this deployment).

## SDK regeneration commands needed for this arc specifically

Two of this arc's four migrations require SDK regeneration (see `01_MIGRATION_RUNBOOK.md` for the
full detail per migration):

```
# Migration 1 (N-01/N-16) — document requirement lifecycle columns on an EXISTING table
pac code add-data-source -a dataverse -t cr664_documentchecklists

# Migration 4 (closing-document persistence) — a NEW table
pac code add-data-source -a dataverse -t cr664_closingdocumentmanifest
```

Migrations 2 and 3 (CRM industry projection, test-record field) do **not** require SDK
regeneration — both are read/written via the raw column name through the existing
`dealQueries.ts`/`updateDealProfile.ts` pattern (confirmed in each migration's own PR body).

After running either `pac code add-data-source` command above, re-run
`npx tsc -b` and the full test suite (`npx vitest run`) to confirm the regenerated SDK still
type-checks cleanly against the hand-authored stand-in files it's meant to replace — diff the two
if anything doesn't match (see each generated file's own disclosure header in
`src/generated/models/` / `src/generated/services/`).
