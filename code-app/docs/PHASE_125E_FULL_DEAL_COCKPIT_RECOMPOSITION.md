# Phase 125E — Full Deal Cockpit Recomposition

**Status:** **Shipped.** This is a corrective design phase.
Phase 125D added cockpit primitives and a KPI strip but the
deployed result still read as stacked enterprise cards. Phase
125E recomposes the deal workspace layout itself: it does not
just style the existing surfaces, it changes the page
composition around the reference cockpit pattern.

**No Dataverse schema changes. No new loaders. No new governed
writes. No fake data. No fake AI / predictive / approval-odds
language. No email-lane changes.** The Phase 125 hook hoist in
`DealAutopilotPanel` (the React error #310 fix) is preserved
verbatim. The Phase 121 sparse seed renders honestly across
every new surface.

Related canonical sources:
- [PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md](PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md) — the foundation Phase 125E builds on (the deriver, the primitives, the slate cockpit surfaces). Phase 125D's components are extended / replaced where their visual scale was insufficient; the metric deriver is reused unchanged.
- [PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md](PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md), [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md), [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — predecessor visual phases.
- [PHASE_79_THEME_TOKEN_FOUNDATION.md](PHASE_79_THEME_TOKEN_FOUNDATION.md) — the `--cc-*` token system Phase 125E extends with a new `typography.size.display` scale.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — email-lane invariants Phase 125E honors. Pinned by static-source assertions on every Phase 125E file.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — the seeded `TEST — Deal Phase 121` whose sparse shape the recomposed cockpit specifically tests against.

---

## 1. The diagnosis Phase 125E is responding to

Phase 125D added primitives but the deployed result still felt
like:

- thin white enterprise cards
- tiny text
- low visual contrast
- weak charts
- weak graphics
- no real command-center drama

The reference screenshot the user provided shows a different
class of UI:

- dark product shell energy
- big readable command header
- high-density KPI tiles
- strong iconography
- colorful numeric states
- action queue as a primary operating module
- right-side operational rail
- clear widget hierarchy

The fix is **architectural**, not incremental: the deal page
needs to be recomposed around the reference, not styled on top
of the current layout.

---

## 2. What changed

### 2.1 Theme — display-scale typography

[src/shared/theme.ts](../src/shared/theme.ts) gains a new
`typography.size.display = '2.4rem'` token so the cockpit's
primary KPI values + command-hero deal name read at a glance.
The Phase 125D theme tokens (panelBg / deckBg / deckTile /
glassPanel / panelBorder + shadow.deck) are preserved.

### 2.2 Inline-SVG icon library

[src/shared/cockpitIcons.tsx](../src/shared/cockpitIcons.tsx)
ships 16 stroke-only feather-style glyphs (`DollarIcon`,
`AlertIcon`, `ChecklistIcon`, `DocumentsIcon`, `MailIcon`,
`CalendarIcon`, `ActivityIcon`, `StageIcon`, `BankerIcon`,
`ClientIcon`, `SparkleIcon`, `MemoIcon`, `TeamsIcon`,
`CompletenessIcon`, `PipelineIcon`, `RelationshipIcon`) plus an
`IconChip` halo wrapper. No icon-font dependency; one factory
file, only the shapes the cockpit needs.

### 2.3 New visual primitives — LargeMetricTile + WidgetHeader

[src/shared/cockpitPrimitives.tsx](../src/shared/cockpitPrimitives.tsx)
gains two centerpiece primitives:

- **`LargeMetricTile`** — the Phase 125E KPI tile. ~140px tall, display-scale value typography, optional icon halo, tone-driven top accent stripe (info-cobalt / clear-green / atRisk-amber / blocked-red / neutral, plus the new `'violet'` and `'teal'` for premium accents). Honest "Not set" italic fallback when value is undefined.
- **`WidgetHeader`** — the operational-widget header. Bold icon halo + title + optional one-line subtitle + optional count badge + optional mini progress bar. Replaces `CardHeader` on the cockpit's right-rail widgets so each one reads as a distinct operating widget instead of a paragraph-style card.

### 2.4 DealMetricDeck — six large tiles + completeness ring

[src/deals/DealMetricDeck.tsx](../src/deals/DealMetricDeck.tsx)
is rewritten. The Phase 125D 8-tile compact strip becomes:

```
┌────────────────────────────────────────────────────────────┐
│  ◯ Ring     ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│   75%       │  $   │ │  ✓   │ │  ⚠   │ │  ▤   │ │  📄  │   │
│  PROFILE    │ $2.5M│ │  13  │ │  1   │ │  0   │ │  0   │   │
│             │ Loan │ │Miss. │ │Block.│ │Tasks │ │ Docs │   │
│             │ amt  │ │      │ │      │ │      │ │      │   │
│             └──────┘ └──────┘ └──────┘ └──────┘ └──────┘   │
│                                                            │
│  + Target close tile (violet)                              │
│                                                            │
│  LAST TOUCHED 3d ago · COMMS 2 events · MEMO Draft         │
│  MISSING: Industry · Guarantor · Pricing                   │
└────────────────────────────────────────────────────────────┘
```

Six tiles always render in the same order: Loan amount,
Missing fields, Blockers, Tasks, Documents, Target close. The
ring sits on the left and surfaces profile completeness as a
populated-field ratio. The "Last touched / Comms / Memo /
Missing" footer collapses what used to be two separate Phase
125D tiles + the Phase 125D missing-fields chip strip into one
compact summary line.

### 2.5 DealHeader — Command Hero

[src/deals/DealHeader.tsx](../src/deals/DealHeader.tsx) is
rewritten. Phase 125B's glass metric strip is removed (those
values live in the KPI deck below the hero now). The new hero
focuses on deal identity:

- Eyebrow lockup: **"Commercial Lending Cockpit"** + a deal-id chip on the right.
- Display-scale `<h1>` deal name.
- Three identity slots: Client (with `ClientIcon`), Banker (with `BankerIcon`), Stage (with `StageIcon`). Each slot renders italic "Not set" / "Not assigned" when missing.
- Single status chip (Phase 125B's stage chip is now an identity slot, so the chip row carries only Status).

### 2.6 DealBlockers — Attention Console (centerpiece)

[src/deals/DealBlockers.tsx](../src/deals/DealBlockers.tsx) is
the cockpit's centerpiece module after Phase 125E:

- `WidgetHeader` with the `AlertIcon` + tonal halo + status badge.
- **Big severity meter** — three tiles (Blocked / At-risk / Clear), ~96px tall, display-scale count value, tonal background.
- **Missing-data checklist** — when the cockpit metrics show missing profile fields, the Attention Console renders a tinted amber-bordered block with the field names as pill chips (a scannable checklist).
- Signal rows with the Phase 125C `SeverityGlyph` chip and tinted background.

### 2.7 DealStageProgressionCard — large Stage Map

[src/deals/DealStageProgressionCard.tsx](../src/deals/DealStageProgressionCard.tsx)
keeps the connected-node concept but doubles every dimension:

- Nodes: 44px / 52px (current) vs Phase 125D's 28 / 32.
- Connector lines: 3px vs Phase 125D's 2px.
- Current node halo: 6px cobalt halo + soft elevated drop shadow.
- Numbers + labels move up a typography rung.
- `WidgetHeader` with `StageIcon`.

### 2.8 DealAutopilotPanel — Action Console (tight)

[src/deals/DealAutopilotPanel.tsx](../src/deals/DealAutopilotPanel.tsx)
gets a `WidgetHeader` with the `SparkleIcon` + a tonal action-
count badge (`atRisk` when any high-priority suggestion fires).
The conservative disclaimer is shortened from a paragraph to a
single sentence: *"Read-only. Never creates tasks, sends
emails, advances the stage, or calls AI."* Phase 125 hook
hoist preserved.

### 2.9 Right-rail widget headers

Every right-rail / detail card now uses `WidgetHeader` instead
of `CardHeader`:

| Card | Icon | Tone | Count |
| --- | --- | --- | --- |
| Tasks (`DealTasks.tsx`) | `ChecklistIcon` | atRisk / clear / info | open count |
| Documents (`DealDocuments.tsx`) | `DocumentsIcon` | atRisk / clear | outstanding |
| Borrower Communication (`BorrowerCommunication.tsx`) | `MailIcon` | info | filtered events |
| Credit Memo (`CreditMemo.tsx`) | `MemoIcon` | violet | memo versions |
| Activity Timeline (`ActivityTimeline.tsx`) | `ActivityIcon` | teal | event count |
| Teams Chat (`TeamsChatHandoff.tsx`) | `TeamsIcon` | violet | — |
| Teams Deal Summary (`TeamsDealSummaryHandoff.tsx`) | `TeamsIcon` | violet | — |

Tasks + Documents additionally render the `progress` mini bar
inside the WidgetHeader (completed/total ratio) so the widget
reads as alive at a glance even when there's nothing else
visible.

### 2.10 DealSummary — compact + demoted

[src/deals/DealSummary.tsx](../src/deals/DealSummary.tsx)
collapses Phase 125D's three tonal sections into a single
compact key/value table, gets a `WidgetHeader` with the
`MemoIcon`, and **moves to the BOTTOM of the left column** in
[BankerDealWorkspace.tsx](../src/deals/BankerDealWorkspace.tsx)
so it stops dominating the page. The Attention Console + Stage
Map + Action Console + Workstream Panel + Relationship Context
+ Credit Memo + Activity Timeline now precede it.

### 2.11 Reduced text walls

- `DealAutopilotPanel` disclaimer: from ~3 sentences to 1.
- `DealWorkstreamPanel` subtitle: from "Derived from authorized records — never AI, never predictive." (kept verbatim) but the footer paragraph removed entirely.
- `DealBlockers` footer: shortened to one sentence.
- `TeamsChatHandoff` + `TeamsDealSummaryHandoff` subtitles: shortened.

### 2.12 What did NOT change

- **No new Dataverse loaders, mutators, or governed writes.**
- **No email-lane edits.** Phase 110 lock honored.
- **No derivation changes.** `deriveDealCockpitMetrics`, `deriveBlockers`, `deriveStageProgressionEligibility`, `deriveNextBestActions`, `deriveCreditMemoFreshness` all unchanged.
- **No fake data, scores, approval odds, AI claims, or predictive close-date language.**
- **No `Card.tsx` primitive change** — all icon-led header changes flow through the new `WidgetHeader` primitive in `cockpitPrimitives.tsx`. The shared `Card` stays untouched so manager / team / executive workspaces don't shift before Phase 129.
- **Phase 125 hook hoist** (`useSuggestionLedger()`) preserved verbatim.

---

## 3. Test surface

### 3.1 New test file

[src/deals/phase125ERecomposition.test.tsx](../src/deals/phase125ERecomposition.test.tsx)
— 13 cases:

| Block | Cases |
| --- | --- |
| Cockpit recomposition (visual hierarchy) | 5: command hero + metric deck + two columns render in order; Attention Console renders BEFORE Deal Summary in the left column; Attention Console → Stage Map → Action Console → Deal Summary document order; no Phase-110 communication-lane vocabulary; no fake AI / approval-odds / predictive language. |
| Source-file static pins | 6: BankerDealWorkspace renders DealSummary AFTER ActivityTimeline; DealBlockers BEFORE DealStageProgressionCard; cockpit shell does not import Office365OutlookService; does not call SendEmailV2; DealMetricDeck has no email-send imports; DealHeader has no email-send imports. |
| Cockpit primitives static pins | 2: cockpitIcons exports the 13 named glyphs the cockpit uses; cockpitPrimitives exports LargeMetricTile and WidgetHeader. |

### 3.2 Updated tests

- [src/deals/DealHeader.test.tsx](../src/deals/DealHeader.test.tsx) — full rewrite for the Phase 125E command hero: identity slots instead of a metric strip, "Commercial Lending Cockpit" eyebrow, single status chip, "Not set" / "Not assigned" italic fallbacks.
- [src/deals/BankerDealWorkspace.test.tsx](../src/deals/BankerDealWorkspace.test.tsx) — hero assertion updated to scope on the new `Deal command hero` label, identity-slot "Not set" + "Not assigned" expectations.
- [src/deals/phase125DCockpitDeck.test.tsx](../src/deals/phase125DCockpitDeck.test.tsx) — selectors updated from `data-metric-tile` to `data-large-metric-tile`; tile-count expectation dropped from 8 to 6; sparse "Not set" expectation dropped from ≥4 to ≥2 (count-driven tiles render numeric values, not "Not set").
- [src/deals/DealAutopilotPanel.test.tsx](../src/deals/DealAutopilotPanel.test.tsx) — title "Next best actions" → "Action Console"; disclaimer assertion updated to the shortened single-sentence wording.
- [src/deals/TeamsChatHandoff.test.tsx](../src/deals/TeamsChatHandoff.test.tsx), [src/deals/TeamsDealSummaryHandoff.test.tsx](../src/deals/TeamsDealSummaryHandoff.test.tsx) — subtitle assertions updated to the shortened wording.

### 3.3 Test count

- **Before Phase 125E:** 50 deal files / 692 deal tests.
- **After Phase 125E:** 51 deal files / **705 deal tests** (+13 in `phase125ERecomposition.test.tsx`).

---

## 4. Acceptance criteria

- [x] Deal Workspace no longer looks like stacked enterprise cards — the recomposed layout leads with the Command Hero + KPI Deck + Attention Console; the Deal Summary is demoted to the bottom of the left column.
- [x] Above-the-fold has a strong command header (display-scale `<h1>` deal name + identity slots + status chip) and large KPI deck (6 tonal tiles + ring).
- [x] The main operating area has a prominent Action / Attention Console (big severity-meter tiles + missing-data checklist + signal rows).
- [x] Stage Map is visually obvious and graphical (44/52px connected nodes + thick connectors + cobalt halo on current node).
- [x] Right-rail modules look like compact operating widgets (WidgetHeader with icon halo + count badge + mini progress bar).
- [x] Deal Summary is no longer the dominant first content block — it renders last in the left column, compact key/value table style.
- [x] Colors are clearly visible (cobalt / teal / violet / clear-green / atRisk-amber / blocked-red consistently applied via `severityPalette` + the new accent tones).
- [x] Charts / graphics are visibly meaningful (large completeness ring, large severity-meter tiles, large stage-map nodes, workstream mini bars, widget-header mini progress bars).
- [x] Sparse data remains honest (italic "Not set" / "Not assigned" + missing-fields readout + zero counts).
- [x] No fake AI / approval-odds / predictive / ranking / deal-score language — pinned by Phase 125B/C/D/E DOM scan + static-source assertions.
- [x] Phase 110 communication lane lock honored — pinned by static-source assertions on cockpit shell + metric deck + header.
- [x] Phase 125 hook hoist preserved.
- [x] All tests pass (127 files / 2787 tests).
- [x] Build clean.

---

## 5. Out of scope (deferred)

- **No new charting library.** Every chart is inline SVG / CSS.
- **No `Card.tsx` primitive change.**
- **No mobile-collapse breakpoint** beyond Phase 125B's `minmax(0, ...)` grid.
- **No manager / team / executive / admin cockpit recomposition.** Phase 129 owns role parity.
- **No deal-page tab routing.** The brief mentioned tabbed sections; Phase 125E keeps the cockpit as a single scrolling page with named `data-cockpit-zone` regions, which the reference screenshot also reads as.

---

## 6. Verification

```bash
npm test -- --run    # 127 files / 2787 tests pass
npm run build        # clean
```

Visual observation against the seeded `TEST — Deal Phase 121`
deal (after the next `pac code push`):

- **Command Hero**: navy gradient band with a cobalt-glow eyebrow reading `● Commercial Lending Cockpit  #d-test01`; display-scale `<h1>` `TEST — Deal Phase 121`; three identity slots reading `Client · Not set`, `Banker · Not assigned`, `Stage · Not set`; single `Status · Not set` chip.
- **KPI Deck**: ring on the left at 0% with caption `PROFILE · 0 of 13`; six tonal tiles — `LOAN AMOUNT` italic "Not set", `MISSING FIELDS` 13 (amber), `BLOCKERS` 0 (green), `TASKS OPEN` 0 (green), `DOCUMENTS` 0 (green), `TARGET CLOSE` italic "Not set". Compact footer reads `LAST TOUCHED No activity recorded · COMMS 0 events · MEMO Not set · MISSING: Loan amount · Target close · Client · Stage · Status · Banker · Product type · Loan structure · Customer type · Industry · Guarantor structure · Pricing type · Collateral`.
- **Attention Console**: amber-bordered severity meter strip with three large tiles (0 Blocked / 0 At-risk / 1 Clear); missing-data checklist block with every tracked field as a pill chip; clean-state "No blockers detected" panel.
- **Stage Map**: nine large connected nodes painted in muted future tone (the seeded stage is custom) + italic "Current: TEST — Stage Phase 121 (custom stage — not in canonical sequence)" footnote.
- **Action Console**: empty state — "All clear" badge + "Read-only. Never creates tasks, sends emails, advances the stage, or calls AI." one-line disclaimer.
- **Workstream Progress**: four mini bars reading honest "No tasks recorded / No documents tracked / No memo records yet / No communication events recorded yet".
- **Right rail**: every widget now has a tonal icon halo header + count badge. Tasks reads `📋 0 open` + 0/0 progress bar (clear-green); Documents reads `📄 0 outstanding` + 0/0 progress; Borrower Communication reads `✉ 0 events`; Credit Memo reads `📋 0`; Activity Timeline reads `📈 0`; both Teams handoffs read with the Teams icon halo.
- **Deal Summary**: at the bottom of the left column as a compact key/value table.

---

## 7. Cross-references

- [PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md](PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md) — the foundation Phase 125E builds on (the deriver, the primitives, the slate cockpit surfaces).
- [PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md](PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md), [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md), [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — predecessor visual phases.
- [PHASE_79_THEME_TOKEN_FOUNDATION.md](PHASE_79_THEME_TOKEN_FOUNDATION.md), [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md), [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) — invariants honored.
- `src/shared/theme.ts`, `src/shared/cockpitIcons.tsx` (new), `src/shared/cockpitPrimitives.tsx` — the primitives layer.
- `src/deals/BankerDealWorkspace.tsx`, `src/deals/DealHeader.tsx`, `src/deals/DealMetricDeck.tsx`, `src/deals/DealBlockers.tsx`, `src/deals/DealStageProgressionCard.tsx`, `src/deals/DealAutopilotPanel.tsx`, `src/deals/DealWorkstreamPanel.tsx`, `src/deals/DealSummary.tsx`, `src/deals/DealTasks.tsx`, `src/deals/DealDocuments.tsx`, `src/deals/BorrowerCommunication.tsx`, `src/deals/CreditMemo.tsx`, `src/deals/ActivityTimeline.tsx`, `src/deals/TeamsChatHandoff.tsx`, `src/deals/TeamsDealSummaryHandoff.tsx` — the recomposed surfaces.
- `src/deals/phase125ERecomposition.test.tsx` (new) — 13 visual-hierarchy + governance invariants.
