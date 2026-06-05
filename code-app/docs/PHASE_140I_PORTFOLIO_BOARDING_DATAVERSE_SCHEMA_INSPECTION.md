# Phase 140I — Portfolio Boarding Dataverse Schema Inspection & Guarded Seed Plan

> **What this is.** A read-only Dataverse schema inspection mode and a
> declarative target-schema plan that prepare — but do **not** enable — the
> persistence layer for the Phase 140B-H portfolio loan boarding system of
> record. **Inspect first. Plan second. Seed only behind explicit commit
> flags (none exist yet).** Phase 140I does not create Dataverse schema. It
> only inspects and plans.

## 1. Purpose

Live Dataverse schema inspection for manually boarded portfolio loans. The
bank needs to manually load fully-closed loans into the LOS as governed
portfolio system-of-record records. Before any write is enabled, we must know
which tables, columns, relationships, and publisher prefix already exist, what
must be created, and what legacy artifacts must be avoided — without guessing
live schema.

## 2. Why this follows Phase 140B-H

Phase 140B-H built the full in-app boarding architecture: the domain model,
field/document catalogs, completeness + snapshot derivers, disabled
persistence adapters, preview/editor shells, the evidence binder, the FDIC
examiner package, and the command-center adapter. Phase 140I prepares the real
Dataverse persistence layer **safely** — inspection and planning only — so a
later phase can wire writes against a known, validated schema.

## 3. What this phase adds

- **Target Dataverse schema plan constants** —
  `src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts`
  (tables, columns, relationships, option-set plans, schema version).
- **Pure inspection report deriver** —
  `src/portfolioBoarding/derivePortfolioBoardingSchemaInspectionReport.ts`
  (fail-closed `safeToSeed`).
- **Read-only inspect script mode** — `--inspect-portfolio-boarding-schema`.
- **Read-only plan script mode** — `--plan-portfolio-boarding-schema`.
- **Governance pins** — schema-plan tests, inspection-report tests, script
  contract pins, and release-snapshot pins.

## 4. Candidate tables

The 13 candidate portfolio boarded loan tables (root first, then children):

1. `cr664_portfolioboardedloan` (**root**)
2. `cr664_portfolioboardedloanborrower`
3. `cr664_portfolioboardedloancollateral`
4. `cr664_portfolioboardedloanguarantor`
5. `cr664_portfolioboardedloancovenant`
6. `cr664_portfolioboardedloantickler`
7. `cr664_portfolioboardedloaninsurance`
8. `cr664_portfolioboardedloandocument`
9. `cr664_portfolioboardedloanexception`
10. `cr664_portfolioboardedloanreview`
11. `cr664_portfolioboardedloanevidence`
12. `cr664_portfolioboardedloanauditentry`
13. `cr664_portfolioboardedloanexaminernote`

## 5. Candidate relationships

Every child table carries a required `cr664_PortfolioBoardedLoan` lookup back
to the root `cr664_portfolioboardedloan` table (parental cascade), so a boarded
loan and all of its collateral, guarantors, covenants, ticklers, insurance,
documents, exceptions, reviews, evidence, audit entries, and examiner notes
form one parent/child graph. The evidence table also carries an optional
lookup to the document it was drawn from. The root table carries optional
external links (see §6).

## 6. Existing table reuse strategy

The root boarded-loan table may link to existing project infrastructure once
inspection confirms targets and they are approved:

- **Loan Deal** (`cr664_loandeal`) — optional `cr664_OriginatedLoanDeal` link
  when a loan was boarded from a closed origination deal.
- **Client Relationship** (`cr664_clientrelationship`) — optional
  `cr664_Client` link.
- **Banker / System User** — `cr664_PortfolioManager` and
  `cr664_AssignedServicingOwner` lookups; the live target (`systemuser` vs a
  banker table) is confirmed by inspection.
- **Team** (`cr664_team`) — optional `cr664_Team` link if a Team table exists.
- **Existing document infrastructure** — only if a later phase approves reuse.

## 7. Safety posture

- **No live schema creates.** No actual Dataverse table creation, no column
  creation, no relationship creation.
- **No live app writes** and **no UI persistence**.
- **No command center data loading changes.**
- **No fake data** and **no sample borrower data.**
- **Dry-run only** — both modes are read-only GET inspections.
- **No commit flag exists** in Phase 140I for portfolio boarding schema
  creation; schema seeding is intentionally disabled.
- Both modes are mutually exclusive with every other script mode and issue no
  POST/PATCH/DELETE, no publish call, and no bypass/suppress headers.

## 8. Operator commands

Read-only inspection of the candidate + related tables:

```
node scripts/phase122-lookup-repair.mjs --inspect-portfolio-boarding-schema
```

Read-only creation plan (dry-run only):

```
node scripts/phase122-lookup-repair.mjs --plan-portfolio-boarding-schema
```

Both require an authenticated `pac` session because they read live Web API
metadata. Neither writes anything.

## 9. Expected output

The inspect mode classifies each candidate table as `EXISTS_REUSABLE`,
`EXISTS_NEEDS_REVIEW`, `MISSING_CAN_SEED`, `BLOCKED_BY_CONFLICT`, or `UNKNOWN`,
lists existing related tables as lookup-target candidates, and prints a
`PORTFOLIO_BOARDING_SCHEMA_RECOMMENDATION` section (tables to create, tables to
reuse, conflicts to resolve, blockers, recommended next mode). The plan mode
prints the tables/columns/relationships/option sets in seed order, the blockers,
the required manual-review items, and the flags `DRY_RUN_ONLY: true`,
`LIVE_WRITES_ENABLED: false`, `COMMIT_FLAG_AVAILABLE: false`.

The pure `derivePortfolioBoardingSchemaInspectionReport` returns
`safeToSeed: false` whenever a conflict exists, the publisher prefix is
unconfirmed, a required lookup target is missing, or an ambiguous table match
exists. Missing target tables alone do **not** block — they are seed
candidates.

## 10. What is intentionally not built

- **No actual Dataverse table creation.**
- **No column creation.**
- **No relationship creation.**
- **No PublishXml / publish call.**
- **No live persistence adapter enablement.**
- **No document upload persistence.**
- **No FDIC PDF export.**

## 11. Next recommended phase

**Phase 140J — Guarded Dataverse schema seed mode for Portfolio Boarded Loan
persistence.** Add a guarded seed mode behind an explicit `--commit-*` flag,
dry-run by default, that creates the planned tables/columns/relationships in
seed order only after every inspection gate (prefix, conflicts, lookup targets)
passes.
