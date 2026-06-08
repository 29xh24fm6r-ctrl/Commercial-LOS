# Phase 141J-K — CRM Dataverse Schema Inspection, Guarded Seed, and Verification

> **What this is.** The live Dataverse schema preparation for the Phase 141B-H
> CRM Relationship Master: a read-only inspection mode, a read-only plan mode, a
> dry-run-default guarded seed mode (live creation only behind an explicit commit
> flag), and a post-seed verification section — built on the same
> inspect → plan → dry-run → commit → verify pattern that worked for Portfolio
> Boarding. **No app-runtime CRM writes are enabled by this phase.**

## 1. Purpose

Buddy has a lending-native CRM Relationship Master in code (Phase 141B-H), but it
has no live Dataverse persistence tables for CRM records. This phase creates the
CRM Dataverse schema **safely** so that a later phase (141L) can add a disabled
persistence adapter over real tables.

The CRM schema is required before Buddy can safely persist organizations, people,
contact points, relationships, role assignments, communication preferences,
contact authorizations, vendor profiles, timeline events, and audit entries.

## 2. Why CRM schema follows the CRM Relationship Master

The domain model, readiness engines, recipient resolver, and read-only panels all
exist first (141B-H). Schema is created only once the model is stable, using the
proven inspect-first discipline: **inspect first, plan second, dry-run third,
commit only behind an explicit flag, verify after creation.** Never enable
app-runtime CRM writes in this phase.

## 3. Candidate CRM tables (10)

| # | Logical name | Purpose |
|---|---|---|
| 1 | `cr664_crmorganization` | Companies, customers, borrowers, vendors, firms, agencies, internal units |
| 2 | `cr664_crmperson` | Individuals and contacts |
| 3 | `cr664_crmcontactpoint` | Emails, phones, mobile numbers, mailing addresses, portals |
| 4 | `cr664_crmrelationship` | Generic relationship graph edges |
| 5 | `cr664_crmroleassignment` | Role assignments (borrower contact, servicing owner, portfolio manager, …) |
| 6 | `cr664_crmcommunicationpreference` | Communication preferences and restrictions |
| 7 | `cr664_crmcontactauthorization` | Authorizations for financial requests, upload links, loan notices, … |
| 8 | `cr664_crmvendorprofile` | Vendor / advisor profile (CPA, attorney, title, appraiser, …) |
| 9 | `cr664_crmtimelineevent` | CRM timeline events |
| 10 | `cr664_crmauditentry` | CRM audit trail |

The plan, columns, optional lookup relationships, and option-set metadata are
declared in `src/crm/crmDataverseSchemaPlan.ts` (constants only — no IO, no
writes, no fake CRM data).

## 4. Reuse candidates

`cr664_clientrelationship`, `cr664_banker`, `cr664_platformuser`, `cr664_team`,
`cr664_loandeal`, `cr664_portfolioboardedloan`, and `systemuser`. These are
inspected as lookup-target / reuse candidates and are never mutated.

## 5. Schema inspection mode (read-only)

```
node scripts/phase122-lookup-repair.mjs --inspect-crm-schema
```

GET only. For each candidate CRM table it prints display / logical / schema /
entity-set names, ownership, primary id/name, activity + notes flags, attribute
count, and a classification: `EXISTS_REUSABLE`, `EXISTS_NEEDS_REVIEW`,
`MISSING_CAN_SEED`, `BLOCKED_BY_CONFLICT`, or `UNKNOWN`. It then prints a
`CRM_SCHEMA_RECOMMENDATION` section and a `CRM_SCHEMA_VERIFICATION` section
(`safeForCrmRuntimePersistenceCandidate` true/false). No PublishXml, no
POST/PATCH/DELETE, no bypass/suppress headers.

The pure deriver `deriveCrmSchemaInspectionReport` projects an inspection result
into a fail-closed report (`safeToSeed` is false on any conflict, unconfirmed
prefix, ambiguous match, or missing required lookup target).

