# Phase 189B — CRM Relationship View-Model Foundation

**Status:** Complete. Pure TypeScript, read-only. No Dataverse writes, no schema
mutation, no route mounting, no `App.tsx`/router change, no
`CRM_LIVE_PERSISTENCE_ENABLED` flip, no fabricated Salesforce spine data.

**Branch:** `phase189b-crm-relationship-view-model` (base: `master` after PR #5 / Phase 189A merge)

**New module:** `src/crm/crmRelationshipViewModel.ts`
(`deriveCrmRelationshipViewModel(input)` — pure, no IO)

---

## 1. What Phase 189A discovered

Phase 189A's `--inspect-crm-relationship-graph` audit proved the **live**
canonical CRM entity today is `cr664_clientrelationship` — a **borrower/client
stub**, reached from `cr664_loandeal.cr664_Client`. The live graph it can walk:

```
cr664_loandeal
  ├─ cr664_Client     ──► cr664_clientrelationship   (REAL lookup)
  ├─ cr664_Team       ──► cr664_team                 (REAL lookup)
  └─ cr664_AssignedTo ──► systemuser / cr664_banker  (REAL lookup)
cr664_banker          ──► cr664_team                 (banker -> team)
cr664_platformuser    ──► cr664_user (CoreUser) + cr664_platformworkspace
```

The richer Salesforce-style spine (`cr664_crmorganization`, `cr664_crmperson`,
`cr664_crmcontactpoint`, `cr664_crmrelationship`, `cr664_crmroleassignment`,
`cr664_crmtimelineevent`, …) is **modeled in `src/crm/crmDataverseSchemaPlan.ts`
but not seeded live**, and `CRM_LIVE_PERSISTENCE_ENABLED` is `false`.

## 2. Why 189B is pure / read-only

There is nothing safe to write yet: the spine tables do not exist live, and the
existing borrower/client graph is already populated. The lowest-risk next step
is therefore a **pure projection** of the already-authorized, already-loaded
live graph into a shape a future panel can render — with **no live loader**
(the adapter shape is pure: the caller passes the graph in). This keeps 189B
free of Dataverse coupling, authorization concerns, and route surface, and lets
189C add the UI/loader behind existing authorization without reworking the
model.

## 3. View-model contract

**Input** — `CrmRelationshipGraphInput`: `deal`, `client`, optional `team`,
`assignedBanker`, `platformUser`, and an optional `spineTablePresence` map
(what a schema gate / the 189A audit observed). Each edge may carry a
`lookupClassification` (`real-lookup` | `pseudo-scalar` | `missing` | `unknown`).

**Output** — `CrmRelationshipViewModel`:

| Field | Meaning |
|---|---|
| `relationshipStatus` | `ready` \| `partial` \| `blocked` |
| `canonicalClient` | The borrower/client **stub** (`kind: 'borrower_client_stub'`), explicitly *not* a Salesforce account/contact |
| `dealRelationshipSummary` | Deal id/name, present edges, expected canonical edge count |
| `assignedBanker` | Banker + `teamMatchesDeal` cross-check |
| `team` | Owning team |
| `platformUserContext` | Workspace / core-user bridge, if available (else `null`) |
| `missingRelationshipEdges` | Explicit edges with `severity` (`blocking`/`degraded`/`informational`) |
| `unsafePseudoLookupWarnings` | Edges riding a pseudo GUID/text column |
| `recommendedNextActions` | Ordered; **render existing graph before seeding spine** |
| `sourceFacts` | Audit lines explaining which live edges are present |
| `futureSpine` | The 10 spine tables, each `not_seeded` / `present_not_wired`; `seeded: false`, `wired: false` |

**Status rules:** `blocked` when the deal anchor or the canonical client is
missing; `partial` when client is present but a `degraded` edge (team/banker) is
missing or a pseudo-lookup warning exists; `ready` only when the full *current*
borrower/client graph is present on real lookups.

**Safety booleans (literal):** `readOnly: true`, `liveWritePerformed: false`,
`externalSystemChanged: false`, `spineSeeded: false`,
`liveSpinePersistenceEnabled` (reads `CRM_LIVE_PERSISTENCE_ENABLED`, `false`).

## 4. Current live graph vs future Salesforce-style spine

| | Today (live) | Future spine (modeled, not live) |
|---|---|---|
| Account/company | `cr664_clientrelationship` (stub) | `cr664_crmorganization` |
| Contacts | — | `cr664_crmperson` / `cr664_crmcontactpoint` |
| Owners / principals / guarantors | — | `cr664_crmrelationship` edges |
| Relationship roles | Team / AssignedTo on the deal | `cr664_crmroleassignment` |
| Activity timeline | `cr664_dealtask` (tasks only) | `cr664_crmtimelineevent` |

The view-model **fabricates none** of the right-hand column: no contacts, org
hierarchy, roles, activities, or timeline events are synthesized.

## 5. Recommended Phase 189C

Mount a **read-only CRM Relationship panel** that renders
`deriveCrmRelationshipViewModel(...)` **behind the existing deal/workspace
authorization** (reuse the deal-workspace auth/loader seam; do not add a new
public route or flip `CRM_ROUTE_ENABLED`). 189C adds the thin authorized loader
that builds `CrmRelationshipGraphInput` from the live deal and hands it to this
pure model — no writes, display only.

## 6. Recommended later phase (guarded spine seed)

Only **after** a runtime schema gate (`src/crm/crmRuntimeSchemaGate.ts`)
confirms the `cr664_crm*` tables exist live should a guarded seed/repair run —
dry-run by default, commit behind an explicit flag, fail-closed, idempotent,
audit-emitting. Until then `futureSpine.seeded` stays `false` and the panel
renders only the existing borrower/client graph.

---

## 7. Acceptance evidence

- `src/crm/crmRelationshipViewModel.test.ts` (14 tests): complete graph →
  `ready`; missing client → `blocked`; missing team/banker → `partial` with an
  explicit degraded edge; pseudo-lookup warning surfaced; future spine never
  fabricated; render-before-seed action ordering.
- `src/shared/governance/phase189BCrmRelationshipViewModelContract.test.ts`
  (12 pins): no POST/PATCH/DELETE/PublishXml, no fetch, no
  `CRM_LIVE_PERSISTENCE_ENABLED` default change, no `App.tsx`/router mount, no
  checklist/comms/handoff or SDK/client/write-adapter imports, no fabricated
  Salesforce entities in sample output.
- Full suite green, `npm run build` green, route count unchanged, no
  schema/migration files, no Dataverse write paths.
