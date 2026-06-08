# Phase 141L — CRM Live Persistence Adapter (Disabled by Default)

> **What this is.** A governed live CRM persistence adapter for the CRM
> Relationship Master, now that Phase 141J-K created and verified the live CRM
> Dataverse schema. It is the CRM equivalent of Portfolio Boarding Phase 140L/Q:
> a real adapter architecture, schema-scoped payload mapping, **disabled by
> default**, feature-flag gated, permission-ready, auditable, non-destructive,
> and structurally unable to send outreach.

## 1. Purpose

Buddy needs a safe application-layer way to persist CRM Relationship Master
records — organizations, people, contact points, relationships, role
assignments, communication preferences, contact authorizations, vendor profiles,
timeline events, and audit entries — so future annual-review workflows can know
who to contact, who is authorized, who is do-not-contact, which vendors/advisors
support evidence, and which internal users own servicing or relationship
responsibilities.

Because this adapter may eventually write real customer / contact / vendor data,
it is schema-scoped, **disabled by default**, feature-flag gated, permission-
ready, auditable, non-destructive, and unable to send outreach.

## 2. Prerequisites

- **Phase 141B-H** — CRM Relationship Master (domain model, readiness engines,
  recipient resolver, read-only panels).
- **Phase 141J-K** — CRM Dataverse schema seeded and verified
  (`safeForCrmRuntimePersistenceCandidate = true`).

## 3. CRM schema state (per the Phase 141J-K verification)

- **10** CRM tables (`cr664_crmorganization` … `cr664_crmauditentry`)
- **147** CRM columns (the non-primary scalar columns; each table also carries
  its `cr664_name` primary)
- **28** CRM relationships (all optional lookups)

The runtime schema gate derives these expectations from
`src/crm/crmDataverseSchemaPlan.ts`, so it stays in sync with the plan
automatically and never fakes readiness.

## 4. What this phase adds

| File | Role |
|---|---|
| `src/crm/crmFeatureFlags.ts` | Fail-closed feature flags (all off by default) |
| `src/crm/crmDataverseMapper.ts` | Domain ↔ `cr664_crm*` payload mapping (+ redaction) |
| `src/crm/crmLiveDataverseTransport.ts` | Narrow injected transport + CRM entity-set allow-list |
| `src/crm/crmLiveDataverseAdapter.ts` | Live adapter factory + disabled default |
| `src/crm/resolveCrmPersistenceAdapter.ts` | Fail-closed resolver (disabled unless every gate passes) |
| `src/crm/crmRuntimeSchemaGate.ts` | Verified-schema gate (10 / 147 / 28) |
| `src/crm/crmPersistenceTypes.ts` | Live result + adapter contract + error codes |
| `src/shared/governance/crmPersistenceGovernance.test.ts` | Governance pins |

The adapter performs NO IO itself: all access goes through an **injected**
`CrmDataverseTransport`, which the real Dataverse client would fulfill and which
is never wired by default. If no app-safe runtime Dataverse client exists, the
live adapter remains non-configured and tests inject a fake transport only.

## 5. What remains disabled

- **No route** registered in `App.tsx` — the route flag stays forced off in this
  phase even if a config asks for it.
- **No UI write path** enabled by default.
- **No borrower outreach** — no email / SMS / Twilio / mailto primitives.
- **No upload-link** generation or sending.
- **No deletes** — the transport seam exposes no delete; a destructive write is
  structurally impossible.
- **No app-runtime CRM writes** by default — `resolveCrmPersistenceAdapter`
  returns the disabled adapter unless the live flag is on, the schema is verified
  ready, a transport is injected, and the operator is authorized.

## 6. Safety posture

- **CRM table allow-list** — the transport only ever touches the 10
  `cr664_crm*` entity sets; entity-set names are resolved from a hardcoded
  allow-list, never from UI input. `cr664_loandeal`, client, banker,
  platformuser, team, systemuser, and the boarded-loan table are explicitly
  denied for writes.
- **No cross-table writes** — a non-CRM logical name resolves to `undefined`, so
  the adapter fails closed with `crm_disallowed_table`.
- **Feature-flag gating** — live persistence requires `CRM_LIVE_PERSISTENCE_ENABLED`;
  editing capabilities require persistence; the route stays off.
- **Schema gate** — create/update require the verified table + column counts to
  meet the plan with zero conflicts.
- **Permission context** — writes require an authorized operator.
- **Structured failure** — every operation returns a stable result with one of
  `crm_persistence_not_configured`, `crm_live_persistence_disabled`,
  `crm_schema_not_ready`, `crm_permission_denied`, `crm_validation_failed`,
  `crm_unsupported_operation`, `crm_transport_failed`, `crm_disallowed_table`,
  `crm_disallowed_delete`, or `crm_sensitive_value_blocked`.
- **No sensitive leakage** — tax identity is persisted as a boolean presence flag
  only (a raw tax id / SSN / TIN / EIN throws); audit value summaries are
  redacted before mapping; the recipient resolver never exposes a raw contact
  value. Do-not-contact remains enforced by the readiness logic.

## 7. Next recommended phase

**Phase 141M — Annual review borrower request workflow with human approval,
using CRM recipients** — still adapter-gated and disabled by default, with no
auto-send.
