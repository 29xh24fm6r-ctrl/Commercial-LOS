# Phase 125G — Lending OS Cockpit Fit-and-Finish

**Status:** **Shipped.** Polish pass after Phase 125F restored
the Lending OS shell. Not another redesign — six targeted
finishing changes so the shipped cockpit feels intentional at
production quality.

**No Dataverse / schema / loader / governed-write / email-lane
changes.** No fake AI / approval-odds / predictive language.
Phase 125 useSuggestionLedger hook hoist preserved. Phase 121
sparse seed renders honestly across every refined surface.

Related canonical sources:
- [PHASE_125F_LENDING_OS_SHELL_RESTORATION.md](PHASE_125F_LENDING_OS_SHELL_RESTORATION.md) — the foundation Phase 125G polishes.
- [PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md](PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md) — the per-deal cockpit Phase 125G touches at the metric-deck + hero level.
- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the original Lending OS reference and the bucket-classification framework Phase 125F/125G both honor.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — email-lane invariants Phase 125G honors.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — the seeded sparse `TEST — Deal Phase 121` the cockpit specifically tests against.

---

## 1. What changed (six targeted polish items)

### 1.1 Banker KPI grid — stable 5×2 / 4×3 / 2×5 layout

Phase 125F's KPI grid used `repeat(auto-fit, minmax(178px, 1fr))`
which, at intermediate viewport widths, dropped a single tile
to its own row ("9 + 1" awkwardness). Phase 125G replaces it
with an explicit `.cc-kpi-grid` CSS class in
[src/index.css](../src/index.css) with three breakpoints:

```css
.cc-kpi-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@media (max-width: 1240px) { ... repeat(4, ...); }
@media (max-width: 760px)  { ... repeat(2, ...); }
```

Result: 10 tiles always lay out as balanced rows on any
viewport — no lone orphan. Pinned by static-source assertions
on both the CSS file and `BankerKpiGrid.tsx`.

### 1.2 Deal Metric Deck — stable 3×2 / 2×3 / 1 layout + tighter padding

[src/index.css](../src/index.css) gains `.cc-metric-deck-tiles`
with the same explicit-breakpoint pattern. The 6 tonal tiles
always lay out as `3×2` on desktop, `2×3` on medium, single
column on narrow. The deck's vertical padding is tightened
slightly (`spacing.sm` instead of `spacing.md` top padding)
and the ring gains a right-side divider so it reads as a
distinct anchor on the left of the tile grid.

### 1.3 Deal Cockpit Anchor Strip — `src/deals/DealCockpitNav.tsx` (new)

A horizontal anchor row that sits directly under the metric
deck and points to every cockpit module:

```
┌──────────────────────────────────────────────────────────┐
│ ⚠ ATTENTION · ▦ STAGE MAP · ✦ ACTIONS · ▤ WORKSTREAMS ·  │
│ 👥 RELATIONSHIP · 📋 CREDIT MEMO · ↗ ACTIVITY · ✓ SUMMARY│
└──────────────────────────────────────────────────────────┘
```

Each anchor is a real `<a href="#…">` link targeting an `id`
on the matching module's outer wrapper in
[BankerDealWorkspace.tsx](../src/deals/BankerDealWorkspace.tsx).
Smooth scrolling is opt-in via `html { scroll-behavior: smooth }`
in `index.css`, with a `prefers-reduced-motion` override so
users who request reduced motion get instant jumps.

This addresses the "Stage Map starts below the fold" feedback
without compressing the metric deck or moving the Stage Map
above the Attention Console — the banker now sees that the
page contains a Stage Map (and 6 other modules) immediately,
and can jump to any of them with one click.

### 1.4 Attention Console — grouped missing-field chips

The Phase 125F flat chip strip ran 13 chips in one line on a
fully sparse deal. Phase 125G groups them into five logical
buckets, each with its own dashed-amber divider + group label:

| Group | Fields |
| --- | --- |
| Economics | Loan amount · Pricing type |
| Parties | Client · Banker |
| Timing | Target close |
| Stage & status | Stage · Status |
| Structure | Product type · Loan structure · Customer type · Industry · Guarantor structure · Collateral |

Groups with zero missing fields don't render. An "Other"
fallback bucket would catch any future label not yet mapped
(none today). The 13-of-13 total count on a fully sparse seed
is preserved exactly.

### 1.5 DealHeader — "Deal Cockpit" lockup + brighter accent edge

The hero eyebrow row gains a cobalt-tinted glass pill reading
**"Deal Cockpit"** alongside the existing **"Commercial
Lending Cockpit"** institutional eyebrow. The eyebrow dot's
glow is brightened (5px cobalt halo + a soft 14px outer
shadow) so the hero reads more dimensional without growing
taller.

### 1.6 Right rail — consistent widget height

The right-rail rail items (`Today's Schedule` + `My Tasks`)
gain a `minHeight: 160` so they read as a row of equal-height
operating widgets rather than ragged cards keyed to their
content length. The honest "No meetings today" / "No open
tasks" empty states stay unchanged.

### 1.7 What did NOT change

- **No new Dataverse loaders, mutators, or governed writes.**
- **No email-lane edits.** Phase 110 lock honored.
- **No derivation changes.** `deriveDealCockpitMetrics`, `deriveBankerPersonalActivity`, `deriveBlockers`, etc. are all unchanged.
- **No fake data / fake AI / fake approval-odds language.**
- **No `Card.tsx` primitive change.**
- **No Stage Map content change** — it stays in position #2 in the left column (right after the Attention Console); Phase 125G just makes its existence visible up front via the anchor strip.
- **Phase 125 hook hoist** preserved.

---

## 2. Test surface

