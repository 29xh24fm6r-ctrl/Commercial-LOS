# Phase 189I — Manager/Team CRM Read-Only Mount Parity

**Status:** Complete. Mount parity only. The existing read-only
`DealCrmRelationshipPanel` (panel + detail cards) is now mounted in the manager
and team authorized deal workspaces, at parity with the banker workspace. No new
data loading, no routes, no `App.tsx`/router/`WorkspaceGate` change, no Dataverse
IO, no Dataverse writes, no schema/migration, no `CRM_LIVE_PERSISTENCE_ENABLED`
flip, no executive mount, no fabricated CRM data, no write affordances.

**Branch:** `phase189i-crm-manager-team-readonly-mount` (base: `master` after the
Phase 189H merge / PR #17).

## What changed

Two workspace components — and only these — gain the mount:

- `src/manager/ManagerDealWorkspace.tsx`
- `src/team/TeamDealWorkspace.tsx`

Each already loads its deal under an authorized, team-scoped loader
(`loadDealForManager` / `loadDealForTeam`) and wraps the deal cards in
`DealDataProvider`. Phase 189I adds, inside that existing authorized context, the
**same** container the banker workspace uses:

```tsx
<div data-deal-card="crm-relationship">
  <DealCrmRelationshipPanel />
</div>
```

`DealCrmRelationshipPanel` builds its view-model and readiness from the
already-loaded deal row (no second GET) and reads the assigned banker via
`useOptionalBanker`. In the manager/team workspaces there is no banker context,
so the panel degrades honestly to the authorized deal row's lookup ids — exactly
the behavior the Phase 189H readiness audit deemed mount-capable.

## Why this is parity, not expansion

- **Reuse, not new UI.** Both workspaces import the existing
  `../crm/CrmRelationshipPanel` container. No new component, no direct mount of
  `CrmRelationshipDetailCards`, no re-derivation of view-model/readiness in the
  host.
- **No new data.** The panel is pure over the deal row the workspace already
  loaded. No new query, no Dataverse IO, no SDK/generated-service import enters
  the workspace files.
- **Read-only.** The panel/cards render no button/form/input and wire no action
  handler (pinned by 189F/189G and re-pinned here at the integration level). The
  workspaces keep passing `readOnly` to every write-capable card.
- **Banker mount unchanged.** `BankerDealWorkspace` is untouched.
- **No executive mount.** `ExecutiveWorkspace` / `ExecutiveProductStrategyWorkspace`
  mount neither the panel nor the cards.
- **No routing/flag/schema change.** `App.tsx`, `WorkspaceGate`,
  `workspaceRoutes` reference no CRM panel; `CRM_LIVE_PERSISTENCE_ENABLED` stays
  `false`.

## Relationship to the 189H audit

Phase 189H produced a pure readiness audit
(`deriveCrmManagerTeamMountReadiness`) that classified the manager and team
surfaces as **mount-capable but unmounted** — they already carry the deal
context and an authorized, team-scoped load. That audit module is a point-in-time
assessment and is left **unchanged**; Phase 189I simply enacts the mount it
deemed safe. The 189G and 189H governance contracts, which pinned the
then-current banker-only mount, are updated to reflect the new parity (their
mount-surface blocks now assert that manager/team mount the panel; the banker
assertion is unchanged).

## Acceptance evidence

- `phase189ICrmManagerTeamReadonlyMount.test.tsx` (render proof): banker,
  manager, and team workspaces each render `crm-relationship-panel` +
  `crm-relationship-detail-cards` + `crm-detail-provenance` once authorization is
  `ready`, with no write button/textbox in the panel or cards region; the mount
  does not appear on a denied authorization.
- `phase189ICrmManagerTeamReadonlyMountContract.test.ts` (static pins): manager
  and team mount the existing container inside `DealDataProvider`; reuse-only (no
  detail-cards/internals import); banker unchanged; no executive mount; no
  App/router/WorkspaceGate change; no new route; no Dataverse IO/writes/SDK
  import; readOnly preserved on write-capable cards; no flag flip; no
  schema/migration.
- Updated `phase189GCrmDetailCardsFitFinishContract.test.ts` and
  `phase189HCrmManagerTeamMountReadinessContract.test.ts` mount-surface blocks.
- Full suite green, `npm run build` green.
