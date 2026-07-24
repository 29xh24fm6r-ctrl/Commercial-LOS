# PR 106 — Risk Rating / Underwriting Recommendation Schema Migration (operator-gated)

Status: **NOT YET APPLIED**. This document, plus the scripts under
`scripts/schema-migrations/pr106-risk-rating/`, is the complete, executable
plan for the schema change. Nothing in this PR's code depends on these
columns existing — `DealRiskRatingPanel.tsx` stays local-only (session-scoped)
until an operator runs this migration and flips the flag below.

## Why this exists

`src/workflow/underwritingDeepFacts.ts` (ARC Phase 3) already contains a
fully-built, fully-tested pair of pure policies —
`evaluateRiskRatingReadiness` and `evaluateUnderwritingRecommendationReadiness`
— that gate the Underwriting → Credit Approval transition. Its own header
comment says exactly why they were never live-enforced:

> the current Dataverse schema has NO deal-scoped risk-rating or
> underwriting-recommendation record... these facts remain `tracked: false`
> in the registry (surfaced as "future")... they flip live the moment a real
> record source lands (a maker adds the schema + a loader supplies the fact).

PR 106 built the missing capture UI (`DealRiskRatingPanel.tsx`) against
these existing policies. This document is the schema half of "a maker adds
the schema."

## Schema change

**Table**: `cr664_loandeal` (display name "Loan Deal")

| New column (logical name) | Display name | Type | Notes |
|---|---|---|---|
| `cr664_riskratinginputs` | Risk Rating Inputs (JSON) | Multiple Lines of Text (unlimited) | Additive JSON blob round-tripping a `RiskRatingRecord` (rating value, scale, rationale, assigned-by, status), mirroring the live `cr664_extendedloanattributes` precedent. |
| `cr664_underwritingrecommendationinputs` | Underwriting Recommendation Inputs (JSON) | Multiple Lines of Text (unlimited) | Additive JSON blob round-tripping an `UnderwritingRecommendationRecord` (decision, rationale, underwriter actor, status). |

Both columns are **additive, nullable, non-breaking**: no existing column
is modified or removed, no required-field constraint is added, no existing
row is touched.

This is an independent migration from
`docs/factory-arc/PR105_LOAN_STRUCTURE_SCHEMA_MIGRATION.md` (it does not
assume that migration has been applied) — an operator can run either first,
or combine both column sets into a single Maker Portal session if convenient.

## Option A — Maker Portal (recommended; no credentials needed in this repo)

1. Open the Power Apps Maker Portal → the environment
   (`https://org3a57b8d4.crm.dynamics.com`) → Solutions → the solution this
   app's customizations live in.
2. Open the **Loan Deal** (`cr664_loandeal`) table → Columns → **+ New column**.
3. Add both columns per the table above (Multiple Lines of Text, unlimited
   length). Leave "Required" as **Optional** for both.
4. Publish all customizations.
5. Regenerate the Power Apps Code Apps generated SDK so
   `src/generated/models/Cr664_loandealsModel.ts` and
   `src/generated/services/Cr664_loandealsService.ts` pick up both new
   fields. Commit the regenerated files in a follow-up PR — do NOT
   hand-edit the generated files.

## Option B — Dataverse Web API script

`scripts/schema-migrations/pr106-risk-rating/create-columns.mjs` — the same
idempotent Web API pattern as PR 105's migration. Requires:

- `DATAVERSE_URL` (e.g. `https://org3a57b8d4.crm.dynamics.com`)
- `DATAVERSE_ACCESS_TOKEN` (an OAuth token for an account with System
  Customizer or System Administrator role)

Run with: `node create-columns.mjs`.

## Verification

`scripts/schema-migrations/pr106-risk-rating/verify-columns.mjs` — reads
back the `EntityDefinitions(...)/Attributes` metadata and confirms both
`LogicalName`s exist with the expected `AttributeType`. Run this before
flipping the flag below.

## Rollback

`scripts/schema-migrations/pr106-risk-rating/rollback-columns.mjs --confirm`
— deletes both attributes. Safe at any point before
`RISK_RATING_PERSISTENCE_ENABLED` is flipped to `true` (no live code reads
or writes these columns until then).

## Activation (after the migration is applied and verified)

`RISK_RATING_PERSISTENCE_ENABLED` (to be added alongside the persistence
adapter in a follow-up PR once this migration lands) stays `false` until
`verify-columns.mjs` passes. Flipping it without running the migration
first will fail closed (the generated SDK has no such field to send/read)
rather than silently drop data.

**Important**: persisting a real `RiskRatingRecord`/`UnderwritingRecommendationRecord`
is a separate concern from *enforcing* the Underwriting → Credit Approval
gate on it. Even after this migration lands and a loader supplies the fact,
`loanWorkflowRequirementEngine.ts`'s registry entries for
`UNDERWRITING:risk_rating` (and the equivalent underwriting-recommendation
requirement) must be explicitly flipped from `tracked: false` to
`tracked: true` in a reviewed follow-up change — never automatically, and
never merely because a column now exists.
