# Phase 82 — Banker Autopilot Rollup

## Goal

Add a deterministic banker-side rollup on the Banker Command Center showing the banker's own deals with next-best-action signals. Reuses Phase 80 `deriveNextBestActions` once per deal in the banker's already-authorized pipeline; aggregates HIGH/MEDIUM/LOW counts and ranks the top 5 deals.

No AI. No automation. No new schema. No new write surface. No executive expansion.

## Why this phase

The Microsoft Vibe scope expects the Banker Command Center to act as an always-on command center showing urgent deals, stale follow-ups, overdue tasks, outstanding docs, and next actions. Phase 80 shipped per-deal Autopilot Lite inside each Deal Workspace; Phase 81 shipped a team-level rollup for managers. The remaining symmetric move is the banker's personal cross-pipeline rollup on the Command Center — "where should I start today?".

Three surfaces now share the same derivation engine:

- **Per-deal (banker)** — Phase 80 panel inside each Deal Workspace.
- **Team rollup (manager)** — Phase 81 card on Manager Command Center.
- **Personal rollup (banker)** — Phase 82 card on Banker Command Center.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.1 (Banker Command Center) — current-state notes the new `<BankerAutopilotRollup />` card mounted between `<PersonalActivitySummary />` and `<MyWorkQueue />`. "What's my workload shape" → "what should I do first" → "the queue of work" → relationships → pipeline.
- §1.17 (Deal autopilot) — advanced to "Partially operational (advanced by Phase 80 + Phase 81 + Phase 82)". Autopilot capability now spans three surfaces.
- §1.18 (Activity intelligence) — extended; the banker rollup also surfaces the stale-activity signal, the same one Phase 80 surfaces on the per-deal panel and Phase 81 surfaces on the manager team rollup.

## Relationship to Phases 80 and 81

Phase 82 is a thin aggregator over Phase 80, parallel to Phase 81 but on the banker side.

| | Phase 80 panel | Phase 81 manager rollup | Phase 82 banker rollup |
|---|---|---|---|
| Surface | Per-deal Deal Workspace | Manager Command Center | Banker Command Center |
| Data source | `useDealData()` | `ManagerDataProvider.teamPipeline` (TeamDeal[]) | `loadBankerWorkQueueData(bankerId)` |
| Tasks loaded | ✓ (full per-deal) | ✗ | ✓ (work-queue: open tasks) |
| Documents loaded | ✓ (full per-deal) | ✗ | ✓ (outstanding + pending-review) |
| Memos loaded | ✓ (full per-deal w/ sections) | ✗ | ✓ (status only, no sections) |
| Activity timeline | ✓ (`activity[0]?.eventAt`) | proxy (`deal.modifiedOn`) | proxy (`deal.lastActivityOn` = modifiedon) |
| Memo consistency | ✓ (full check) | ✗ | ✗ (no sections) |
| Coverage | 8/8 signals | 3–4/8 signals | 7/8 signals |
| Cap | 3 suggestions per deal | top 5 deals | top 5 deals |
| Output shape | NextBestAction[] | ManagerAutopilotRollup | BankerAutopilotRollup |

Phase 82's `deriveBankerAutopilotRollup` consumes the Phase 80 `deriveNextBestActions` and `NextBestAction` types directly — no fork, no duplication.

## Signal reuse

The rollup reuses Phase 80's signal language verbatim. Each rendered row surfaces the deal's TOP suggestion (`deriveNextBestActions(...)[0]`) so the banker sees the same `title` + `reason` + `suggestedActionLabel` they would see when they open the deal.

### Signal coverage on the banker rollup

`loadBankerWorkQueueData(bankerId)` returns the full banker work queue: deals + open tasks + outstanding documents + pending-review documents + memos (status only, no sections). The rollup wires this into the Phase 80 derivation by:

- `openTasks` → bucketed by `dealId`; Phase 80's overdue-task filter applies.
- `outstandingDocuments` → bucketed by `dealId`; Phase 80's outstanding-documents check fires when count > 0.
- `pendingReviewDocuments` → bucketed by `dealId`; the bucket already filters "received + no reviewer", and Phase 80 re-applies the 7-day threshold.
- `memos` → bucketed by `dealId`; Phase 80's draft-memo signal fires when `statusKey === 'draft'`.
- `deal.lastActivityOn` → passed as `mostRecentActivityIso` (modifiedon proxy).
- `memoConsistencyFindingsCount` → hardcoded to `0` because running `checkCreditMemoConsistency(deal, creditMemo.data)` requires the full `CreditMemoData` with `sections`, which the work-queue loader does not fetch. That signal remains available on the per-deal Phase 80 panel.

