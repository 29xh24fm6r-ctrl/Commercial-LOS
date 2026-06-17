# Phase 189C — Read-Only CRM Relationship Panel

**Status:** Complete. Read-only React panel over the Phase 189B view-model,
mounted inside the existing authorized banker deal-workspace render path. No
Dataverse writes, no schema mutation, no `App.tsx`/router/`WorkspaceGate`
change, no `CRM_LIVE_PERSISTENCE_ENABLED` flip, no fabricated Salesforce spine.

**Branch:** `phase189c-crm-relationship-panel` (base: `master` after PR #6 / Phase 189B merge)

## Files

| File | Role |
|---|---|
| `src/crm/buildCrmRelationshipInput.ts` | Pure mapper: authorized deal/workspace context → `CrmRelationshipGraphInput` |
| `src/crm/buildCrmRelationshipInput.test.ts` | Builder behavior tests |
| `src/crm/CrmRelationshipPanel.tsx` | Presentational `CrmRelationshipPanel` + connected `DealCrmRelationshipPanel` |
| `src/crm/CrmRelationshipPanel.test.tsx` | jsdom render tests (ready/partial/blocked, pseudo, ordering, container) |
| `src/shared/governance/phase189CCrmRelationshipPanelContract.test.ts` | Static governance pins |
| `src/deals/BankerDealWorkspace.tsx` | **Mount point** (the only runtime file changed besides the new modules) |

## What this phase does

Phase 189B shipped `deriveCrmRelationshipViewModel(input)` — a pure projection
of the live relationship graph. 189C renders it:

1. **`buildCrmRelationshipInput`** (pure) maps what the authorized deal
   workspace truthfully knows into the view-model input. It invents no edges:
   an edge the workspace context does not load is simply absent, and the
   view-model then reports it as a not-yet-linked edge.
2. **`CrmRelationshipPanel`** (presentational) renders status, the canonical
   client **stub**, team/banker, optional platform-user context, pseudo-lookup
   warnings, edges to wire, render-before-seed next steps, and the future spine
   shown honestly as *not seeded · not wired*.
3. **`DealCrmRelationshipPanel`** (connected) reads `useDealData()` +
   `useOptionalBanker()` — data already loaded under existing authorization —
   builds the input, derives the view-model, and renders the panel. It performs
   no IO of its own.

## Mount

Mounted in `BankerDealWorkspace.tsx` only, inside the **authorized** render path
(after the loading/denied/not-found/failed guards), in the left intelligence
column next to `RelationshipContext`, as
`<div id="crm-relationship" data-deal-card="crm-relationship">`. No route is
registered; `App.tsx`, `WorkspaceGate`, and `workspaceRoutes` are untouched.

## Data available in the workspace context (and its honesty)

The authorized `DealDetail` surfaces the deal id/name and the **client display
name** (not the `cr664_clientrelationship` GUID); the current banker (from
`BankerContext`) **is** the assigned banker, since `loadDealForBanker` already
authorized `_cr664_assignedbanker_value === bankerId`. So this phase wires:

- **Deal → Client** by display name. When only a name is known, the builder uses
  a `name:`-prefixed surrogate id so it is never mistaken for a real record id,
  and marks the edge classification `unknown` (the panel does not run the Phase
  189A metadata probe).
- **Deal → Assigned banker** with the real `bankerId`.
- **Deal → Team** and **platform-user context** are not loaded in this view, so
  they appear as edges to wire — never fabricated.

Result for a typical deal: `partial`, showing the borrower/client stub + banker,
with Team listed as an edge to wire and the full Salesforce spine reported as
not seeded.

## Safety posture

- Read-only: no POST/PATCH/DELETE, no `PublishXml`, no `fetch` of its own.
- No `CRM_LIVE_PERSISTENCE_ENABLED` change (default stays `false`).
- No `App.tsx`/router/`WorkspaceGate`/schema/migration changes.
- No checklist/comms/handoff or SDK/client/Dataverse-write-adapter imports.
- No fabricated contacts / orgs / roles / activities / timeline; the future
  spine is reported `not_seeded` / `present_not_wired`.

## Recommended later phases

- **189D (optional):** an authorized loader that supplies real client/team GUIDs
  + Phase 189A lookup classifications to the builder (richer than display names),
  so the panel can show real-lookup vs pseudo edges and Team without changing the
  pure model/panel.
- **Later (guarded):** seed the Salesforce-style spine only after
  `crmRuntimeSchemaGate` confirms the `cr664_crm*` tables exist live — dry-run by
  default, commit behind an explicit flag, fail-closed, audit-emitting.

## Acceptance evidence

- `buildCrmRelationshipInput.test.ts` (11), `CrmRelationshipPanel.test.tsx` (8),
  `phase189CCrmRelationshipPanelContract.test.ts` pins, existing
  `BankerDealWorkspace` tests still green after the mount.
- Full suite green, `npm run build` green, route count unchanged, no
  schema/migration files, no Dataverse write paths.
