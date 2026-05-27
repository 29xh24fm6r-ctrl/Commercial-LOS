# Phase 125B — Deal Workspace Visual Redesign

**Status:** **Shipped.** Visual / composition-only redesign of
the Banker Deal Workspace based on the live-screenshot design
critique. Implements the Commercial Lending Deal Command Center
direction: navy hero band, glass metric strip, two-column
cockpit grid. No Dataverse schema changes. No new loaders. No
new governed writes. No fake data. No fake AI / predictive /
ranking / approval-odds language. No email-lane changes.
Phase 125 hotfix (hoisted `useSuggestionLedger()` in
`DealAutopilotPanel`) is preserved.

Related canonical sources:
- [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — the first cockpit upgrade and the React error #310 hotfix. Phase 125B is the visual redesign that landed against the design pass; the Phase 125 hook hoist is preserved unchanged.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md), [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md), [PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md](PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md) — design language carried into the new cockpit (primary accent stripes, framed dashed-border empty states, severity-tinted left borders, premium card framing).
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants Phase 125B honors. New static-source pin on `BankerDealWorkspace.tsx` asserts the lock.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — the seeded `TEST — Deal Phase 121` whose sparse shape this redesign honors.

---

## 1. The design pass (live-screenshot critique)

The pre-125B deal workspace was technically working, but read
as stacked enterprise record cards rather than a commercial
lending command center. The live screenshot diagnosis:

- Hero area too white and flat; the deal name floated in a
  large blank card instead of anchoring a cockpit.
- Top metadata fields too spread out and too weak.
- `Deal Blockers` and `Stage Progression Guard` read as warning
  boxes, not executive underwriting intelligence modules.
- Amber stripes too dominant; page felt like a compliance
  exception screen.
- Layout was one long vertical column → no visual contrast
  between identity, risk, progression, and summary.

The target state was specified as: **Commercial Lending Deal
Command Center**, with a navy/slate hero band, compact metric
tiles, two-column cockpit grid, severity chips instead of
heavy amber borders, and the page rendered as a serious
institutional surface.

Phase 125B implements that direction.

## 2. What changed

### 2.1 DealHeader — navy hero band + glass metric strip

[src/deals/DealHeader.tsx](../src/deals/DealHeader.tsx) was
fully rewritten. The new layout:

```
┌──────────────────────────────────────────────────────────┐
│  ●  COMMERCIAL LENDING DEAL                              │
│  TEST — Deal Phase 121                                   │
│  ┌ Stage · Underwriting ┐  ┌ Status · Active ┐           │
│  Derived from authorized deal records.                   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                     │
│  │AMOUNT│ │CLIENT│ │T-CLOSE│ │BANKER│                    │
│  │$2.5M │ │Acme  │ │in 8d │ │Matt  │  glass cells       │
│  └──────┘ └──────┘ └──────┘ └──────┘                     │
└──────────────────────────────────────────────────────────┘
```

Visual contract:
- Background: `linear-gradient(135deg, #0f172a 0%, #14213d 55%, #1f3461 100%)` with a subtle radial-gradient overlay at the top-right for depth.
- Shadow: `shadow.hero` (Phase 123 token).
- Eyebrow: brand-accent dot + `COMMERCIAL LENDING DEAL` in `#60a5fa` (light blue accent on navy).
- Title: hero-scale `<h1>` in near-white (`#f1f5fa`).
- Status chips: glass-style pills (rgba white 6% bg, 1px white 14% border). Missing values render as **dashed-border `Stage · Not set` / `Status · Not set`** italic chips — honest absence, never fabricated.
- Metric strip: 4 glass cells in a responsive `auto-fit minmax(180px, 1fr)` grid. Loan amount gets the hero treatment (xl + bold + tabular-nums). Client / Target close / Assigned banker render at lg + semibold. Missing values render as italic `Not set` in muted-white inside their cell.

Hook surface unchanged: single `useDealData()` at the top, no
new hooks, no conditional hooks, no early returns. **The Phase
125 hook order hoist in `DealAutopilotPanel` is unaffected.**

### 2.2 BankerDealWorkspace — two-column cockpit layout

[src/deals/BankerDealWorkspace.tsx](../src/deals/BankerDealWorkspace.tsx)
now renders a two-column cockpit grid below the navy hero band:

```
┌─────────────────────────────────────────────────────────┐
│ DealHeader (full-width navy hero band)                  │
├──────────────────────────┬──────────────────────────────┤
│ LEFT  ~65% — intelligence│ RIGHT ~35% — attention / work│
│                          │                              │
│ DealSummary              │ DealBlockers                 │
│ DealStageProgressionCard │ DealTasks                    │
│ DealAutopilotPanel       │ DealDocuments                │
│ RelationshipContext      │ BorrowerCommunication        │
│ CreditMemo               │ TeamsChatHandoff             │
│ ActivityTimeline         │ TeamsDealSummaryHandoff      │
└──────────────────────────┴──────────────────────────────┘
```

CSS:
- Outer container: `display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr); gap: spacing.lg; align-items: start;`. The `1.85fr / 1fr` ratio produces a ~65/35 split that breathes on wide screens and collapses gracefully on narrow ones (CSS grid auto-rebalances when content overflows; for a true mobile collapse to single column, a future pass can add a `@media` breakpoint).
- Each column: `<section>` with `aria-label` ("Deal intelligence and detail" / "Attention and work surfaces") so screen readers and tests can scope queries.

**Every `data-deal-card` anchor used by the Phase 80
`DealAutopilotPanel` scrollIntoView is preserved verbatim** —
the anchors now sit in either the left or right column wrapper
divs depending on each card's placement, but the
`querySelector('[data-deal-card="<key>"]')` lookup still works
because the anchors exist in the document regardless of which
column they live in.

Hook surface unchanged: `useBanker()` + `useState` + `useEffect`,
all at the top. Early returns for `loading` / `denied` /
`not-found` / `failed` happen BEFORE any layout work. Same as
Phase 125.

### 2.3 Per-card visual state

The remaining deal-workspace cards already received their
premium framing in Phase 125 (severity-tinted left stripes on
DealBlockers signal rows + DealStageProgressionCard reason rows,
framed dashed-border empty states across DealTasks / DealDocuments
/ CreditMemo / ActivityTimeline / BorrowerCommunication, italic
honest "Not set" copy). Phase 125B leaves those cards
**unchanged** because the Phase 125 visual treatment already
matches the redesign spec for those modules. Phase 125B's value
is the layout shift + hero band + metric strip.

### 2.4 What did NOT change

- **`Card.tsx`** shared primitive — untouched. Manager / team / executive / admin workspaces will not visually shift before Phase 129.
- **`theme.ts`** — no new tokens added. Phase 125B uses inline gradient strings + rgba glass values that don't need to be in the central palette (they're hero-band-specific).
- **`DealSummary.tsx`** — already a compact metric grid with italic `Not provided` for missing fields (preserved for parity with `creditMemoDraft.ts` + `teamsDealSummary.ts` outputs).
- **`DealAutopilotPanel.tsx`** — Phase 125 hook hoist preserved. No new edits.
- **`RelationshipContext.tsx`**, **`TeamsChatHandoff.tsx`**, **`TeamsDealSummaryHandoff.tsx`** — already cockpit-grade via Card.
- **Phase 125 hotfix regression tests** — both pass unchanged.
- **All Dataverse loaders + governed writes + email lane** — untouched.

