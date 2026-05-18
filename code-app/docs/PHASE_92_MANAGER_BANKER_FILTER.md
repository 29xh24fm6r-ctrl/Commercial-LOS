# Phase 92 — Per-Banker Filter on Manager Surfaces

## Goal

Add a manager-facing per-banker filter that narrows the manager observability surfaces — `<ManagerAutopilotRollup />` (Phase 81/87) and `<ManagerMorningCatchUp />` (Phase 88) — to one banker's deals at a time. The filter is pure manager-facing UI/state — no Dataverse write, no schema change, no AI, no notifications, no persistence beyond the current page session.

## Why this phase

After Phase 87 (manager-scoped child data) + Phase 88 (manager catch-up) + Phase 90 (last-seen) + Phase 91 (item dismiss/snooze), the manager observability surfaces carry meaningful operational depth. As a team grows beyond a handful of bankers, the manager needs a way to focus those two surfaces on one banker without changing permissions, data scope, or business state. Phase 92 closes that gap with a small, honest control.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.22 (Manager workspace)** — current-state extended to "Operational (Phase 36 + Phase 71 + Phase 81 + Phase 87 + Phase 88 + Phase 90 + Phase 91 + Phase 92)". The manager workspace now offers a focused-banker view.
- **§1.18 (Activity intelligence)** — extended note: the morning catch-up surface now supports per-banker focus via the Phase 92 filter, applied before derivation so the "since last visit" overlay (Phase 90) and the dismiss/snooze ledger (Phase 91) operate on the same focused subset.
- §1.27 (Reporting / portfolio analytics) — no change. Reporting surfaces (executive transitional fallback, profitability snapshots) are not in Phase 92 scope.

## Surfaces filtered

| Surface | Filtered in Phase 92? | Why / why not |
|---|---|---|
| `<ManagerAutopilotRollup />` | ✓ yes | Primary observability surface; brief target. |
| `<ManagerMorningCatchUp />` | ✓ yes | Primary observability surface; brief target. |
| `<ManagerActivitySummary />` | ✗ no | Pipeline-mix derivation — the team aggregate is the value; a single-banker pipeline mix loses meaning. Future phase could add this if banker feedback warrants. |
| `<TeamPipelineSummary />` | ✗ no | High-level team aggregate — same rationale. |
| `<DealsByStage />` / `<ClosingForecast />` / `<AtRiskBlockedDeals />` / `<BankerWorkloadSummary />` / `<TeamWorkQueue />` | ✗ no | Team-level lenses by design. The brief prefers "starting with the two observability surfaces only" — Phase 92 honors that. |

## Filter option derivation

`deriveBankerFilterOptions(deals)` is a pure function that returns:

1. **All team** (always first). Selection: `{ kind: 'all' }`.
2. **One option per unique banker** present in `teamPipeline`. Deduped by `cr664_bankerid` when known; falls back to a `name:<assignedBankerName>` key when the id is absent (name-fallback path is documented as a limitation). Options sorted alphabetically by banker name. Selection: `{ kind: 'banker'; id?: string; name: string }`.
3. **Unassigned** (appended last, only if any deal has neither id nor name). Selection: `{ kind: 'unassigned' }`.

No unrelated users are fetched. No admin / user tables are queried. The option set comes entirely from the already-loaded `teamPipeline` slot (Phase 14).

## Filter state

`ManagerBankerFilterProvider` holds `[selection, setSelection]` in local React state. Default is `{ kind: 'all' }`. Provider mounts inside `ManagerDataProvider`, so consumers can read both filter state and data without prop drilling.

**Persistence posture (Phase 92):**

- ❌ No localStorage. The brief's preferred Phase 92 scope is in-memory only — selection resets when the manager navigates away or refreshes.
- ❌ No sessionStorage.
- ❌ No Dataverse `cr664_userpreferences*` row (no such schema exists today; would be a separate brief).
- ❌ No cross-device sync.
- ❌ No audit / timeline row.

A future phase could add LOCAL_ONLY persistence (Phase-90-style) for the filter selection if managers ask for it; the contract today is "view tool only, no memory."

**No auto-reset on data change.** If the manager picks "Alice" and Alice's deals subsequently all get reassigned, the filter still applies (the surfaces show empty states) until the manager manually picks something else. This is more transparent than silently flipping the selection out from under the user.

## Filter application

