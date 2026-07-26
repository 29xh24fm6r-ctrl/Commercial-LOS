# Final Migration Runbook — Post-PR143 Schema Changes

## Scope and honesty statement

This runbook covers the **four additive schema migrations** that are merged into `master` (via
PR132, PR137/138, PR141/142, and PR A/#143) but have **not been applied to any live Dataverse
environment**. Every command below is copied verbatim from its own migration script's header
comment or its source PR's own "Operator steps" section — nothing here is inferred or guessed.
None of these migrations has been executed. This document does not claim otherwise anywhere.

All four are:
- **Additive only** — no column is ever renamed, retyped, or deleted by any of these scripts.
- **Independent of each other** — none depends on another having been applied first; apply them in
  any order, or skip any one without affecting the others.
- **Safe to re-run** — every script is idempotent (existence-checked before create; a second run
  reports "already exists" and makes no further change).

## Prerequisites (all four migrations)

- A Dataverse user/service principal with **System Customizer** or **System Administrator**
  security role in the target environment (`org3a57b8d4.crm.dynamics.com`, per PR132's own
  documented target — confirm this is still the correct target environment before running anything
  against it).
- `pac` CLI authenticated against that environment (`pac org who` must resolve to the expected org
  host — migration 1 checks this itself and blocks on mismatch).
- For migrations 2–4 (the `.mjs` scripts): `DATAVERSE_URL` and `DATAVERSE_ACCESS_TOKEN` environment
  variables set to a valid OAuth access token for the same account.
- Node.js available on the operator's machine to run the `.mjs` scripts (migration 1 is PowerShell).

## Migration 1 — Document requirement lifecycle columns (blocks N-01, N-16)

**Directory**: `scripts/dataverse/create-document-requirement-lifecycle-fields.ps1` (PowerShell,
not the `.mjs` pattern used by the other three — this predates that convention).

**What it creates**: 9 columns/relationships on `cr664_documentchecklist`, including
`cr664_requirementstatus` (the 7-option lifecycle status picklist) and `cr664_receivedby` (a Lookup
to `cr664_user`, the segregation-of-duties column N-16's fix depends on).

**Verify command** (dry-run; also doubles as the post-apply verification — re-run without
`-Apply` and confirm every column now reports "exists," not "planned"):
```
powershell -File scripts/dataverse/create-document-requirement-lifecycle-fields.ps1
```

**Create/apply command**:
```
powershell -File scripts/dataverse/create-document-requirement-lifecycle-fields.ps1 -Apply
```

**Expected result**: 9 columns/relationships created (or confirmed already present) on
`cr664_documentchecklist`. The script publishes customizations itself, automatically, only if it
actually created something this run (no separate publish step needed for this one).

**SDK regeneration required**: **Yes.**
```
pac code add-data-source -a dataverse -t cr664_documentchecklists
```
Confirm `_cr664_receivedby_value` and the other 8 fields land in the generated model, then retire
the `documentRequirementFields.ts` bridge type (per PR132's own documented follow-up step).

**`publish-all-customizations` required**: No — the script does this itself on `-Apply` when it
creates something.

**`pac code push` required**: No. This migration only adds columns to an already-registered table;
`pac code push` is for pushing code-app/PCF component code, not schema changes, and does not apply
here per `regenerate-powerapps-sdk.ps1`'s own header ("does NOT run `pac code push`").

## Migration 2 — CRM industry NAICS projection (blocks N-22, N-23)

**Directory**: `scripts/schema-migrations/pr138-crm-industry-projection/`

**What it creates**: `cr664_crmindustryprojection` (Memo/JSON column) on `cr664_loandeal`.

**Verify command**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/pr138-crm-industry-projection/verify-columns.mjs
```
Exits 0 if present, 1 if missing (prints which).

**Create/apply command**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/pr138-crm-industry-projection/create-columns.mjs
```

**Expected result**: `cr664_crmindustryprojection` created on `cr664_loandeal`. The script prints
`CREATED: cr664_crmindustryprojection` (or `SKIP (already exists)` on a re-run).

**Publish customizations**: **Required, manual** — the `.mjs` script does not auto-publish (unlike
migration 1). Do this in the Maker Portal after running `create-columns.mjs`.

**SDK regeneration required**: **No** — this PR's own "Operator steps" explicitly states the column
is read/written via the raw column name through `dealQueries.ts`/`updateDealProfile.ts`, the same
technique already used for the Phase 5 risk-rating/recommendation columns. (The script's own
generic console message says "regenerate the SDK" as a boilerplate reminder shared with every
migration in this family — the PR's specific Operator Steps override that and are authoritative
here.)

**`pac code push` required**: No.

## Migration 3 — Governed test/production classification field (blocks N-17)

**Directory**: `scripts/schema-migrations/pr142-test-record-field/`

**What it creates**: `cr664_istestrecord` (Boolean, no default value) on `cr664_loandeal`.

**Verify command**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/pr142-test-record-field/verify-columns.mjs
```

**Create/apply command**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/pr142-test-record-field/create-columns.mjs
```

**Expected result**: `cr664_istestrecord` created on `cr664_loandeal`, left unset on every existing
and newly-created deal (no default value) — `isTestOrSmokeDeal()` in
`testDealClassification.ts` falls back to the pre-existing name-convention match whenever this
column is unset, so leaving it unset is a safe, non-breaking default.

**Publish customizations**: **Required, manual**, same as migration 2.

**SDK regeneration required**: **No** for the current read path (same raw-key read pattern) — but
a future phase wiring additional consumers (Manager/Team/Executive/Admin surfaces, which today
still classify purely by name — see `PR_A_REMAINING_PRODUCTION_REMEDIATION.md`) through the
strongly-typed model would need it then.

**`pac code push` required**: No.

**Post-migration operator action beyond schema**: this column has no admin UI to *set* it yet
(PR A's own scope note) — until an admin UI is built, an operator must set
`cr664_istestrecord = true` on individual test/smoke deal records directly (e.g. via the Maker
Portal's data view or an OData PATCH) for it to have any observable effect beyond the default
name-based classification.

## Migration 4 — Closing document manifest table (blocks durable closing-document persistence)

**Directory**: `scripts/schema-migrations/pr123-closing-document-persistence/`

**What it creates**: a new table, `cr664_closingdocumentmanifest`, with 10 columns (dealId,
templateKey, templateVersion, generatedAtIso, generatedByActorEmail, contentHash, correlationId,
status, supersedesManifestId, renderedContent) — an append-only, per-document history table, not an
additive column on an existing table (see `entity.mjs`'s own design-note comment for why this
shape was chosen over a deal-level JSON blob).

**Verify command**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/pr123-closing-document-persistence/verify-entity.mjs
```

**Create/apply command**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/pr123-closing-document-persistence/create-entity.mjs
```

**Expected result**: the `cr664_closingdocumentmanifest` table created with its 10 columns and
primary attribute `cr664_manifestid`.

**Publish customizations**: **Required, manual.**

**SDK regeneration required**: **Yes** — this is a NEW TABLE (unlike migrations 2–3, which added
columns to an already-registered table). Run:
```
pac code add-data-source -a dataverse -t cr664_closingdocumentmanifest
```
Then diff the real generated `Cr664_closingdocumentmanifestsModel.ts`/`Service.ts` against the
hand-authored stand-in files already in `src/generated/` (see those files' own disclosure headers)
— the field-level contract is not expected to change since both are derived from the same
`entity.mjs`, but the real regeneration is authoritative once it exists.

**Additional environment-local step required**: the generated service's `dataSourcesInfo.ts`
registration (`.power/schemas/appschemas/dataSourcesInfo.ts`) is **gitignored** — it is not part of
any PR diff. After running `pac code add-data-source` for real, confirm this file's
`cr664_closingdocumentmanifests` entry has real `tableId`/`version` values (not the empty-string
placeholders the current hand-authored stand-in used).

**`pac code push` required**: No — `pac code push` deploys PCF/code-app component code, not schema.

## Order of operations (recommended, not required — all four are independent)

1. Apply migrations in any order; there is no dependency between them.
2. After each migration's create step: run its verify script, confirm success, then publish
   customizations (manual for migrations 2–4; automatic for migration 1).
3. For migrations 1 and 4 (SDK regeneration required): run the `pac code add-data-source` command,
   then diff the generated output against the existing hand-authored stand-in files.
4. Re-run the FULL migration verify sweep (`02_SCHEMA_VERIFICATION_COMMANDS.md`) after all four are
   applied, to confirm nothing regressed.

## Do not run

- **Do not run any `rollback-*.mjs` / rollback script** as part of this deployment. Rollback exists
  for genuine incident recovery only, is out of scope for this runbook, and each migration's own
  rollback-considerations section documents it is safe to invoke independently if ever needed —
  but invoking it is a separate, deliberate decision, not a step in bringing these migrations live.
- Do not hand-edit any other generated SDK file beyond what a real `pac code` regeneration produces.
