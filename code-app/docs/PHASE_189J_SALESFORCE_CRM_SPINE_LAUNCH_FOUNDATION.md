# Phase 189J — Salesforce CRM Spine Launch Foundation

**Status:** Complete. Typed model + launch-readiness foundation only. Pure and
read-only: no fabricated CRM records, no Dataverse writes, no schema/migration
files, no `CRM_LIVE_PERSISTENCE_ENABLED` flip, no new routes, no
`App.tsx`/router/`WorkspaceGate` change, no manager/team/executive mount
expansion.

**Branch:** `phase189j-salesforce-crm-spine-foundation` (base: `master` after the
Phase 189I merge / PR #19).

## What this phase delivers

The canonical, typed foundation for a real launch CRM spine, plus a readiness
engine that classifies exactly what stands between today and launch — without
seeding, writing, or fabricating anything.

- `src/crm/crmSalesforceSpineModel.ts` — canonical typed entities mapped onto the
  already-planned `cr664_crm*` tables (`crmDataverseSchemaPlan.ts`), an entity
  registry of launch requirements, and two **honest** pure projections:
  `toProvisionalAccount` (client stub → provisional identity) and
  `coverageTeamFromAuthorizedFacts` (banker/team facts → coverage members).
- `src/crm/crmSalesforceSpineLaunchReadiness.ts` —
  `deriveCrmSalesforceSpineLaunchReadiness(input)`: per-entity readiness, source
  facts, visibility requirements, a seed plan, and explicit fabrication refusals.

### Model entities

`CrmAccount`, `CrmContact`, `CrmAccountContactRelationship`,
`CrmRelationshipRole`, `CrmCoverageTeamMember`, `CrmDealRelationship`,
`CrmActivity`, `CrmTask`, `CrmRelationshipHealth`, `CrmSourceFact`,
`CrmVisibilityRequirement`.

## Readiness states (the seven distinctions)

Per entity, the engine assigns exactly one state:

| State | Meaning | Example this phase |
|---|---|---|
| `renderable` | Available now from facts/policy on hand. | source facts, visibility policy, coverage team |
| `provisional` | A partial/projected identity is available; full record deferred. | Account (from client stub), deal relationship, relationship health |
| `seed-required` | Backing table exists but holds no records yet. | contacts when `cr664_crmperson` is present but empty |
| `schema-required` | Backing table must be created first. | contacts/roles/activities by default; tasks (no planned table) |
| `migration-required` | Existing data must migrate into the seeded table. | Account once `cr664_crmorganization` exists but the stub isn't migrated |
| `authorization-required` | Needs an authorization fact to load. | coverage team when no banker/team facts are in context |
| `blocked` | A prerequisite anchor is missing. | everything when no deal/client anchor exists |

`launchStatus` summarizes: `blocked` (no anchor), `provisional-foundation` (the
normal case this phase — provisional identity + renderable foundation, spine not
seeded), or `launch-ready` (all entities renderable; future).

## Honesty guarantees (pinned by tests)

- **No fabrication.** The model offers only two constructors, both pure
  projections of facts the caller already holds. Contacts, account/contact
  relationships, roles, activities, tasks, and timeline have **no constructor**
  and are never synthesized; the readiness output lists them in
  `rejectedFabrications`.
- **Stub → provisional Account only.** `toProvisionalAccount` returns
  `isProvisional: true` with every full-account attribute (`legalName`,
  `industry`, `accountType`, …) null. It is never a full Account.
- **Contacts/activities/roles stay gated.** They are `schema-required` (or
  `seed-required` once a table exists), and only `renderable` once authorized-
  loaded — never fabricated.
- **Coverage team is fact-derived.** Members come only from the existing
  authorized `cr664_banker` / `cr664_team` facts; absent facts →
  `authorization-required` and an empty team.
- **Nothing live changes.** `readOnly: true`, `spineSeeded: false`,
  `schemaMutated: false`, `migrationExecuted: false`, and live persistence stays
  `false`.

## Acceptance evidence

- `crmSalesforceSpineModel.test.ts`: provisional-account projection, fact-derived
  coverage team, the 11-entity registry's launch requirements, and that the model
  exposes no fabrication constructors.
- `crmSalesforceSpineLaunchReadiness.test.ts`: provisional foundation by default;
  contacts/roles/activities/tasks non-renderable until seeded/loaded; seed-
  required when a table is present; migration-required for the account once the
  org table exists; authorization-required coverage without facts; blocked
  without an anchor; all seven states reachable; no fabricated record
  collections; deferral ordering.
- `phase189JSalesforceCrmSpineLaunchContract.test.ts`: pure modules (no
  writes/network/SDK/client import), no schema-mutation or SQL/migration files,
  no flag flip, no fabricated records/PII, no routes/App/Gate change, no
  manager/team/executive mount expansion.
- `npm run build` green; targeted suite green.

## Recommended next phase (guarded, not this phase)

Create the missing `cr664_crm*` tables (inspect-first, guarded), migrate the
borrower/client stub into a real `CrmAccount`, then seed/load contacts, roles,
activities, and tasks — each step flipping the corresponding readiness state from
`schema-required` → `seed-required` → `renderable`. Flip
`CRM_LIVE_PERSISTENCE_ENABLED` only after all three land behind a runtime schema
gate.
