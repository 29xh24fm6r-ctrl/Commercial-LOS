# Phase 119 — Restore Original Banker Workspace UI/UX, Part 1

**Status:** **Shipped.** First restoration slice from the Phase 118
backlog — bucket-A wave 1 (composition-only; no new schema, no new
loader, no new governed write, no email-lane change). Five
restored surfaces across the Banker Workspace shell + pipeline +
right rail.

The Phase 117 shell rendered correctly but was a thinner UI than
the original product targeted. Phase 118's inventory documented
exactly what was missing and classified each gap into a bucket.
Phase 119 implements bucket-A wave 1 — the highest-value,
lowest-risk items that re-use the data primitives already loaded
by the Phase 117 shell.

Phase 121 (the data seed runbook, formerly numbered Phase 119)
is deferred until after Phase 120 ships the wave-2 restoration —
seeding live test rows against a still-incomplete UI would
validate the wrong shape.

Related canonical sources:
- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the gap table and restoration backlog this phase consumes from. §5.1 items 1–4 + §5.7 wave 1.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell this phase extends. Every Phase 117 invariant is preserved.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants this phase explicitly does not touch.
- [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) — the deferred seed runbook. Run only after Phase 120.
- `src/banker/BankerShell.tsx` — KPI grid expansion (6 → 9 tiles) + My Tasks rail panel.
- `src/banker/PersonalPipeline.tsx` — flat table → stage-grouped sections.
- `src/shared/analytics/bankerPersonalActivity.ts` — derivation extended with 3 new counts.

---

## 1. What this phase restores

Five surfaces, all from the Phase 118 §5.1 wave-1 list:

| # | Surface | Inventory § | Restoration type |
| --- | --- | --- | --- |
| 1 | **Stage-grouped pipeline layout** | §5.1.1 | PersonalPipeline refactor: flat table → stage-grouped sections sorted by canonical STAGE_CATALOG ordinal |
| 2 | **`In Underwriting` KPI tile** | §5.1.2 | New tile in BankerShell KpiGrid; counts active deals whose stage matches "Underwriting" case-insensitively |
| 3 | **`Stale 14d+` KPI tile** | §5.1.2 | New tile; counts active deals whose lastActivityOn is ≥ 14 days ago |
| 4 | **`Urgent items` KPI tile** | §5.1.3 | New tile; sums overdue tasks + overdue outstanding documents + past-target-close deals |
| 5 | **My Tasks right-rail panel** | §5.1.4 | New panel alongside Closing soon; top-3 open tasks (overdue first) |

KPI grid expands from **6 tiles to 9 tiles**. Right rail expands
from **1 panel to 2 panels**. PersonalPipeline expands from
**1 flat section to N stage sections**.

---

## 2. Implementation summary

### 2.1 `src/shared/analytics/bankerPersonalActivity.ts`

Extended `PersonalActivityDeal` with `stage` + `lastActivityOn`
(both required) and `PersonalActivityDocument` with optional
`dueDate`. `BankerPersonalActivity` gained three new required
fields: `inUnderwritingCount`, `staleActivityCount`,
`urgentItemCount`. Two new constants:

- `STALE_ACTIVITY_DAYS = 14` (anchored against `modifiedon`, separate from `STAGE_AGING_AT_RISK_DAYS = 30`).
- `UNDERWRITING_STAGE_LABEL = 'underwriting'` (case-insensitive match against `cr664_stagereferencename`).

`urgentItemCount = overdueTaskCount + overdueOutstandingDocumentCount + pastTargetCloseCount`.
A single deal can contribute multiple urgency units (one for each
overdue child) — intentional, matches the original UI's count
semantics.

The Phase 75 module-hygiene pins still hold: no SDK import, no
role-module import, no scoring / ranking / approval / AI /
predictive vocabulary. The derivation remains pure and
deterministic.

### 2.2 `src/banker/BankerShell.tsx`

- KPI grid placeholder count: `6 → 9`.
- Three new `<KpiTile>` instances after `Pending reviews`: Urgent items, In underwriting, Stale 14d+.
- New `topTasks` memo computes top-3 open tasks sorted by `dueDate` ascending (overdue first, no-due-date last).
- `RightRail` now wraps its inner content in `styles.railStack` and renders both `Closing soon` and `MyTasksRailPanel`.
- `formatTaskDue` formats due-date strings as "Overdue by Nd" / "Due today" / "Due in Nd".
- New `railStack` style for vertical stacking of rail panels.

