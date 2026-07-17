# Dataverse Schema Remediation — After-Action Report

Phase 1 of the Admin Release Readiness schema remediation: document-checklist file upload,
deal-stage sequencing, datasource-manifest reconciliation, and a borrower-portal design proposal.

## Sandbox constraint (read first)

This session has no `pac` CLI, no dotnet SDK, and no PowerShell session holding live Dataverse
credentials. **No live Dataverse metadata was inspected, no live schema was mutated, no SDK was
regenerated, and no live datasource binding was verified in this phase.** Every deliverable below
that requires live access is a script or document, written and reviewed against this repo's
established provisioning-script conventions, but **not executed**. Everything that could be
verified without live access — code, tests, static analysis, build — was verified and is reported
with real results below.

## 1. Inventory classification

| Item | Category | Disposition |
|---|---|---|
| `cr664_documentchecklist` missing File/metadata/UploadedBy columns | 1 — existing-table missing column | Provisioning script written, not run |
| `cr664_dealstagereferences` missing `cr664_sequence`/`cr664_stagetype` | 1 — existing-table missing column | Provisioning script written, not run |
| Seven canonical stage rows with sequence values | 3 — missing seed/reference data | Already satisfied by pre-existing `scripts/seed-stage-references.mjs` — verified, not duplicated |
| A separate `cr664_stagereferences`/`cr664_stagereference` table | 7 — superseded design | **Not built.** `STAGE_PROGRESSION_ENABLEMENT_MAP.md` already retired this in favor of the `cr664_sequence` ordinal on the existing table |
| File-upload UI, governed upload adapter, forward-stage progression gating | 4 — missing application wiring | Built, behind new default-off flag |
| Recurring "data source not found" incidents (`systemusers`, `cr664_loandeals`) | 4 — missing application wiring (tooling gap) | General reconciliation script written |
| Borrower portal (8 tables + external auth) | 5 — missing external authentication architecture | Design only — no tables created |
| `LOCAL_ONLY_FLOWS` (localStorage-only features) | 6 — deliberate governance non-goal | Untouched |
| Return / Decline / Withdraw stage actions | 6 — deliberate governance non-goal (explicit instruction) | Untouched, stays unmounted |

## 2. Live metadata inspected

None. Sandbox has no Dataverse credentials. Everything below was derived from committed source
(`power.config.json`, generated SDK models/services under `src/generated/`, existing provisioning
scripts, and `.power/schemas/` where present) rather than a live `Get-Dataverse*` call.

## 3. Columns created

None. Two provisioning scripts were written (create-missing-only, idempotent, dry-run by default,
`-Apply`-gated) but not executed — no credentials available to run them:

- `scripts/dataverse/create-document-checklist-file-columns.ps1` — adds to `cr664_documentchecklist`:
  `cr664_documentfile` (File, `MaxSizeInKB` param, default 25600 = 25 MB), `cr664_originalfilename`
  (String), `cr664_mimetype` (String), `cr664_filesizebytes` (Whole Number), `cr664_uploadedon`
  (DateTime), and a `cr664_uploadedby` lookup relationship to `cr664_user` (not `systemuser` — see
  §9 decision log).
- `scripts/dataverse/create-dealstagereference-sequence-column.ps1` — adds `cr664_sequence` (Whole
  Number) and `cr664_stagetype` (String) to `cr664_dealstagereferences`. Explicitly does **not**
  create a separate stage-reference table and does **not** create a Dataverse alternate key on
  `cr664_sequence` (rationale in §9).

Both follow the same shape as the pre-existing `create-banker-credit-authority-fields.ps1`:
environment-host guard, solution-existence check, token validation, typed `"APPLY"` confirmation
gate, skip-existing columns, publish-only-if-created, post-create `AttributeType` verification.

## 4. Stage rows seeded

None run. `scripts/seed-stage-references.mjs` (pre-existing, not modified this phase) was read
end-to-end and confirmed to already satisfy the seeding requirements: match-by-code, PATCH-reuse of
existing active rows to preserve record IDs, POST only for genuinely new codes, fail-closed on
duplicate/inactive/ambiguous matches, and a `TEST`/`PHASE`-prefix guard that prevents touching
non-canonical rows. No new seed script was written. `docs/STAGE_SCHEMA_SETUP.md` was updated to
point to the new provisioning script as "Option A" for the column-creation step, keeping the
original manual make.powerapps.com instructions as "Option B."

