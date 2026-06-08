# Phase 140J — Guarded Dataverse Schema Seed Mode for Portfolio Boarded Loan Persistence

> **What this is.** A guarded, **dry-run-first** Dataverse schema seed mode for
> the Phase 140B-H portfolio loan boarding system of record. Live metadata
> creation happens **only** when the explicit
> `--commit-seed-portfolio-boarding-schema` flag is supplied **and** every
> inspection gate passes. This phase creates schema metadata only — it never
> creates loan records, never uploads documents, and never enables app-runtime
> portfolio boarding writes.

## 1. Purpose

Guarded Dataverse schema seed mode for Portfolio Boarded Loan persistence.
The bank needs to manually board every material detail of already-closed /
legacy loans into the LOS. Phase 140J creates the real Dataverse
tables/columns/relationships those records will live in — through a controlled,
inspection-gated, explicitly-committed operator workflow.

## 2. Why this follows Phase 140I

Phase 140I added read-only schema inspection and planning
(`--inspect-portfolio-boarding-schema`, `--plan-portfolio-boarding-schema`)
and proved no live schema creation was enabled. Phase 140J adds the next
controlled step: it can **seed** the planned schema, but only behind an
explicit operator commit flag and only after the same inspection gates pass.

## 3. What this phase adds

- `--seed-portfolio-boarding-schema` — dry-run by default.
- `--commit-seed-portfolio-boarding-schema` — authorizes live metadata create.
- A pure schema **seed plan deriver**
  (`src/portfolioBoarding/derivePortfolioBoardingSchemaSeedPlan.ts`).
- Script-local **create helpers** for missing tables, columns, and lookup
  relationships, plus verification reads.
- Governance pins (seed-plan tests, script-contract pins, release snapshot).

## 4. What this phase does not do

- Does not enable app runtime portfolio boarding writes.
- Does **not** create loan records.
- Does **not** upload documents.
- Does **not** wire command center live data.
- Does **not** add React routes.
- Does **not** widen permissions.
- Does **not** create fake data.
- Does **not** create Copilot actions.
- Performs **no** DELETE and **no** mutation of existing columns.

## 5. Operator workflow

```
# Step 1 — inspect live metadata
node scripts/phase122-lookup-repair.mjs --inspect-portfolio-boarding-schema

# Step 2 — review the creation plan
node scripts/phase122-lookup-repair.mjs --plan-portfolio-boarding-schema

# Step 3 — dry-run the seed (read-only; prints the exact create plan)
node scripts/phase122-lookup-repair.mjs --seed-portfolio-boarding-schema

# Step 4 — commit ONLY after the dry-run is reviewed and clean
node scripts/phase122-lookup-repair.mjs --seed-portfolio-boarding-schema --commit-seed-portfolio-boarding-schema

# Step 5 — verify
node scripts/phase122-lookup-repair.mjs --inspect-portfolio-boarding-schema
```

## 6. Safety gates

- **Publisher prefix gate** — the active prefix must be confirmed as `cr664`
  (the project publisher prefix). If it cannot be confirmed, the commit is
  refused.
- **Conflict gate** — any candidate table that exists under a wrong / legacy
  prefix is classified `BLOCKED_BY_CONFLICT` and blocks commit.
- **Lookup target gate** — child→root lookups target the in-plan root table;
  optional external lookups (`OriginatedLoanDeal`, `Client`, `PortfolioManager`,
  `AssignedServicingOwner`, `Team`) are created only when their target exists,
  and are otherwise skipped with a warning. A required-but-missing lookup target
  blocks commit.
- **No destructive operation gate** — no DELETE, no column removal, no column
  alteration. The seed path only creates missing tables/columns/relationships.
- **Commit flag gate** — live metadata create is only reachable inside the
  commit branch. Dry-run prints `DRY_RUN_ONLY: true`; commit prints
  `DRY_RUN_ONLY: false` and `COMMIT_CONFIRMED: true`.
- **Mutex gate** — `--seed-portfolio-boarding-schema` is mutually exclusive
  with every other script mode; `--commit-seed-portfolio-boarding-schema` is
  inert on its own and only valid alongside the seed mode.

Option-set / choice columns are intentionally **deferred**: picklist plan
columns are seeded as text columns in this phase, and global/local option-set
metadata creation is left to a later phase.

## 7. Expected dry-run output

- tables to create / reuse
- columns to create (count)
- relationships to create / reuse
- skipped optional relationships
- blockers
- `safeToCommit`

No POST/PATCH/DELETE is issued in dry-run.

## 8. Expected commit output

- created tables (in seed order)
- created columns (in seed order)
- created lookup relationships (in seed order)
- skipped existing compatible items
- a verification summary from re-reading metadata

## 9. Rollback / recovery

This phase creates metadata only and performs **no deletes**, so rollback is
manual through Dataverse solution management if needed. Operators should prefer
running in a dev / test environment first.

## 10. Next recommended phase

- **Phase 140K** — run live schema inspection/seed in the target environment and
  capture verification output; **or**
- **Phase 140L** — enable the governed Portfolio Loan Boarding persistence
  adapter behind an explicit runtime feature flag, once the schema exists and is
  verified.
