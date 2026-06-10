# Phase 144E — Extend Drill-Through Deep-Links Across Cockpits

> **Read-only, same-page deep links — now everywhere.** Extends the Phase 144D
> `?drill=<id>` deep-link support from Portfolio to the Manager, Team, Executive,
> and CRM Relationship Intelligence cockpits, reusing the exact same helpers. No
> new route, no fetch, no auth/permission change; the panel payload always comes
> from the current authorized page's local registry/props, never the URL.

## 1. What was extended from 144D

Phase 144D shipped the safe deep-link helpers (`drillThroughDeepLink.ts`,
`useDrillThroughDeepLink`) and wired Portfolio. Phase 144E:

- Adds a small pure binder `deepLinkCardProps(deepLink, id)` (in
  [useDrillThroughDeepLink.ts](../src/shared/drillthrough/useDrillThroughDeepLink.ts))
  that returns the `{ open, onOpenChange }` props for a `DrillThroughCard` —
  removing per-cockpit duplication while staying read-only.
- Wires `useDrillThroughDeepLink` into the Manager, Team, and Executive KPI
  ribbons (same pattern as Portfolio).
- Retrofits the **CRM Relationship Intelligence cockpit** onto the shared
  `DrillThroughCard` + a new read-only adapter
  ([crmRelationshipDrillThrough.ts](../src/crm/relationshipIntelligence/crmRelationshipDrillThrough.ts)),
  then deep-links each section.

## 2. Supported cockpits

| Cockpit | Deep-linkable targets | Id prefix |
|---|---|---|
| Manager Bloomberg Control Panel | KPI ribbon tiles | `manager-kpi-<slug>` |
| Team Ops Queue | KPI ribbon tiles | `team-kpi-<slug>` |
| Executive Command Center | KPI ribbon tiles | `executive-kpi-<slug>` |
| CRM Relationship Intelligence | cockpit section panels | `crm-rel-<section_key>` |
| Portfolio Command Center (144D) | KPI ribbon tiles | `portfolio-kpi-<slug>` |

## 3. URL / query-param behavior

- Same single param as 144D: **`?drill=<targetId>`**.
- Loading a page with a valid, available id opens the matching read-only panel.
- Opening a panel sets the param; closing removes it; unrelated params are
  preserved. No new app route is added.

## 4. Fail-closed behavior

- An invalid/unsafe id (wrong charset, `javascript:`/`data:`, oversized) is
  rejected by the 144D sanitizer — no panel opens, no URL text is rendered.
- A valid id that is **not present on the current page** (e.g. a Manager id loaded
  on the Team cockpit) is treated as unavailable: the page behaves normally and
  nothing is fetched or navigated to.

## 5. Why deep links do not fetch or authorize data

- The id only selects from the set of target ids the page already built from
  authorized data (`useDrillThroughDeepLink(availableIds)`); it is never used to
  query Dataverse/CRM or any provider.
- No cross-workspace global lookup is introduced. An id for another workspace is
  simply unavailable here.

## 6. How payload remains local to the current authorized props/registry

- Manager/Team/Executive panels render from their per-cockpit KPI target adapters
  (Phase 144B). CRM panels render from `crmRelationshipSectionTargets`, mapped
  purely from the cockpit's already-derived `viewModel.sections`.
- The panel heading/summary/detail come from that local target — the URL only
  carries the id. The CRM cockpit never claims live sync/write status from the
  URL; its copy states no live Salesforce/nCino lookup, sync, push, or write
  occurs.

## 7. Accessibility behavior

- Deep-linking reuses the native `<details>`/`<summary>` disclosure — keyboard
  reachable, Enter/Space toggle, accessible name unchanged.
- A deep-linked panel opens with a real `<h3>` heading inside a `role="region"`
  and can be collapsed, which removes the URL param.

## 8. Security / auth posture

- No new route, no WorkspaceGate/auth/entitlement bypass, no permission widening.
- The param is sanitized and fails closed; it is never executed, used as an href,
  or used to fetch.
- The CRM cockpit remains strictly read-only: no `<button>`/`<form>`/`onClick`,
  no sync/push/write controls, no writes — verified by both the CRM activation
  governance and the new expansion governance.

## 9. Deferred surfaces

- **Banker/Deal metric deck** and **chart cards** — these use native `<details>`
  (Phase 144B/144C) but are not yet bound to the deep-link hook; binding them
  needs the controlled-open prop threaded through the deck/`ChartFrame`, a focused
  follow-up. The helper is ready.
- **Cross-workspace / global deep-link resolution** — intentionally NOT built;
  each id stays local to its surface.

## 10. Future rule

Every new drill-through surface must opt into the shared deep-link helper
(`useDrillThroughDeepLink` + `deepLinkCardProps`) with stable, safe target ids,
unless explicitly documented as deferred. No surface may invent its own
detail-routing mechanism.

## 11. Acceptance commands

```
npm test -- drillThrough DeepLink deepLink manager team executive crm relationshipIntelligence governance releaseCandidateSnapshot
npm run build
npm test
```
