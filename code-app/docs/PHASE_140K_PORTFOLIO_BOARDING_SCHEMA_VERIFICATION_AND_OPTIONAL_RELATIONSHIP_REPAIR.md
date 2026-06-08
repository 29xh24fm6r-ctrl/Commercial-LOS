# Phase 140K — Portfolio Boarding Schema Verification & Optional Evidence→Document Lookup Repair

> **What this is.** A fix for the Phase 140J residual optional-relationship
> planning issue, plus stronger post-seed verification of the live Portfolio
> Boarded Loan Dataverse schema. Everything here is read-only by default; the
> only write path is a narrow, commit-gated repair of a single optional
> lookup. No app runtime persistence is enabled.

## Purpose

After Phase 140J seeded the core Portfolio Boarded Loan schema, one residual
remained: the optional evidence→document lookup
(`cr664_portfolioboardedloanevidence.cr664_PortfolioBoardedLoanDocument →
cr664_portfolioboardedloandocument`) was reported as *skipped* even though the
document table exists. Phase 140K fixes the target-resolution logic, adds a
concise verification report, and adds a guarded repair mode scoped to that one
optional lookup.

## Post-140J live schema state

- Tables to create: 0 (13 reused)
- Columns to create: 0
- Required child→root relationships: present
- Blockers: none
- `safeToCommit`: true

The only gap was the optional evidence→document lookup.

## Residual optional evidence→document lookup issue

The Phase 140J seed dry-run printed:

```
Optional lookup target cr664_portfolioboardedloandocument absent; skipping cr664_PortfolioBoardedLoanDocument.
```

…even though `cr664_portfolioboardedloandocument` exists.

## Root cause

The script's optional-lookup target resolution only checked the **pre-existing
external related tables** (`cr664_loandeal`, `cr664_clientrelationship`,
`cr664_banker`, `cr664_team`, `cr664_platformuser`, `systemuser`). It did not
recognize a **newly seeded portfolio boarding table** (like
`cr664_portfolioboardedloandocument`) as a valid internal lookup target.

The fix (`pbResolveTargetExists` / `pbIsCandidateTable`) resolves an optional
lookup target that is itself a portfolio boarding candidate table from the
inspected candidate results (and from the in-plan create list), in addition to
the external related-table probe. After the fix, the dry-run reports the
evidence→document lookup under **relationships to create** (or **reused** when
it already exists) — never as an absent optional target.

## Verification report behavior

`--inspect-portfolio-boarding-schema` now prints a
`PORTFOLIO_BOARDING_SCHEMA_VERIFICATION` section:

- target tables expected / found / missing
- target columns expected / missing
- required child→root lookups expected / found / missing
- optional relationships expected / found / missing
- `safeForRuntimePersistenceCandidate: true/false`

Rules (mirrored by the pure
`derivePortfolioBoardingSchemaVerificationReport`):

- `safeForRuntimePersistenceCandidate` is **false** if any target table is
  missing, any required column is missing, any required child→root lookup is
  missing, or any table conflicts.
- A missing **optional** evidence→document relationship is a **warning**, not a
  blocker.
- The report restates that **app runtime persistence is NOT enabled** — it is a
  schema-readiness signal only.

## Repair mode behavior

`--repair-portfolio-boarding-optional-relationships` (dry-run by default):

- inspects the source (`cr664_portfolioboardedloanevidence`) and target
  (`cr664_portfolioboardedloandocument`) tables;
- fails closed if either table is missing;
- no-ops if the lookup already exists;
- in dry-run, prints the single missing optional lookup and writes nothing;
- in commit mode (`--commit-repair-portfolio-boarding-optional-relationships`),
  creates **only** that one optional lookup relationship, then verifies by
  re-reading metadata.

It creates no tables, no other columns, no records, and no documents. Both
flags are mutually exclusive with every other script mode, and the commit flag
is inert without the repair mode.

## Safety constraints

- No app runtime persistence enabled.
- No React route changes; no command center data loading changes.
- No fake data; no borrower/loan records created; no documents uploaded.
- No destructive operations; no DELETE.
- Dry-run is the default for the repair; the commit flag is required for the
  single metadata create.
- Existing Phase 140I inspect and Phase 140J seed modes remain safe.
- The existing Phase 140J core schema is not recreated or mutated.

## Operator commands

```
# Inspect (now includes the verification section)
node scripts/phase122-lookup-repair.mjs --inspect-portfolio-boarding-schema

# Dry-run the optional-relationship repair
node scripts/phase122-lookup-repair.mjs --repair-portfolio-boarding-optional-relationships

# If the dry-run shows only the optional evidence→document relationship and no blockers:
node scripts/phase122-lookup-repair.mjs --repair-portfolio-boarding-optional-relationships --commit-repair-portfolio-boarding-optional-relationships

# Verify
node scripts/phase122-lookup-repair.mjs --inspect-portfolio-boarding-schema
node scripts/phase122-lookup-repair.mjs --seed-portfolio-boarding-schema
```

## What is intentionally not built

- no live app persistence
- no portfolio loan record creation
- no document upload
- no command center live data loading
- no permission changes
- no fake data

## Next recommended phase

**Phase 140L** — enable the governed Portfolio Loan Boarding persistence
adapter behind an explicit feature flag and operator-only UI path, once the
verification report reports `safeForRuntimePersistenceCandidate: true`.