**7 of 8 Phase 80 signals fire on the banker rollup:**

- ✓ `overdue-tasks` (HIGH)
- ✓ `pending-review-documents` (HIGH)
- ✓ `closing-soon-stale-activity` (HIGH)
- ✓ `closing-soon` (MEDIUM)
- ✓ `stage-aging` (MEDIUM)
- ✓ `outstanding-documents` (MEDIUM)
- ✓ `draft-memo` (LOW)
- ✓ `stale-activity` (LOW)
- ✗ `memo-consistency-findings` (MEDIUM) — silenced; available on per-deal panel.

The card disclaimer states this verbatim:

> "Banker rollup uses your work-queue data (deals, open tasks, outstanding + pending-review documents, memos). Memo consistency findings appear on each deal's Next Best Actions panel inside the Deal Workspace; they do not fire on this rollup."

## Rollup ranking logic

`compareRollupDeals` orders flagged deals by:

1. **Priority desc** — HIGH > MEDIUM > LOW.
2. **Suggestion count desc** — more signals on a deal = more attention warranted.
3. **Nearest target close date asc** — sooner-closing deals first; missing target-close goes to the back.
4. **Deal name asc** — stable lexicographic fallback for determinism.

The first 5 ranked deals appear in `topDeals`. The chip row counts (HIGH/MEDIUM/LOW deal counts) always reflect the **complete** flagged set; only the visible list is capped.

This is the same ranking Phase 81 uses for the manager rollup — both surfaces feel consistent.

## Role boundaries

- **Banker** — sees `<BankerAutopilotRollup />` on Banker Command Center.
- **Manager** — unchanged. The Phase 81 team rollup remains the manager-side surface.
- **Team** — unchanged.
- **Executive** — unchanged.
- **Admin** — unchanged.

The card consumes `useBanker()` and `loadBankerWorkQueueData(bankerId)` — same banker-scoped two-step loader Phase 32, 75, 76, 78 all use. No new query shape; no permission widening. The destination of the deal-name click (`navigate('/deals/<id>')`) runs through the existing Phase 4 `loadDealForBanker(dealId, bankerId)` access check; no bypass.

## Banker card UI

`src/banker/BankerAutopilotRollup.tsx` renders:

- Card header: "My next-best-action signals" + subtitle "Derived from current records. Nothing happens automatically."
- Priority count chip row: HIGH/MEDIUM/LOW deal counts (`aria-label="High priority: N deals"` etc.). Scan line ("Scanned N of your deals · M with signals") closes the row.
- Top deals list: at most 5 `<li>` rows. Each row:
  - Deal name as a button (`aria-label="Open deal <name>"`) → `navigate('/deals/<id>')`.
  - Priority badge (`aria-label="High priority signal"` etc.).
  - Top suggestion title + "(+N more on this deal)" tag when `suggestionCount > 1`.
  - Top suggestion reason paragraph.
  - Meta row: client, stage, target close.
- Signal-coverage limitation paragraph (memo-consistency-findings note).
- Conservative disclaimer: "Derived from current records. Nothing happens automatically. No AI or automated decisions. Open a deal to act — the Phase 80 per-deal panel and the existing card actions are the only places a write happens."

## Empty states

Four empty/intermediate states:

- **Loading** — "Loading personal pipeline signals…"
- **Failed** — `role="alert"` block with the error message + "Refresh to retry."
- **No deals** (banker has zero active deals) — "No active deals assigned to you yet. Signals will populate as deals enter your pipeline."
- **No signals** (deals exist but none flag) — "No next-best-action suggestions from current records." Followed by the signal-coverage limitation paragraph and the conservative disclaimer.

The rendered DOM is statically asserted NOT to contain "all clear" / "no risk" / "pipeline healthy" / "everything is fine" — those forbidden empty-state phrases would each be a false confidence claim.

## Why this is not AI / not automation

