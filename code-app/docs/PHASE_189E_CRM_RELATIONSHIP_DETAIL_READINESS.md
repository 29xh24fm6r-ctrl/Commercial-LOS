# Phase 189E — CRM Relationship Detail Readiness Audit

**Status:** Complete. Pure, read-only readiness audit. No Dataverse writes, no
schema/migration files, no `App.tsx`/router/`WorkspaceGate` change, no
`CRM_LIVE_PERSISTENCE_ENABLED` flip, no spine seed, no fabricated CRM data, no
broad org-wide queries.

**Branch:** `phase189e-crm-relationship-detail-readiness` (base: `master` after PR #8 / Phase 189D merge)

**New module:** `src/crm/crmRelationshipDetailReadiness.ts`
(`deriveCrmRelationshipDetailReadiness(input)` — pure, no IO)

## 189A–189D chain of custody

| Phase | Contribution |
|---|---|
| 189A | Read-only Dataverse audit proving the live graph; real-lookup vs pseudo classification (`--inspect-crm-relationship-graph`). |
| 189B | Pure `deriveCrmRelationshipViewModel` over the live graph; never fabricates the spine. |
| 189C | Read-only CRM panel + `buildCrmRelationshipInput`, mounted in the authorized banker deal workspace. |
| 189D | Enriched the already-authorized `DealDetail` (no second GET) with real lookup ids + per-edge classifications: `clientId`, `teamId`, `assignedBankerId`, and their `*LookupClassification`. |
| **189E** | **Readiness audit** that proves, from those authorized ids, which detail surfaces are safe to render — before any richer detail UI or spine seed. |

## What 189D now exposes safely

Real `cr664_clientrelationship` / `cr664_team` / `cr664_AssignedBanker` ids,
each with a classification (`real-lookup` when the `_<lookup>_value` GUID exists;
`unknown` for a label/context-only id; `missing` otherwise). 189E consumes the
189D-enriched `CrmRelationshipGraphInput` and assesses detail readiness — it
performs no IO.

## Detail sections: safe vs blocked

A section is **safe** only when its required record id is present, is a **real**
id (not a `name:` surrogate), and its edge is classified `real-lookup`.

| Section | Safe when | Otherwise |
|---|---|---|
| `clientIdentity` | real `client.id` + `real-lookup` | name-only surrogate or unverified → blocked (no record drilldown) |
| `teamOwnership` | real `team.id` + `real-lookup` | missing/unverified → blocked |
| `assignedBanker` | real `assignedBanker.id` + `real-lookup` | context-only id (`unknown`) or missing → blocked |
| `platformWorkspaceBridge` | real `platformUser.id` present | absent (optional) → blocked |
| `relationshipIntegrity` | a deal anchor exists (diagnostic is read-only) | no deal → blocked |
| `salesforceSpine` | never this phase | always blocked — not seeded / not wired |

**Output:** `readinessStatus` (`ready`/`partial`/`blocked`), `safeDetailSections`,
`blockedDetailSections`, `sectionAssessments`, `missingInputs`,
`unsafeAssumptionsRejected`, `nextActions` (render-safe-before-seed),
`sourceFacts`.

**Status rules:** `blocked` when no deal or no client; `ready` when client +
team + banker are all real-lookup; `partial` otherwise (incl. a name-only
surrogate client — its record detail is blocked but the audit still proceeds).

**Always rejected (never inferred):** contacts, organization hierarchy,
relationship roles, activities, timeline events, communication preferences —
listed in `unsafeAssumptionsRejected` with reasons, never materialized.

## Why 189E is pure / readiness-only

The richer detail surfaces (and the spine) aren't safe to build until we've
proven which authorized ids actually support a real record-detail drilldown.
189E is that proof: a pure function over the already-authorized graph, no IO, no
new query, no UI. It lets 189F add detail cards over **only** the sections this
audit marks safe, without re-deriving safety in the view layer.

## Recommended 189F

Read-only CRM detail cards that render **only** `readiness.safeDetailSections`,
behind the existing deal/workspace authorization (no new route, no
`CRM_ROUTE_ENABLED`/`CRM_LIVE_PERSISTENCE_ENABLED` change). Blocked sections show
the readiness reason, not fabricated data.

## Later (guarded)

Seed the Salesforce-style `cr664_crm*` spine only after
`crmRuntimeSchemaGate` confirms the tables exist live — dry-run by default,
commit behind an explicit flag, fail-closed, audit-emitting. Until then
`salesforceSpine` stays blocked / not seeded.

## Acceptance evidence

- `crmRelationshipDetailReadiness.test.ts` (11): ready/partial/blocked,
  name-only surrogate blocks client detail, missing client blocks the audit,
  missing team/banker degrade without fabrication, spine stays blocked, unsafe
  assumptions rejected, render-before-seed ordering.
- `phase189ECrmRelationshipDetailReadinessContract.test.ts` (10): no write
  verbs/fetch/broad query, no Dataverse service/client import, no flag flip, no
  route/App/WorkspaceGate change, no schema/migration, no write affordances, no
  fabricated CRM spine.
- Full suite green, `npm run build` green, no router/App/Gate change (route
  invariance), no schema/migration files, no Dataverse write paths.
