# Phase 144A — System-Wide Drill-Through Contract

> **Read-only UX contract.** Establishes the reusable drill-through model,
> primitives, governance, and a first broad implementation pass so every dashboard
> card, KPI tile, queue row, summary box, cockpit widget, and intelligence panel
> can be activated to reveal the full read-only information behind it — or link to
> an EXISTING authorized route — or honestly say detail is unavailable.

## 1. User goal

Every single box / card / tile / row / KPI in the system should be clickable so
users can see the full information behind it: the source details, contributing
records, derivation, warnings, blockers, and the next safe review step.

**Core principle: no dead summary cards.** Every summarized metric or status must
be able to explain itself.

## 2. Drill-through principles

1. Every card/tile/row/KPI resolves to exactly one of three behaviours:
   - open a **read-only detail panel**, or
   - navigate to an **existing authorized route** (`routeHref`), or
   - show an **honest unavailable state** that says exactly what is missing.
2. Drill-through is always **read-only** (`readOnly: true`, structurally pinned).
3. No fabricated rows. An empty section shows an honest `emptyMessage`, never
   sample/mock data.
4. No new permissions, routes, live calls, or writes are introduced. A `routeHref`
   may only point at a route that already exists behind the current
   WorkspaceGate / auth / entitlement rules.

## 3. Shared payload shape

Defined in [drillThroughTypes.ts](../src/shared/drillthrough/drillThroughTypes.ts):

- `DrillThroughTarget`: `id`, `title`, `subtitle?`, `surface`, `entityKind`,
  `entityId?`, `statusLabel?`, `summary`, `detailSections`, `sourceFields`,
  `sourceCounts`, `warnings`, `blockers`, `nextReviewStep?`, `routeHref?`,
  `readOnly: true`, `unavailableReason?`.
- `DetailSection`: `title`, `rows`, `emptyMessage?`.
- `DetailRow`: `label`, `value`, `source?`, `confidence?`, `warning?`.
- `DrillThroughSourceCount`: `label`, `count`.

Builders / helpers:

- `buildDrillThroughTarget(input)` — normalizes, freezes collections, forces
  `readOnly: true`, and fills an honest default `unavailableReason` when there is
  no content and no route (never a blank drawer).
- `resolveDrillThroughAction(target)` — `{ kind: 'panel' | 'route' | 'unavailable' }`.
- `hasDrillThroughContent`, `drillThroughAccessibleName`, `validateDrillThroughTarget`.

## 4. Shared primitives

| Primitive | File | Role |
|---|---|---|
| Types + builders | [drillThroughTypes.ts](../src/shared/drillthrough/drillThroughTypes.ts) | Payload contract, normalization, action resolution |
| Registry | [drillThroughRegistry.ts](../src/shared/drillthrough/drillThroughRegistry.ts) | Per-surface builders; recent-surface descriptors |
| `DrillThroughPanel` | [DrillThroughPanel.tsx](../src/shared/drillthrough/DrillThroughPanel.tsx) | Renders read-only detail / route / unavailable |
| `DrillThroughCard` + `useDrillThroughPanel` | [DrillThroughCard.tsx](../src/shared/drillthrough/DrillThroughCard.tsx) | Clickable `<details>` disclosure face + helper |

## 5. UX rules

- Clickable cards use a NATIVE `<details>`/`<summary>` disclosure — no custom
  click handler, no `<button>`, no `<form>`.
- A pointer affordance (`cursor: pointer`) and a "View details ▸" / "Open record ▸"
  / "Details unavailable" hint communicate what will happen.
- A "Read-only" badge and read-only footer disclaimer appear on every panel.
- Empty/unavailable detail renders an honest message; warnings and blockers render
  in their own sections when present.

## 6. Accessibility rules

- Cards are keyboard reachable and activated by **Enter/Space** via the native
  `<summary>` element (no `div`-only click targets).
- The `<summary>` carries an `aria-label` naming what opens ("View details: …").
- The revealed content is a `role="region"` labelled by the panel heading
  (`aria-labelledby`).
- The panel renders a real heading (`<h3>` via `CardHeader`) and can be collapsed
  (closed) again via the same disclosure.

## 7. Permission / auth rules

- No route bypasses existing WorkspaceGate / auth / entitlement rules.
- `routeHref` may ONLY reference a route that already exists and is already
  authorized; this phase creates no new route and mounts nothing in `App.tsx`.
- No permission, role, or scope widening.

## 8. No-fake-data rules

- Production source embeds no sample/mock/fake data.
- Builders are pure functions of caller-supplied, already-derived view-model
  payloads; absent a content payload they yield an honest unavailable target.
- An empty section shows `emptyMessage`; it never fabricates rows.

## 9. Implemented surfaces (recent Phase 142/143)

Registered under the contract via `createRecentSurfaceRegistry()`
([drillThroughRegistry.ts](../src/shared/drillthrough/drillThroughRegistry.ts)),
each exposing read-only detail or an honest unavailable reason:

- Executive Command Center (142H/142I)
- Executive Product Strategy (142H)
- Product Profitability / ROE Availability (142S)
- Credit Committee Package Review Queue (142M)
- Committee Package Export Adapter (142N)
- E-Sign Envelope Adapter — PandaDoc, disabled (142O)
- Core Banking Read-Only Lookup (142P)
- AML/KYC + Bureau Policy Gate (142Q)
- Servicing Lifecycle Mapper (142R)
- CRM Relationship Intelligence Cockpit (143H)
- CRM Connector Readiness (143B)
- CRM Entity Matching (143C)
- CRM Sync Preview (143D)
- CRM Writeback Policy / Dry-Run (143E/143F)
- CRM Activity Timeline (143G)

## 10. Deferred surfaces

Panel-level wiring (replacing each surface's existing static face with a
`DrillThroughCard`) is the follow-up to this first pass. The shared primitives and
per-surface registry builders are ready to drop in. Deferred legacy surfaces
include: Manager Bloomberg Control Panel charts/top-deals/exceptions, Portfolio
Command Center exposure/concentration tiles, Team Ops Queue rows, Deal cockpit
metric deck + attention/blockers + credit-memo readiness cards, and document/task
cards. Each is integrated by mapping its already-derived view model into a
`DrillThroughTarget` through the registry — no new data, route, or permission.

## 11. How future cards must comply

A new summary card/tile/row is compliant when it:

1. Builds a `DrillThroughTarget` via `buildDrillThroughTarget(...)` (or a registry
   builder) from its already-derived view model.
2. Renders through `DrillThroughCard` (or supplies `drillThroughTarget` +
   `useDrillThroughPanel`) so it is keyboard-activatable and accessibly named.
3. Resolves to detail content, a safe existing `routeHref`, or an honest
   `unavailableReason` — never a dead, clickable-looking, action-less, or blank
   card.
4. Adds no write, no live call, no new route, no permission widening, and no
   approve/deny/vote/sync-now/push-now/apply-now control.

## 12. Acceptance commands

```
npm test -- drillThrough DrillThrough systemWideDrill governance executive manager portfolio team committee crm servicing profitability releaseCandidateSnapshot
npm run build
npm test
git status --short
git diff --stat
```