Both observability surfaces:

1. Read `useManagerBankerFilter()` for the current `selection` + `matchesDeal(deal)` predicate.
2. Filter the deal universe BEFORE running the deterministic derivation: `teamPipeline.data.filter(filter.matchesDeal)`.
3. Filter child rows (tasks / documents / memos) by `dealId ∈ visibleDealIds` so the derivation operates on a coherent subset.
4. Run the existing Phase 80 → Phase 87 / Phase 88 derivation unchanged.
5. Render the result. When filtered, the header surfaces a small "Filtered to <Banker>" tag.

The Phase 80 priority chip counts + the catch-up "N new since your last visit" line + the dismiss/snooze ledger entries continue to work — they always reflect what's currently visible to the manager. No special handling needed.

## Filter copy

- Selection labels (used in the header tag + as `aria-label` on the filter control):
  - `kind === 'all'` → "Showing team view"
  - `kind === 'banker'` → "Filtered to <Banker>"
  - `kind === 'unassigned'` → "Filtered to Unassigned"
- Filter control: visible label "Focus on banker"; helper text "Local view filter. No data is hidden from the team; this narrows the autopilot rollup and morning catch-up cards only. No data is changed."
- Filter-aware empty states:
  - Rollup: `No deals match the current filter (focused on <Banker>).`
  - Catch-up: `No catch-up items for <Banker> from current records.`

Forbidden vocabulary statically scanned (source + rendered DOM) — none of these appear on any filter surface:

- ❌ `official assignment`, `official view`, `official record / state / status`
- ❌ `performance ranking`, `underperforming`
- ❌ `score` (the word alone — covered by the Phase 71 forbidden list extension)
- ❌ `surveillance`
- ❌ `audit view`
- ❌ `(is|was|has been) synced`

## Local ledger interaction (Phase 90 / 91)

The filter is purely a view-time concept. Phase 90's per-user last-seen marker continues to use its existing scope key (`cc:lastVisit:catchUp:manager:<bankerId>:<teamId>`) regardless of filter selection; Phase 91's dismiss/snooze ledger continues to key by `surface|itemKey`, where `itemKey` is the Phase 88 derivation's `item.id` — stable across filter changes.

Concrete behavior:

- A manager dismisses an item, then filters to Alice. If the item belongs to Alice, it still renders muted with Restore. If the item belongs to Bob, it disappears with Bob's other items.
- A manager filters to Alice, dismisses an item. Switches back to All team. The dismissed item still renders muted with Restore — ledger keys do not depend on filter state.
- The "since last visit" badge does not get re-stamped by the filter — Phase 90 snapshots once on mount and bumps after the 2-second settle, independent of filter changes.

These are documented in the doc; no test coverage gap.

## Accessibility

The filter control uses a native `<select>`:

- **Accessible label.** The visible `<label htmlFor="manager-banker-filter">Focus on banker</label>` is associated by `id`; also surfaced as `aria-label="Manager banker filter"` on the wrapping `<div>`.
- **Keyboard operability.** Native — Tab to focus, arrow keys to change, Enter/Space to open the picker.
- **Clear selected state.** The native `<select>` renders the current selection in its closed state.
- **Helper text.** Below the select; describes the local-only posture.
- **Filter tag on cards.** When a non-default selection is active, the rollup and catch-up cards surface a small italic tag in the header with `aria-label="Filtered to <Banker>"` so screen readers announce the focus state on every card.

## Role boundary

- **Manager Workspace only.** The provider + control + hook live under `src/manager/`. The cards import the hook only when they themselves are mounted inside the manager workspace tree.
- **Banker / Team / Executive / Admin Workspaces:** unchanged. None of them mount `ManagerBankerFilterProvider`; `useManagerBankerFilter()` throws if called outside the provider (test asserts this).
- **No permissions widened.** The filter operates over the manager's already-authorized `teamPipeline` (Phase 14) and Phase 87 child data. A filter narrowing to "Alice" still pulls only the manager-authorized data — Alice's deals are only visible because they are on the manager's team.

## Limitations

