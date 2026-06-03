# Phase 125B — Manager Command Center data-label hydration + visual polish

## 1. Live-screenshot regressions (before)

After Phase 124E + 125A landed the dense Bloomberg Command Center,
the live screenshot still showed several data-quality regressions
the manager surface inherited from its pre-Phase-122 loaders:

| Observation | Cause |
|---|---|
| Team label rendered as `"(unnamed team)"` even after Banker.Team was seeded | `loadManagerIdentity` read only the `cr664_teamname` SDK shadow field, which the live env does not populate even when `_cr664_team_value` is set |
| Top-deal Client / Stage / Status / Banker rendered `Not set` | `loadTeamPipeline` mapped only the SDK shadow fields (`cr664_clientname`, `cr664_stagereferencename`, `cr664_statusreferencename`, `cr664_assignedbankername`) which are empty in the live env |
| "Missing data" tile flagged Client / Stage / Status even though the banker cockpit showed them populated | Manager loader returned undefined → manager missing-fields catalog flagged them → `missingDataCount` incremented |
| "Pipeline by stage" chart showed `Unset` for every deal | Same loader gap |
| Banker leaderboard / Open-tasks / Outstanding-docs charts showed banker GUIDs or `Unassigned` | Same loader gap |
| Product / Loan Structure / Pricing never appeared on the top-deal row | `loadTeamPipeline` did not fetch the reference-table display values |
| Dead whitespace inside chart cards for single-deal teams | Chart canvas height was set to 140 px regardless of bar count |

These are not data issues — Maker Portal showed every field
correctly populated. The Phase 122C banker cockpit displayed all of
them correctly. The manager surface simply did not run the same
hydration pattern.

## 2. Fix — Phase 122C formatted-value hydration applied to the manager loaders

The Power Apps SDK exposes typed `<attr>name` shadow fields on the
model interface, but the live env does **not** populate them for
lookup / choice columns. The display value Dataverse returns lives
on a `@OData.Community.Display.V1.FormattedValue`-suffixed key of
the raw response. The Phase 122C banker cockpit reads these
annotations directly. Phase 125B applies the same pattern to the
manager loaders.

### 2.1 `loadManagerIdentity` — team-name hydration

[managerQueries.ts](../src/manager/managerQueries.ts) now reads:

```
teamName =
  getLookupFormattedValue(bankerRaw, 'cr664_team')   // 1. lookup
    ?? banker.cr664_teamname                          // 2. shadow
    ?? undefined;                                     // 3. honest gap
```

When all three sources are absent the caller still receives the
legacy `'(unnamed team)'` display so legacy callers don't crash —
critically, the script never falls back to the team GUID.

### 2.2 `loadTeamPipeline` — full TeamDeal display hydration

Every lookup / choice display column on the manager pipeline is now
resolved by the same priority chain Phase 122C uses on the banker
cockpit:

| Field | Source 1 (lookup formatted value) | Source 2 (SDK shadow) | Source 3 |
|---|---|---|---|
| `clientName` | `_cr664_client_value@…FormattedValue` | `cr664_clientname` | — |
| `stage` | `_cr664_stagereference_value@…FormattedValue` | `cr664_stagereferencename` | — |
| `status` | `_cr664_statusreference_value@…FormattedValue` | `cr664_statusreferencename` | `statuscode@…FormattedValue` → `statuscodename` |
| `assignedBankerName` | `_cr664_assignedbanker_value@…FormattedValue` | `cr664_assignedbankername` | `owneridname` |
| `productType` (new) | `_cr664_producttypereference_value@…FormattedValue` | `cr664_producttypereferencename` | — |
| `loanStructure` (new) | `_cr664_loanstructuretypereference_value@…FormattedValue` | `cr664_loanstructuretypereferencename` | — |
| `pricingType` (new) | `_cr664_pricingtypereference_value@…FormattedValue` | `cr664_pricingtypereferencename` | — |

`TeamDeal` grew three new `string | undefined` fields:
`productType`, `loanStructure`, `pricingType`.

### 2.3 Threading through the snapshot

[managerPipelineSnapshot.ts](../src/manager/managerPipelineSnapshot.ts):

- `teamDealToDealDetail` now propagates `productType` / `loanStructure`
  / `pricingType` into the shared VM input (previously hardcoded to
  `undefined`).
- `ManagerTopDealRow` grew three matching fields so the cockpit's
  top-deal row can surface them.
- `MANAGER_REQUIRED_TEAM_FIELDS` is unchanged — once the loader
  hydrates clientName / stage / status / banker, the existing
  manager missing-fields check (Phase 124A) automatically stops
  flagging them. The honest "Not set" cells only render for fields
  the live record genuinely doesn't carry.

### 2.4 Top-deal row surfaces product / loan / pricing

[ManagerBloombergControlPanel.tsx](../src/manager/ManagerBloombergControlPanel.tsx):