One discrepancy is flagged here rather than silently resolved: the generated
`Cr664_dealstagereferencesModel.ts` already declares `cr664_sequence`, but the seed script's own
header comment assumes the live column doesn't exist yet. Whoever runs the provisioning script
first (item A) should treat live-metadata verification, not the generated model, as the source of
truth for whether this column is genuinely missing.

## 5. SDK files regenerated

None. No `pac code add-data-source` was run. Two regression guards were added instead, since no
guard existed for this risk before this phase:

- `src/shared/governance/multiSelectPicklistFieldShapeContract.test.ts` pins `cr664_loandeals`'s
  `cr664_relationshipexpansionopportunitytags` and `cr664_alertqueues`'s
  `cr664_assignmenthierarchy`/`cr664_assignmenthistory` as array-typed with intact
  `multiSelectPicklistFields`/serialize/deserialize wiring. Verified to actually fail when one field
  was temporarily flattened to scalar, then restored.
- `src/deals/documentChecklistFileFields.ts` — a stopgap type-only interface for the 6 new
  documentchecklist fields, following the `bankerCreditAuthorityFields.ts` precedent, marked for
  deletion once a real regeneration lands. `cr664_sequence` needed no stopgap; it's already on the
  generated model.

## 6. Generated changes rejected and why

N/A — no regeneration was run this phase, so nothing was rejected. The rejection criteria from the
task spec (no MultiSelectPicklist-to-scalar conversion, no removed multi-select serialization, no
removed valid live columns, no duplicate datasource aliases, no unrelated schema drift) are now
codified as an automated check via item 5's guard test, to be run against any future regen output.

## 7. Datasource audit

`scripts/verify-datasource-manifest-completeness.mjs` (new) does pure local file comparison: parses
every `entitySetName` declared in `power.config.json` against every top-level key registered in
`.power/schemas/appschemas/dataSourcesInfo.ts`, reports Declared/Registered/Missing/Unexpected
counts, and refuses to trust that file if it detects the `BUILD-ONLY FALLBACK` stub marker (which
is mechanically derived from `power.config.json` and therefore can never show a genuine gap).
Manually verified against synthetic manifests with `systemusers` and `cr664_loandeals` stripped out
— it reproduces both real incidents from earlier in this engagement. Run it against the live app's
actual generated manifest (not the fallback stub) to catch the next one before it reaches
production.

## 8. Tests and build results

All run this session, current as of this AAR:

- `npx tsc -b` — clean, no errors.
- `npx vitest run` (full suite) — **828 test files passed, 11,697 tests passed, 2 skipped, 0
  failed.**
- `npx eslint .` — **21 problems (16 errors, 5 warnings)** — unchanged from this engagement's
  established pre-existing baseline; no new lint errors introduced.
- `npm run audit:reachability` — 995 non-test sources, 692 reachable, 303 allow-listed orphans,
  **0 unexpected orphans**. The one new orphan this phase added
  (`src/deals/documentChecklistFileFields.ts`, a stopgap type file nothing imports yet) is
  explicitly listed in `src/navigation/intentionallyUnrouted.ts` with its reason.
- `npm run build` — succeeds. Only pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` and chunk-size
  advisory warnings, no errors.

New test files added this phase: `documentUploadAction.test.ts` (16 tests — flag-off fail-closed,
no-deps fail-closed, all input-validation rejections + boundary-exact-size acceptance, full
successful-path dependency verification, unresolved-actor omits identity bind, upload/metadata
failure ordering, both readback-mismatch variants, both governance-partial variants, thrown-error
handling), `documentUploadLiveDeps.test.ts` (10 tests), `multiSelectPicklistFieldShapeContract.test.ts`
(7 tests), `stageSequenceUniqueness.test.ts` (4 tests), `dataverseRemediationNoHardcodedGuids.test.ts`
(7 tests), plus 5 new cases and 1 fixed case in `ReceiveDocumentModal.test.tsx`.

## 9. Decisions made this phase (documented, not silently assumed)

- **`cr664_uploadedby` lookup target: `cr664_user`, not `systemuser`.** Two independent reasons:
  (1) the analogous `cr664_ChangedBy → /systemusers(...)` bind was rejected live in a real
  production incident documented in `newDealAuditActorResolver.ts`'s header; (2) the underlying
  Dataverse solution already has an unwired `cr664_LoanDocument.cr664_UploadedBy → cr664_User`
  relationship — same target, proven pattern.
- **No Dataverse alternate key / unique index on `cr664_sequence`.** A literal DB-level key enforces
  uniqueness across *all* rows including retired ones, which would block a legitimate future
  re-sequencing during a stage-set migration. Dataverse has no native "unique among active rows
  only" constraint. Uniqueness-among-active-rows is enforced at the application level instead:
  `seed-stage-references.mjs`'s existing fail-closed duplicate-match handling at seed time, plus the
  new `stageSequenceUniqueness.test.ts` guard pinning the canonical in-code template.
- **New flag `DOCUMENT_FILE_UPLOAD_ENABLED`, default `false`.** Two-layer gate (hard constant +
  injected config), matching every other new-capability flag in this codebase. Stays fail-closed
  until the schema in §3 actually exists live and an operator arms it.
- **Upload validation limits**: 25 MB max, MIME allow-list (PDF, Word, Excel, JPEG, PNG) — chosen to
  match `MaxSizeInKB` used in the provisioning script and standard loan-document types; open to
  adjustment before go-live.

## 10. Deployment commands (for someone with `pac`/Dataverse access)

```powershell
# 1. Inspect live schema first
./scripts/dataverse/verify-document-checklist-and-stage-schema.ps1