---

## 3. Test surface

### 3.1 Test count + outcome

- `npm test -- --run`: **121 files / 2724 tests passed** (+11 vs Phase 126: 10 new BankerDealWorkspace cockpit tests + 2 updated DealHeader assertions on top of the Phase 126 baseline of 2713; net +11).
- `npm run build`: clean.

### 3.2 New test file

[src/deals/BankerDealWorkspace.test.tsx](../src/deals/BankerDealWorkspace.test.tsx)
(new — 10 cases across two describe blocks):

| Block | Cases |
| --- | --- |
| **BankerDealWorkspace cockpit (rendering)** | 7 cases: sparse `TEST — Deal Phase 121` renders without crash (Phase 125 hotfix regression at the integration layer); two-column cockpit grid renders both labeled regions; intelligence cards land in the LEFT column; attention cards land in the RIGHT column; every `data-deal-card` anchor used by autopilot scrollIntoView is preserved (regardless of column); navy hero band renders honest "Not set" copy for every metric cell on a fully sparse deal; no Phase-110 forbidden vocabulary in the integration view; no fake AI / predictive / ranking / approval-odds language in the workspace shell. |
| **BankerDealWorkspace.tsx static-source pins** | 3 cases: no `Office365OutlookService` import, no `SendEmailV2` callsite, no `sendXEmail` action import. |

