# Phase 189F — Read-Only CRM Detail Cards Over Safe Detail Sections Only

**Status:** Complete. Read-only UI. No Dataverse IO/writes, no schema/migration
files, no `App.tsx`/router/`WorkspaceGate` change, no `CRM_LIVE_PERSISTENCE_ENABLED`
flip, no new route, no write affordances, no fabricated CRM spine.

**Branch:** `phase189f-crm-readonly-detail-cards` (base: `master` after PR #10 / Phase 189E merge)

## What this phase adds

A presentational `CrmRelationshipDetailCards` that renders record-detail content
**only** for the sections the Phase 189E readiness audit marks safe. Blocked
sections render compact explanatory copy — never a fake placeholder record.

```
<CrmRelationshipDetailCards viewModel={…} readiness={…} />
```

The connected `DealCrmRelationshipPanel` now:
1. builds the graph input **once** from the 189D-enriched `DealDetail` fields,
2. derives the view-model (`deriveCrmRelationshipViewModel`),
3. derives the readiness gate (`deriveCrmRelationshipDetailReadiness`),
4. renders `CrmRelationshipPanel` and `CrmRelationshipDetailCards` together.

No service/client/fetch/Dataverse import is introduced; both hooks
(`useDealData`, `useOptionalBanker`) read data already loaded under existing
authorization.

## Section gating

| Section | Renders detail when safe | Blocked behavior |
|---|---|---|
| `clientIdentity` | client id / name / type / `real-lookup` | name-only `name:` surrogate → "known by name only" copy, **no** id/drilldown; missing client → "no canonical client" copy |
| `teamOwnership` | team id / name / `real-lookup` | missing/unverified → reason copy, no fabricated id |
| `assignedBanker` | banker id / name / email / team-match / `real-lookup` | context-only id (`unknown`) or missing → reason copy |
| `platformWorkspaceBridge` | workspace / core-user facts | absent (optional) → reason copy |
| `relationshipIntegrity` | readiness source facts + pseudo-lookup warnings | no deal → reason copy |
| `salesforceSpine` | — | **always** blocked: *not seeded · not wired* |

The card also lists `unsafeAssumptionsRejected` (contacts, org hierarchy, roles,
activities, timeline events, communication preferences) as labels only — proof
they are **not** inferred.

## Safety guarantees

- Read-only UI; the component is a pure function of `{ viewModel, readiness }`.
- No Dataverse IO/writes; the cards import no SDK/service/client/fetch.
- Gating is delegated entirely to `deriveCrmRelationshipDetailReadiness` —
  the view layer never re-decides safety.
- No `App.tsx`/router/`WorkspaceGate` change; the cards reach the UI only
  through the existing `BankerDealWorkspace` mount of `DealCrmRelationshipPanel`.
- No `CRM_LIVE_PERSISTENCE_ENABLED` flip; no schema/migration files.
- No buttons/forms/inputs/action handlers; no fabricated Salesforce-style spine.

## Files

- **Add:** `src/crm/CrmRelationshipDetailCards.tsx`,
  `src/crm/CrmRelationshipDetailCards.test.tsx`,
  `src/shared/governance/phase189FCrmReadonlyDetailCardsContract.test.ts`, this doc.
- **Update:** `src/crm/CrmRelationshipPanel.tsx` (container derives + passes
  readiness; renders the cards), `src/crm/CrmRelationshipPanel.test.tsx`.

## Recommended later phase

Guarded CRM spine seed only after `crmRuntimeSchemaGate` confirms the
`cr664_crm*` tables exist live (dry-run by default, commit behind an explicit
flag, fail-closed, audit-emitting). Until then `salesforceSpine` stays blocked,
and any contacts/roles/activities/timeline surfaces remain rejected.

## Acceptance evidence

- `CrmRelationshipDetailCards.test.tsx` + `CrmRelationshipPanel.test.tsx`:
  safe sections render real detail; name-only surrogate blocks client drilldown;
  missing client blocks detail content; missing team/banker render
  blocked/degraded copy (no fake records); spine renders not seeded/not wired;
  no buttons/forms/inputs; connected container uses the 189E readiness gate.
- `phase189FCrmReadonlyDetailCardsContract.test.ts`: no write verbs/fetch/broad
  query, no Dataverse service/client import, no flag flip, no route/App/Gate
  change, no write affordances, readiness-as-gate, no fabricated spine.
- Full suite green, `npm run build` green, route invariance (no router/App/Gate
  changes), no schema/migration files, no Dataverse write paths.
