# Phase 125 — Deal Workspace Cockpit

> ### Hotfix — 2026-05-27 (post-deploy, pre-Phase-126 deploy)
>
> **Symptom (production).** After Phase 125 deployed, clicking
> `TEST — Deal Phase 121` from the Pipeline tab OR from
> Morning Catch-Up blanked the content area. Console showed
> `Uncaught Error: Minified React error #310`.
>
> **Root cause — pre-existing Phase 83 hooks violation, surfaced
> by Phase 121 + Phase 125.** [src/deals/DealAutopilotPanel.tsx](../src/deals/DealAutopilotPanel.tsx)
> called `useSuggestionLedger()` AFTER two early returns
> (`if (!dataReady) return …` + `if (suggestions.length === 0)
> return …`). React error #310 = `formatProdErrorMessage(310)`
> in `react-dom-client.production.js` line 4472 = "Rendered more
> hooks during this render than during the previous render"
> (hook-count mismatch in `updateWorkInProgressHook`).
>
> Path that triggered the crash:
>
> 1. Initial render: `dataReady = false` (child loaders still
>    loading). Component runs `useDealData` + 3 `useMemo` calls,
>    then returns the "Loading deal signals…" Card early. Hook
>    count: 4.
> 2. Child loaders resolve. `dataReady` flips to `true`. The
>    seeded `TEST — Deal Phase 121` has `targetCloseDate = today
>    + 7d`, which makes `deriveNextBestActions` produce a
>    closing-soon suggestion → `suggestions.length > 0` → both
>    early returns are skipped → execution reaches the
>    conditional `useSuggestionLedger()` call. Hook count: 5.
> 3. React compares the hook chain from render 1 (4 hooks) with
>    render 2 (5 hooks) inside `updateWorkInProgressHook`, finds
>    the mismatch, and throws #310. The error boundary catches
>    it and blanks the workspace.
>
> The bug has been latent since Phase 83 (Sept 2025 codebase, per
> the Phase 83 ledger doc). It went unnoticed because:
>
> - Pre-Phase-121: no banker had any deal in the live env, so the
>   path from `dataReady=false` → `suggestions.length > 0` never
>   fired in production.
> - Phase 121 seeded the first real deal that produces a
>   suggestion. Phase 125 changes are unrelated to the hook
>   ordering, but Phase 125's polish was the trigger for this
>   deployment cycle.
>
> **Fix.** [src/deals/DealAutopilotPanel.tsx:60-65](../src/deals/DealAutopilotPanel.tsx#L60-L65) —
> hoisted `const ledger = useSuggestionLedger();` to the top of
> the component, immediately after `useDealData()`. The hook now
> fires on every render regardless of which branch the early
> returns take. `ledger` is still only **used** in the populated
> render path — calling it unconditionally is the correct React
> Hooks contract; using its value only when needed is fine.
>
> **Regression test.** Two new test cases in
> [src/deals/DealAutopilotPanel.test.tsx](../src/deals/DealAutopilotPanel.test.tsx)
> under `describe('DealAutopilotPanel — Phase 125 hotfix (deal-
> click crash, React error #310)')`:
>
> 1. **`does NOT crash with React error #310 when the panel
>    transitions from loading → ready+populated`** — uses
>    `render(...)` + `rerender(...)` to simulate the exact state
>    transition that triggered the production crash, with a deal
>    factory that mirrors the seeded `TEST — Deal Phase 121`
>    shape (sparse summary fields, target close 7d out). The
>    pre-hotfix code would have thrown #310 on `rerender`; the
>    post-hotfix code renders the populated branch cleanly.
> 2. **`does NOT crash when the panel transitions from loading
>    → ready+empty`** — companion regression for the empty-
>    suggestions branch. Pre-hotfix this path didn't fire the
>    bug (the `if (suggestions.length === 0) return …` branch
>    also returned before the conditional hook), but pinning
>    both transitions guards against any future refactor that
>    re-introduces the pattern.
>
> Full test suite still passes: **120 files / 2713 tests** (+2
> new regression cases on top of the Phase 126 baseline of
> 2711).
>
> **Deployment posture.** Phase 126 was held in the repo
> pending this hotfix. The next `pac code push` will deploy
> Phase 125 + the hotfix + Phase 126 together. See
> [PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md](PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md)
> for the Phase 126 deployment-hold record.
>
> **Files touched in the hotfix.**
> - [src/deals/DealAutopilotPanel.tsx](../src/deals/DealAutopilotPanel.tsx) — hook hoisted to top, comment block explains the contract.
> - [src/deals/DealAutopilotPanel.test.tsx](../src/deals/DealAutopilotPanel.test.tsx) — 2 new regression test cases.
>
> No production code other than `DealAutopilotPanel.tsx` was
> modified. No Dataverse schema / loader / governed-write
> change. Phase 110 communication lock untouched.

---

**Status:** **Shipped + hotfixed.** Visual / composition-only
upgrade scoped to the Banker Deal Workspace. Clicking a deal card in the Phase
124 stage-board now opens a workspace that visually matches the
Phase 123 shell + Phase 124 board — a premium OGB LOS commercial
lending cockpit, not a plain detail page. No Dataverse schema
changes. No loader / query changes. No new governed writes. No
fake / sample data. No email-lane changes.

Related canonical sources:
- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5 — the bucket-A backlog item Phase 125 implements.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md) — the shell-level design language Phase 125 carries into the deal workspace.
- [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md) — the Kanban + deal card whose visual vocabulary Phase 125 echoes inside each per-deal card.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants Phase 125 explicitly does not touch.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — Phase 121 validated 2026-05-27; the empty-state surfaces Phase 125 polishes are exactly the ones Phase 121 confirmed render honestly.
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — the Dataverse-config phase that will populate the framed-empty Task / Document / Credit Memo cards Phase 125 just polished.

