# PR 105 — Core Loan Structure Schema Migration (operator-gated)

Status: **NOT YET APPLIED**. This document, plus the scripts under
`scripts/schema-migrations/pr105-loan-structure/`, is the complete,
executable plan for the schema change. Nothing in this PR's code depends
on these columns existing — every reader/writer stays behind a
default-`false` flag until an operator runs this migration and flips it.

## Why this exists

`src/deals/write/updateDealProfile.ts`'s header (added 2026-07-22, Workstream
E) documents exactly what's missing and why it wasn't fixed in code:

> Genuinely missing schema (loan term, loan purpose, a deal-level
> ownership/legal-structure classification distinct from guarantor
> structure) stays OUT of scope — those require an operator-authorized
> Dataverse column, not a code change.

This is that authorization package.

## Schema change

**Table**: `cr664_loandeal` (display name "Loan Deal")

| New column (logical name) | Display name | Type | Notes |
|---|---|---|---|
| `cr664_loanpurpose` | Loan Purpose | Single Line of Text (200) | Free text; a choice set is a reasonable future refinement once real usage data exists, but text avoids guessing at a taxonomy the business hasn't validated yet. |
| `cr664_loantermmonths` | Loan Term (Months) | Whole Number | Distinct from the existing `cr664_amortizationmonths` — a balloon loan can amortize over 300 months but have a 60-month term. |
| `cr664_ownershipstructure` | Ownership Structure | Single Line of Text (100) | Deal-level legal/ownership classification of the credit request, distinct from `cr664_guarantorstructure` (which describes guarantor arrangement, not entity ownership). Text for the same reason as above. |
| `cr664_financialspreadinputs` | Financial Spread Inputs (JSON) | Multiple Lines of Text (unlimited) | One additive JSON column, following the EXACT precedent already live at `cr664_extendedloanattributes` on `cr664_portfolioboardedloans` (see `src/portfolioBoarding/extendedLoanAttributes.ts`). Round-trips the Global Cash Flow calculator's entered figures (business + guarantors + debt service) so they survive a reload, instead of the local-only-per-session behavior this PR ships with. |

All four columns are **additive, nullable, non-breaking**: no existing
column is modified or removed, no required-field constraint is added, and
no existing row is touched. This is the same risk class as the
`cr664_extendedloanattributes` column already live on the boarded-loans
table.

## Option A — Maker Portal (recommended; no credentials needed in this repo)

1. Open the Power Apps Maker Portal → the environment
   (`https://org3a57b8d4.crm.dynamics.com`) → Solutions → open (or create) the
   solution this app's customizations live in.
2. Open the **Loan Deal** (`cr664_loandeal`) table → Columns → **+ New column**.
3. Add each column per the table above (name, display name, data type, max
   length where applicable). Leave "Required" as **Optional** for all four.
4. Publish all customizations.
5. Regenerate the Power Apps Code Apps generated SDK (`pac code` /
   the project's existing SDK-generation step) so
   `src/generated/models/Cr664_loandealsModel.ts` and
   `src/generated/services/Cr664_loandealsService.ts` pick up the four new
   fields. Commit the regenerated files in a follow-up PR — do NOT hand-edit
   the generated files.

## Option B — Dataverse Web API script (for repeatable/scripted provisioning)

`scripts/schema-migrations/pr105-loan-structure/create-columns.mjs` — a
Node script using the Dataverse Web API `POST
.../EntityDefinitions(LogicalName='cr664_loandeal')/Attributes` metadata
endpoint. Requires an operator to supply:

- `DATAVERSE_URL` (e.g. `https://org3a57b8d4.crm.dynamics.com`)
- `DATAVERSE_ACCESS_TOKEN` (an OAuth token for an account with System
  Customizer or System Administrator role — this script does not
  authenticate itself)

Run with: `node create-columns.mjs`. The script is idempotent — it checks
for each column's existence before creating it, so re-running after a
partial failure is safe.

## Verification

`scripts/schema-migrations/pr105-loan-structure/verify-columns.mjs` — reads
back the `EntityDefinitions(...)/Attributes` metadata for `cr664_loandeal`
and confirms all four `LogicalName`s exist with the expected `AttributeType`.
Exits non-zero and prints exactly which column(s) are missing if the
migration was not (yet) applied — this is the same script an operator runs
before flipping `ORIGINATION_LOAN_STRUCTURE_FIELDS_ENABLED` /
`FINANCIAL_SPREAD_PERSISTENCE_ENABLED` from `false` to `true`.

## Rollback

`scripts/schema-migrations/pr105-loan-structure/rollback-columns.mjs` —
deletes the four attributes via `DELETE
.../EntityDefinitions(LogicalName='cr664_loandeal')/Attributes(LogicalName='...')`.
Safe at any time before the columns are read/written by live code (they
never are, until the flags below are flipped) — deleting an unused, empty,
additive column has no downstream impact. If the columns have already been
in use (flags flipped to `true`), deleting them is destructive to whatever
was persisted in them; export the affected rows first if that matters.

## Activation (after the migration is applied and verified)

Two independent flags gate the two new capabilities — flip only after
`verify-columns.mjs` passes:

- `ORIGINATION_LOAN_STRUCTURE_FIELDS_ENABLED` (`src/deals/write/updateDealProfile.ts`) — adds `loanPurpose` / `loanTermMonths` / `ownershipStructure` to the governed Deal Profile update path.
- `FINANCIAL_SPREAD_PERSISTENCE_ENABLED` (`src/deals/financialSpreadPersistence.ts`) — enables round-tripping `GlobalCashFlowPanel`'s entered figures through `cr664_financialspreadinputs`, replacing the current local-only (session-scoped) behavior.

Both default `false` in this PR. Flipping either without running the
migration first will fail closed (the generated SDK simply has no such
field to send/read) rather than silently drop data.
