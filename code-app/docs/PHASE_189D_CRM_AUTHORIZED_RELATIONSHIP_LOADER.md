# Phase 189D — CRM Authorized Relationship Enrichment

**Status:** Complete. Read-only enrichment of the already-authorized deal row.
No Dataverse writes, no schema mutation, no `App.tsx`/router/`WorkspaceGate`
change, no `CRM_LIVE_PERSISTENCE_ENABLED` flip, no new query.

**Branch:** `phase189d-crm-authorized-relationship-loader` (base: `master` after PR #7 / Phase 189C merge)

## This phase is NOT a new runtime loader

It adds **no second Dataverse GET** and **no child query** for the CRM panel.
It enriches the deal row that `loadDealForBanker` / `loadDealForManager` /
`loadDealForTeam` already retrieve and already authorize, so the read-only CRM
Relationship panel can use **real lookup IDs** instead of a name surrogate —
without adding a second child query.

The enrichment is computed inside `mapDealDetail`, which runs **only after** the
existing authorization check (`_cr664_assignedbanker_value` / `_cr664_team_value`
match). No pre-authorization request is introduced.

## What changed

`src/deals/dealQueries.ts`
- `import type { CrmEdgeLookupClassification }` (type-only — erased at runtime,
  no runtime CRM dependency in the loader).
- `DealDetail` gains seven CRM fields, populated from the SAME retrieve:
  `clientId`, `clientLookupClassification`, `teamId`, `teamName`,
  `teamLookupClassification`, `assignedBankerId`,
  `assignedBankerLookupClassification`.
- Classification rule per edge:
  - **client:** `real-lookup` when `_cr664_client_value` exists; `unknown` when
    only a display label (`cr664_client` formatted value / `cr664_clientname`)
    exists; `missing` otherwise.
  - **team:** `real-lookup` when `_cr664_team_value` exists; `missing` otherwise.
    `teamName` from `cr664_team` formatted value (or `cr664_teamname`).
  - **assigned banker:** `real-lookup` when `_cr664_assignedbanker_value` exists;
    `unknown` when only a label/`owneridname` exists; `missing` otherwise.

> **Interface note:** the seven fields are declared **optional** on `DealDetail`
> so the many existing hand-built `DealDetail` test fixtures keep compiling
> without edits (this phase touches no fixture outside its scope). `mapDealDetail`
> — the single real producer, used by every `loadDealFor*` path — always sets all
> seven, so the authorized runtime row carries definite values.

`src/crm/CrmRelationshipPanel.tsx` (`DealCrmRelationshipPanel`)
- Passes the enriched ids to `buildCrmRelationshipInput`: `clientId`,
  `clientLookupClassification`, a real `team` object when `teamId` exists, and
  the real assigned-banker id (`deal.assignedBankerId`, `deal.bankerName`,
  classification) — falling back to the banker context only when the deal has no
  assigned-banker id.

`src/crm/buildCrmRelationshipInput.ts`
- Unchanged behavior (already supported these fields in 189C): a real client
  GUID **always wins** over the `name:` surrogate; a label-only client still
  produces the surrogate. A 189D traceability comment documents the precedence.

## Fallback / safety guarantees

- Real GUID wins over the name surrogate; a label-only client still gets a
  `name:` surrogate (no fabricated GUID).
- No fabricated Salesforce-style spine data; the future spine still renders
  *not seeded · not wired*.
- No `CRM_LIVE_PERSISTENCE_ENABLED` change (stays `false`).
- No `App.tsx`/router/`WorkspaceGate` change; no route registered.
- No schema/migration files; no POST/PATCH/DELETE/PublishXml.
- No new pre-auth or child query — exactly the existing single retrieve per
  loader.

## Tests

- `loadDealForBanker.test.ts` — maps `_cr664_client_value`→`clientId`/real-lookup,
  `_cr664_team_value` + formatted value→`teamId`/`teamName`/real-lookup,
  `_cr664_assignedbanker_value`→`assignedBankerId`/real-lookup, plus
  unknown/missing classification cases.
- `buildCrmRelationshipInput.test.ts` — classification passthrough; real GUID
  wins; label-only → `name:` surrogate.
- `CrmRelationshipPanel.test.tsx` — connected container renders real client +
  team when `DealDetail` carries IDs (status `ready`); no buttons/forms/write
  affordances.
- `phase189DCrmRelationshipLoaderContract.test.ts` — no new write path, no new
  GET/child query, auth-before-mapping, type-only CRM import, no
  route/App/WorkspaceGate change, no schema/migration, no fabricated CRM spine.

## Recommended later phase

A guarded spine seed only after `crmRuntimeSchemaGate` confirms the `cr664_crm*`
tables exist live — dry-run by default, commit behind an explicit flag,
fail-closed, audit-emitting.

## Acceptance evidence

Targeted tests green · full suite green · `npm run build` green · route count
unchanged (no router files touched; no `check:routes` script exists in this repo
— invariance verified via the untouched `workspaceRoutes` + the routes test in
the suite) · no schema/migration files · no Dataverse write paths.