---

## 1. What changed

### 1.1 DealHeader — cockpit hero band

Full rewrite of `src/deals/DealHeader.tsx` for the cockpit feel:

- **Header band**: 3px primary top stripe + `shadow.elevated`
  (Phase 123 token). Matches the BankerShell header band.
- **Eyebrow row**: brand-accent dot + `Deal · Commercial Lending`
  + stage chip (info-tinted outlined) + status chip (neutral
  outlined). Replaces the previous unbranded "Deal" eyebrow.
- **Title row**: hero-scale `<h1>` (`typography.size.hero`,
  `weight.bold`) for the deal name, paired with a right-aligned
  **amount hero block** that has its own 3px primary left
  accent stripe.
- **Honest missing-state**: when `deal.amount` is `undefined`,
  the amount hero block still renders the `Loan amount` label
  but the value becomes the italic `Not set` copy — never
  silent `$0`, never `—` filler.
- **Fact row**: Client / Assigned banker / Target close render
  as a 3-column grid; each missing value surfaces as italic
  `Not set` (consistent with Phase 124's "Amount not set" /
  honest-absence pattern in the DealCard).
- **Target close** now carries a relative countdown when
  parseable: `Jun 3, 2026 (in 8d)` / `Jun 3, 2026 (3d past)` /
  `Jun 3, 2026 (today)` — matches Phase 124's
  `formatTargetClose` cadence so the cockpit and the Kanban
  card speak the same language about target close.

Files touched:
- [src/deals/DealHeader.tsx](../src/deals/DealHeader.tsx) — full rewrite.

### 1.2 DealBlockers — severity-tinted signal frames

Each blocker signal now renders inside a subtle framed row
(`palette.surfaceAlt` background, 1px border, 3px severity-tinted
left stripe matching `severityPalette[sev].bar`). The
`StatusDot` + label + detail layout is unchanged; the framing
makes severity glanceable without changing per-row content.

Files touched:
- [src/deals/DealBlockers.tsx](../src/deals/DealBlockers.tsx) — `signal` style + per-row inline border-left.

### 1.3 DealStageProgressionCard — same treatment as DealBlockers

