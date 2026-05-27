# Phase 124 — Rich Pipeline / Stage Board

**Status:** **Shipped.** Visual + structural upgrade scoped to
the Pipeline tab only. The previous per-stage flat-table layout
(Phase 119) is replaced with a horizontal stage-board / Kanban
experience using premium deal cards inside canonical stage
lanes. No Dataverse schema changes. No new loaders. No new
governed writes. No fake data. No email-lane changes. Phase 123
design tokens carried through.

Related canonical sources:
- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5.1.A.2 — the bucket-A item this phase implements.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md) — the premium shell whose design tokens / accent-stripe pattern this phase reuses inside the lanes + deal cards.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) §2.3 — the previous stage-grouped flat-table layout this phase replaces. Stale-badge logic (Phase 120) is preserved verbatim.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell whose 7 tabs include the Pipeline tab this phase rebuilds.
- `src/banker/PersonalPipeline.tsx` — the only production file touched in this phase.
- `src/shared/stages/stageCatalog.ts` — canonical non-terminal-stage source for lane definition.
- `src/banker/dealQueries.ts` — `loadBankerPipeline` filter (`statecode = 0 AND cr664_isterminalstatus != true`) that already excludes terminal-stage deals; this phase relies on that exclusion to justify omitting the terminal lanes.

---

## 1. What changed

### 1.1 Layout — flat table → horizontal Kanban

The `PersonalPipeline` render path replaces the previous
`<div style={styles.stageStack}>` containing per-stage
`<table>` blocks with a horizontal flex container
(`styles.kanbanBoard`) holding one `<section>` lane per stage.
Lanes scroll horizontally on narrow viewports; each is a
fixed 296px column.

Wrapper:
- `role="group"`, `aria-label="Pipeline stage board"`.
- `display: flex`, `overflowX: auto`, `gap: spacing.md`.
- Sits below the Phase 119 filter row (Stage + Status selects),
  unchanged.

### 1.2 Lane definition — canonical + custom + unknown

`buildLanes(deals)` produces the lane list:

| Tier | Source | Behavior |
| --- | --- | --- |
| **Canonical** | `STAGE_CATALOG.filter(s => !s.isTerminal)` | All 9 non-terminal stages render as lanes (Origination, Screening, Application, Pricing, Underwriting, Committee, Documentation, Closing, Funded), **even when empty** — that's the Kanban contract: lane shape is determined by the canonical pipeline, not by what happens to have a row today. |
| **Custom** | Stages present in `deals` whose name doesn't match a canonical id or label (case-insensitive) | Surfaces operator-created stage names from the live `cr664_dealstagereference` table (e.g. `TEST — Stage Phase 121` from the Phase 121 seed). Ordinal falls back to 9999 — sorts after canonical, before unknown. |
| **Stage unknown** | Deals with missing / blank stage | Only appears when at least one deal in the visible set has no parseable stage. Sorts last (ordinal +∞). Never fabricated. |