# 2. Provision missing columns (dry run, then apply)
./scripts/dataverse/create-document-checklist-file-columns.ps1
./scripts/dataverse/create-document-checklist-file-columns.ps1 -Apply

./scripts/dataverse/create-dealstagereference-sequence-column.ps1
./scripts/dataverse/create-dealstagereference-sequence-column.ps1 -Apply

# 3. Seed the seven canonical stage rows (pre-existing script, unchanged)
node scripts/seed-stage-references.mjs --apply

# 4. Re-verify
./scripts/dataverse/verify-document-checklist-and-stage-schema.ps1

# 5. Regenerate the SDK for the two touched tables, then diff against the
#    two files multiSelectPicklistFieldShapeContract.test.ts pins before
#    accepting the regen output:
pac code add-data-source -a dataverse -t cr664_documentchecklists
pac code add-data-source -a dataverse -t cr664_dealstagereferences
npx vitest run src/shared/governance/multiSelectPicklistFieldShapeContract.test.ts

# 6. Reconcile the datasource manifest against the real (non-fallback)
#    generated file, in the live app, not this repo's stub:
node scripts/verify-datasource-manifest-completeness.mjs

# 7. Arm the flag (application config, not source) once 1-6 are confirmed:
#    documentFileUploadEnabled = true
```

## 11. Borrower-portal schema proposal

Full 8-table design (purpose, primary name, alternate keys, fields/types, relationships, ownership,
state/status reasons, retention/audit requirements, borrower-visible security boundary, external
identity linkage for each of `cr664_borrowerportaluser`, `cr664_borrowerportalinvitation`,
`cr664_borrowerportalaccessgrant`, `cr664_borrowerconsent`, `cr664_borrowerconversation`,
`cr664_borrowermessage`, `cr664_borrowernotification`, `cr664_borrowerdocumentaccess`) is in
`docs/BORROWER_PORTAL_SCHEMA_PROPOSAL.md`. **No borrower-portal tables were created.** The document
is explicitly a design artifact pending review of the external-authentication architecture it
assumes but does not resolve.

## 12. Remaining decisions requiring approval

1. External identity provider choice for the borrower portal (Entra External ID vs. B2C vs.
   equivalent) — prerequisite to creating any table in the borrower-portal proposal.
2. The 7 open decisions itemized at the end of `docs/BORROWER_PORTAL_SCHEMA_PROPOSAL.md` (consent
   versioning granularity, message retention window, notification delivery channel scope, etc.).
3. `cr664_uploadedby → cr664_user` as the lookup target (§9) — implemented in the script as
   written; flag for explicit sign-off before running `-Apply`.
4. No DB-level unique key on `cr664_sequence` (§9) — application-level enforcement only; flag for
   explicit sign-off.
5. `DOCUMENT_FILE_UPLOAD_ENABLED` flag name and false default (§9).
6. 25 MB / MIME allow-list upload limits (§9) — adjust before go-live if requirements differ.
7. Whether to run the two provisioning scripts against the live environment now that they exist, and
   who holds the credentials to do so — this AAR cannot answer that; it can only hand off the
   scripts and their exact invocation commands (§10).
