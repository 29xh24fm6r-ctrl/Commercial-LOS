# Phase 125D — Bloomberg / Apple Deal Cockpit Redesign

**Status:** **Shipped.** Visual / composition redesign of the
Banker Deal Workspace into a Bloomberg-Terminal-meets-Apple-
Enterprise-meets-Microsoft-Fluent commercial-lending cockpit.
Phase 125B established the navy command hero + two-column
cockpit grid; Phase 125C added the cobalt / teal / cyan /
violet accent palette + stage rail + severity glyphs + hero
glow + right-column glass overlay; Phase 125D promotes the
workspace from "premium card stack" to a fully instrumented
**operating cockpit** with a fixed KPI deck, profile-
completeness ring, workstream bars, severity meters, a
connected-node stage map, and an action-console priority
strip — all derived from authorized records, all read-only,
all honestly empty when there's no data.

**No Dataverse schema changes. No new loaders. No new governed
writes. No fake data. No fake AI. No predictive / approval-
odds / ranking language. No email-lane changes.** The Phase
125 hook hoist in `DealAutopilotPanel` (the React error #310
fix) is preserved verbatim.

Related canonical sources:
- [PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md](PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md) — the accent palette + glyphs + stage rail + glass overlay that Phase 125D builds on.
- [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md) — the navy command hero + glass metric strip + two-column cockpit layout Phase 125D inherits.
- [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — the foundational cockpit upgrade + the React error #310 hotfix. The `useSuggestionLedger()` hoist is preserved unchanged.
- [PHASE_79_THEME_TOKEN_FOUNDATION.md](PHASE_79_THEME_TOKEN_FOUNDATION.md) — the `--cc-*` CSS-variable system Phase 125D extends with cockpit-surface tokens (`panelBg` / `deckBg` / `deckTile` / `glassPanel` / `panelBorder`).
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants Phase 125D honors. Static-source pins on every Phase 125D file assert the lock.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — the seeded `TEST — Deal Phase 121` whose sparse shape the cockpit specifically tests against (every metric tile renders an honest "Not set" and the meter readout lists every tracked field as missing).

---

## 1. What changed

### 1.1 Theme — cockpit-surface tokens

Five new `--cc-*` variables under [src/index.css](../src/index.css) and exposed on
`palette` via [src/shared/theme.ts](../src/shared/theme.ts) (light + dark + `[data-theme="dark"]` blocks):

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--cc-panel-bg` / `palette.panelBg` | `#eef2f7` | `#0c1018` | Cockpit page backdrop — the slate "platform" the deal panels sit on. |
| `--cc-panel-border` / `palette.panelBorder` | `#d8dee8` | `#232938` | Panel hairline border. |
| `--cc-deck-bg` / `palette.deckBg` | `#f8fafc` | `#14171f` | KPI deck surface. |
| `--cc-deck-tile` / `palette.deckTile` | `#ffffff` | `#1b1f2b` | Individual KPI tile background. |
| `--cc-glass-panel` / `palette.glassPanel` | `rgba(248, 250, 252, 0.78)` | `rgba(31, 36, 50, 0.72)` | GlassPanel sub-panel (next-action command strip, attention console halo). |

And a new `shadow.deck` token:

```ts
deck: '0 1px 0 rgba(255, 255, 255, 0.55) inset, 0 1px 3px rgba(15, 23, 42, 0.08)',
```

Used by KPI tiles + the deck shell so the cockpit feels embedded into the slate panel rather than floating on a page background.

### 1.2 deriveDealCockpitMetrics() — pure-function deriver

[src/deals/dealCockpitMetrics.ts](../src/deals/dealCockpitMetrics.ts)
introduces a single deterministic function that turns the
DealDataProvider slots (`deal`, `tasks`, `documents`,
`creditMemo`, `activity`) into every value the cockpit renders:

- **`loanAmount`** + **`targetCloseIso`** + **`daysToClose`** + **`daysInStage`** — pulled from DealDetail, days arithmetic relative to `now`.
- **`profileCompletenessPct`** + **`populatedFieldCount`** + **`totalFieldCount`** + **`missingFieldLabels`** — derived against a documented `PROFILE_COMPLETENESS_FIELDS` catalog (13 schema-actual fields). Whitespace-only strings are treated as missing.
- **`taskOpenCount`** / **`taskOverdueCount`** / **`taskCompletedCount`** — task counts; overdue is `dueDate < now`.
- **`docOutstandingCount`** / **`docReceivedCount`** / **`docReviewedCount`** — document counts.
- **`memoState`** + **`memoCount`** — the highest-tier memo state present: `final > borrower-safe > draft > stale > unknown > none`.
- **`communicationState`** + **`rightRail.communicationEvents`** + **`lastTouchedIso`** + **`daysSinceLastTouched`** — communication-event count from the activity timeline (`EmailLogged` / `BorrowerUpdateSent` / `CallLogged` / `NoteLogged` / `MeetingLogged`).
- **`rightRail.{tasksOpen, documentsOutstanding, memos, communicationEvents}`** — count-badge values for right-rail card headers.

The deriver is **pure** — no SDK service imports, no governed
writes, no Office365 references. Pinned by a static-source
assertion in the Phase 125D test suite.

### 1.3 Shared visual primitives (`src/shared/cockpitPrimitives.tsx`)

Six composable primitives in one module:

| Primitive | Role |
| --- | --- |
| `MetricTile` | Compact KPI tile: tiny uppercase label + bold value + optional sub + tonal accent stripe (`info` / `clear` / `atRisk` / `blocked` / `neutral`). Honest "Not set" italic fallback. |
| `CompletenessRing` | Inline-SVG circular progress ring for profile completeness. Tonal ring color derived from percentage (≥80 clear, ≥50 info/cobalt, ≥25 atRisk, else blocked). |
| `WorkstreamBar` | Horizontal mini progress bar with `done / total` numerator+denominator. Tone derived from ratio: `clear` at 100%, `atRisk` at 0%, `info` in between, `neutral` when nothing is tracked. |
| `CountBadge` | Tonal count pill for right-rail card-header trailing slots. |
| `SeverityMeter` | Horizontal severity-bucket tile strip (e.g. `Blocked / At-risk / Clear` for Attention Console; `High / Medium / Low` for Action Console). Zero counts render as muted tiles so the strip is a fixed instrument bar. |
| `GlassPanel` | Translucent inner panel wrapper for command strips / next-action guidance. |

Every primitive uses only theme tokens. Severity icons remain
the shared Phase 125C `SeverityGlyph`.

### 1.4 DealMetricDeck — Bloomberg-style KPI strip

[src/deals/DealMetricDeck.tsx](../src/deals/DealMetricDeck.tsx)
is the new zone between the navy command hero and the cockpit
grid. Composition:

```
┌──────────────────────────────────────────────────────────┐
│  ╭──╮  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
│  │██│  │Amt │ │TClo│ │D-Stg│ │Blkr│ │Tasks│ │Docs│ │Memo│  │
│  ╰──╯  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘   │
│ Ring   8 KPI tiles                                       │
│                                                          │
│  MISSING FIELDS — Industry · Guarantor · Pricing         │
└──────────────────────────────────────────────────────────┘
```

Eight tiles always render in the same order:

1. **Loan amount** — `$2,500,000` or "Not set" italic.
2. **Target close** — formatted date + "in 12d / today / 8d past" sub.
3. **Days in stage** — `0d` / `42d` / "—" honestly.
4. **Blockers** — overdue tasks + outstanding documents combined count + sub.
5. **Tasks** — open count + overdue sub.
6. **Documents** — outstanding count + received sub.
7. **Credit memo** — `Final` / `Borrower safe` / `Draft` / `Stale` / "Not set" + version count sub.
8. **Last touched** — relative time + communication event count sub.

The profile-completeness ring sits on the left and reports the
populated/tracked ratio as an honest percentage. The missing-
fields readout lists every tracked profile field that is not
populated — never a "deal score" / "approval probability" /
"predicted close date" claim.

### 1.5 DealWorkstreamPanel — workstream bars

[src/deals/DealWorkstreamPanel.tsx](../src/deals/DealWorkstreamPanel.tsx)
renders four horizontal mini progress bars summarizing the four
workstreams the deal must complete on its way to funding:

- **Tasks** — completed/total ratio; tone `atRisk` when any open task is overdue.
- **Documents** — received+reviewed / total ratio; tone `clear` when zero outstanding.
- **Credit memo** — state index in the canonical progression (`none → draft → borrower-safe → final`, max 3); stale renders at the draft index.
- **Communication** — event count capped at a small reference scale; tone `atRisk` when the last event is ≥14 days ago.

Each bar's detail line surfaces the honest underlying count
("2 outstanding · 3 received · 1 reviewed", "No documents
tracked", etc.). Read-only; never writes, never sends, never
advances stage.

### 1.6 BankerDealWorkspace — cockpit zone shell

[src/deals/BankerDealWorkspace.tsx](../src/deals/BankerDealWorkspace.tsx)
gains `data-cockpit-zone="..."` attributes on every major
region so the cockpit shell reads as a named instrument panel:

- `command-hero` — Phase 125B navy hero band.
- `metric-deck` — Phase 125D KPI strip + ring + missing fields.
- `grid` — the two-column cockpit grid wrapper.
- `intelligence-column` — left ~65% column: Attention Console + Stage Map + Action Console + Workstream Panel + Deal Summary + Relationship Context + Credit Memo + Activity Timeline.
- `right-rail-dashboard` — right ~35% column: Tasks + Documents + Borrower Communication + Teams Chat handoff + Teams Deal Summary handoff.

The page background flips from `pageBg` to the new `panelBg`
slate cockpit backdrop so the deal panels read as instruments
mounted on a platform, not as cards floating on white.

**DealBlockers moves from the right column to the left column
"Attention Console" position** so the cockpit's "what needs
attention" + "what stage are we in" + "what to do next" reads
as one continuous decision panel, with the right rail
specializing as the work-surfaces / handoff dashboard.

Every Phase 80 / 96 `data-deal-card="..."` anchor used by the
DealAutopilotPanel `scrollIntoView` is preserved verbatim. The
sparse Phase 121 seed still renders the entire shell without
the React error #310 (the Phase 125 hook hoist in
DealAutopilotPanel is unchanged).

### 1.7 DealBlockers → Attention Console

[src/deals/DealBlockers.tsx](../src/deals/DealBlockers.tsx)
keeps its derivation (deriveBlockers + deriveCreditMemoFreshness)
verbatim and adds:

- Card title renamed from "Deal Blockers" to **"Attention Console"** with subtitle "Severity-bucketed signals from authorized records — never AI."
- `SeverityMeter` header strip: three always-rendered tiles (Blocked / At-risk / Clear) with counts. The console reads as a fixed instrument bar; zero counts still render as muted tiles.
- Clear-state copy wraps in a `GlassPanel` so it reads as a calm panel, not a fading paragraph.
- Severity glyphs on signal rows preserved from Phase 125C.

### 1.8 DealStageProgressionCard → Stage Map

[src/deals/DealStageProgressionCard.tsx](../src/deals/DealStageProgressionCard.tsx)
replaces the Phase 125C horizontal pill rail with a **connected-
node stage map**:

- Each canonical non-terminal STAGE_CATALOG stage is a circular
  numbered node with the stage label below.
- Horizontal connector lines render between consecutive nodes:
  past-to-past = solid green, past-to-current = green→cobalt
  gradient, future = dashed neutral.
- The current node is sized up (32px vs 28px), painted cobalt,
  and given a 4px cobalt halo + `aria-current="step"`.
- Custom-stage fallback (Phase 121 sparse-seed path, where the
  live stage name doesn't match the canonical catalog) renders
  every node in the muted future tone + the italic
  "custom stage — not in canonical sequence" footnote, so the
  banker still sees the canonical landmarks without the cockpit
  fabricating progression state.
- The "Next action guidance" block wraps in a `GlassPanel` with
  a thicker severity-tinted left edge so it reads as a cockpit
  command strip, not a faint paragraph.

Card title renamed from "Stage Progression Guard" to **"Stage Map"**.

### 1.9 DealAutopilotPanel → Action Console

[src/deals/DealAutopilotPanel.tsx](../src/deals/DealAutopilotPanel.tsx)
gains a priority-bucket `SeverityMeter` header (High / Medium /
Low, always three tiles, zero counts included). Card title
renamed to **"Action Console"** with subtitle "Deterministic
next-best actions — derived from authorized records. Banker
decides." All Phase 125C priority-stripe colors + the Phase
125 hook hoist preserved unchanged.

### 1.10 DealSummary — grouped metric sections

[src/deals/DealSummary.tsx](../src/deals/DealSummary.tsx) replaces
the Phase 80 single-grid `<dl>` with three tonal "deck
sections":

- **Identity** (cobalt left stripe): product type / loan structure / customer type / industry.
- **Pricing** (teal left stripe): pricing type / spread index + margin (combined).
- **Structure** (violet left stripe): guarantor structure / created date.
- **Collateral** — long-form narrative below the three sections, divider above. Italic "Not provided" when unset.

Each section reads as a labeled cockpit module. Missing values
keep the italic "Not provided" treatment — Phase 125B/C/D's
honest-absence rule.

### 1.11 Right-rail count badges

`DealTasks` and `DealDocuments` CardHeader trailing slots now
carry a tonal `CountBadge`:

- **Tasks**: open-task count; tone `atRisk` when any open task is overdue, `clear` when zero open, `info` otherwise.
- **Documents**: outstanding-doc count; tone `atRisk` when any outstanding, `clear` when none.

`BorrowerCommunication` and `CreditMemo` already use the
trailing slot for action buttons (Phase 105 borrower update +
borrower-safe packet, Phase 73 memo modal) — their count
information is surfaced inside the card body subtitle rather
than as an additional badge, to avoid colliding with the
governed-write affordances.

### 1.12 What did NOT change

- **No new Dataverse loaders, mutators, or governed writes.** Read-only visual phase.
- **No email-lane edits.** `Office365OutlookService` / `SendEmailV2` / `sendXEmail` callsites untouched. Phase 110 lock honored.
- **No derivation changes.** `deriveStageProgressionEligibility`, `deriveBlockers`, `deriveNextBestActions`, `deriveCreditMemoFreshness`, and every other pure-function derivation is unchanged.
- **No fake data, scores, approval odds, AI claims, or predictive close-date language.**
- **No `Card.tsx` change.** Shared primitive untouched so manager / team / executive workspaces don't shift before Phase 129.
- **Phase 125 hotfix** (`useSuggestionLedger()` hoist) preserved.

---

## 2. Test surface

### 2.1 New test files

[src/deals/dealCockpitMetrics.test.ts](../src/deals/dealCockpitMetrics.test.ts)
— 16 cases pinning the pure-function deriver:

| Block | Cases |
| --- | --- |
| Profile completeness | 4 cases: tracked-field denominator, 100% on full deal, 0% + every field listed missing on sparse deal, whitespace-only treated as missing. |
| Days arithmetic | 3 cases: forward delta on future target, negative delta on past target, undefined when source dates are unset. |
| Task counts | 2 cases: counts honest + overdue flagged; loading slot returns zero, never a fake "1 open". |
| Memo state | 4 cases: none / draft / borrower-safe (overrides draft) / final. |
| Communication state | 3 cases: unknown (loading) / none (empty) / has-events (real event). |

[src/deals/phase125DCockpitDeck.test.tsx](../src/deals/phase125DCockpitDeck.test.tsx)
— 13 component-level cases:

| Block | Cases |
| --- | --- |
| DealMetricDeck (populated) | 4 cases: completeness ring at 100%, 8 tonal KPI tiles render, "no missing fields" copy, region aria-label. |
| DealMetricDeck (sparse) | 3 cases: italic "Not set" inside every empty tile, every tracked field listed in the missing-fields readout, completeness ring at 0%. |
| DealWorkstreamPanel | 2 cases: 4 workstream bars render, honest "No tasks / no docs / no memo / no comms" detail on sparse seed. |
| DealBlockers Attention Console | 2 cases: card title is "Attention Console", severity meter renders 3 tiles. |
| DealAutopilotPanel Action Console | 2 cases: card title is "Action Console", priority meter renders 3 tiles labeled high/medium/low. |

[src/deals/phase125DCockpitIntegration.test.tsx](../src/deals/phase125DCockpitIntegration.test.tsx)
— 8 integration + static-source-pin cases:

| Block | Cases |
| --- | --- |
| Cockpit integration | 3 cases: sparse Phase 121 deal mounts with the metric-deck region; no Phase-110 communication-lane vocabulary leaks into the cockpit shell; no fake AI / approval-odds / predictive / ranking / deal-score language anywhere. |
| Source-file static pins | 5 cases: cockpit shell has no `Office365OutlookService` import, no `SendEmailV2` callsite; metric deck has no email-send imports; workstream panel has no email-send imports; deriver is pure (no SDK service imports). |

### 2.2 Updated tests

[src/deals/BankerDealWorkspace.test.tsx](../src/deals/BankerDealWorkspace.test.tsx)
— the existing Phase 125B "intelligence cards in LEFT column /
attention cards in RIGHT column" case is updated to reflect the
Phase 125D zone repositioning: `card-deal-blockers` is now
asserted in the LEFT column (Attention Console). New mock
declarations for the `DealMetricDeck` and `DealWorkstreamPanel`
zone components are added to the existing stub set.

[src/deals/phase125CCockpitVisuals.test.tsx](../src/deals/phase125CCockpitVisuals.test.tsx)
— "canonical stage progression rail" aria-label assertions
updated to "canonical stage progression map" to match the
Phase 125D StageMap rename. Every other Phase 125C invariant
(StageMap canonical labels render, current stage gets
aria-current="step", custom-stage fallback footnote, severity
glyphs on signal rows, priority stripe color in autopilot)
passes unchanged.

[src/deals/phase125CCockpitLayout.test.tsx](../src/deals/phase125CCockpitLayout.test.tsx)
— Phase 125C right-rail liquid-glass overlay assertion still
passes (Phase 125D bumped the cobalt rgba slightly but the
matcher tolerates whitespace inside the rgba tuple).

### 2.3 Test count

- **Before Phase 125D:** 47 deals files / 655 deals tests.
- **After Phase 125D:** 50 deals files / 692 deals tests (+37: 16 in `dealCockpitMetrics.test.ts`, 13 in `phase125DCockpitDeck.test.tsx`, 8 in `phase125DCockpitIntegration.test.tsx`).

---

## 3. Acceptance criteria

- [x] Deal workspace visually resembles a high-tech operating cockpit, not a newsletter — implemented via the slate panel backdrop + KPI deck + ring + workstream bars + severity meters + connected-node stage map + glass command strip.
- [x] There is a clear KPI deck — 8 tiles always in order, between the hero and the cockpit grid.
- [x] There are real visual graphics — completeness ring, workstream bars, stage map nodes/connectors, severity meter tiles, action-console priority strip.
- [x] There is more color — cobalt (current stage / medium priority / info tiles), teal (low priority / pricing accent), violet (structure accent), at-risk (high priority / overdue), clear (complete), with slate cockpit backdrop unifying the surface.
- [x] Right rail feels useful and alive — Tasks and Documents card headers carry tonal count badges; the right-rail-dashboard zone has its own data-cockpit-zone attribute.
- [x] Sparse data remains honest — every tile shows italic "Not set" for missing values; every tracked profile field shows up in the missing-fields readout; workstream bars show "No tasks recorded" / "No documents tracked" / "No memo records yet" / "No communication events recorded yet".
- [x] No fake scores, predictions, AI, approval odds, or fabricated rows — pinned by Phase 125B / 125C / 125D DOM-scan + static-source assertions.
- [x] Phase 110 communication lane lock honored — pinned by static-source asserts on cockpit shell + metric deck + workstream panel + deriver.
- [x] Phase 125 hook hoist preserved — both Phase 125 regression tests still pass.
- [x] All tests pass (50 deal files / 692 deal tests; 126 total files / 2773 total tests).
- [x] Build clean.

---

## 4. Out of scope (deferred)

- **No bundle-splitting / code-splitting for the new cockpit modules** — Phase 125D adds visual primitives and one deriver; the bundle warning that fires on >500KB chunks was already there pre-125D (and is unchanged in posture).
- **No mobile-collapse breakpoint** beyond Phase 125B's `minmax(0, ...)` grid rebalance.
- **No new charting library**. Every "chart" is inline SVG / CSS — no recharts, no nivo, no d3.
- **No `Card.tsx` primitive change.** Shared primitive untouched.
- **No manager / team / executive / admin cockpit polish.** Phase 129 still owns role-parity polish.

---

## 5. Verification

```bash
npm test -- --run    # 126 files / 2773 tests pass
npm run build        # clean
```

Visual observation against the seeded `TEST — Deal Phase 121`
deal (after the next `pac code push`):

- Page paints a slate panel backdrop; the navy command hero,
  the new metric deck, and the cockpit grid sit on top of it.
- KPI deck renders 8 tiles. Loan amount / target close /
  credit memo / last touched all read italic "Not set". Days-
  in-stage shows "—" honestly. The profile-completeness ring
  reads 0% (the sparse seed populates only the name + isClosed).
- Missing-fields readout lists every tracked field separated
  by " · ".
- Attention Console renders a 3-tile severity meter strip
  (blocked / at-risk / clear) with the count of each. The
  signal rows below show the Phase 125C severity glyphs.
- Stage Map renders the 9 canonical non-terminal nodes with
  muted-future connectors (the seed's custom stage isn't in
  the catalog), plus the italic custom-stage footnote.
- Action Console renders the priority meter (High / Medium /
  Low) with the count of suggestions per priority — empty on
  the sparse seed.
- Workstream Panel renders 4 mini bars: tasks / documents /
  memo / communication. All read "No tasks recorded" / "No
  documents tracked" / "No memo records yet" / "No
  communication events recorded yet" honestly.
- Right rail: Tasks card header carries a `clear` count badge
  reading 0; Documents card header carries a `clear` count
  badge reading 0.

---

## 6. Cross-references

- [PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md](PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md)
- [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md)
- [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md)
- [PHASE_79_THEME_TOKEN_FOUNDATION.md](PHASE_79_THEME_TOKEN_FOUNDATION.md)
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md)
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md)
- `src/shared/theme.ts`, `src/index.css` — cockpit-surface tokens.
- `src/shared/cockpitPrimitives.tsx` (new) — MetricTile / CompletenessRing / WorkstreamBar / CountBadge / SeverityMeter / GlassPanel.
- `src/deals/dealCockpitMetrics.ts` (new) — pure-function metric deriver.
- `src/deals/DealMetricDeck.tsx` (new) — Bloomberg-style KPI strip.
- `src/deals/DealWorkstreamPanel.tsx` (new) — workstream mini bars.
- `src/deals/BankerDealWorkspace.tsx` — cockpit zone shell.
- `src/deals/DealHeader.tsx` — navy command hero (preserved from Phase 125B/C).
- `src/deals/DealSummary.tsx` — grouped metric sections.
- `src/deals/DealBlockers.tsx` — Attention Console.
- `src/deals/DealStageProgressionCard.tsx` — Stage Map.
- `src/deals/DealAutopilotPanel.tsx` — Action Console.
- `src/deals/DealTasks.tsx`, `src/deals/DealDocuments.tsx` — right-rail count badges.
- `src/deals/dealCockpitMetrics.test.ts` (new) — 16 deriver unit cases.
- `src/deals/phase125DCockpitDeck.test.tsx` (new) — 13 component-level invariants.
- `src/deals/phase125DCockpitIntegration.test.tsx` (new) — 8 integration + static-source pins.