Reason rows now use the same severity-tinted framed-row pattern.
The `nextActionBox` ("Next action guidance") gets a 3px left
border (instead of uniform 1px) so the severity tint reads more
strongly without changing the existing background-tinted
treatment.

Files touched:
- [src/deals/DealStageProgressionCard.tsx](../src/deals/DealStageProgressionCard.tsx) — `signal` + `nextActionBox` styles + per-row inline border-left.

### 1.4 Framed honest-empty states across 5 cards

The plain italic muted `<p>` empty-state text inside DealTasks,
DealDocuments, CreditMemo, ActivityTimeline, and
BorrowerCommunication is replaced with the same dashed-border
framed empty-state treatment Phase 123 introduced (and Phase
124 used inside Kanban lanes):

- `padding: spacing.md spacing.lg`
- `background: palette.surfaceAlt`
- `border: 1px dashed palette.borderStrong`
- `borderRadius: radius.md`
- `textAlign: center`
- `fontSize: typography.size.sm`, `lineHeight: 1.4`

Every existing piece of empty-state copy is preserved verbatim
("No tasks on this deal yet.", "No documents on this deal
yet.", "Loading documents…", per-section "No open tasks." /
"No completed tasks yet." / "No outstanding documents." /
"None received yet." / "No reviewed documents yet.", etc.) —
only the visual framing changed.

This is critical for the Phase 121 reduced-scope reality: the
honest-empty Task / Document / Credit-Memo surfaces are what
the deal workspace shows TODAY against the seeded `TEST — Deal
Phase 121` (until Phase 122 retargets the legacy lookups). The
framed empty states make those surfaces read as deliberate,
not as forgotten placeholders.

Files touched:
- [src/deals/DealTasks.tsx](../src/deals/DealTasks.tsx) — `styles.muted`.
- [src/deals/DealDocuments.tsx](../src/deals/DealDocuments.tsx) — `styles.muted`.
- [src/deals/CreditMemo.tsx](../src/deals/CreditMemo.tsx) — `styles.muted`.
- [src/deals/ActivityTimeline.tsx](../src/deals/ActivityTimeline.tsx) — `styles.muted`.
- [src/deals/BorrowerCommunication.tsx](../src/deals/BorrowerCommunication.tsx) — `styles.muted`.

### 1.5 What was deliberately NOT touched

- **`Card.tsx`** — the shared Card primitive is unchanged. Phase
  125 stays focused on the deal workspace; cascading a Card-
  level change would ripple across manager / team / executive /
  admin workspaces that Phase 129 will address separately.
- **`DealSummary.tsx`** — already renders cleanly with `Card` +
  `CardHeader` + dt/dd grid + italic `Not provided` missing-
  state. Phase 125 leaves the "Not provided" copy alone for
  consistency with `creditMemoDraft.ts` + `teamsDealSummary.ts`
  outputs that share the same string.
- **`DealAutopilotPanel.tsx`** — already premium with severity-
  tinted suggestion cards + Phase 83 local dismiss/snooze. No
  refactor was needed.
- **`RelationshipContext.tsx`**, **`TeamsChatHandoff.tsx`**,
  **`TeamsDealSummaryHandoff.tsx`** — already use the Card
  primitive and read as cockpit-grade in the current
  composition.
- **Task rows / Document rows inside their respective cards** —
  the inline list / row-level layouts inside DealTasks and
  DealDocuments remain Phase 119-era. Phase 128 (post-Phase
  122 retarget) will upgrade those once the rows are populated
  with real data. Polishing empty rows that don't exist yet
  would be premature.
- **CreditMemoDraftModal** — premium modal-level polish for
  the memo workspace is Phase 127's scope.
- **`BankerDealWorkspace.tsx` shell padding** — the existing
  layout works correctly under the Phase 123 shell's `tabPanel`
  wrapper. No changes needed.

---

## 2. What did NOT change

Phase 125 is strictly visual / composition. The following are
explicitly unchanged:

