# Phase 128B — Team Ops Queue data-hydration parity

## Context

Phase 128A hardened the team-deployment release candidate. Live
validation showed all four workspaces (Banker, Team, Manager,
Portfolio) reachable on the Lending OS shell, and the Manager /
Portfolio surfaces rendering hydrated live Dataverse labels correctly:

- `TEST Client`
- `TEST · Stage Phase 121`
- `TEST — Status Phase 121`
- `Matthew Paller`
- `SBA 7(a)` / `Term Loan` / `Variable`
- missing data = 0

The **Team Ops Queue** execution board, however, still showed:

- `Unknown banker`
- `Client not set`
- `Stage not set`
- `Status not set`
- Missing data = 1

## Root cause

The Team Ops Queue snapshot (`teamOpsQueueSnapshot.ts`) was already
correct: it joins every task / document work item back to the hydrated
`TeamDeal` row by `dealId` and reads `clientName` / `stage` / `status` /
`assignedBankerName` from that row (see the `rowByDealId` lookup in
`buildLanes`). The Phase 127C snapshot tests prove this works on a
hydrated row.

The gap was one layer down, in the **loader**. The manager pipeline
loader `loadTeamPipeline` (`managerQueries.ts`) was upgraded in Phase
125B to resolve every lookup / choice display column via a
**formatted-value-first** strategy:

```
getLookupFormattedValue(raw, 'cr664_client') ?? d.cr664_clientname
```

The auto-generated SDK exposes typed `<attr>name` shadow fields, but the
live environment leaves them **empty** for choice / lookup columns even
when Maker Portal shows the value. The real display text arrives on the
Dataverse `@OData.Community.Display.V1.FormattedValue` annotation key.

The team loader `loadTeamDeals` (`teamQueries.ts`) never got that Phase
125B upgrade — it read only the empty shadow fields:

```
clientName: d.cr664_clientname,            // undefined in live env
stage:      d.cr664_stagereferencename,    // undefined
status:     d.cr664_statusreferencename,   // undefined
assignedBankerName: d.cr664_assignedbankername, // undefined
```

So every team surface fed by `loadTeamDeals` (Team Ops Queue plus the
other team cards via `TeamDataProvider`) saw undefined labels →
`Client not set` / `Stage not set` / `Status not set` / `Unknown
banker`, and `teamMissingFieldLabels` honestly flagged those absent
fields → missing data = 1.

## Fix

Bring the team pipeline row to **label parity** with the manager
`TeamDeal` by applying the same formatted-value-first hydration in the
existing loader. No new loader, no Dataverse schema change, no route /
permission change, no write surface.

### `src/team/teamQueries.ts`

- Added local `getFormattedValue` / `getLookupFormattedValue` helpers
  (mirroring the manager-side accessors; kept local per the Phase 48
  `src/team/` ↔ `src/manager/` isolation rule).
- `loadTeamDeals` now resolves each display column **formatted value →
  SDK shadow → next fallback**, matching `loadTeamPipeline`:
  - `clientName`: `cr664_client` lookup → `cr664_clientname`
  - `stage`: `cr664_stagereference` lookup → shadow
  - `status`: `cr664_statusreference` lookup → shadow →
    `statuscode` formatted value → `statuscodename`
  - `assignedBankerName`: `cr664_assignedbanker` lookup → shadow →
    `owneridname`
- Added `productType` / `loanStructure` / `pricingType` (optional, so
  existing `TeamDealRow` literals across the team surfaces don't need to
  enumerate them) hydrated via their reference-lookup formatted values —
  completing parity with the manager `TeamDeal`.
- Honest absence preserved: when no source produces a display value the
  field stays `undefined`; the banker FK (`assignedBankerId`) is still
  carried for grouping but never leaks into a human-facing name.

### `src/team/teamOpsQueueSnapshot.ts`

- `teamDealToDealDetail` now forwards the newly-hydrated `productType` /
  `loanStructure` / `pricingType` from the team row into the shared
  `DealDetail` projection (previously hardcoded `undefined`).
- Updated the `filterOutLoaderGapSignals` rationale comment: now that
  `productType` is fetched, suppressing `deriveBlockers`'
  `missing-required` is no longer a loader-gap workaround — it is
  deliberate de-duplication against the team's own honest missing-data
  lane (`teamMissingFieldLabels`), which owns the "missing required deal
  fields" concept on the team surface.

The work-item label derivation itself was already correct and is
unchanged — the snapshot reads `clientName` / `stage` / `status` /
`assignedBankerName` straight off the joined `TeamDeal` row, which is
now hydrated. The `displayOwner` rule (`TeamOpsQueue.tsx`) is unchanged:
human name when present, `Unknown banker` only when an FK exists but no
display name does, `Unassigned` when no FK at all.

## Resulting execution-board display

Rows now show, with no GUIDs and no fake fallbacks:

- `TEST Client`
- `TEST · Stage Phase 121`
- `TEST — Status Phase 121`
- `Matthew Paller`
- missing data = 0 (when the hydrated row carries every required field)

## Tests

- `src/team/teamQueries.hydration.test.ts` (new) — pins the loader
  hydration: client / stage / status / banker / product / structure /
  pricing resolve formatted-value-first; empty-string annotations fall
  through; truly absent values surface as honest `undefined` with no
  GUID leakage. Mirrors `managerQueries.hydration.test.ts`.
- `src/team/teamOpsQueueSnapshot.test.ts` — added a Phase 128B block:
  task-derived and document-derived work items hydrate client / stage /
  status / banker from the matching `TeamDeal`; the missing-data lane is
  empty when the row is fully hydrated; banker workload uses the human
  `assignedBankerName`; `Unknown banker` appears only when an FK exists
  without a display name.
- Manager / Portfolio hydration suites remain green (no regression).

## Acceptance

```
npm test -- TeamOpsQueue teamOpsQueueSnapshot teamOpsQueueDashboardCharts \
  managerQueries managerPipeline Portfolio
npm run build
```

All target suites pass (Team Ops Queue + loader hydration: 79 tests;
manager pipeline + Portfolio: 91 tests) and the production build
(`tsc -b && vite build`) succeeds.