- **No model invocation.** The rollup is a pure function over typed inputs plus a sort + slice. No `fetch` to AI endpoints, no Copilot connector, no embedding lookup.
- **`isAutomated: false` is preserved.** Each suggestion the banker sees is a Phase 80 `NextBestAction` with the literal-typed false flag.
- **No action runs on the banker's behalf.** Clicking a deal-name navigates; the destination workspace mounts its own action surfaces, and the banker has to click those manually.
- **Module-hygiene test forbids the vocabulary.** `bankerAutopilotRollup.test.ts` asserts the source never contains "AI-generated", "autopilot executed", "automatic(ally)", "is/was/has been approved", "decisioned", "guaranteed", "system will complete", "predicts", "prediction".
- **Rendered-DOM test forbids the same vocabulary in the card output.** `BankerAutopilotRollup.test.tsx` asserts the DOM never contains those tokens as positive claims. The disclaimer's "Nothing happens automatically" passes because the regex only matches affirmative-tense forms ("executes/runs/completes/approves/decides automatically").
- **Conservative-copy guard remains green.** The Phase 45 phrase guard continues to pass — Phase 82 reuses the same truthful "No AI or automated decisions" negation Phase 80 / 81 use, and the existing allowlist treatment carries over (the rollup file is added to the same `unwired-ai-claim` allowlist).

## Limitations

- **No memo-consistency-findings signal on the rollup.** Documented honestly; the per-deal Phase 80 panel surfaces it.
- **`modifiedOn` is a coarse activity proxy.** It captures any deal-record write, not just timeline events. The per-deal Phase 80 panel uses the precise `activity[0]?.eventAt` because the per-deal activity timeline is loaded in `useDealData()`.
- **No suggestion ledger.** The card does not record which suggestions the banker scanned, opened, or actioned. Adding a ledger is the natural Phase 80/81/82 sibling.
- **No drill-through to per-deal signals from the rollup.** Clicking a deal name navigates to the Deal Workspace where the Phase 80 panel mounts. A future phase could deep-link directly to the per-deal panel or pass the top-suggestion id as a `?focus=` query param.
- **Top 5 cap.** A banker with 20 flagged deals sees only the 5 highest-ranked. The chip-row counts always reflect the full flagged set so the banker isn't misled about the total.
- **Data-fetch duplication.** Like Phase 75/76/78, the card calls `loadBankerWorkQueueData` independently. The Banker Command Center now issues that loader four times (PersonalActivitySummary, MyWorkQueue, RelationshipMemory, BankerAutopilotRollup). A future cleanup (a banker-scoped data provider analogous to ManagerDataProvider) would deduplicate.

## Future upgrade path

Phase 82 ships the deterministic rollup. The Vibe-expected autopilot capability continues to extend through these future phases (same upgrade path Phase 80 and 81 named, applied symmetrically across surfaces):

1. **Suggestion ledger (LOCAL_ONLY first; governed-write later).** Record which suggestions the banker / manager scanned, dismissed, or actioned. Tie to a future rule-tuning phase.
2. **Accept/reject feedback per row.** Banker can mark "Working on it" / "Snooze 24h" / "Dismiss for this deal".
3. **Teams notifications.** When a HIGH-priority signal first appears for the banker's pipeline, fire a Teams card. Lane E connector phase.
4. **AI-assisted explanation.** Optional Copilot brief that summarizes "why this deal is flagged this way and what to do first." Lane F; opt-in only; "review before use" warning.
5. **Task creation with confirmation.** Each suggestion gains an "Open and create follow-up task" affordance. Phase-21-style governed write triggered from the suggestion, with explicit banker confirmation.
6. **Live Outlook/Teams integration.** Once contact-history ingestion lands, the autopilot can surface "Last borrower email was 12 days ago" instead of the modifiedon proxy.
7. **BankerDataProvider.** A shared banker-data context that runs `loadBankerWorkQueueData(bankerId)` once and exposes it to MyWorkQueue + PersonalActivitySummary + RelationshipMemory + BankerAutopilotRollup. Eliminates the data-fetch duplication called out under Limitations.

## Files created

- `src/shared/autopilot/bankerAutopilotRollup.ts` — pure rollup primitive (`deriveBankerAutopilotRollup` + `BankerAutopilotRollup` + `BankerRollupDeal` + `BankerRollupDealInput` / TaskInput / DocumentInput / MemoInput + `TOP_N_BANKER_ROLLUP_DEALS = 5`).
- `src/shared/autopilot/bankerAutopilotRollup.test.ts` — 17 derivation + module-hygiene tests covering empty input, quiet deals, child-bucketing (signals attribute to the right deal), each signal type, the memo-consistency-findings silenced contract, priority counts, ranking, the top-N cap, the top-suggestion `isAutomated: false` passthrough, clientName passthrough, and the no-SDK / no-role / no-AI source vocabulary discipline.
- `src/banker/BankerAutopilotRollup.tsx` — banker-only Command Center card.
- `src/banker/BankerAutopilotRollup.test.tsx` — 8 card-rendering tests covering loading / failed / no-deals empty / no-signals empty (with "no over-confidence" assertion), populated chips + scan line + top rows + meta, deal-name navigation, signal-coverage disclaimer, and rendered-DOM forbidden-vocab scan.
- `docs/PHASE_82_BANKER_AUTOPILOT_ROLLUP.md` — this document.

