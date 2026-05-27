# Phase 126 — Relationships + Signals Visual Restoration

> ### Deployment-hold record — 2026-05-27
>
> Phase 126 finished cleanly in the repo on 2026-05-27 but was
> **NOT deployed alone**. The Phase 125 deploy surfaced a
> deal-click crash (React error #310) caused by a pre-existing
> hooks-order bug in `DealAutopilotPanel.tsx` — see the
> "Hotfix" block at the top of
> [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md)
> for the full root cause + fix + regression test record.
>
> Per the sequencing rule, Phase 126 stayed in the repo and the
> next `pac code push` will combine **Phase 125 + the Phase 125
> hotfix + Phase 126** in one deploy. Phase 126 is not pushed by
> itself over a known deal-click crash.
>
> **Post-hotfix live check order (operator):**
>
> 1. `pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS`
> 2. Hard refresh the deployed app (Ctrl + F5).
> 3. From the Pipeline tab → click `TEST — Deal Phase 121`. Confirm the deal workspace renders without crash; React error #310 no longer fires.
> 4. Return to Overview → click `TEST — Deal Phase 121` from the Morning Catch-Up card. Confirm the same.
> 5. Click into the **Relationships** tab. Confirm the framed empty-state + premium row treatment.
> 6. Click into the **Signals** tab. Confirm the framed empty-state + severity-tinted row treatment (if any signals surface on the seeded deal).
>
> Phase 126 verification is gated behind steps 1–4. If steps 3 or 4 fail, stop and re-investigate; do not validate the Relationships / Signals visual work against a broken deal-click path.

---

**Status:** **Shipped (held for combined deploy with Phase 125 hotfix).** Visual / composition-only upgrade scoped
to the Banker Command Center's Relationships tab + Signals tab.
The two tabs read as premium OGB LOS intelligence spaces now,
matching the Phase 123 shell + Phase 124 stage-board + Phase 125
deal cockpit. No Dataverse schema changes. No new loaders. No
new governed writes. No fake / sample data. No fake AI /
predictive / ranking language. No email-lane changes.

Related canonical sources:
- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5.1.A.5 + §5.1.A.6 — the bucket-A items Phase 126 implements.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md), [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md), [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — the design language Phase 126 carries into the Relationships + Signals tabs (primary accent stripes, framed dashed-border empty states, severity-tinted left borders).
- [PHASE_76_RELATIONSHIP_MEMORY_LITE.md](PHASE_76_RELATIONSHIP_MEMORY_LITE.md), [PHASE_82_BANKER_AUTOPILOT_ROLLUP.md](PHASE_82_BANKER_AUTOPILOT_ROLLUP.md) — the deterministic derivation primitives this phase visually elevates. **Neither derivation changed.**
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants Phase 126 honors. Static-source pins now assert the lock holds on both touched files.

---

## 1. What changed

### 1.1 RelationshipMemory (Relationships tab) — premium framing

The Phase 76 client-grouped relationship-memory card already
carried all the deterministic content the tab needs (per-client
active deal count, total pipeline, last activity, nearest
upcoming close, open asks, attention badges, deal pills, Phase
78 local draft-note button, Phase 100 Teams copy, Phase 101
Outlook handoff). Phase 126 only changes how it LOOKS:

- **Loading + empty states** — `styles.muted` upgraded from
  plain italic text to a framed dashed-border card matching the
  Phase 123 / 124 / 125 pattern (`palette.surfaceAlt`
  background, `1px dashed palette.borderStrong`, `radius.md`,
  centered). Every empty-state copy string preserved verbatim.
- **Client row** — promoted from `palette.surfaceAlt` background
  with a thin divider border to a `palette.surface` card with a
  `1px palette.border` frame **plus a 3px `palette.primary`
  left accent stripe**. Padding increased from `spacing.sm
  spacing.md` to `spacing.md spacing.lg`. Border radius bumped
  from `radius.sm` to `radius.md`. Per-row gap promoted to
  `spacing.xs`.
- **Client name** — typography bumped from `size.base` to
  `size.lg`, weight from `semibold` to `bold`, and gained
  `letterSpacing.heading` to match the cockpit hero pattern.

Files touched:
- [src/banker/RelationshipMemory.tsx](../src/banker/RelationshipMemory.tsx) — `styles.muted` / `styles.row` / `styles.clientName` only. All component logic, derivation, copy, and modal wiring unchanged.

### 1.2 BankerAutopilotRollup (Signals tab) — severity-tinted framing

The Phase 82 banker-side autopilot rollup already deterministically
derives priority-counted next-best-action signals from the
work-queue data, with Phase 83 local-only dismiss/snooze, Phase
95 memo-consistency findings, and Phase 80 per-deal scroll-into-
view. Phase 126 only changes how it LOOKS:

- **Loading + zero-active-deals + zero-suggestions empty states**
  — same framed dashed-border treatment as RelationshipMemory.
  Every empty-state copy string preserved verbatim, including
  "Nothing happens automatically. No AI or automated decisions."
  honest framing.
- **Rollup row** — promoted from `palette.surfaceAlt` background
  with a thin divider border to a `palette.surface` card with a
  `1px palette.border` frame **plus a 3px severity-tinted left
  accent stripe** driven by the row's `highestPriority` value
  (high = atRisk red, medium = info blue, low = neutral gray).
  The dismissed-state styling (`rowDismissed` opacity 0.6) is
  preserved verbatim and composed on top of the new framed row.

Files touched:
- [src/banker/BankerAutopilotRollup.tsx](../src/banker/BankerAutopilotRollup.tsx) — `styles.muted` / `styles.row` only, plus a `severityPalette` import for the per-row inline accent stripe. All derivation, ledger wiring, copy, and existing styles preserved.

### 1.3 What did NOT change

Phase 126 is strictly visual. The following are explicitly
unchanged:

- **`deriveRelationshipMemory`**, **`deriveBankerAutopilotRollup`**, **`checkCreditMemoConsistency`**, **`useSuggestionLedger`** — every derivation / state-hook unchanged.
- **`loadBankerWorkQueueData`** — same loader contract.
- **All copy strings** — including every empty-state phrase, the conservative disclaimers ("not a relationship score", "No predictive claim", "Nothing happens automatically. No AI or automated decisions."), the dismiss/snooze tags, the signal coverage paragraph, the Phase 100 / Phase 101 handoff button labels.
- **Modal wiring** — `RelationshipNoteDraftModal` (Phase 78 local-only), `SummaryOutlookHandoffButtons` (Phase 101 governed mailto handoff), `RelationshipMemoryTeamsCopyButton` (Phase 100 clipboard).
- **Phase 110 communication-lane lock** — no `Office365OutlookService` import added, no `SendEmailV2` callsite added, no `sendDocumentRequestEmail` / `sendBorrowerUpdateEmail` import added. New static-source pins on both files (§3.2 below) assert this.
- **Phase 83 suggestion ledger** — local-only dismiss/snooze unchanged.
- **Phase 86 / 96 / 97 / 99 / 100 / 101 handoff surfaces** — all clipboard / Outlook mailto / Teams handoff buttons unchanged.
- **`Card.tsx`, `Badge.tsx`, `StatusDot.tsx`** shared primitives unchanged.
- **7 sidebar nav items + 7 tab bar tabs** — Phase 117 / 120 invariants intact (asserted by existing BankerShell tests).

---

## 2. Honest-data discipline

Both tabs continue to derive every visible element from real
authorized data:

| Surface | Data source | Honest behavior |
| --- | --- | --- |
| RelationshipMemory active deal count | `data.deals.filter(banker-FK)` length per client | `0` if no deals — card renders the framed empty state instead. |
| RelationshipMemory total pipeline | Sum of `cr664_amount` per client | Honestly omits when sum is zero; surfaces `($N missing $)` italic gap when some deals have null amounts. |
| RelationshipMemory last activity / nearest close | `modifiedon` / `cr664_targetclosedate` from visible records | `—` placeholder only when no parseable timestamp exists across the client's deals; the relative-time formatter says `today` / `Nd ago` / etc. for real values. |
| RelationshipMemory attention badges | Phase 76 derivation counts (overdue tasks, pending review, closing soon, stage attention, draft memos) | Badge rendered only when the count > 0. No fabricated badges. |
| BankerAutopilotRollup priority counts | `deriveBankerAutopilotRollup` counts of high / medium / low priority deals | All zero if no deals scanned; falls into the framed empty state. |
| BankerAutopilotRollup top-5 deals | Sorted by priority → suggestion count → nearest close → name | Empty list falls into the no-suggestions framed empty state. |
| BankerAutopilotRollup top suggestion + reason | Phase 80 `deriveNextBestActions` deterministic output | Surfaces only signals the deterministic rules produce; nothing inferred, nothing AI-generated. |
| BankerAutopilotRollup local dismiss / opened tags | Phase 83 `useSuggestionLedger` (browser localStorage) | Honest "tracked on this browser only" tag; no Dataverse write. |

No card surfaces fabricate values for missing data. Every empty
state is honestly empty.

---

## 3. Test surface

### 3.1 Test count + outcome

- `npm test -- --run`: **120 files / 2710 tests passed** (+8 new
  Phase 126 static-source pins on top of the Phase 125 baseline
  of 2702).
- `npm run build`: clean.

### 3.2 New static-source pins

Both card source files gain a **`Phase 126 — static-source pins`**
describe block at the bottom of their existing test file:

| Pin | Reason |
| --- | --- |
| No `from '…Office365OutlookService'` import | Phase 110 communication lane lock — only the email adapter at `src/deals/emailDelivery/outlookEmailAdapters.ts` imports the SDK service. |
| No `SendEmailV2(` callsite | Phase 110 single-callsite invariant. |
| No `sendDocumentRequestEmail` / `sendBorrowerUpdateEmail` import | Phase 110 governed-action callsite count invariant. |
| No fabricated-AI claim vocabulary in source | Spot-check that the visual upgrade did NOT introduce `AI score`, `approval probability`, `approval odds`, `borrower sentiment`, `lender match`, `predicted close date`, or `risk rating` strings. Negation disclaimers ("not a relationship score", "No AI or automated decisions") remain — those are the honest framing of what the cards are NOT. |

Files touched (test):
- [src/banker/RelationshipMemory.test.tsx](../src/banker/RelationshipMemory.test.tsx) — `Phase 126 — RelationshipMemory.tsx static-source pins` block (4 new test cases). Pre-existing 21 cases pass unchanged.
- [src/banker/BankerAutopilotRollup.test.tsx](../src/banker/BankerAutopilotRollup.test.tsx) — `Phase 126 — BankerAutopilotRollup.tsx static-source pins` block (4 new test cases). Pre-existing 14 cases pass unchanged.

### 3.3 Why no new "render" tests were added

The existing Phase 76 + Phase 82 test files **already pin every
behavioral invariant** Phase 126's brief asks for:

- Empty state when no client data → existing Phase 76 case `renders the empty state when the banker has no active deals` (line 105).
- Populated relationship rendering → existing Phase 76 case `renders a single-client snapshot with all the standard rows + pills` (line 114).
- Signals tab deterministic only → existing Phase 82 cases for priority counts, top-5 rendering, dismissed/restored flow.
- No fake AI / predictive language in DOM → existing Phase 76 case `renders the conservative disclaimer + forbidden-vocab scan passes` (line 263) which already grep-scans the rendered DOM for `AI-generated`, `Copilot`, `official relationship graph`, etc.
- Honest-empty signals → existing Phase 82 framed empty-state tests.

Adding redundant render tests would be brittle and add noise. The
new Phase 126 tests focus on the **genuine gap**: the Phase 110
communication-lane lock was not previously asserted on these two
source files. The static-source pins close that gap.

---

## 4. Acceptance criteria

- [x] Relationships and Signals tabs feel materially more premium (primary / severity accent stripes, framed dashed-border empty states, premium card framing with bumped padding, bumped client-name typography).
- [x] Empty states are polished and honest (verbatim copy preserved).
- [x] Any rendered signal is derived from real visible data (no derivation changes; existing tests pin this).
- [x] No fake / predictive / AI claims (negation disclaimers preserved; new static-source pin blocks both files from drift).
- [x] No schema / data / write behavior changes.
- [x] Tests pass.
- [x] Build clean.

---

## 5. What Phase 126 explicitly does NOT do

Per the Phase 122A backlog sequencing:

- **Phase 127 — Credit Memo premium workspace.** The CreditMemo card empty state was framed in Phase 125; the full premium memo-editing workspace (modal polish + section-pill layout + side-by-side preview) is Phase 127's scope.
- **Phase 122 — Dataverse lookup retargeting** for `cr664_documentchecklist.cr664_Deal` (and candidates). Without Phase 122, the Action Queue / Due Diligence / per-deal Tasks + Documents surfaces remain in their Phase 125-framed honest-empty state.
- **Phase 128 — Task / document UX after Phase 122.** Row-level task / document card polish waits for Phase 122 retargeting so the polish ships against populated data.
- **Phase 129 — Manager / team / executive / admin visual parity.**
- **Multi-workspace switcher** in the sidebar footer remains the Phase 120 single-workspace state until a real `cr664_workspaceentitlement` loader exists (bucket C / D in the inventory).
- **No `New Deal` / `Log Activity` write surfaces** — still bucket D in Phase 122A (must-ask-first).
- **No probability / win-rate / approval-odds tiles** — still bucket C (schema confirmation + new loaders required) and bucket D (governance: must not surface ranking-style outputs without explicit scope).
- **No drag-and-drop signal dismissal** — the Phase 83 dismiss-locally button stays click-based; introducing DnD would require a new library import and isn't justified here.

---

## 6. Verification

```bash
npm test -- --run    # 120 files / 2710 tests passed
npm run build        # clean
```

The visual upgrades will become visible in the deployed app on
the next `pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS`.

Post-push observation against the seeded `TEST — Deal Phase 121`:

- **Relationships tab** → the per-client row for `TEST —
  Borrower Phase 121` renders as a framed `palette.surface`
  card with a 3px primary left accent stripe, bumped client-
  name typography, and the existing meta / asks / badges /
  deal-pill layout. The Phase 100 Copy Teams summary button
  + Phase 78 Draft relationship note button + Phase 101
  SummaryOutlookHandoffButtons all preserved.
- **Signals tab** → the rollup row for the seeded deal (if it
  surfaces any deterministic signals from Phase 80) renders
  framed with a severity-tinted left stripe. The priority
  count chips (High/Medium/Low) and scan line preserved. The
  Phase 83 Dismiss locally / Opened locally tags preserved.
- **Both tabs in the empty-data state** → render the framed
  dashed-border honest-empty cards consistent with the rest of
  the cockpit (Pipeline / Action Queue / Due Diligence / right
  rail My Tasks).

---

## 7. Cross-references

- [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) §5.1.A.5 + §5.1.A.6 — backlog source.
- [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md), [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md), [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) — design language reused.
- [PHASE_76_RELATIONSHIP_MEMORY_LITE.md](PHASE_76_RELATIONSHIP_MEMORY_LITE.md), [PHASE_82_BANKER_AUTOPILOT_ROLLUP.md](PHASE_82_BANKER_AUTOPILOT_ROLLUP.md) — derivation primitives reused unchanged.
- [PHASE_78_RELATIONSHIP_NOTES_LOCAL_ONLY.md](PHASE_78_RELATIONSHIP_NOTES_LOCAL_ONLY.md), [PHASE_83_AUTOPILOT_SUGGESTION_LEDGER.md](PHASE_83_AUTOPILOT_SUGGESTION_LEDGER.md), [PHASE_100_RELATIONSHIP_MEMORY_TEAMS_HANDOFF.md](PHASE_100_RELATIONSHIP_MEMORY_TEAMS_HANDOFF.md), [PHASE_101_OUTLOOK_SUMMARY_HANDOFF.md](PHASE_101_OUTLOOK_SUMMARY_HANDOFF.md) — adjacent local / clipboard / mailto handoffs preserved.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane lock Phase 126 honors and explicitly pins via new static-source assertions.
- `src/banker/RelationshipMemory.tsx`, `src/banker/BankerAutopilotRollup.tsx` — only files modified in production source.
- `src/banker/RelationshipMemory.test.tsx`, `src/banker/BankerAutopilotRollup.test.tsx` — Phase 126 static-source pin blocks added.
