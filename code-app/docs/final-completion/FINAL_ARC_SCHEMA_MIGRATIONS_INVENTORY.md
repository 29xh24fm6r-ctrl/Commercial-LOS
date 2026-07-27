# Final LOS Completion arc — Schema Migrations Inventory (Workstream S)

## Scope and honesty statement

This is the inventory for the **six new schema migrations** this specific arc ("Final LOS Completion",
branch `factory/final-los-completion`) added, Workstreams C/D/E/F/H/J. It is a companion to, not a
replacement for, the pre-existing
`docs/production-remediation/deployment-and-live-certification/01_MIGRATION_RUNBOOK.md` (which covers
four earlier, already-merged migrations from before this arc) and
`02_SCHEMA_VERIFICATION_AND_DEPLOYMENT_COMMANDS.md`. **None of the six migrations below has been
applied to any live Dataverse environment.** Every command is copied verbatim from each migration's
own script; nothing here is inferred or guessed.

All six share the exact same shape, deliberately (see `docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md`
§4/§11):
- **New tables, not additive columns** — each workstream introduced a genuinely new, append-only,
  per-deal history entity (never an existing table's columns).
- **`entity.mjs` is the single source of truth** per migration — `create-entity.mjs` / `verify-entity.mjs`
  / `rollback-entity.mjs` all import their column list and entity name from it, so there is exactly one
  place to review per table, not four.
- **Additive only** — no column is ever renamed, retyped, or deleted.
- **Independent of each other and of the four pre-existing migrations** — apply in any order, or skip
  any one without affecting the others.
- **Idempotent** — every `create-entity.mjs` existence-checks before creating; a second run reports
  "already exists" and makes no further change.
- **`cr664_dealid` is a plain String column, not a Lookup relationship** on all six (matching the
  established pattern from the four pre-existing migrations) — a deal association without requiring an
  `@odata.bind` relationship to exist before the table does. A future phase MAY add a genuine Lookup
  relationship to `cr664_loandeal` once these tables are live and stable; not attempted here.
- **`cr664_supersedes*Id` is a plain String column** on all six — the append-only "current record"
  resolution (`evaluate*Readiness` in each workstream's `src/workflow/*Types.ts`) is a pure client-side
  structural-linkage computation (never a timestamp comparison — see each type module's own header for
  the exact reasoning), so no database-level self-referencing relationship is required.

## Prerequisites (all six)

Same as the pre-existing runbook: a Dataverse user/service principal with **System Customizer** or
**System Administrator** security role in the target environment, and `DATAVERSE_URL` /
`DATAVERSE_ACCESS_TOKEN` environment variables set to a valid OAuth access token for that account.

## Migration 5 — Credit Approval Decision (`cr664_creditapprovaldecision`) — Workstream C

**Directory**: `scripts/schema-migrations/final-arc-credit-approval-decision/`

**What it creates**: a new table with 16 columns (dealId, decisionStatus, approvedAmount,
approvedProduct, approvedTermMonths, approvedPricing, collateralSummary, conditionsJson [Memo/JSON],
authorityTier, rationale, requestedBy, requestedAt, decidedBy, decidedAt, correlationId,
supersedesDecisionId) plus the primary attribute `cr664_decisionid`.

**Verify / Create commands**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-credit-approval-decision/verify-entity.mjs
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-credit-approval-decision/create-entity.mjs
```

**Backs**: `src/workflow/creditApprovalDecisionTypes.ts` / `src/creditApproval/creditApprovalDecisionStore.ts`
/ `src/creditApproval/submitCreditApprovalDecision.ts` — feeds `CREDIT_APPROVAL:approval_decision` /
`:approval_authority` / `:approval_conditions` in `loanWorkflowRequirementRegistry.ts`.

## Migration 6 — Commitment Record (`cr664_commitmentrecord`) — Workstream D

**Directory**: `scripts/schema-migrations/final-arc-commitment-record/`

**What it creates**: a new table with 15 columns (dealId, commitmentStatus, approvedAmount,
approvedProduct, approvedTermMonths, approvedPricing, keyTermsSummary, expirationDate, issuedBy,
issuedAt, respondedBy, respondedAt, declineReason, correlationId, supersedesCommitmentId) plus the
primary attribute `cr664_commitmentid`.

**Verify / Create commands**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-commitment-record/verify-entity.mjs
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-commitment-record/create-entity.mjs
```

**Backs**: `src/workflow/commitmentRecordTypes.ts` / `src/commitment/commitmentRecordStore.ts` /
`src/commitment/submitCommitmentAction.ts` — feeds `COMMITMENT:commitment_issued` /
`:borrower_acceptance`.

## Migration 7 — Condition Verification (`cr664_conditionverification`) — Workstream E

**Directory**: `scripts/schema-migrations/final-arc-condition-verification/`

**What it creates**: a new table with 8 columns (dealId, conditionType [CONDITIONS_PRECEDENT /
COLLATERAL / INSURANCE], verificationStatus, notes, verifiedBy, verifiedAt, correlationId,
supersedesRecordId) plus the primary attribute `cr664_recordid`. One table, parameterized by
`conditionType`, serves all three of `DOCUMENTATION:conditions_precedent` / `:collateral_verified` /
`:insurance_verified`.

**Verify / Create commands**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-condition-verification/verify-entity.mjs
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-condition-verification/create-entity.mjs
```

**Backs**: `src/workflow/conditionVerificationTypes.ts` / `src/documentation/conditionVerificationStore.ts`
/ `src/documentation/submitConditionVerificationAction.ts`.

## Migration 8 — Executed Document Attestation (`cr664_executeddocattestation`) — Workstream F

**Directory**: `scripts/schema-migrations/final-arc-executed-document-attestation/`

**What it creates**: a new table with 8 columns (dealId, attestationStatus [ATTESTED / REVOKED],
executedDate, notes, attestedBy, attestedAt, correlationId, supersedesAttestationId) plus the primary
attribute `cr664_attestationid`.

**Verify / Create commands**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-executed-document-attestation/verify-entity.mjs
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-executed-document-attestation/create-entity.mjs
```

**Backs**: `src/workflow/executedDocumentAttestationTypes.ts` /
`src/closing/executedDocumentAttestationStore.ts` /
`src/closing/submitExecutedDocumentAttestationAction.ts` — feeds `CLOSING_FUNDING:executed_docs`.
Named "attestation" throughout (never "certification") to stay clear of
`bankerFacingLaunchLanguageGuard.test.ts`'s trip-wire — see the store's own header.

## Migration 9 — Booking QC Check (`cr664_bookingqccheck`) — Workstream H

**Directory**: `scripts/schema-migrations/final-arc-booking-qc-check/`

**What it creates**: a new table with 7 columns (dealId, qcStatus [PASSED / FAILED / WAIVED], notes,
reviewedBy, reviewedAt, correlationId, supersedesCheckId) plus the primary attribute `cr664_checkid`.

**Verify / Create commands**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-booking-qc-check/verify-entity.mjs
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-booking-qc-check/create-entity.mjs
```

**Backs**: `src/workflow/bookingQcCheckTypes.ts` / `src/closing/bookingQcCheckStore.ts` /
`src/closing/submitBookingQcCheckAction.ts` — feeds `CLOSING_FUNDING:booking_qc`.

## Migration 10 — Adverse Action Record (`cr664_adverseactionrecord`) — Workstream J

**Directory**: `scripts/schema-migrations/final-arc-adverse-action-record/`

**What it creates**: a new table with 7 columns (dealId, actionStatus [SENT / WAIVED], notes,
recordedBy, recordedAt, correlationId, supersedesRecordId) plus the primary attribute `cr664_recordid`.

**Verify / Create commands**:
```
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-adverse-action-record/verify-entity.mjs
DATAVERSE_URL=<org-url> DATAVERSE_ACCESS_TOKEN=<token> node scripts/schema-migrations/final-arc-adverse-action-record/create-entity.mjs
```

**Backs**: `src/workflow/adverseActionRecordTypes.ts` / `src/creditApproval/adverseActionRecordStore.ts`
/ `src/creditApproval/submitAdverseActionAction.ts` — feeds `DECLINE:adverse_action`.

## SDK regeneration required (all six) — and the exact safety discipline

**Yes, for all six** — every one is a NEW TABLE (never a column addition), so the generated
model/service pairing must be regenerated for real once the table exists live:
```
pac code add-data-source -a dataverse -t <entity-logical-name-plural>
```
(e.g. `pac code add-data-source -a dataverse -t cr664_commitmentrecords`).

**Until that operator step runs**, every one of the six carries a **hand-authored generated-SDK
stand-in** in `src/generated/models/Cr664_*Model.ts` / `src/generated/services/Cr664_*Service.ts`.
**SDK regen safety property, true of all six and verified by direct read of each file's own header**:
every stand-in's field list is derived DIRECTLY from its own `entity.mjs`'s `COLUMNS` array — the same
single source of truth `create-entity.mjs`/`verify-entity.mjs` read from — so there is no drift risk
between "what the migration creates" and "what the hand-authored SDK stand-in declares." A real `pac
code` regeneration should be diffed against the existing stand-in once run; the field-level contract is
not expected to change, since both are derived from the same `entity.mjs`, but the real regeneration
is authoritative once it exists (same discipline the pre-existing Migration 4 entry documents for
`cr664_closingdocumentmanifest`).

**`dataSourcesInfo.ts` registration**: same caveat as the pre-existing runbook's Migration 4 — this
file (`.power/schemas/appschemas/dataSourcesInfo.ts`) is gitignored and not part of any PR diff. None
of the six stand-in services can make a real Dataverse call until an operator runs `pac code
add-data-source` for real and this file gains real `tableId`/`version` entries for each of the six data
source names (`cr664_creditapprovaldecisions`, `cr664_commitmentrecords`, `cr664_conditionverifications`,
`cr664_executeddocattestations`, `cr664_bookingqcchecks`, `cr664_adverseactionrecords`). Until then,
every live call through these six stores fails closed with an honest `{ success: false, error }` —
proven by each store's own test suite (`*Store.test.ts`), never a fabricated success.

**`pac code push` required**: No, for all six — same reasoning as every other migration in this
family: `pac code push` deploys code-app/PCF component code, not schema.

**Publish customizations**: Required, manual, for all six (the `.mjs` create scripts do not
auto-publish).

## Order of operations (recommended, not required — all ten migrations, four pre-existing plus six
new, are mutually independent)

1. Apply migrations 5–10 in any order, interleaved with or independent of migrations 1–4; there is no
   dependency between any of them.
2. After each migration's create step: run its own verify script, confirm success, then publish
   customizations manually (none of migrations 2–10 auto-publish; only migration 1 does).
3. Run `pac code add-data-source` for each of the six new tables, then diff the generated
   `Cr664_*Model.ts`/`Service.ts` output against the existing hand-authored stand-in files in
   `src/generated/`.
4. Re-run every migration's own `verify-entity.mjs` after all ten are applied, to confirm nothing
   regressed.

## Do not run

Same discipline as the pre-existing runbook: do not run any `rollback-*.mjs` script as part of a
deployment. Each of the six rollback scripts deletes the entire entity (all columns and rows)
permanently, defaults to a dry run without `--confirm`, and exists for genuine incident recovery only
— never a step in bringing these migrations live.