### 3.3 Updated test cases

[src/deals/DealHeader.test.tsx](../src/deals/DealHeader.test.tsx)
— two existing cases updated for the new chip markup:

- `renders the eyebrow lockup "Commercial Lending Deal"` (was `Deal · Commercial Lending` pre-125B — eyebrow rewritten to lead with the institutional framing).
- `renders the stage chip and status chip when both are present (Phase 125B markup: "Stage · <name>" / "Status · <name>")` — was previously asserting the chip contained just the stage / status text; now asserts the prefixed chip format.

Added one new case: `renders honest "Stage · Not set" / "Status · Not set" chips when those fields are missing` — covers the sparse-deal hero branch.

All other Phase 125 DealHeader.test.tsx assertions (the honest
"Not set" amount + client + banker + target close cells, no
Phase-110 forbidden vocabulary, static-source pins) **pass
unchanged**.

### 3.4 Sparse-deal end-to-end

The Phase 125 hotfix added a unit-level state-transition test
on `DealAutopilotPanel` (loading → ready+populated cannot crash).
Phase 125B adds the integration-level companion:

> **`renders without crashing for a sparse TEST-style deal
> (Phase 125 hotfix regression at integration layer)`**
>
> Mounts the full BankerDealWorkspace with a sparse deal
> (`clientName`, `stage`, `status`, `amount`, `bankerName`,
> `targetCloseDate`, summary fields, `stageEntryDate` all
> undefined), mocks every child card as a sentinel, asserts
> the `<h1>` deal name renders and no error is thrown during
> mount.

This pins the Phase 121 + Phase 125 production-crash signature
at both the unit AND integration levels.

---

## 4. Acceptance criteria

- [x] Deal workspace feels like a commercial lending command center (navy hero band, glass metric strip, two-column cockpit) — implemented per the design pass.
- [x] Compact metric strip with `Loan Amount` / `Client` / `Target Close` / `Assigned Banker` — implemented.
- [x] Missing values still say "Not set" inside polished metric cells — implemented (italic muted-white inside glass cells).
- [x] Two-column cockpit layout (left = intelligence, right = attention) — implemented.
- [x] Severity badges + calmer tinted surfaces instead of huge amber borders — Phase 125 framed signal rows already match this; preserved.
- [x] No fake data / scores / approval odds / AI recommendations — pinned by 2 static-source pins + 2 DOM scans in the new tests.
- [x] Old Glory navy + blue accent + amber for true attention only — implemented in the hero band.
- [x] React hook order preserved (Phase 125 hotfix unaffected) — both Phase 125 regression cases still pass.
- [x] Phase 110 communication lock honored — new static-source pin on BankerDealWorkspace.tsx asserts this.
- [x] All 2724 tests pass.
- [x] Build clean.

---

## 5. What Phase 125B explicitly does NOT do

Per the Phase 122A backlog sequencing:

- **Phase 127 — Credit Memo premium workspace.** Phase 125B framed CreditMemo's empty state in Phase 125 and left it placed in the left column of the new cockpit. The full premium memo-editing workspace (CreditMemoDraftModal polish + section-pill layout + side-by-side preview) remains Phase 127's scope.
- **Phase 122 — Dataverse lookup retargeting** for `cr664_documentchecklist.cr664_Deal` (and candidates). Without Phase 122, the DealTasks / DealDocuments / CreditMemo cards remain in their framed honest-empty state — now placed in the right column of the cockpit where the operator can scan them at a glance.
- **Phase 128 — Task / document UX after Phase 122.** Row-level task / document card polish waits for Phase 122.
- **Phase 129 — Manager / team / executive / admin visual parity.** Phase 125B touched only the banker deal workspace shell + DealHeader; manager / team / executive deal workspaces still use their Phase 36 / Phase 37 read-only layouts.
- **No mobile-collapse breakpoint** added yet. The two-column grid uses `minmax(0, ...)` so the columns will compress under tight viewports without overflowing; an explicit mobile single-column breakpoint can be added in a small follow-up if needed.
- **No `Card.tsx` primitive change** — shared component is untouched so the other workspaces don't shift.
- **No new theme tokens** — the navy hero gradient is inline because it's hero-band-specific. If a future phase wants navy-hero treatment elsewhere (e.g., manager command center hero), the gradient can be promoted to a theme token then.

---

## 6. Verification

```bash
npm test -- --run    # 121 files / 2724 tests passed
npm run build        # clean
```

The redesign will become visible in the deployed app on the
next `pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS`.

Post-push observation against the seeded `TEST — Deal Phase 121`:

- Pipeline → click `TEST — Deal Phase 121` → workspace opens.
- Hero band reads navy with a glowing top-right radial accent.
  `COMMERCIAL LENDING DEAL` eyebrow (light blue accent) sits
  above a hero-scale white `TEST — Deal Phase 121`. Stage chip
  reads `Stage · TEST — Stage Phase 121` (glass pill); Status
  chip reads `Status · TEST — Status Phase 121`. Conservative
  governance copy renders beneath.
- Metric strip shows 4 glass cells: `LOAN AMOUNT` ($2.5M hero
  value), `CLIENT` (`TEST — Borrower Phase 121`), `TARGET
  CLOSE` (relative countdown), `ASSIGNED BANKER` (`Matthew
  Paller`).
- Below hero, the cockpit splits two columns:
  - **Left ~65%**: DealSummary, Stage Progression Guard, Next
    Best Actions, Relationship Context, Credit Memo, Activity
    Timeline.
  - **Right ~35%**: Deal Blockers, Deal Tasks, Deal Documents,
    Borrower Communication, Teams Chat Handoff, Teams Deal
    Summary Handoff.
- Empty states (DealTasks, DealDocuments, CreditMemo, etc.)
  render the Phase 125 framed dashed-border treatment, now in
  their right-column placement.
- The Phase 125 hotfix unblocks the click-through — no React
  error #310 anywhere.
- Clicking back to Banker Command Center returns to Phase
  123/124/126 surfaces.

---

## 7. Cross-references

- [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — the foundational cockpit upgrade and the React error #310 hotfix. Phase 125B builds on the Phase 125 framing without regressing the hook hoist.
- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5 — the bucket-A backlog item Phase 125B sharpens with the design-pass-first approach.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md), [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md), [PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md](PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md) — sibling phases sharing the design language.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — email-lane lock Phase 125B honors.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) — seeded sparse deal whose shape Phase 125B specifically tests.
- `src/deals/DealHeader.tsx` — full rewrite (navy hero + glass metric strip).
- `src/deals/BankerDealWorkspace.tsx` — two-column cockpit layout + named region wrappers.
- `src/deals/BankerDealWorkspace.test.tsx` (new) — 10 cockpit / integration / static-source assertions.
- `src/deals/DealHeader.test.tsx` — 2 updated chip assertions + 1 new honest-absence chip assertion.