- **In-memory state only.** Refresh / nav-away resets to All team.
- **Name-fallback when banker id is missing.** Two bankers with the same denormalized name would collapse into one option. The schema's `cr664_assignedbanker` lookup normally provides an id; this fallback is a defensive degradation.
- **Only the two observability surfaces are filtered.** Other manager cards intentionally remain full-team views.
- **No auto-reset.** A selection that no longer matches any deal stays active; the user sees a clear empty state until they switch back.
- **No persistence across browsers / devices / sessions.**
- **No keyboard shortcut.** Filter is reachable via Tab; no `/` or `Ctrl+F` style binding.
- **No multi-select.** Phase 92 picks one banker at a time. "Show Alice + Bob" would require a different control (multi-select / chip group); deferred.

## Privacy / security posture

- **No data exposed by the filter.** The control reads `teamPipeline` (already loaded) and renders an option per unique banker. Banker names and ids in the dropdown are already visible on every manager card.
- **No network traffic.** Filter selection is pure client state.
- **No storage.** No localStorage / sessionStorage / Dataverse write — nothing to leak.
- **No tracking.** The selection is not telemetered or logged anywhere.

## Why this is not (a)

- **A performance-review tool.** Forbidden vocabulary `performance ranking`, `underperforming`, `score`, `audit view`, `surveillance` is scanned out of source + rendered DOM. The card copy uses "Focus on banker" + "Filtered to <Banker>" + "Local view filter" only.
- **A persistent manager preference.** No storage. Selection lives in React state only. A future preference layer is documented as future work.
- **A permissions surface.** The manager already sees the banker's deals; the filter only changes which subset renders.
- **A workflow tool.** No dismiss / snooze / approve / decision affordances; no Dataverse write of any kind.

## Future upgrade path

1. **Saved manager preferences.** Persist the selection per-user in `cc:managerFilterSelection:v1` localStorage (LOCAL_ONLY) or in a Dataverse `cr664_userpreferences*` row once such schema lands. Cross-device only with the server option.
2. **Team hierarchy filters.** When `cr664_teams` carries a hierarchy or sub-team concept, the same filter pattern would extend to sub-team selection.
3. **Product / stage filters.** Sibling filters on the same control — "Underwriting only", "RLOCs only" — once banker feedback says they're needed. Same pure-React pattern.
4. **Banker coaching dashboard.** A dedicated manager-side per-banker drilldown (per-banker activity summary + per-banker autopilot + per-banker catch-up + per-banker timeline). Sibling surface; reuses the Phase 92 filter.
5. **Teams notifications per banker.** Once Lane E (Phase 86 → admin-consented Graph) matures, the filter could double as a "notify me only about HIGH-priority signals from focused banker" toggle. Out of scope today.
6. **Multi-select filter.** "Alice + Bob" / "everyone except Carol". Replaces the `<select>` with a chip-group control.

## Files created

- `src/manager/ManagerBankerFilter.tsx` — pure helpers (`deriveBankerFilterOptions`, `dealMatchesBankerFilter`, `selectionToOptionValue`, `selectionLabel`) + `ManagerBankerFilterProvider` + `useManagerBankerFilter` hook + `<ManagerBankerFilterControl />` component. Selection model: `{ kind: 'all' } | { kind: 'banker'; id?; name } | { kind: 'unassigned' }`. Option model: `{ value, label, selection }`.
- `src/manager/ManagerBankerFilter.test.tsx` — 26 tests covering option derivation (empty, single banker, dedupe by id, name fallback, alphabetical sort, Unassigned appended only when applicable, whitespace tolerance), `dealMatchesBankerFilter` (all / banker-with-id / banker-by-name-fallback / id-only-no-name-match / unassigned), value-label round-trip, forbidden-vocabulary scan on rendered labels, provider default + reactive options + outside-provider throw, control labeled select + change updates selection + helper text + forbidden-vocab scan, module hygiene.
- `docs/PHASE_92_MANAGER_BANKER_FILTER.md` — this document.

## Files modified