Phase 117 invariants preserved:
- Sidebar nav unchanged (5 items).
- Tab bar unchanged (5 tabs).
- No new tab, no Contacts / Due Diligence / Alerts surface added.
- No `New Deal` / `Log Activity` action button added.
- Read-only banner still surfaces when `writeDisabledReason` is populated.
- Closing-soon disclaimer "Not a calendar integration" still rendered.
- Phase 110 static-source pins still hold (no Office365OutlookService import, no SendEmailV2 callsite, no sendXEmail import).

### 2.3 `src/banker/PersonalPipeline.tsx`

- Added `groupByStage(deals)` helper + `stageOrdinal(stageName)` helper.
- Replaced single `<table>` with N stage sections, each `<section aria-label="Stage: <Label>">`.
- Each section: stage header (label + deal count) + per-stage table.
- Removed the per-row `Stage` `<td>` (stage now lives in the section header — no duplication).
- Stage sections sorted by canonical STAGE_CATALOG ordinal; unknown stages get ordinal 9999; missing/blank stage groups under "Stage unknown" with ordinal +∞ (sorts last).
- Empty / loading / failed states unchanged.
- Stage + status filters unchanged.

Honest empty state preserved: when the banker has zero active
deals, the card renders `"No active deals assigned to you"` and
no fabricated row.

---

## 3. Regression tests added

| Surface | Test file | Assertions |
| --- | --- | --- |
| Derivation — `inUnderwritingCount` | `src/shared/analytics/bankerPersonalActivity.test.ts` | Case-insensitive Underwriting match; honest zero; honest empty on missing stage |
| Derivation — `staleActivityCount` | same | 14-day threshold; missing / unparseable lastActivityOn skipped |
| Derivation — `urgentItemCount` | same | Sum of three sub-counts; received documents excluded; zero when nothing overdue |
| Derivation — empty data shape | same | `toEqual` updated to include new fields = 0 |
| BankerShell — new tiles render | `src/banker/BankerShell.test.tsx` | All 3 new labels present in `Workload KPIs` region |
| BankerShell — honest zeros | same | At least 8 literal `0` values render in empty state (was ≥5) |
| BankerShell — read-only context | same | New tiles still render when `writeDisabledReason` is set |
| BankerShell — My Tasks panel heading | same | Panel renders alongside Closing soon |
| BankerShell — My Tasks empty state | same | "No open tasks on your active deals" copy |
| BankerShell — top-3 ordering | same | Overdue tasks first; 4th task hidden by cap |
| PersonalPipeline — empty state | `src/banker/PersonalPipeline.test.tsx` (new) | Honest no-deals copy; no fabricated section |
| PersonalPipeline — stage grouping | same | Three stages render; section count + DOM order matches canonical ordinal (Application < Underwriting < Closing) |
| PersonalPipeline — unknown stages | same | Missing / blank stage filed into "Stage unknown" section sorted last |
| PersonalPipeline — no duplicate stage badge | same | "Underwriting" appears once (section header only) |
| PersonalPipeline — no forbidden vocab | same | No "delivered" / "email sent" / "borrower was notified" in the rendered DOM |

The Phase 117 + Phase 118 release-candidate snapshot pin now
also requires `docs/PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md`
to exist on disk.

---

## 4. Invariants preserved

Phase 119 is a **composition** phase. It writes no new Dataverse
query, registers no new governed write, and does not touch the
email lane. Every constraint from prior phases continues to hold.

### 4.1 Permission-before-render

The shell still mounts only inside `BankerProvider`, which
fails-closed when the signed-in UPN has no `cr664_banker` row.
The new tiles + rail panel + stage sections are children of the
already-permitted shell.

### 4.2 Fail-closed access

No restored surface bypasses the existing banker-FK filter. The
KPI counts derive from the same `loadBankerWorkQueueData(bankerId)`
load. The My Tasks rail panel reads `state.data.tasks` — already
banker-scoped at the server by `loadOpenTasksForDeals(dealIds)`
(deal ids previously confirmed banker-authorized via
`loadBankerPipeline`). The stage-grouped pipeline reads from the
same `loadBankerPipeline(bankerId)` call as before.

### 4.3 No fabricated / sample data

- KPI tiles render literal `0` when the underlying count is zero
  — never a placeholder value, never an "N/A", never a faked row.
- The My Tasks panel renders `"No open tasks on your active
  deals."` in the empty state. No sample task is fabricated.
- PersonalPipeline still renders `"No active deals assigned to
  you"` in the empty state. No fabricated stage section is added.

### 4.4 No fallback dashboards

No `if (no data) return mockShell` branch is added anywhere.
Empty states remain honest.

### 4.5 BankerIdentity remains authoritative

`useBanker()` is still the only identity source. No restored
surface introduces its own user lookup or bypass.

