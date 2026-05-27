# Phase 122A — OGB LOS Original UI/UX Recovery Audit

**Status:** **Audit complete. Documentation only.** No production
code changed. This is a forward-looking recovery backlog for the
OGB LOS / Commercial Lending LOS banker UX.

**Scope clarification (per the brief):** This audit is strictly
about the **Old Glory Bank / Commercial Lending LOS** banker
workspace. It is not about Buddy, franchise concepts, borrower-
portal designs, or any other product. The deployed app at
environment `5f2d77a5-de50-edeb-9d74-5b2400a2320d` (`Matthew
Paller's Environment`) is the only system in scope.

Related canonical sources:
- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the gap-classification baseline this audit refines.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) — bucket-A wave 1 shipped.
- [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — bucket-A wave 2 shipped.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — reduced-scope Phase 121 validated 2026-05-27.
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — Dataverse retarget; gates the document/task surfaces.

---

## 0. Headline finding

> **No archived / hidden / simplified-from-richer-ancestor UI
> exists in this repository.** Comprehensive inspection of
> `src/banker/`, `src/workspaces/`, `src/deals/`, `src/shared/`,
> `src/components/` (does not exist), docs/, and package.json
> turned up zero evidence of a previously-built richer banker UI
> that was simplified into Phase 117. The Phase 117 / 119 / 120
> shell **is the only banker UI** that has ever been committed
> to this codebase.
>
> The "original slick OGB LOS UI" the brief refers to does not
> live in this repo. It lives in a different artifact — design
> mockups, Figma files, prior product, screenshots, or design
> conversation — that is not present in the project folder.
> Phase 118's `docs/PHASE_118_ORIGINAL_UI_UX_INVENTORY.md` is the
> closest thing we have: it documents what the original product
> UX targeted, classified by bucket. Phase 122A consumes Phase
> 118 as the baseline.

### What this means for the audit

- The brief's question 3 ("Which files contain richer UI/UX work that is unused, simplified, or only partially restored?") has a clear answer: **none.** Every banker component in `src/banker/` is mounted; every shared component in `src/shared/` is composed; every workspace shell in `src/workspaces/` is reachable from a route.
- The brief's question 6 ("What 'cool' UI spaces did we already build or discuss for OGB LOS?") has a clear answer: **discussed in Phase 118 inventory; never built.** Phase 119 + Phase 120 shipped the cheapest tier (bucket A composition) of the inventory. The richer visual tier (bucket F: spacing, density, KPI styling, premium iconography, charts, polish) was deferred and remains unbuilt.
- Phase 122A's value-add is therefore **forward-looking**: produce a sequenced, governance-safe visual recovery backlog (proposed Phases 123–129) starting from where Phase 120 left off.

---

## 1. Methodology + evidence

Audit performed read-only against the working tree at the
project folder root. Two parallel tracks:

### 1.1 Broad inspection (Explore agent)

Inspected the full source tree + 77 phase docs + package.json
for archived / unused / orphan / mock / demo / premium UI work.
Key evidence findings:

| Probe | Finding |
| --- | --- |
| Files matching `*Demo*` / `*Mock*` / `*Preview*` / `*Legacy*` / `*V2*` / `*Showcase*` under `src/` | **Zero matches** |
| Shell variants other than `BankerShell.tsx` (e.g. `BankerShell.legacy.tsx`, alternate `Dashboard.tsx`) | **Zero matches** |
| Image / asset files under `src/` (`.png` `.jpg` `.svg` `.gif` `.webp`) | **Zero matches** |
| Visualization-library imports (`recharts` / `victory` / `nivo` / `chart.js`) | **Zero imports** anywhere in `src/`; not in `package.json` |
| Animation-library imports (`framer-motion` / `react-spring` / `motion`) | **Zero imports**; not in `package.json` |
| Premium icon-library imports (`lucide-react` / `phosphor-icons` / `heroicons`) | **Zero imports**; not in `package.json` |
| Kanban / drag-drop libraries (`react-beautiful-dnd` / `dnd-kit`) | **Zero imports**; not in `package.json` |
| Hardcoded mock data arrays in component files | **Zero matches**; all data flows through `loadBankerWorkQueueData` / `loadBankerPipeline` |
| `.css` / `.scss` / `.sass` / `.less` files under `src/` other than `src/index.css` | **None** (single `index.css`) |
| `src/components/` directory | **Does not exist** |
| Pre-Phase-51 design docs (e.g. "Phase 0 — Initial Design") | **No phase doc below Phase 51 exists**; earliest is `PHASE_51_DOCUMENT_UPLOAD_SCOPE.md` |

### 1.2 Theme + library footprint

`package.json` dependencies (full list):

```json
{
  "@microsoft/power-apps": "^1.1.3",
  "@microsoft/teams-js": "^2.53.0",
  "react": "^19.2.6",
  "react-dom": "^19.2.6",
  "react-router-dom": "^7.15.0"
}
```

No design-system library, no charting library, no animation
library, no icon library. Every visual element is hand-rolled
in `src/shared/theme.ts` + inline `style` props per component.

`src/shared/theme.ts` defines a conservative palette (navy
primary `#1f4ea6`, gray-scale neutrals, three severity colors
for blocked / at-risk / clear). Two shadow tokens (`card`,
`rise`). Four radius tokens (`xxs`, `xs`, `sm`, `md`, full).
Standard system font stack. **No gradient tokens, no glow
tokens, no premium iconography, no glassmorphism tokens, no
hero-card tokens.**

### 1.3 Per-workspace richness comparison

| Workspace | Sidebar? | KPI grid? | Tabs? | Right rail? | Tab content style |
| --- | --- | --- | --- | --- | --- |
| Banker (`BankerShell`) | ✅ dark navy | ✅ 9 tiles | ✅ 7 tabs | ✅ 2 panels | composed cards (PersonalActivitySummary, MyWorkQueue, PersonalPipeline, etc.) |
| Manager (`ManagerWorkspace`) | ❌ | ❌ | ❌ | ❌ | stacked cards under a header |
| Team (`TeamWorkspace`) | ❌ | ❌ | ❌ | ❌ | stacked cards under a header |
| Executive (`ExecutiveWorkspace`) | ❌ | ❌ | ❌ | ❌ | 2-col card grid under a header |
| Admin (`AdminWorkspace`) | ❌ | ❌ | ❌ | ❌ | diagnostic card stack |

The banker workspace is the **richest** workspace in the repo
today. Manager / team / executive / admin are visually simpler
— not richer.

---

## 2. The 10 audit questions, answered

| # | Question | Answer |
| --- | --- | --- |
| 1 | What does the current deployed Banker Command Center look like? | Dark navy left sidebar with 7 nav items + workspace switcher footer + identity card. Light-surface main area with 9 conservative KPI tiles (label / value / hint) in a `auto-fit minmax(170px,1fr)` grid. 7 tabs (Overview / Pipeline / Action Queue / Due Diligence / Activity / Relationships / Signals). 2 right-rail panels (Closing Soon + My Tasks). All cards are plain bordered `<Card>` with optional 3px accent stripe. No charts, no gradients, no animations, no premium icons. |
| 2 | What original/richer OGB LOS UI surfaces existed or were planned? | **Planned, never built.** Phase 118 §3 + §4 documents the original-product target surfaces (stage lanes / progression bar, deal cards vs rows, probability badges, weighted pipeline, YTD closed, win rate, hi-prob tile, urgent tile + 8 others, Today's Schedule rail, My Alerts rail, Cross-sell widgets, Contacts tab, Activity tab feed, Vendors section, greeting). Phase 119 + 120 shipped the cheapest tier; richer visual tier is unbuilt. |
| 3 | Which files contain richer UI/UX work that is unused, simplified, or only partially restored? | **No files.** Zero archived / orphan / unused UI components exist in this repo. The richer work is documented in `docs/PHASE_118_*` but never coded. |
| 4 | Which current Phase 119–120 surfaces are functionally restored but visually underbuilt? | **All of them, to varying degrees.** The 3 Phase-119 derived tiles (Urgent items / In underwriting / Stale 14d+) render as flat text — no sparklines, no deltas, no comparative trend. The Phase-119 stage-grouped pipeline is a stacked table per stage — no Kanban columns, no deal cards. The Phase-119 My Tasks rail is a 3-row list. The Phase-120 Activity feed is plain text rows. The Phase-120 Due Diligence sections are plain text rows. The Phase-120 workspace switcher is a static label. |
| 5 | What visual elements are missing from the original slick version? | Stage lanes (Kanban-style), deal cards (vs rows), probability badges, sparkline / trend deltas on KPI tiles, hero KPI tile for Pipeline, donut for stage distribution, premium iconography, animated transitions, brand-polished sidebar (with sticky workspace status), greeting block, density variations per breakpoint, alert/notification glyphs, status-color gradients, hover affordances (currently very subtle), focus styles (currently default), color-coded stage chips. |
| 6 | What "cool" UI spaces did we already build or discuss for OGB LOS? | **Discussed in Phase 118 inventory.** Built: Phase 119 + 120's composition surfaces (functional but plain). Built and visually richer than the rest: the dark-navy sidebar + identity card (Phase 117). Discussed but unbuilt: everything in Phase 118 §4 / §5 not labeled "Phase 119" or "Phase 120". |
| 7 | Which items can be restored now as UI-only composition work? | See §4 bucket A below. Most of the visual upgrade work IS bucket A (re-styles existing surfaces; no new data, no new loader, no new write). |
| 8 | Which items are blocked by Phase 122 Dataverse lookup retargeting? | See §4 bucket B. Anything that requires populated task / document data — Action Queue card density, Due Diligence section cards, My Tasks rail rows with overdue badges, the Open-tasks / Outstanding-docs / Pending-reviews tile non-zero rendering. Until Phase 122 + a re-walk of Phase 121 Steps 6 + 7, these surfaces only show honest-empty states. |
| 9 | Which items require additional data/model work? | See §4 bucket C. Weighted pipeline tile (needs `cr664_probability` schema confirm), YTD-closed / win-rate tiles (need closed-deal history loader), high-probability tile (needs probability field), global search bar (needs search-across-deals loader), Today's Schedule (needs Outlook calendar — Lane E upstream), Cross-sell widgets (Lane F Copilot upstream). |
| 10 | Which items should not be restored because they violate governance? | See §4 bucket D. `New Deal` action button (no governed write, must-ask-first), `Log Activity` action button (potential Phase 110 communication-lane scope extension), borrower-portal previews (NOT_WIRED), unauthorized workspace switcher entries (entitlement model is single-workspace per user today), any fabricated row anywhere, any "Send notification" surface. |

---

## 3. Surface-by-surface inventory + classification table

Each row covers one banker-facing surface (or workspace shell).
The "Visual gap" column lists what would change in a premium
restoration. "Functional gap" lists what's currently empty
because data is missing. "Bucket" maps to §4 buckets A/B/C/D.

| Surface | Current implementation | Visual gap (cosmetic upgrade) | Functional gap (data dependency) | Data dependency | Governance risk | Safe to restore now? | Bucket |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Banker shell — sidebar** | Dark navy, 7 buttons, footer switcher (static), identity card | Brand glyph polish, sticky workspace-mode badge, animated hover/active, icon per nav item | none | none | none | ✅ visual only | A |
| **Banker shell — header** | Eyebrow + title + subtitle + email-mode badge + optional read-only banner | Greeting prefix (Good morning, Matt), env badge polish, last-refresh timestamp, settings menu icon | none | bootstrap (already loaded) | low — keep banner | ✅ visual only | A |
| **KPI grid (9 tiles)** | Plain text label / value / hint per tile | Hero treatment for Active deals + Pipeline tiles, sparkline for trend, color-coded value text, donut for stage distribution, comparative deltas (vs last month) | YTD-closed / Win-rate / Hi-prob tiles do not exist (per Phase 118 §4.3) | C tiles need closed-deal-history loader + probability field | low — must stay honest, never fabricate trends | ✅ existing tile cosmetic = A; new tiles = C | A + C |
| **Pipeline tab — stage groups** | Phase 119 flat-table-per-stage sections | Kanban / stage-lane columns, deal cards (vs rows), idle badges per row, probability ribbons, stage-progress bar across the top | Probability badge needs `cr664_probability` schema confirm | A (Kanban layout); C (probability) | low | ✅ Kanban layout safe; probability blocked | A + C |
| **Action Queue tab — MyWorkQueue** | Stacked rows grouped by severity (blocked / overdue / at-risk / upcoming) | Severity-tinted row cards, due-date countdown chips, action-icon affordances | Currently honest-empty after Phase 121 reduced scope (no tasks; documents Phase-122 blocked) | B (gated on Phase 122 + AssignedTo fix) | low | ⚠️ visual safe; population blocked | A + B |
| **Due Diligence tab** | Phase 120 two-section read view (Outstanding / Pending review) with deal-context links | Doc-state pill (Requested / Received / Reviewing), per-doc due-date countdown, document-type icon, hover preview | Currently honest-empty per Phase 121 reduced scope | B (gated on Phase 122 retarget) | low | ⚠️ visual safe; population blocked | A + B |
| **Activity tab** | Phase 120 modifiedon-derived rows with type badge + deal link | Activity-type icons, time-bucket grouping (Today / This week / Earlier), avatar tints, "since last visit" highlight | Currently surfaces deal / stage-ref / status-ref / borrower modifiedon; missing task + doc activity until Phase 122 | A (visual) + B (task/doc rows gated) | low | ⚠️ visual safe; richer rows blocked | A + B |
| **Relationships tab — RelationshipMemory** | Per-client snapshot with active deal count, asks, attention | Client-card layout (avatar / initials, last-touch, deal stack), graph-style cross-deal links | partial — clients without an `_cr664_client_value` on the seeded deal won't surface; Step 3 borrower covers one row | A (visual) + B (Phase 122 retargets memos too if confirmed) | low | ⚠️ visual safe; population partial | A + B |
| **Signals tab — BankerAutopilotRollup** | Top-N deals with next-best-action suggestion list | Suggestion-card layout, priority chips, dismiss/snooze controls (Phase 91 logic already exists in CatchUp) | none — derivation works from current data | none | low — Phase 91 ledger already exists | ✅ visual + composition | A |
| **Right rail — Closing soon** | Phase 117 list with "Not a calendar integration" disclaimer | Countdown chips per item, stage-color stripe, hover preview of deal facts | none | none | **must keep "Not a calendar integration" disclaimer** | ✅ visual only (disclaimer protected) | A |
| **Right rail — My Tasks** | Phase 119 top-3 list with overdue-first sort | Overdue badge styling, due-date countdown, completed-checkbox affordance (LOCAL_ONLY, no governed write) | Currently honest-empty per Phase 121 reduced scope | B (gated on Task AssignedTo fix; not Phase 122) | low | ⚠️ visual safe; population blocked | A + B |
| **Workspace switcher footer** | Phase 120 single-workspace static state | Premium pill + workspace-mode glyph; future-ready for multi-workspace dropdown | Single-workspace is honest until entitlement model surfaces multiples | A (visual); B (multi-workspace = new loader + entitlement read) | low — must keep "single workspace entitled" copy honest | ✅ visual safe; multi-workspace blocked | A |
| **Deal workspace — DealHeader** | Plain text title + stage + status + amount + target close | Hero header with status-color band, breadcrumb back-to-pipeline, primary action region (intentionally empty given no `New Deal` / `Log Activity`) | none | none | medium — must not surface unsupported actions | ✅ visual only | A |
| **Deal workspace — DealSummary** | Plain row of facts (product type, structure, customer, industry, guarantor, pricing, collateral) | Two-column glance layout, color-coded chips, copy-to-clipboard per row, missing-field hints | none | none | low | ✅ visual only | A |
| **Deal workspace — DealBlockers** | List of overdue / stale / past-close signals | Severity-grouped card with iconography per blocker type | none | none | low | ✅ visual only | A |
| **Deal workspace — DealStageProgressionCard** | Read-only stage eligibility signals | Vertical step indicator, "next eligible" chip, why-blocked hover detail | Stage progression is **deliberately not wired** (NOT_WIRED row) | D (any write attempt is governance violation; visual only OK) | high — must not imply advance-stage capability | ✅ visual only, strict no-action | A |
| **Deal workspace — DealAutopilotPanel** | 1–3 next-best-action suggestions with scroll-into-view links | Suggestion-priority card, dismiss/snooze (Phase 83 ledger exists) | none | none | low | ✅ visual + dismiss/snooze | A |
| **Deal workspace — DealTasks** | Task list + Complete modal | Task-card layout, due-date countdown, assignee chip, severity tint | Currently honest-empty per Phase 121 reduced scope (AssignedTo bug) | B (gated on AssignedTo fix, separate from Phase 122) | low | ⚠️ visual safe; population blocked | A + B |
| **Deal workspace — DealDocuments** | Doc table + Request/Receive/Review/Create-Task modals | Doc-card layout per status, type icon, due chip, action region | Currently honest-empty per Phase 121 reduced scope (Phase 122 dependency) | B (gated on Phase 122 retarget) | low | ⚠️ visual safe; population blocked | A + B |
| **Deal workspace — CreditMemo** | Card + draft modal | Memo-card with section-pills, freshness indicator, side-by-side draft preview | Existing 5 memos have null Deal FK so they don't surface on any deal | B (gated on Phase 122 if memos also legacy-targeted) | medium — must not auto-generate text | ✅ visual safe; population gated | A + B |
| **Deal workspace — ActivityTimeline** | Read-only event feed with last-visit badge + Outlook + Teams handoff | Event-icon column, time-bucket grouping, copy-summary affordance polish | none — empty by design until events accumulate | none | low | ✅ visual only | A |
| **Deal workspace — BorrowerCommunication** | Borrower-update draft modal + Send button + status packet draft | Draft-preview side panel, send-history rail, **honest "Outlook accepted" copy** (Phase 110 lock) | none | **STRICT — Phase 110 communication-lane lock; conservative-copy lock; no payload expansion** | **must not change** | ✅ visual surrounds only; never the lane itself | A (surrounding only) |
| **Deal workspace — TeamsChatHandoff / TeamsDealSummaryHandoff** | Buttons → clipboard / deep-link | Handoff-method picker polish | none | none | low | ✅ visual only | A |
| **Deal workspace — RelationshipContext** | Cross-deal client context card | Client-graph mini-view, related-deals chip ribbon | partial — needs multiple deals per client to surface meaningful context | A (visual) + C (richer relationship loaders) | low | ✅ visual; richer relationship needs more data | A + C |
| **Manager workspace** | Header + stacked cards | Sidebar + tabs + KPI grid (mirror banker shell), per-team KPI tiles, banker-filter affordance polish | none — existing data loaders sufficient | A | low | ✅ visual; mirror banker shell pattern | A |
| **Team workspace** | Header + stacked cards | Same shell-style upgrade as manager | none | A | low | ✅ visual | A |
| **Executive workspace** | Header + 2-col grid | Premium portfolio dashboard layout, sparklines per portfolio tile | partial — Phase 15 chose snapshot-only; deal drill-through is NOT_WIRED | A (visual) + D (deal drill-through is governance call) | medium — keep snapshot-only invariant | ✅ visual; drill-through stays blocked | A |
| **Admin workspace** | Diagnostic card stack | Per-card health-state polish, action region (Phase 109 smoke-test entry point already exists) | none — admin data loaders sufficient | A | low | ✅ visual | A |

---

## 4. Restoration backlog — buckets A / B / C / D

### A. Safe UI-only restoration (do now)

Composition / styling work only. No new data, no new loader, no
new write, no new governance discussion. Bucket A items are
gated only on phasing decisions (scope, sequencing, design
direction).

- A.1 — Banker shell premium polish: sidebar iconography, header greeting, KPI tile hero treatment for Active deals + Pipeline, badge styling across tiles, visual rhythm.
- A.2 — Pipeline tab Kanban / stage-lane layout (replaces the Phase 119 flat-tables-per-stage with a horizontal lane layout; deal-card per row; idle badge from existing modifiedon).
- A.3 — Deal workspace cockpit polish: DealHeader hero band, DealSummary two-column glance, DealBlockers severity grouping, DealTasks / DealDocuments / CreditMemo card-layout upgrade.
- A.4 — Activity tab time-bucket grouping (Today / This week / Earlier); type-icon column; "since your last visit" highlight (Phase 90 ledger already exists).
- A.5 — Relationships tab client-card layout; cross-deal chip ribbon.
- A.6 — Signals tab suggestion-card layout with priority chips + dismiss/snooze (Phase 83 ledger already exists).
- A.7 — Right rail polish: Closing-soon countdown chips; My-Tasks overdue badging; **keep "Not a calendar integration" disclaimer intact**.
- A.8 — Workspace switcher footer pill + future-ready dropdown affordance (still single-workspace state today).
- A.9 — Manager / Team / Executive / Admin: lift to the banker-shell pattern (sidebar + header + KPI grid + tabs + rail).

### B. Dataverse-blocked restoration (needs Phase 122 first)

Surfaces that are functionally complete but render honest-empty
today because the live Dataverse schema doesn't connect children
to the modern `cr664_loandeal` table. Phase 122 unblocks this
bucket.

- B.1 — Outstanding docs / Pending reviews / Action Queue document rows / Due Diligence tab population (gated on `cr664_documentchecklist.cr664_Deal` retarget — confirmed Phase 122 scope).
- B.2 — Open tasks / Action Queue task rows / My Tasks rail / Deal Tasks card population (gated on **two** separate issues: Phase 122 candidate `cr664_dealtask1.cr664_Deal` retarget IF inspection confirms it is legacy-targeted, AND the separate `cr664_dealtask1.cr664_AssignedTo` form/quick-find view bug).
- B.3 — Credit Memo card population (gated on Phase 122 candidate `cr664_creditmemo1.cr664_Deal` IF inspection confirms it is legacy-targeted).
- B.4 — Activity tab task / doc / memo modifiedon rows (gated on B.1 / B.2 / B.3 collectively — once those tables have populated Deal FKs, their modifiedon timestamps surface in the Activity feed too).

Bucket B's visual restoration (the A-side) can ship before
Phase 122 — the surfaces will render with honest empty-state
copy until Phase 122 retargets the lookups. Visual polish does
not depend on data presence.

### C. Future data/model restoration (new loaders / schema)

Surfaces requiring new Dataverse queries, new schema fields, or
upstream lane unlocks. Per Phase 118 §5.3.

- C.1 — Pipeline-weighted tile + High-probability tile + per-row probability badge — requires `cr664_probability` field on `cr664_loandeal` (schema confirmation first; field may or may not exist in live env). Probably a small Phase later.
- C.2 — YTD-closed tile + Win-rate tile — requires closed-deal-history loader (`statecode = 1` + closed status + year window). Schema-light; can be done after C.1 or independently.
- C.3 — Global search bar in header — requires `searchAcrossDeals(bankerId, query)` loader. Scope phase first; substantial UX decision.
- C.4 — Multi-workspace switcher (interactive dropdown) — requires `cr664_workspaceentitlement` loader (currently unpopulated in live env per Phase 115 bootstrap commentary).
- C.5 — Today's Schedule rail panel — Lane E (Outlook / Graph calendar) unlock required. Out of repo scope until upstream.
- C.6 — Cross-sell / pipeline-suggestion widgets — Lane F (Copilot) unlock required. Out of repo scope.
- C.7 — Contacts tab / entity — schema-blocked (no `cr664_contact` entity in scope today).
- C.8 — Vendors / Resources section — schema + governance decision required.

### D. Do-not-restore (governance / honesty conflicts)

Items that would violate existing invariants if shipped without
explicit scope-extension decisions.

- D.1 — `New Deal` action button — bucket D + E in Phase 118 inventory. Adds the first banker-side create-write since Phase 110. Requires `GOVERNED_WRITES` inventory addition + Dataverse FK targeting + form UI + audit/timeline wiring. **Must ask user first.** Visual mock or button without action would mislead operators — do not surface even visually.
- D.2 — `Log Activity` action button — same bucket; conflicts with Phase 110 communication-lane scope. **Must ask user first.**
- D.3 — Borrower-portal previews / borrower-side mockups — explicit `NOT_WIRED` row + Phase 64 / 65 deferral.
- D.4 — Any AI-generated / Copilot-suggestion surfaces that produce text content — would fabricate; Phase 75 module hygiene + Phase 110 conservative-copy lock both prohibit. Suggestions surfaced today are deterministic primitives (Phase 80 autopilot), not AI.
- D.5 — Faked schedule / faked alerts / faked cross-sell widgets — even as visual placeholders. Empty states must remain honest; do not add "Sample meeting at 2pm" or similar mocks.
- D.6 — Multi-workspace dropdown showing UI options for workspaces the signed-in user is not entitled to. Phase 120 single-workspace state is the only honest representation today.
- D.7 — Any "Send Notification" / "Notify Borrower" / "Trigger Reminder" surface that bypasses the Phase 104–110 communication lane. Conservative copy + single-callsite invariants are protected; do not add wrappers.

---

## 5. Proposed phase sequencing

Each is a candidate phase brief. None is committed until user
approves the next one. Phases are listed in restoration-cost
order (cheapest, lowest-risk first).

### Phase 123 — Premium OGB Banker Command Center visual shell

**Scope:** A.1 + A.8 + a coordinated sidebar/header/right-rail
visual upgrade. No new data. No new loader. No new write. Theme-
extension only (`src/shared/theme.ts` gets gradient + glyph
tokens) + per-component inline-style upgrade.

**Out of scope for 123:** Kanban pipeline (Phase 124), deal
workspace cockpit (Phase 125), all bucket B / C / D items.

**Risk:** low. Pure cosmetic.

### Phase 124 — Rich pipeline / stage-board experience

**Scope:** A.2. Replace the Phase 119 flat-table-per-stage in
`PersonalPipeline.tsx` with a horizontal stage-lane layout +
deal-card per row + idle/stale badges. Stage catalog ordering
unchanged (Phase 119 `STAGE_CATALOG` ordinal already correct).

**Out of scope:** probability ribbons (C.1), drag-drop stage
advancement (NOT_WIRED — Phase 28 schema gap).

**Risk:** low-medium. Visual refactor of one component; tests
update needed.

### Phase 125 — Deal workspace cockpit restoration

**Scope:** A.3. Premium polish across DealHeader, DealSummary,
DealBlockers, DealStageProgressionCard, DealAutopilotPanel
(banker-only surfaces; manager / team / executive deal views
already read-only and visually adequate). Action-region for
the deal header is intentionally empty.

**Out of scope:** DealTasks / DealDocuments / CreditMemo card
upgrade (gated by B.2 / B.1 / B.3 respectively — wait for
Phase 122 + the AssignedTo fix before the visual upgrade lands
where the operator can see the polished version).

**Risk:** low-medium. Touches many cards but no data layer.

### Phase 126 — Relationship + Signals visual restoration

**Scope:** A.5 + A.6. Client-card layout for Relationships;
suggestion-card layout for Signals (Phase 83 + 91 dismiss/snooze
already exists locally).

**Risk:** low. Existing data primitives drive these surfaces.

### Phase 127 — Credit memo premium workspace

**Scope:** A.3 (CreditMemo card subset) + visual polish of the
CreditMemoDraftModal. Honest empty state preserved if no memos
exist on the deal (post-Phase 122 the 5 existing memos may
remain orphaned with null Deal FK).

**Risk:** low. Existing memo loader + Phase 73 consistency
check + Phase 80 freshness signal all preserved.

### Phase 128 — Task / document UX after Dataverse Phase 122

**Scope:** A.3 (DealTasks + DealDocuments card upgrade) +
re-walk the Phase 121 §4 validation against the now-populated
state. Visual surfaces from Phases 119–120 (Action Queue, Due
Diligence, My Tasks rail, KPI tiles) start surfacing real
content.

**Hard prerequisite:** Phase 122 must ship first. The visual
work can begin earlier under feature-flag, but the canonical
validation walk requires real data.

**Risk:** medium. Two-phase sequencing dependency.

### Phase 129 — Manager / team / executive visual parity

**Scope:** A.9. Lift `ManagerWorkspace`, `TeamWorkspace`,
`ExecutiveWorkspace`, `AdminWorkspace` to the banker-shell
pattern (sidebar + header + KPI grid + tabs + rail). Each
workspace's existing card stack maps to a tab; existing data
loaders are unchanged.

**Risk:** medium. Touches 4 routes + 4 shell components; each
needs its own test extension.

---

## 6. Honest constraints that carry forward to every Phase 123–129

1. **No Buddy references** — strictly OGB LOS / Commercial Lending LOS scope.
2. **No fabricated / sample data** — every empty state stays honest. Visual upgrades change *how* an empty state renders, never *whether* it is empty.
3. **No fabricated AI claims** — Phase 75 / 76 / 80 / 82 / 88 / 89 deterministic primitives stay deterministic. No "Copilot says…" / "AI recommends…" copy.
4. **No unauthorized workspace access** — `BankerProvider` fail-closed routing untouched; workspace switcher stays single-workspace until C.4.
5. **No fallback dashboards** — `if (no data) return mockShell` patterns remain forbidden.
6. **Permission-before-render** — all banker surfaces continue to render only inside `BankerProvider`.
7. **Fail-closed** — all loaders continue to filter by the signed-in banker's id.
8. **EMAIL lane governance (Phase 104–110)** — single `Office365OutlookService` import, single `SendEmailV2` callsite, three `getEmailAdapter()` callers, no payload expansion. Visual upgrades to BorrowerCommunication card surrounds only; the lane itself is untouched.
9. **No live borrower communication sends** during any visual work.
10. **Honest empty states** — may be visually richer (better copy, better iconography, clearer next steps), but never fabricate a row to fill them.
11. **No production code changes in this audit phase.** Phase 123+ are the implementation phases; Phase 122A is documentation-only.

---

## 7. Verification

- `npm test -- --run`: full suite passes unchanged (docs-only edit).
- `npm run build`: clean.
- `src/shared/governance/releaseCandidateSnapshot.test.ts`: required-doc-existence pin extended to include `docs/PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md`.

No `pac code push` needed.

---

## 8. Cross-references

- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the gap baseline; this audit consumes its §3 + §4 surface map and refines the §5 backlog into a phased visual-restoration sequence.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) + [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — the bucket-A wave 1 / 2 functional restorations whose visual polish is now scoped in §5 above.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — Phase 121 validated 2026-05-27; honest-empty Task / Document / Due Diligence / Action Queue surfaces this audit categorizes as bucket B.
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — the Dataverse-config phase that unblocks bucket B.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants every Phase 123+ visual restoration must respect.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the empty-state shell Phases 123–129 will progressively enrich.
- [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — the lane-A / lane-E / lane-F coverage map; every bucket-C / bucket-D item references a specific lane.
- `src/banker/BankerShell.tsx` — the shell every Phase 123+ visual restoration extends.
- `src/shared/theme.ts` + `src/index.css` — the design-token surface area Phase 123 expands.