- **`loadDealForBanker`** — same authorized projection.
- **`DealDataProvider`** — same loading orchestration.
- **`deriveBlockers` / `deriveCreditMemoFreshness` / `deriveStageProgressionEligibility` / `deriveNextBestActions`** — every derivation function unchanged.
- **`Cr664_*Service` write callsites** — zero governed writes touched.
- **Email lane** — no new `Office365OutlookService` import, no new `SendEmailV2` callsite, no new `sendXEmail` import. Phase 110 communication-lane lock remains intact. Static-source pins on `DealHeader.tsx` assert this.
- **All modal write surfaces** — RequestDocumentModal, ReceiveDocumentModal, ReviewDocumentModal, CreateDocumentReviewTaskModal, CompleteTaskModal, CreditMemoDraftModal, DraftBorrowerUpdateModal, BorrowerSafeStatusPacketModal — unchanged.
- **Permission-before-render** — `loadDealForBanker` continues to fail-closed with `kind: 'denied'` for non-assigned deals; `<ErrorState>` rendering unchanged.
- **Breadcrumb** — `← Banker Command Center` / `<deal name>` rendering unchanged.
- **Empty-state copy** — every honest-empty string preserved verbatim. Only the visual framing changed.
- **`Card.tsx`, `Badge.tsx`, `StatusDot.tsx`** — shared primitives unchanged.

---

## 3. Test surface

### 3.1 Test count + outcome

- `npm test -- --run`: **120 files / 2701 tests passed** (+10 from new `DealHeader.test.tsx`; full suite was 2691 → 2701).
- `npm run build`: clean.

### 3.2 New test file

[src/deals/DealHeader.test.tsx](../src/deals/DealHeader.test.tsx)
ships 10 cases across two describe blocks pinning the Phase 125
cockpit hero band invariants:

| Block | Cases |
| --- | --- |
| **DealHeader cockpit hero band (rendering)** | renders deal name as `<h1>`; renders eyebrow lockup `Deal · Commercial Lending`; renders stage + status chips; renders formatted loan amount when present; renders honest `Not set` amount when missing (never silent `$0`); renders `Not set` for missing client / banker / target-close; no Phase-110 forbidden vocabulary. |
| **DealHeader.tsx static-source pins** | no `Office365OutlookService` import; no `SendEmailV2` callsite; no `sendXEmail` action import. |

The intent of these tests is to PIN the cockpit invariants
without asserting any pixel-perfect styling. Visual polish can
evolve in subsequent phases; the honest-absence + Phase 110
constraints must not regress.

### 3.3 Why existing tests still pass

Every existing Phase 4 / 26 / 27 / 51 / 53 / 54 / 80 / 95 / 99 /
100 / 117 / 119 / 120 / 122 / 122A / 123 / 124 test that
exercises any of the deal workspace cards continues to pass:

- **DealBlockers tests** — assert signal severity dot / label /
  detail. Phase 125 didn't change those text contents or the
  StatusDot variant logic; the `signal` style change only
  affected padding + background + border.
- **DealStageProgressionCard tests** — same reasoning.
- **DealTasks / DealDocuments / CreditMemo / ActivityTimeline /
  BorrowerCommunication tests** — assert text content of empty
  states + modal triggers. The `muted` style change is purely
  visual; no text or test selector affected.
- **CreditMemo `Not provided` placeholder** — `creditMemoDraft.ts`
  + `teamsDealSummary.ts` tests pin the literal string
  `Not provided` for missing fields in the credit-memo handoff
  output. Phase 125 deliberately did NOT change that string in
  DealSummary either, so all those tests pass unchanged.

---

## 4. Acceptance criteria

- [x] Clicking `TEST — Deal Phase 121` opens a materially more premium deal workspace.
- [x] DealHeader hero band feels like a cockpit anchor (primary accent stripe + hero-scale name + amount hero block + eyebrow lockup + relative target-close countdown).
- [x] Missing task / document / memo data remains honestly empty pending Phase 122 — now in framed dashed-border treatment so the empty state reads as deliberate.
- [x] No fake / sample data introduced.
- [x] No Dataverse / schema changes.
- [x] No loader / query changes.
- [x] No new governed writes.
- [x] No live communication behavior changed.
- [x] Phase 110 communication-lane lock preserved (asserted by static-source pin on `DealHeader.tsx`).
- [x] Permission-before-render intact (`loadDealForBanker` denied / not-found / failed branches unchanged).
- [x] All 2701 tests pass.
- [x] Build clean.

