# Phase 189L — Salesforce CRM Live Readiness Console

**Status:** Complete. A read-only admin/operator console that surfaces the Phase
189K schema adapter's **inspect** and **plan** output and shows the seed mode as
disabled/inert. Pure presentational: no Dataverse writes, no schema mutation, no
live seed, no `CRM_LIVE_PERSISTENCE_ENABLED` flip, no fabricated records, no
route/`App.tsx`/`WorkspaceGate` change, no banker/manager/team/executive
workspace expansion.

**Branch:** `phase189l-salesforce-crm-live-readiness-console` (base: `master`
after the Phase 189K line, included via PR #24).

## What this phase delivers

`src/crm/CrmSpineReadinessConsole.tsx` — a presentational React component that
calls the Phase 189K adapter (`inspectCrmSpineSchema` → `planCrmSpineSchema` →
`runCrmSpineSchemaSeed` with no gate) and renders:

- **Per-entity status** for all 11 CRM spine entities (Account, Contact,
  AccountContactRelationship, RelationshipRole, CoverageTeamMember,
  DealRelationship, Activity, Task, RelationshipHealth, SourceFact,
  VisibilityRequirement): the backing table and a `present` / `partial` /
  `missing` / `conflict` / `not-applicable` badge, plus columns-present /
  columns-expected and relationships-present / relationships-expected counts for
  spine-table entities.
- **Deterministic plan steps** — the create-table / create-column /
  create-relationship steps, each labelled with the metadata operation it *would*
  perform, rendered with an explicit `executed: false`.
- **Seed mode** — shown as `disabled · inert`, with the adapter's blocked reason
  and `executed: false` / `gate-satisfied: false`.

The component takes an optional `snapshot` prop (a read-only live metadata
snapshot); with none, every spine table reads as `missing` and derived/meta
entities as `not-applicable`.

## Not wired this phase

The console is **not mounted** into any route or workspace — `App.tsx`,
`WorkspaceGate`, and `workspaceRoutes` are unchanged. It is ready to drop into the
existing admin surface when an operator-visibility decision is made; this phase
keeps the launch controls intact and changes no routing.

## Safety guarantees (pinned by tests)

- The console imports only React, the shared UI primitives, and the pure CRM
  spine modules — no `@microsoft/power-apps`, no generated services, no
  `getClient`/`fetch`.
- No data-write verb, no `PublishXml`, no schema-mutation call; it renders no
  button/form/input and wires no action handler.
- It uses the adapter in inspect/plan mode only and never passes a satisfied seed
  gate, so the seed stays inert (`executed: false`).
- No `CRM_LIVE_PERSISTENCE_ENABLED` flip, no schema/migration files, no
  route/App/WorkspaceGate change, and no workspace mounts it.

## Acceptance evidence

- `phase189LCrmSpineReadinessConsole.test.tsx`: renders all 11 entities; reflects
  missing/present/partial statuses from the snapshot; shows the plan with
  `executed: false` and renders deterministically across renders; shows the seed
  block as not-executed / gate-not-satisfied; exposes no button/textbox.
- `phase189LSalesforceCrmLiveReadinessConsoleContract.test.ts`: static purity
  pins (no write/network/SDK/schema-mutation, inspect/plan only, no satisfied
  seed gate, no flag flip, no schema/migration files, no route/App/Gate change,
  no workspace expansion).
- Repo-wide `crmGovernance` and `noFakeProductionData` scanners green.
- `npm run build` green; targeted suite green.