Each top-deal row's meta grid now conditionally renders three new
cells — Product / Loan structure / Pricing — only when the loader
returned a non-undefined value. Honest absence: when a deal hasn't
been pointed at a reference row yet, no `Not set` cell pollutes the
grid.

### 2.5 Visual polish

[ManagerChartPrimitives.tsx](../src/manager/ManagerChartPrimitives.tsx):

- `CHART_HEIGHT` reduced from `140` → `110 px`. The minimum bar
  height (4 px) keeps even all-zero histograms readable without a
  giant empty box.
- Chart card padding tightened from `spacing.sm × spacing.md` →
  `spacing.xs × spacing.sm` and inter-element gap reduced to a
  fixed 4 px. The Bloomberg-style density is preserved without
  the dead whitespace single-deal cards previously showed.

## 3. What does NOT change

- No Dataverse schema change.
- No new loader. `ManagerDataProvider` continues to fire the same
  six parallel queries.
- No banker cockpit change.
- No Portfolio / Team / Executive surface change.
- No write affordance. Cockpit remains strictly read-only (zero
  `<button>` / `<form>` / `onClick` / `onSubmit` — pinned).
- No fake fallback values. `'(unnamed team)'` remains for callers
  that need a display string; no GUID is ever derived into a
  user-facing label.
- The existing nine manager cards render unchanged.
- The Phase 124B banker filter still narrows the entire dashboard
  consistently.

## 4. Tests landed in Phase 125B

| File | New tests | Pins |
|---|---|---|
| [src/manager/managerQueries.hydration.test.ts](../src/manager/managerQueries.hydration.test.ts) | **10 (new file)** | `loadManagerIdentity`: annotation > shadow > `'(unnamed team)'`; empty-string annotation treated as absent. `loadTeamPipeline`: client/stage/status/banker/product/loan/pricing all hydrate via `@OData.Community.Display.V1.FormattedValue`-first → shadow → owneridname / statuscode fallbacks. Honest undefined when no source produces a display value; **no GUID leakage** verified against `/^[0-9a-f-]{36}$/` |
| [src/manager/managerPipelineSnapshot.test.ts](../src/manager/managerPipelineSnapshot.test.ts) | +4 | Missing-fields catalog no longer flags hydrated client/stage/status/banker; still flags truly-absent banker; top-deal row carries hydrated product / loan / pricing; honest undefined when not hydrated |
| [src/manager/managerDashboardCharts.test.ts](../src/manager/managerDashboardCharts.test.ts) | +1 | Stage chart uses hydrated display name; no GUID leakage |
| [src/manager/ManagerBloombergControlPanel.test.tsx](../src/manager/ManagerBloombergControlPanel.test.tsx) | +2 | Top-deal row renders Product / Loan structure / Pricing meta cells when hydrated; **omits them entirely** when undefined (honest absence — no "Not set" cell pollution) |

Plus fixture maintenance: every existing TeamDeal test helper across
the manager module gained `productType: undefined` /
`loanStructure: undefined` / `pricingType: undefined` defaults so
TypeScript stays happy with the extended interface.

Total new + extended Phase 125B test pins: **17**.

Existing tests still green:

- Phase 123A / B / C — banker cockpit + shared VM
- Phase 124A / B / C / D / E — manager cockpit foundation, polish,
  workspace switcher, seed mode, shell restoration
- Phase 125A — dense Bloomberg analytics grid + 10-tile ribbon
- Phase 125F banker shell

## 5. Live walkthrough (after)

1. **Manager-entitled banker** signs in, opens the workspace
   switcher, clicks **Manager Workspace**.
2. Manager Workspace mounts with the dark Lending OS sidebar
   (Phase 124E shell).
3. The identity block now shows `TEST Team` instead of
   `(unnamed team)`.
4. The KPI ribbon's **Missing data** tile drops to the honest
   count — Client / Stage / Status / Banker no longer falsely flagged.
5. **Pipeline by stage** chart shows the real stage name
   (e.g. `TEST · Stage Phase 121`) instead of `Unset`.
6. **Pipeline by banker** chart shows the real banker name
   (e.g. `Matthew Paller`) instead of a GUID.
7. **Top deals** row shows real Client / Stage / Status / Banker;
   if the deal has product / loan-structure / pricing wired, those
   render below as additional meta cells.
8. **Chart cards** feel tighter — single-bar charts no longer
   stretch with dead whitespace.

## 6. Acceptance

- [x] Identity team name hydrates via lookup formatted value
- [x] TeamDeal client/stage/status/banker hydrate via lookup
      formatted value
- [x] TeamDeal product/loan/pricing hydrated end-to-end
- [x] Missing-fields catalog stops flagging hydrated fields
- [x] Charts render human display names; no GUID leakage
- [x] Top-deal row surfaces product/loan/pricing when present;
      omits cells when absent
- [x] Visual density tightened (chart height + padding)
- [x] No banker workspace regression
- [x] No write surface added
- [x] No Dataverse schema / new loader
- [x] `npm run build` clean
- [x] Full manager suite green (311/311)