## 6. Plan mode (read-only)

```
node scripts/phase122-lookup-repair.mjs --plan-crm-schema
```

Runs the same GET inspection and prints the planned tables (seed order), columns,
relationships, option-set notes, skipped optional relationships, and blockers.
It prints `DRY_RUN_ONLY: true`, `LIVE_WRITES_ENABLED: false`,
`COMMIT_FLAG_AVAILABLE: false`, and states clearly:

> Phase 141J-K plan mode does not create Dataverse schema unless
> `--seed-crm-schema` is used with `--commit-seed-crm-schema`.

The pure deriver `deriveCrmSchemaSeedPlan` turns the inspection report into
create / reuse / skip lists and a fail-closed `safeToCommit`.

## 7. Guarded seed mode (dry-run default)

```
node scripts/phase122-lookup-repair.mjs --seed-crm-schema                            # dry-run
node scripts/phase122-lookup-repair.mjs --seed-crm-schema --commit-seed-crm-schema   # commit
```

Dry-run is the default and is read-only: it inspects, builds the seed plan, and
prints tables/columns/relationships to create or reuse, skipped optional
relationships, blockers, and warnings — then stops with no write. Commit mode
creates missing CRM tables in seed order, then missing columns, then missing safe
relationships, skips reusable items, skips optional relationships whose external
target is absent, and re-reads metadata to verify. The ONLY mutation verb in the
seed path is POST (create). There is no PATCH, no DELETE, no PublishXml, no
record creation.

Picklist plan columns are seeded as TEXT in this phase — option-set creation is
deferred until the existing option-set helper is proven safe.

## 8. Safety gates

- Dry-run is the default; the commit flag is required for any metadata write.
- `--commit-seed-crm-schema` is inert without `--seed-crm-schema`.
- All script modes remain mutually exclusive; the existing Portfolio Boarding and
  Phase 122/124/133/137 modes are unchanged.
- Publisher prefix must be `cr664`; the forbidden `new_` prefix is refused.
- Fail-closed: any conflict, ambiguous match, unconfirmed prefix, or missing
  required lookup target blocks the commit.
- No DELETE, no PublishXml, no bypass / suppress duplicate-detection headers, no
  force flag, no record creation.

## 9. What is intentionally NOT enabled

- **No app-runtime CRM writes** — the app never persists CRM records in this phase.
- **No borrower outreach** — no email / SMS / Twilio / mailto primitives.
- **No upload links.**
- **No CRM route** registered in `App.tsx`; no permission widening.
- **No schema deletion** and no mutation of existing reusable tables.
- **No fake CRM data** — no sample customer / vendor / contact records, no sample
  emails or phone numbers, no placeholder company names.

## 10. Operator workflow

```
node scripts/phase122-lookup-repair.mjs --inspect-crm-schema
node scripts/phase122-lookup-repair.mjs --plan-crm-schema
node scripts/phase122-lookup-repair.mjs --seed-crm-schema
node scripts/phase122-lookup-repair.mjs --seed-crm-schema --commit-seed-crm-schema
node scripts/phase122-lookup-repair.mjs --inspect-crm-schema
```

The final inspect re-reads metadata and prints the `CRM_SCHEMA_VERIFICATION`
section to confirm the tables, columns, and required relationships landed.

## 11. Rollback / recovery

This phase creates only additive schema metadata (tables, columns, optional
lookups) under the `cr664` publisher in the existing solution. There is no
DELETE in the seed path. To roll back a created artifact, an operator removes it
manually in the maker portal (or via a separate, audited tooling pass) — the seed
script never deletes. Because the seed is idempotent (existing compatible items
are reused, not recreated), re-running dry-run after any manual change is safe.

## 12. Next recommended phase

**Phase 141L — CRM live persistence adapter, disabled by default** (over an
injected transport seam, fail-closed `not_configured`, no delete), once the CRM
schema is verified present.