## Files modified

- `src/workspaces/BankerWorkspace.tsx` — mounts `<BankerAutopilotRollup />` between `<PersonalActivitySummary />` and `<MyWorkQueue />`. Final card order: PersonalActivitySummary → BankerAutopilotRollup → MyWorkQueue → RelationshipMemory → PersonalPipeline.
- `src/shared/governance/conservativeCopyGuard.test.ts` — adds `src/banker/BankerAutopilotRollup.tsx` to the `unwired-ai-claim` allowlist with a stated Phase 82 reason (same pattern Phase 24 / 73 / 80 / 81 received).
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.1 + §1.17 + §1.18 advanced.

## Vibe capability advanced

§1.17 Deal Autopilot is the headline change — "Partially operational (advanced by Phase 80 + Phase 81 + Phase 82)" — the autopilot capability now spans three surfaces. §1.1 + §1.18 updated.

## Rollup signals implemented

Seven of Phase 80's eight signals fire on the banker rollup surface (overdue-tasks, pending-review-documents, closing-soon-stale-activity, closing-soon, stage-aging, outstanding-documents, draft-memo, stale-activity). One signal is silenced (memo-consistency-findings) because the work-queue loader does not fetch CreditMemoData with sections. The per-deal Phase 80 panel continues to surface the missing signal.

## Ranking rules

Priority desc → suggestion count desc → nearest target close → deal name asc. Cap at `TOP_N_BANKER_ROLLUP_DEALS = 5`. Same rules Phase 81 uses on the manager rollup.

## Role surfaces updated

- **Banker Command Center** — new `<BankerAutopilotRollup />` card.
- **Banker Deal Workspace / Manager / Team / Executive / Admin** — unchanged.

## Tests added / updated

- 17 derivation tests in `src/shared/autopilot/bankerAutopilotRollup.test.ts`.
- 8 card-rendering tests in `src/banker/BankerAutopilotRollup.test.tsx`.
- 1 allowlist entry in `src/shared/governance/conservativeCopyGuard.test.ts` (`src/banker/BankerAutopilotRollup.tsx` allowed for the `unwired-ai-claim` rule with stated Phase 82 reason).

No existing test was changed substantively. Phase 80 + Phase 81 tests continue to pass — Phase 82 imports `deriveNextBestActions` unchanged.

## Confirmation: no writes / schema / AI / automation added

- **No new write surface.** No `GOVERNED_WRITES` entry.
- **No new `LOCAL_ONLY_FLOWS` entry.** The card is pure render of already-loaded data.
- **No schema change.** Every field consumed already existed.
- **No AI.** Pure deterministic function; rendered-DOM + source-text vocab scans pin the contract.
- **No automation.** Phase 80's literal `isAutomated: false` flows through unchanged.
- **No permission widening.** The rollup operates on `loadBankerWorkQueueData(bankerId)` only.
- **No executive expansion.** Executive workspace unchanged.

## Test + build counts (at acceptance)

- Full suite: **1379 / 1379 tests passing** (Phase 81 baseline 1354 + 17 derivation + 8 card = 25 new).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the coverage map after Phase 82, the autopilot rollup capability is now banker + manager. Natural next moves:

- **Suggestion ledger (LOCAL_ONLY)** — record which Phase 80 / 81 / 82 suggestions a user opened / dismissed. Phase-23-style local surface; data source for a future rule-tuning phase.
- **Manager-scoped child-data loader** — broadens manager rollup signal coverage to match the banker rollup's 7/8 (or 8/8 with memo consistency). Two-step pattern modeled on Phase 32.
- **Team-side rollup** — `<TeamAutopilotRollup />` mirror on the Team Workspace using `TeamDataProvider.deals`. Closes the rollup parity across all three banker-adjacent role workspaces (banker + manager + team).
- **Manager / Team Deal Workspace Relationship Context** — Phase 77 sibling extension. Pure reuse.
- **BankerDataProvider deduplication** — one shared loader for the four Banker Command Center cards. No new feature; one-time refactor.
- **High-contrast theme palette** — declare `[data-theme="high-contrast"]` on top of Phase 79.

The **suggestion ledger** is the natural continuation if you want to keep building on the autopilot surface across all three rollups. The **manager child-data loader** is the natural coverage-parity move. The **team rollup** is the natural role-parity move (completes the triad).
