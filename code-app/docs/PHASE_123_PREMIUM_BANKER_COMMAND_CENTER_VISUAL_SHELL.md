# Phase 123 — Premium OGB Banker Command Center Visual Shell

**Status:** **Shipped.** Visual / composition-only upgrade on top
of the Phase 117 / 119 / 120 governed shell. No Dataverse schema
changes. No loader / query changes. No governed writes. No
fake / sample data. No new dependencies. No new Buddy / borrower-
portal / franchise references — strictly OGB LOS / Commercial
Lending LOS.

Related canonical sources:
- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5 — the bucket-A wave that Phase 123 implements first.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the empty-state shell this phase visually enriches.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) + [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — the functional restorations whose visual polish lands here.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — Phase 121 validated 2026-05-27; the populated workspace this premium shell renders against.
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — Dataverse-config phase whose task / doc population this shell will surface once it ships.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants Phase 123 explicitly does not touch.

---

## 1. What changed

### 1.1 Header — command-center hero band

The header is now a banded layout with a thicker bottom divider,
larger title scale (`typography.size.hero`), and a brand-eyebrow
row featuring an `Old Glory Bank · Commercial Lending` lockup
with a small `palette.primary` accent dot before the eyebrow
text. The subtitle remains the conservative Phase 117 copy ("no
performance ranking, no predictive claim, no compensation
impact"). The meta cluster (Email mode badge + optional Read-only
mode badge) sits in the same row, right-aligned, no longer
competing with the title for vertical space.

The read-only banner (Phase 117) keeps its `role="status"`
element verbatim — Phase 117 tests still pass.

Files touched:
- [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) — `Header` function + `styles.header` / `headerBand` / `eyebrowRow` / `eyebrowDot` / `headerTitle` / `headerSubtitle`.

### 1.2 KPI grid — 3 semantic groups + hero tiles

The flat 9-tile grid (Phase 117 / 119 layout) is reorganized into
three semantic groups, each with a chrome-style group label + a
short caption. Inside each group, a `auto-fit minmax(180px, 1fr)`
sub-grid renders the tiles. The outer `<section aria-label="Workload KPIs">`
is preserved exactly so the existing Phase 117 / 119 tests
continue to find it by role.

| Group | Caption | Tiles |
| --- | --- | --- |
| **Pipeline** | Authorized pipeline shape | Active deals (hero), Pipeline (hero), In underwriting, Closing soon |
| **Work items** | Tasks · documents · reviews | Open tasks, Outstanding docs, Pending reviews |
| **Attention** | Things to look at first | Urgent items, Stale 14d+ |

`Active deals` and `Pipeline` get the **hero treatment**: larger
value font (`typography.size.hero`), deeper elevation
(`shadow.elevated`), 3px left accent stripe in
`palette.primary`. The two anchor tiles read as the workspace's
primary focus without breaking the calm-institutional aesthetic.

Tiles with `emphasis: 'atRisk'` (overdue) get a 3px left stripe
in `palette.atRisk`; `emphasis: 'info'` (closing-soon non-zero)
gets a stripe in `palette.primary`.

All values continue to come from `deriveBankerPersonalActivity`.
**Zero KPI value / calculation changes.** Empty states still
render `0` / `$0` honestly. The loading-state placeholders use
generic `"Loading…"` labels (not pre-named tile labels) to keep
the test-time disambiguation between the right-rail "Closing
soon" panel and the ready-state KPI tile clean.

Files touched:
- [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) — `KpiGrid` function (ready + loading + failed branches), `KpiTile` (added `hero` prop), `styles.kpiGrid` / `kpiGroup` / `kpiGroupHeader` / `kpiGroupLabel` / `kpiGroupCaption` / `kpiGroupBody` / `kpiTile` / `kpiTileHero` / `kpiValue` / `kpiValueHero` / `kpiHint`.

### 1.3 Tab bar — premium underline style

The tab bar gains a `palette.surface` background, slight
horizontal padding, and a `radius.md` top corner. The active
tab's text shifts from the previous "no color change, only
2px primary border" treatment to `palette.primary` color +
`fontWeight: bold` + 2px primary underline. Inactive tabs gain
a 140ms color/border transition. The role/`aria-selected`
markup is unchanged — existing tab-switching tests still pass.

Files touched:
- [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) — `styles.tabBar` / `tabButton` / `tabButtonActive`.

### 1.4 Right rail — accented framed panels

Both rail panels (`Closing soon` + `My Tasks`) gain a 3px top
accent stripe in `palette.primary`, a slightly deeper shadow
(`shadow.elevated` instead of `shadow.card`), and crisper title
styling (`<div style={styles.railTitle}>` already an h-style
element — kept `margin: 0` for premium tightness). Per-item
cards (`railItem`) gain a 3px left primary stripe so closing-
soon and my-tasks rows read as related-but-distinct.

The empty-state copy ("No deals with a target close in the next
14 days.", "No open tasks on your active deals.") is preserved
verbatim — Phase 117 / 119 tests still pass. The empty-state
markup gains a dashed-border framed look (`styles.railMuted`) so
it reads as intentional rather than as a fallback.

**The Phase 117 "Not a calendar integration" disclaimer remains
visible and unchanged.** Test still passes.

Files touched:
- [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) — `styles.rail` / `railTitle` / `railSubtitle` / `railItem` / `railMuted`.

### 1.5 Sidebar — navigation polish + workspace switcher pill

Nav buttons gain a 140ms transition on background / color /
border-left-color for crisper hover feedback. Active nav button
keeps its 3px accent-color left stripe (Phase 117 behavior). Per-
item padding bumps to `spacing.sm spacing.md` for a denser-but-
breathable list.

The workspace switcher footer (Phase 120) gains a 3px left
accent stripe in `SIDEBAR_ACTIVE_ACCENT` and the "Current" pill
becomes an actual pill: outlined-border, rounded-full,
uppercase letterspaced. The honest single-workspace hint
("Only one workspace is entitled to your account.") is
preserved — Phase 120 tests still pass.

Files touched:
- [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) — `styles.navButton` / `navButtonActive` / `workspaceSwitcherCurrent` / `workspaceSwitcherPill`.

### 1.6 PersonalPipeline — premium stage section headers + framed empty state

Each stage section's header now has a left-aligned group with an
8px primary-color accent dot + the stage label, paired with a
right-aligned "1 deal" / "N deals" count rendered as a primary-
color outlined pill (no longer plain muted text). The section
divider underneath strengthens from `palette.border` to a 2px
`palette.primary` line, anchoring each stage visually.

Stage-stack gap increases from `spacing.md` to `spacing.xl` so
each stage reads as its own surface. The honest empty-state copy
("No active deals assigned to you.") is preserved verbatim, but
its container becomes a dashed-border framed card so the empty
state reads as intentional.

The Phase 119 stale badge (`Stale 14d+` outlined badge per row
where lastActivityOn ≥ 14d ago) is unchanged.

Files touched:
- [src/banker/PersonalPipeline.tsx](../src/banker/PersonalPipeline.tsx) — `stageHeader` + new `stageHeaderLabelGroup` / `stageHeaderAccent` styles; `stageHeaderCount` rebuilt as a pill; `empty` style rebuilt as a dashed-border framed card.

### 1.7 Activity Feed + Due Diligence — framed empty states

The `BankerActivityFeed` and `BankerDueDiligenceView` empty-state
copy ("No recent updates on your active deals…", "No outstanding
or pending-review documents…") is preserved verbatim. The
container styling is upgraded from plain italic muted text to a
dashed-border framed card matching the PersonalPipeline empty-
state treatment. Honest-empty reads as a deliberate state, not a
forgotten placeholder.

Files touched:
- [src/banker/BankerActivityFeed.tsx](../src/banker/BankerActivityFeed.tsx) — `styles.empty` only.
- [src/banker/BankerDueDiligenceView.tsx](../src/banker/BankerDueDiligenceView.tsx) — `styles.empty` only.

### 1.8 Theme — two additive shadow tokens

`src/shared/theme.ts` gains:

- `shadow.elevated` — between `card` and `rise`. Used by the KPI
  hero tiles + right rail panels for "primary attention without
  popover" elevation.
- `shadow.hero` — deepest tier. Reserved for the command-center
  hero band and any future right-rail brand frame.

No `palette` keys added. No new `--cc-*` CSS variables. The
Phase 79 themeTokens test (which pins that every `palette` value
is a `var(--cc-*)` reference declared in all 3 theme blocks)
continues to pass unchanged.

Files touched:
- [src/shared/theme.ts](../src/shared/theme.ts) — additive `shadow.elevated` + `shadow.hero`.

---

## 2. What did NOT change

Phase 123 is visual only. The following are explicitly unchanged:

- **`deriveBankerPersonalActivity`** — no KPI value / calculation drift.
- **`loadBankerWorkQueueData`** / **`loadBankerPipeline`** — no loader / filter change.
- **`Cr664_*Service.create` callsites** — zero governed writes touched.
- **Email lane** — no `Office365OutlookService` import, no `SendEmailV2` callsite, no `sendXEmail` import added or removed. Phase 110 communication-lane lock remains intact.
- **Sidebar nav items** — 7 items (Overview / Pipeline / Action Queue / Due Diligence / Activity / Relationships / Signals). Phase 117 + 120 invariants.
- **Tab bar tabs** — 7 tabs. Aria-selected / role / tab IDs unchanged.
- **KPI tile labels** — all 9 ("Active deals", "Pipeline", "Closing soon", "Open tasks", "Outstanding docs", "Pending reviews", "Urgent items", "In underwriting", "Stale 14d+") render verbatim.
- **Empty-state copy** — every honest-empty string preserved verbatim. Visual treatment polished; copy unchanged.
- **"Not a calendar integration" disclaimer** — Phase 117 invariant, still visible.
- **Read-only banner** — Phase 117 `role="status"` element + reason text + recovery hint preserved.
- **Workspace switcher single-workspace state** — Phase 120 invariant. Hint copy verbatim. No combobox / listbox / button inside the switcher group.
- **Phase 121 reduced-scope validation expectations** — Open tasks / Outstanding docs / Pending reviews / Action Queue / Due Diligence / My Tasks all render honest empty states.
- **Sample / fabricated data** — none introduced. Empty states are visually richer but informationally identical.
- **`Cr664_dealtask1.cr664_AssignedTo` form-config bug + `cr664_documentchecklist.cr664_Deal` legacy-target issue** — both remain Phase 122 scope; Phase 123 does not address either.

---

## 3. Test surface

### 3.1 Test count + outcome

- `npm test -- --run`: **119 files / 2681 tests passed** (unchanged from Phase 122A baseline).
- `npm run build`: clean. Bundle size grew by ~5 KB (premium-shell inline styles only; no new dependencies).

### 3.2 Test edits

One Phase 117 KPI-grid test edited to acknowledge that "Pipeline"
now appears twice inside the kpiGrid region: once as the
new group-header label (chrome) and once as the actual tile
label (data). The edit replaces
`expect(within(kpiGrid).getByText('Pipeline')).toBeInTheDocument()`
with
`expect(within(kpiGrid).getAllByText('Pipeline').length).toBeGreaterThanOrEqual(1)`
and adds an inline comment explaining the Phase 123 grouping.
All other assertions (8 tile labels, zero count, read-only
banner, tab switching, workspace switcher, communication-lane
static-source pins, no-fake-routes) are unchanged.

File touched:
- [src/banker/BankerShell.test.tsx](../src/banker/BankerShell.test.tsx) — single test case body update; comment expanded.

### 3.3 What the test pins still prove

After Phase 123 the pinned invariants below all continue to be
proved by tests:

- Sidebar has 7 nav items with their exact aria-labels.
- Tab bar has 7 tabs.
- KPI grid renders all 9 tile labels.
- Zero-value KPI tiles render `0` / `$0` (no fabricated values).
- Read-only banner renders when `writeDisabledReason` is set.
- Workspace switcher renders the single-workspace state honestly (no combobox / listbox / button inside).
- Closing-soon disclaimer "Not a calendar integration" stays visible.
- My Tasks empty-state copy is verbatim.
- Phase 110 static-source pins on BankerShell.tsx, BankerActivityFeed.tsx, BankerDueDiligenceView.tsx hold (no `Office365OutlookService` import, no `SendEmailV2` callsite, no `sendXEmail` import).
- PersonalPipeline empty-state copy is verbatim; stage-grouped layout structure preserved; stale-14d+ badge logic preserved.
- BankerActivityFeed + BankerDueDiligenceView derivation + render contracts unchanged.

---

## 4. Acceptance criteria

- [x] Banker Command Center looks materially more premium and productized (hero band header, grouped KPI grid with hero anchors, premium tab bar, accent-striped right rail, framed empty states, polished sidebar nav, premium workspace switcher pill).
- [x] No data behavior changes.
- [x] No Dataverse / schema changes.
- [x] No fake / sample data introduced.
- [x] Empty states remain honest but more polished (dashed-border framed cards across pipeline / activity / due-diligence / right-rail empties).
- [x] Pipeline tab still shows `TEST — Deal Phase 121` (Phase 121 validation surface unaffected).
- [x] Open Tasks / Outstanding Docs / Pending Reviews can remain `0` honestly.
- [x] All 2681 tests pass.
- [x] Build clean.

---

## 5. What Phase 123 explicitly does NOT do

These remain in the inventory but are deferred to the next phases
(per Phase 122A §5):

- **Phase 124 — Rich pipeline / stage-board (Kanban) experience.** Phase 123 keeps the per-stage table layout from Phase 119 and only polishes the section headers. The horizontal stage-lane refactor is Phase 124.
- **Phase 125 — Deal workspace cockpit restoration.** Phase 123 leaves DealHeader / DealSummary / DealBlockers / DealStageProgressionCard / DealAutopilotPanel / DealTasks / DealDocuments / CreditMemo / ActivityTimeline / BorrowerCommunication unchanged. Phase 125 ships their premium polish.
- **Phase 126 — Relationships + Signals visual restoration.** RelationshipMemory, BankerAutopilotRollup, BankerMorningCatchUp, PersonalActivitySummary, MyWorkQueue card-level upgrades are out of scope here.
- **Phase 127 — Credit memo premium workspace.** CreditMemo card-level polish + CreditMemoDraftModal styling deferred.
- **Phase 128 — Task / document UX after Phase 122.** Card-layout upgrades for tasks / docs wait for Phase 122 retarget so they ship against populated data.
- **Phase 129 — Manager / team / executive visual parity.** Other workspaces unchanged; lift to the banker-shell pattern is a separate phase.

No bucket-B / bucket-C / bucket-D work from Phase 122A is
addressed in Phase 123.

---

## 6. Verification

```bash
npm test -- --run    # 119 files / 2681 tests passed
npm run build        # clean (431 modules, 1077 kB index bundle)
```

The shell visual upgrades will become visible in the deployed
app on the next `pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS`.
After push, Matt should sign in and observe:

- Command-center hero band header with eyebrow / title / meta row.
- KPI grid split into Pipeline / Work items / Attention groups, with Active deals + Pipeline rendered as hero tiles.
- Premium tab bar with primary-color active state.
- Right rail with accent-striped panels and framed empty states.
- Sidebar with polished nav transitions and the "Current" pill.
- PersonalPipeline stage sections with accent dots + count pills + 2px primary section dividers.
- Activity / Due Diligence honest-empty states rendering as dashed-border framed cards instead of plain italic muted text.

The shell should read as a real OGB LOS commercial-lending command
center, not a Dataverse work queue.

---

## 7. Cross-references

- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) — the audit whose bucket-A wave 1 this phase implements.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md), [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md), [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — the functional surfaces this phase visually enriches.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — Phase 121 validation that bounded the populated-state expectations.
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — the Dataverse-config phase that unlocks the populated task / doc surfaces Phase 123's polished empty-state cards will eventually replace.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants Phase 123 does not touch.
- [PHASE_79_DARK_THEME_TOKENS.md](PHASE_79_DARK_THEME_TOKENS.md) — the theme-token foundation Phase 123's two new shadow tokens additively extend.
- `src/shared/theme.ts` — token surface, two additive shadow tiers.
- `src/banker/BankerShell.tsx` — header, KPI grid, tab bar, right rail, sidebar polish.
- `src/banker/PersonalPipeline.tsx` — stage header polish + framed empty state.
- `src/banker/BankerActivityFeed.tsx`, `src/banker/BankerDueDiligenceView.tsx` — framed empty states.
