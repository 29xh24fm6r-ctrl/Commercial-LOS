# Phase 189K — Salesforce CRM Spine Schema Adapter (Inspect / Plan / Disabled Seed)

**Status:** Complete. Schema adapter with **inspect** and **plan** modes live and
a **disabled, gated seed** mode. Pure and fail-closed: no live Dataverse writes,
no schema mutation, no fabricated CRM records, no `CRM_LIVE_PERSISTENCE_ENABLED`
flip, no `App.tsx`/router/`WorkspaceGate` change, no new routes, no UI expansion.

**Branch:** `phase189k-salesforce-crm-spine-schema-adapter` (base: `master` after
the Phase 189J merge / PR #21, included via PR #22).

## What this phase delivers

`src/crm/crmSalesforceSpineSchemaAdapter.ts` binds the Phase 189J launch entities
to their Dataverse `cr664_crm*` schema artifacts and exposes three modes plus a
dispatcher (`runCrmSpineSchemaAdapter`, default `inspect`).

### Entity → schema bindings

| Entity | Backing table | Schema kind |
|---|---|---|
| Account | `cr664_crmorganization` | spine-table |
| Contact | `cr664_crmperson` | spine-table |
| AccountContactRelationship | `cr664_crmrelationship` | spine-table |
| RelationshipRole | `cr664_crmroleassignment` | spine-table |
| Activity | `cr664_crmtimelineevent` | spine-table |
| Task | `cr664_crmtask` *(new — defined in this adapter)* | spine-table |
| CoverageTeamMember | — | derived-no-schema |
| DealRelationship | — | derived-no-schema |
| RelationshipHealth | — | derived-no-schema |
| SourceFact | — | meta-no-schema |
| VisibilityRequirement | — | meta-no-schema |

Spine-table columns/relationships reuse the existing `crmDataverseSchemaPlan.ts`
(141J-K); the new `cr664_crmtask` table plan is defined here because the base
plan has no task table.

## Modes

- **Inspect** (`inspectCrmSpineSchema`) — compares a read-only live snapshot
  against the plan and reports, per entity, whether its table is `present`,
  `partial`, `missing`, `conflict`, or `not-applicable` (derived/meta), with the
  exact present/missing columns and relationships. Recommends `plan-schema`,
  `reuse-existing`, or `resolve-conflicts`. Mutates nothing.
- **Plan** (`planCrmSpineSchema`) — turns the inspection into deterministic,
  ordered `create-table` / `create-column` / `create-relationship` steps (each
  labelled with the metadata operation it *would* perform: `CreateEntity` /
  `CreateAttribute` / `CreateRelationship`). Re-planning the same input yields
  identical steps. `executed: false` — it runs nothing.
- **Seed** (`runCrmSpineSchemaSeed`) — **disabled by default and inert.** A gate
  (`explicitlyConfirmed` + non-empty `acknowledgement` + live persistence) is
  required even to be considered, and **even when the gate is satisfied this
  phase performs no live write** — the write path is intentionally absent.
  `executed` is always `false`.

## Safety guarantees (pinned by tests)

- Every mode returns `liveWritePerformed: false` and `schemaMutated: false`;
  plan/seed return `executed: false`.
- The adapter imports only pure local CRM modules — no `@microsoft/power-apps`,
  no generated services, no `getClient`/transport/adapter, no `fetch`.
- No data-write verb (`createRecord`/`updateRecord`/`deleteRecord`/
  `retrieveMultiple`/`executeMultiple`/`method: 'POST'|'PATCH'|'DELETE'`/
  `PublishXml`) appears in the adapter.
- No fabricated records, no PII, no `CRM_LIVE_PERSISTENCE_ENABLED` flip, no
  route/App/WorkspaceGate change, and no workspace mounts the adapter.

## Acceptance evidence

- `crmSalesforceSpineSchemaAdapter.test.ts`: bindings cover all 11 entities;
  inspect reports missing/present/partial/conflict; plan is deterministic and
  emits create steps without executing; seed is disabled without a gate and inert
  even with a satisfied gate; the dispatcher defaults to inspect.
- `phase189KSalesforceCrmSpineSchemaContract.test.ts`: static purity pins plus
  runtime proof that inspect/plan/seed/default-dispatch never write or mutate.
- `npm run build` green; targeted suite green.

## Recommended next phase (guarded)

Wire a real, gated metadata-write executor behind the seed gate (inspect-first,
dry-run default, commit only on the explicit flag), create the missing
`cr664_crm*` tables, then migrate the borrower/client stub into a real Account
and seed contacts/roles/activities/tasks — flipping each entity's 189J readiness
state from `schema-required` → `seed-required` → `renderable`. Flip
`CRM_LIVE_PERSISTENCE_ENABLED` only after that lands behind the runtime schema
gate.