---

## 5. What Phase 125 explicitly does NOT do

Per the Phase 122A backlog sequencing:

- **Phase 126 — Relationships + Signals visual restoration.** RelationshipMemory (banker workspace card) + BankerAutopilotRollup + BankerMorningCatchUp + PersonalActivitySummary visual upgrades remain for Phase 126.
- **Phase 127 — Credit memo premium workspace.** The CreditMemo card's empty state was framed in Phase 125, but the full premium memo-editing workspace (modal polish + section-pill layout + side-by-side preview) is Phase 127's scope.
- **Phase 122 — Dataverse lookup retargeting** for `cr664_documentchecklist.cr664_Deal` (and candidates on `cr664_dealtask1` / `cr664_creditmemo1` / `cr664_creditmemodraftsection` / `cr664_dealtimelineevent`). Without Phase 122, the Task / Document / Credit-Memo cards remain in their framed empty state.
- **Phase 128 — Task / document UX after Phase 122.** Row-level task / document layout upgrade (card-per-row, severity-tinted left stripes, due-date countdown chips) waits for Phase 122 retargeting so the polish ships against populated data.
- **Phase 129 — Manager / team / executive / admin visual parity.** The shared `Card.tsx` primitive was left untouched in Phase 125 so the other workspaces' Card-based surfaces don't shift unintentionally before Phase 129 lifts them to the banker shell pattern.
- **No `New Deal` / `Log Activity` / `Advance Stage` write surfaces** introduced — those remain bucket D in Phase 122A (must ask first; communication-lane scope decision required).
- **No probability ribbons / win-rate badges / AI-recommendation copy / approval-odds claims.**

---

## 6. Verification

```bash
npm test -- --run    # 120 files / 2701 tests passed
npm run build        # clean
```

The cockpit upgrade will become visible on next
`pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS`.

Post-push observation against the seeded `TEST — Deal Phase
121`:

- Click the deal card in the Pipeline tab's Kanban → opens
  `/deals/<id>`.
- Hero band reads as the cockpit anchor: primary top stripe,
  `Deal · Commercial Lending` eyebrow, hero `TEST — Deal Phase
  121` heading, info-tinted `TEST — Stage Phase 121` chip +
  neutral outlined `TEST — Status Phase 121` chip,
  right-aligned `$2.5M` amount hero block with primary left
  stripe, target-close countdown.
- DealBlockers + DealStageProgressionCard render each signal as
  a framed severity-tinted row.
- DealTasks / DealDocuments / CreditMemo / ActivityTimeline /
  BorrowerCommunication empty states render as framed dashed-
  border cards — clearly intentional honest-empty, not
  placeholder filler.
- No `New Deal` / `Log Activity` / `Send Notification` /
  unsupported action buttons surface anywhere.

---

## 7. Cross-references

- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5 — the bucket-A backlog item Phase 125 implements.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md), [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md) — design tokens + framed-empty-state pattern reused inside the deal workspace.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane lock this phase honors.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) — the seeded `TEST — Deal Phase 121` that surfaces in the polished cockpit.
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — the Dataverse-config phase that will populate the framed-empty Task / Document / Credit Memo cards.
- `src/deals/DealHeader.tsx` — the only full rewrite.
- `src/deals/DealBlockers.tsx`, `src/deals/DealStageProgressionCard.tsx` — signal-row + reason-row framing.
- `src/deals/DealTasks.tsx`, `src/deals/DealDocuments.tsx`, `src/deals/CreditMemo.tsx`, `src/deals/ActivityTimeline.tsx`, `src/deals/BorrowerCommunication.tsx` — framed honest-empty states.
- `src/deals/DealHeader.test.tsx` — new test file pinning Phase 125 cockpit invariants.
- `src/shared/theme.ts` — Phase 123 `shadow.elevated` token reused.