### 4.6 Workspace entitlements remain authoritative

`workspaceRoutes.ts` is unchanged. The Phase 116 alias map still
governs which workspace a signed-in user lands on. No restoration
surface side-steps the entitlement check.

### 4.7 Right-rail "Closing soon" disclaimer remains visible

The "Not a calendar integration — no events are read from or
written to Outlook / Teams calendars" disclaimer is rendered by
the Closing-soon panel block, which is left intact. Phase 119
adds a second rail panel beside it; it does NOT modify the
Closing-soon panel.

### 4.8 Live communication actions remain governed

No restoration surface invokes a send action. The My Tasks rail
panel renders task titles + due-date hints; clicking a task does
nothing today (no navigation, no governed write). The future
"click task → deal workspace" wiring is bucket A but deferred to
Part 2 so this phase stays composition-only.

### 4.9 Phase 110 communication lock

Static-source assertions still hold:
- BankerShell.tsx imports no `Office365OutlookService`.
- BankerShell.tsx contains no `SendEmailV2(...)` callsite.
- BankerShell.tsx imports no `sendDocumentRequestEmail` / `sendBorrowerUpdateEmail` action.
- PersonalPipeline.tsx adds no email-lane import.
- bankerPersonalActivity.ts adds no SDK or role-module import.

The Phase 110 release lock file still passes unchanged.

---

## 5. What this phase explicitly does NOT do

These are bucket-A wave 2 items, deferred to **Phase 120** per
Phase 118 §5.1 items 5–8:

- Banker-cross-deal Activity tab (§4.6 in the inventory).
- Due-Diligence tab (§4.6 in the inventory).
- Stale-row badges per row in PersonalPipeline (§4.4 in the inventory).
- Workspace-switcher in sidebar footer (§4.1 in the inventory).
- Visual polish pass (§5.2 in the inventory) — runs only after Phase 121 populated-state validation.

And these remain explicitly out of scope until upstream unlocks
land, per Phase 118 §5.5–§5.6:

- `New Deal` button — bucket D + E, requires new `GOVERNED_WRITES` row + Phase 110 scope-extension decision; must ask first.
- `Log Activity` button — bucket D + E, conflicts with Phase 110 communication-lane scope; must ask first.
- Today's Schedule rail / calendar widgets — Lane E unlock (Outlook Graph calendar) required.
- Cross-sell widgets — Lane F (Copilot) unlock required.
- Contacts entity + tab — schema-blocked.
- Vendors entity — out of repo scope.
- Pipeline-weighted / win-rate / YTD-closed / high-probability tiles — bucket C loaders; requires schema confirmation of `cr664_probability` + closed-deal history loader. Not in this slice.

---

## 6. Verification

### 6.1 CI gates

- `npm test -- --run`: full suite passes. New assertions:
  - 3 new derivation describe blocks (8 new test cases in `bankerPersonalActivity.test.ts`).
  - 2 new shell describe blocks (6 new test cases in `BankerShell.test.tsx`).
  - 1 new PersonalPipeline test file (5 new test cases).
- `npm run build`: clean. No new vite warning beyond the
  pre-existing bundle-size advisory.

### 6.2 Operator gate

Phase 119 is implementation; no operator action is required
until Phase 121 (the data seed) is unblocked. After Phase 120
ships, the operator can run Phase 121 §3 to seed test data and
walk Phase 121 §4 manual validation against the restored UI.

The honest pre-seed state Phase 119 produces:
- All 9 KPI tiles render `0` or `$0`.
- Both right-rail panels show their honest empty copy.
- The Pipeline tab renders the empty-state card (no stage sections).
- No fabricated rows anywhere in the workspace.

### 6.3 Operator-side `pac code push`

Required for this phase — code did change (3 React source files
+ 1 derivation file). Run `pac code push --environment
5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName
CommercialLendingLOS` after merging.

---

## 7. Cross-references

- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md §5.1 items 1–4](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the backlog this phase implements.
- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md §5.7 wave 1](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the recommended near-term sequence Phase 119 follows.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell this phase extends.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane lock this phase does not touch.
- [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) — deferred seed runbook; do not execute until Phase 120 ships.
- `src/shared/analytics/bankerPersonalActivity.ts` — derivation extended.
- `src/banker/BankerShell.tsx` — KPI grid + right rail.
- `src/banker/PersonalPipeline.tsx` — stage-grouped layout.
- `src/banker/PersonalPipeline.test.tsx` — new regression file.
- `src/shared/stages/stageCatalog.ts` — canonical stage ordinal source for pipeline grouping.