### 2.1 New test file

[src/deals/phase125GFitAndFinish.test.tsx](../src/deals/phase125GFitAndFinish.test.tsx)
— 16 cases:

| Block | Cases |
| --- | --- |
| Banker KPI grid stable layout | 3: BankerKpiGrid uses `.cc-kpi-grid`; no `auto-fit, minmax(178px, …)` inline anymore; index.css declares the 5/4/2 column breakpoints. |
| Deal Metric Deck stable layout | 2: deck tiles use `.cc-metric-deck-tiles`; index.css declares the 3/2/1 column breakpoints. |
| DealCockpitNav anchor strip | 3: renders 8 anchor links with the expected labels; each link's `href` matches its `#id`; BankerDealWorkspace declares matching `id="…"` wrappers for every anchor. |
| Attention Console grouped chips | 4: renders the five group containers (`data-missing-field-group="…"`); group labels match Economics / Parties / Timing / Stage & status / Structure; each chip lives in the correct category; the 13-of-13 sparse-seed count is preserved. |
| DealHeader lockup | 1: hero renders "Deal Cockpit" pill alongside the institutional eyebrow. |
| Governance pins | 3: DealCockpitNav and DealBlockers have no SDK / email-lane imports; DealCockpitNav renders no fake AI / approval-odds / predictive copy. |

### 2.2 Tests that continued passing unchanged

Every existing Phase 125B / 125C / 125D / 125E / 125F test
still passes. The fit-and-finish changes are deliberately
additive (new CSS class names, new `data-*` attributes, a
new component, a new "Deal Cockpit" pill, a grouped chip
component) and never rename or remove the surfaces older
tests assert against.

### 2.3 Test count

- **Before Phase 125G:** 128 files / 2,780 tests.
- **After Phase 125G:** 129 files / **2,796 tests** (+16 in `phase125GFitAndFinish.test.tsx`).

---

## 3. Acceptance criteria

- [x] Banker dashboard KPI grid uses a stable layout — no orphan tile on its own row at any viewport.
- [x] Deal Metric Deck uses a stable 3×2 tile layout — no orphan tile.
- [x] Deal Cockpit anchor strip makes Stage Map (and every other module) discoverable without scrolling.
- [x] Missing-field chips are grouped by category for fast scanning.
- [x] Hero gains a "Deal Cockpit" lockup + brighter accent edge without becoming taller.
- [x] Right rail widgets share a consistent minimum height.
- [x] No fake AI / approval-odds / predictive / ranking / deal-score language anywhere in the recomposed cockpit (static-source pin + DOM scan).
- [x] Phase 110 communication-lane lock honored (static-source pins).
- [x] Phase 125 hook hoist preserved.
- [x] All tests pass (129 files / 2,796 tests).
- [x] Build clean.

---

## 4. Out of scope (kept deferred)

- **No new charting / dashboard library.** Phase 125G adds no charts.
- **No `Card.tsx` primitive change.**
- **My Action Queue severity-tile strip + filter chips** — still deferred from Phase 125F; MyWorkQueue stays as the Tasks & Actions tab content.
- **Bucket C / D / E surfaces** (search loader, New Deal / Log Activity governed writes, Schedule calendar, Contacts / Vendors entities) — still surfaced as honest disabled placeholders. No new write or loader was added in this phase.
- **Phase 122 Dataverse retargeting** — the next leap (real tasks / documents / data filling the now-good shell) is the right next phase per the user's roadmap; Phase 125G is the last UI polish in this run.

---

## 5. Verification

```bash
npm test -- --run    # 129 files / 2,796 tests pass
npm run build        # clean
```

Visual observation against the deployed `TEST — Deal Phase
121` seed (after the next `pac code push`):

- Banker dashboard KPI grid renders as 5 tiles × 2 rows on a
  wide desktop. At ~1100px the grid drops to 4 × 3 cleanly.
- Deal cockpit metric deck renders the ring on the left + 6
  tonal tiles in a 3 × 2 arrangement, with a divider between
  the ring column and the tile grid.
- Anchor strip sits directly under the metric deck with 8
  labeled anchors. Clicking "Stage Map" smooth-scrolls to the
  Stage Map module.
- Attention Console missing-data block renders five labeled
  groups (Economics / Parties / Timing / Stage & status /
  Structure) each with a dashed-amber divider — scannable in
  ~2 seconds instead of squinting at a wall of chips.
- DealHeader carries the new "Deal Cockpit" cobalt-glass pill
  next to the eyebrow + a slightly brighter accent dot.
- Right rail "Today's Schedule" and "My Tasks" widgets share
  a consistent minimum height.

---

## 6. Cross-references

- `src/index.css` — new `.cc-kpi-grid` + `.cc-metric-deck-tiles` classes with media-query breakpoints; `html { scroll-behavior: smooth }` for the anchor strip.
- `src/banker/BankerKpiGrid.tsx` — uses `.cc-kpi-grid`.
- `src/deals/DealMetricDeck.tsx` — uses `.cc-metric-deck-tiles`, tighter padding, ring divider.
- `src/deals/DealCockpitNav.tsx` (new) — 8-anchor strip under the deck.
- `src/deals/BankerDealWorkspace.tsx` — renders `<DealCockpitNav />` + matching `id="…"` anchors on every module.
- `src/deals/DealBlockers.tsx` — `MissingFieldGroups` component groups chips by category.
- `src/deals/DealHeader.tsx` — "Deal Cockpit" lockup pill + brighter eyebrow dot.
- `src/banker/BankerShell.tsx` — right-rail `minHeight: 160`.
- `src/deals/phase125GFitAndFinish.test.tsx` (new) — 16 fit-and-finish invariants.