Terminal stages (closed-won, closed-lost, cancelled) are
**deliberately excluded** because the existing loader at
[src/banker/dealQueries.ts:53-58](../src/banker/dealQueries.ts#L53-L58)
already filters them out via
`cr664_isterminalstatus eq false or cr664_isterminalstatus eq null`.
Surfacing terminal lanes here would be misleading dead space.

Lane order = ascending `stageOrdinal` then `localeCompare` tie-
break (same contract as Phase 119's `groupByStage`).

### 1.3 Lane header

Each lane header has three parts in a 2-row block:

1. **Top row.** Stage name (`palette.primary` accent dot +
   bold uppercase-ish label) on the left; deal-count pill on
   the right (primary-color outlined pill, e.g. `1 deal` /
   `12 deals`). Reuses the Phase 119 / 123 accent-dot + count-
   pill pattern verbatim.
2. **Amount-summary row.** Compact-currency sum of all
   parseable amounts in the lane (e.g. `$3.5M`). Omitted
   entirely when (a) the lane is empty, OR (b) every deal in
   the lane has a missing / unparseable amount. Honest
   absence, not silent `$0`.

### 1.4 Lane body

When deals are present, render a vertical stack of `DealCard`s.
When the lane is empty, render the framed empty-state copy
`"No deals in this stage."` styled with the Phase 123 dashed-
border treatment, vertically centered in a 100px-min surface
subtle background.

### 1.5 DealCard

Replaces the flat `<tr>` row with a premium card. Layout:

```
[Deal name (semibold, truncated)]   [Stale 14d+ badge if applicable]
[Client name (muted, truncated)]
[Status chip]                        [Amount or "Amount not set"]
Target close: Aug 4 (in 3d)        ← only if real
Last touched: 2d ago
```

Visual treatment:
- 3px left accent stripe: `palette.atRisk` if `isPastClose` OR
  `isStale`; else `palette.primary`.
- Card-style frame with `shadow.card` (Phase 123 token).
- `palette.surface` background.
- Whole card is a `<button>` for accessibility — `onClick →
  navigate('/deals/<id>')`, `aria-label="Open deal <name>"`.
- Reuses the global `.cc-row-hover` class for hover / focus-
  visible transitions.

Honest rendering rules:
- **Amount** — formatted USD currency if parseable, else
  italic `Amount not set` (subtle, no `—` placeholder hiding
  the absence).
- **Target close** — only rendered when `targetCloseDate`
  parses; never `Target close: —`.
- **Stale 14d+ badge** — same Phase 120 predicate
  (`isStaleActivity` uses exported `STALE_ACTIVITY_DAYS`);
  badge count and the Phase 119 KPI tile count continue to
  agree.
- **Past-close target** — surfaces with `atRisk` color tone
  on the target-close line, same Phase 119 treatment.

### 1.6 Empty-pipeline state

Total deal count = 0 → the Kanban is NOT rendered. The honest
"No active deals assigned to you" `<Card>` block (Phase 117) is
preserved verbatim — same empty-state copy and dashed-border
framed treatment from Phase 123.

### 1.7 Filter behavior

The Phase 119 Stage + Status filter selects continue to drive
`derived.visibleDeals`. The Kanban renders lanes derived from
the FILTERED set, so:

- Selecting a specific stage in the Stage filter narrows the
  data to that stage. Canonical lanes for other stages still
  render but are empty (with the framed honest empty-state copy).
- Selecting a specific status hides deals across all lanes that
  don't match; lanes whose deals are all filtered out render
  empty.

This is a deliberate design choice: the Kanban gives the
operator a stable spatial map regardless of filter state.

---

## 2. What did NOT change

Phase 124 is scoped strictly to the Pipeline tab's
`PersonalPipeline` component. The following are explicitly
unchanged:

- **`loadBankerPipeline`** — same query, same filter, same
  `PipelineDeal` projection.
- **Stage catalog + `stageOrdinal()` helper** — same canonical
  ordering as Phase 119.
- **`STALE_ACTIVITY_DAYS`** — Phase 120 export, unchanged.
- **`isStaleActivity()` + `isOverdueDate()`** — Phase 119 / 120
  predicates verbatim.
- **Filter + select + uniqueSorted helpers** — verbatim.
- **`countSignals()`** — verbatim.
- **Empty-state copy for total = 0 ("No active deals
  assigned to you")** — verbatim.
- **`aria-label="Stage: <Label>"` on each lane region** —
  preserves the Phase 119 test contract.
- **Empty-state copy when filters hide all visible deals
  ("No deals match the current filters.")** — verbatim.
- **All other banker surfaces (BankerShell, KPI grid, tabs,
  right rail, sidebar, MyWorkQueue, RelationshipMemory,
  BankerAutopilotRollup, BankerMorningCatchUp,
  PersonalActivitySummary, BankerActivityFeed,
  BankerDueDiligenceView)** — untouched.
- **Phase 110 communication-lane lock** — no `Office365OutlookService`
  import, no `SendEmailV2` callsite, no `sendXEmail` action
  import in any file touched.
- **`deriveBankerPersonalActivity`** — Phase 119 derivation,
  unchanged. Phase 119 / 120 KPI tile values are unaffected.
- **Phase 121 reduced-scope validation expectations** — Open
  Tasks / Outstanding Docs / Pending Reviews remain `0`
  honestly; Action Queue / Due Diligence / My Tasks remain
  honestly empty pending Phase 122.
- **Phase 123 premium shell** — header, KPI grid grouping, tab
  bar, right rail, sidebar, workspace switcher all unchanged.

---

## 3. Test surface

### 3.1 Test count + outcome

- `npm test -- --run`: **119 files / 2690 tests passed** (+8 new
  Phase 124 cases on top of the Phase 123 baseline of 2682).
- `npm run build`: clean.

### 3.2 New test cases ([src/banker/PersonalPipeline.test.tsx](../src/banker/PersonalPipeline.test.tsx))

All 8 existing Phase 119 / 120 tests **still pass unchanged** —
the lane container preserves the `aria-label="Stage: <Label>"`
contract, "N deal(s)" count format, canonical order assertions,
Stage-unknown sorting, single-occurrence "Underwriting"
assertion (which now refers to the lane header instead of the
old section header), stale-badge predicate, and no-forbidden-
vocab pin.

New Phase 124 assertions:

1. **Stage-board container** — `role="group"` with `aria-label="Pipeline stage board"` renders when at least one deal is present.
2. **Empty canonical lanes** — with 1 deal in Underwriting, exactly 8 lanes (the other non-terminal canonical stages) render the honest `"No deals in this stage."` copy.
3. **All 9 canonical non-terminal lanes** render as `region`s named `Stage: <Label>` for `Origination / Screening / Application / Pricing / Underwriting / Committee / Documentation / Closing / Funded`.
4. **Terminal lanes absent** — `Closed — Won` / `Closed — Lost` / `Stage: Cancelled` do NOT render. The loader filter contract is reflected in the UI.
5. **Missing-amount honesty** — `DealCard` renders the italic `Amount not set` copy when `deal.amount` is `undefined`. No silent `—` filler.
6. **Missing target-close omission** — `DealCard` does NOT render any `Target close:` line when `deal.targetCloseDate` is missing. No `Target close: —` filler.
7. **Lane amount summary positive case** — sum of two deals (2.5M + 1M) renders as `$3.5M` inside the Underwriting lane header.
8. **Lane amount summary absence** — when every deal in a lane has missing amount, no `$`-formatted summary appears anywhere in the lane header.

### 3.3 Why the existing Phase 119 / 120 tests still pass

Phase 119 / 120 test selectors deliberately use semantic queries
(`getByRole('region', { name: /Stage: <Label>/ })`,
`getByText('N deal(s)')`, `getAllByText('Stale 14d+')`) rather
than DOM-shape queries. The Phase 124 Kanban refactor preserves
every semantic contract those tests pin:

- Each lane is still a `<section aria-label="Stage: <Label>">`.
- The deal-count text format `"N deal(s)"` is unchanged.
- Stale-badge logic + threshold are identical.
- Stage-unknown lane logic + ordinal +∞ unchanged.
- "Underwriting" still appears exactly once in the rendered DOM
  (lane-header label; no per-card stage badge — same as Phase 119).
- The empty-pipeline-total = 0 branch still uses the same
  `<Card>` + "No active deals…" copy.

---

## 4. Acceptance criteria

- [x] Pipeline tab renders as a horizontal stage-board with one lane per canonical non-terminal stage.
- [x] Stage-unknown fallback lane present and sorted last when applicable.
- [x] Deal cards render inside lanes with premium card treatment + stale badges + honest "Amount not set" + honest target-close omission.
- [x] Lane headers show deal count + real amount summary (compact USD).
- [x] STAGE_CATALOG ordinal sorting preserved.
- [x] `TEST — Deal Phase 121` visibility preserved (renders in its custom-named lane).
- [x] No fabricated rows.
- [x] No fake AI / risk / prediction claims in any rendered string.
- [x] No email / SMS / live communication imports or calls added.
- [x] Existing 7-tab shell unchanged.
- [x] Existing KPI values and derivations unchanged.
- [x] All 2690 tests pass.
- [x] Build clean.

---

## 5. What Phase 124 explicitly does NOT do

Per the Phase 122A backlog sequencing, the next visual phases
are not part of this slice:

- **Phase 125 — Deal Workspace Cockpit.** DealHeader / DealSummary / DealBlockers / DealStageProgressionCard / DealAutopilotPanel / DealTasks / DealDocuments / CreditMemo / ActivityTimeline / BorrowerCommunication / TeamsChatHandoff / TeamsDealSummaryHandoff card-level polish all stay as-is. Phase 124's `DealCard` is the Pipeline-tab summary card; clicking it navigates to the un-polished deal workspace which Phase 125 will upgrade.
- **Phase 126 — Relationships + Signals visual restoration.** RelationshipMemory + BankerAutopilotRollup + BankerMorningCatchUp + PersonalActivitySummary + MyWorkQueue visual upgrades are out of scope.
- **Phase 127 — Credit memo premium workspace.** CreditMemo card-level polish + CreditMemoDraftModal styling deferred.
- **Phase 128 — Task / document UX after Dataverse Phase 122.** Wait for Phase 122 retarget; today's honest-empty Action Queue / Due Diligence remain Phase 121 reduced-scope.
- **Phase 129 — Manager / team / executive visual parity.**
- **Drag-and-drop stage advancement.** Stage progression is `NOT_WIRED` in `platformInventory.ts` — Phase 28 schema gap. Phase 124's Kanban is **read-only**; cards click through to the deal workspace, they don't drag across lanes.
- **Probability ribbons on deal cards.** Bucket C in Phase 122A — depends on `cr664_probability` schema confirmation. Out of scope here.

---

## 6. Verification

```bash
npm test -- --run    # 119 files / 2690 tests passed
npm run build        # clean
```

The Kanban will become visible in the deployed app on the next
`pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS`.

Post-push observation against the seeded `TEST — Deal Phase 121`:

- Pipeline tab shows 9 canonical lanes (Origination / Screening / Application / Pricing / Underwriting / Committee / Documentation / Closing / Funded) + 1 custom lane (`TEST — Stage Phase 121`).
- 8 of the canonical lanes render the framed "No deals in this stage." empty state.
- The custom `TEST — Stage Phase 121` lane has the test deal as a card with name + client + status + `$2.5M` + target close countdown + last-touched.
- No terminal lanes (Closed Won / Closed Lost / Cancelled) appear.
- No `Stage unknown` lane (the test deal has a stage set).

---

## 7. Cross-references

- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5.1.A.2 — the bucket-A item this phase implements.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md) — design tokens + accent patterns reused inside the Kanban.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) §2.3 — the flat-table-per-stage layout this phase replaces.
- [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — the per-row stale badge preserved verbatim.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the 7-tab shell whose Pipeline tab this phase rebuilds.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) — the seeded `TEST — Deal Phase 121` that surfaces in the rebuilt Kanban.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants this phase respects.
- `src/banker/PersonalPipeline.tsx` — the only production file modified.
- `src/banker/PersonalPipeline.test.tsx` — 8 new test cases pinning the Kanban contract.
- `src/shared/stages/stageCatalog.ts` — canonical stage source.
- `src/banker/dealQueries.ts` — loader filter that justifies the terminal-lane omission.