- `src/workspaces/ManagerWorkspace.tsx` — mounts `<ManagerBankerFilterProvider>` inside `<ManagerDataProvider>`; renders `<ManagerBankerFilterControl />` between `<TeamWorkQueue />` and `<ManagerMorningCatchUp />`.
- `src/manager/ManagerAutopilotRollup.tsx` — consumes `useManagerBankerFilter()`; threads the predicate through the rollup `useMemo` so the deterministic derivation runs over `teamPipeline.data.filter(matchesDeal)` and the child rows narrowed to `visibleDealIds`. Renders a `Filtered to <Banker>` tag in the card header when the selection is not `'all'`. Adds a `totalDealsScanned === 0` empty-state branch that surfaces the filter-aware "No deals match the current filter (focused on <Banker>)" copy.
- `src/manager/ManagerAutopilotRollup.test.tsx` — mocks `useManagerBankerFilter` at the module boundary; defaults to "all team" in the existing Phase 81/83/87 tests; adds 8 Phase 92 tests covering default-all visibility, banker-filtered visibility, header tag rendering, priority-chip-count reflecting filtered universe, child-row narrowing, filter-aware empty state, unassigned-selection behavior, forbidden-vocab scan.
- `src/manager/ManagerMorningCatchUp.tsx` — same wiring as the rollup. Header tag, item-set + ledger filtering, filter-aware empty-state copy.
- `src/manager/ManagerMorningCatchUp.test.tsx` — mocks `useManagerBankerFilter`; adds 6 Phase 92 tests covering default visibility, single-banker visibility, header tag, filter-aware empty state, child-row narrowing, forbidden-vocab scan.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.1 / §1.18 / §1.22 advanced.

## Tests added / updated

- 26 provider / control / helper tests (`ManagerBankerFilter.test.tsx`).
- 8 banker-filter tests appended to `ManagerAutopilotRollup.test.tsx` (32 total → 32; existing 24 unchanged).
- 6 banker-filter tests appended to `ManagerMorningCatchUp.test.tsx` (36 total → 36; existing 30 unchanged).
- 0 inventory tests added (Phase 92 introduces no `LOCAL_ONLY_FLOWS` entry — the filter has no storage footprint).

No existing test was changed substantively. Phases 72 / 80 / 81 / 82 / 83 / 84 / 86 / 87 / 88 / 89 / 90 / 91 tests continue to pass.

## Confirmation: no writes / schema / AI / sync / automation added

- ✅ No new write surface. No `GOVERNED_WRITES` entry.
- ✅ No new `LOCAL_ONLY_FLOWS` entry (Phase 92 is in-memory only).
- ✅ No schema change. No new generated-service import.
- ✅ No new SDK install. `@microsoft/teams-js` from Phase 86 is not used here.
- ✅ No AI. Source-text + rendered-DOM forbidden-vocab scans pin the contract.
- ✅ No notification surface, no real-time stream, no Teams / Outlook push.
- ✅ No cross-device sync. Forbidden vocab pinned.
- ✅ No permission widening. The filter operates strictly over already-authorized manager data.
- ✅ No executive expansion. Executive workspace untouched.
- ✅ Phase 90 / Phase 91 local ledgers unchanged in shape and key strategy. Filter changes which rows render, not which keys exist.

## Test + build counts (at acceptance)

- Full suite: **1738 / 1738 passing** (Phase 91 baseline 1698 → +40: 26 provider + 8 rollup + 6 catch-up).
- `tsc -b && vite build`: clean (verified separately).

## Recommended next phase

After Phase 92 the manager observability stack carries a focused-banker view; the next moves shift back to either closing remaining Vibe gaps in-repo or starting a no-admin Teams-adjacent sibling. Candidates:

1. **Phase 93 candidate — "Mark all seen" affordance on the catch-up cards.** Single button bumps the Phase 90 marker to `now`. Small, useful, closes a known UX gap.
2. **Phase 93 candidate — Saved manager filter preference (LOCAL_ONLY).** Persist the Phase 92 selection per-user via the Phase 72 lastVisit pattern so the focused-banker view survives page refreshes. Sibling to Phase 90.
3. **Phase 93 candidate — Memo consistency findings on the rollups + catch-up.** Closes the 8th and final Phase 80 signal at the cost of loading sections team-wide.
4. **Phase 93 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** No-admin Teams runner-up; banker pastes deterministic deal summary into Teams chat.
5. **Phase 93 candidate — Banker-side per-banker filter? (no — banker pipeline is by definition their own).** Skip.

**Recommendation: Phase 93 — Saved manager filter preference (LOCAL_ONLY).** Phase 92 deliberately ships in-memory only; the brief flagged "session/local persistence only if trivial" as optional. With Phase 92 stable and the Phase 72 lastVisit pattern proven (Phase 90 reuses it), a small `cc:managerFilterSelection:v1` localStorage shim is now trivial. It closes the most common follow-up ask — "I refresh and lose my filter" — without changing anything else.
