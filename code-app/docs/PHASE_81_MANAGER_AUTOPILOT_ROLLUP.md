# Phase 81 — Manager Autopilot Rollup

## Goal

Add a deterministic manager-side rollup that shows the manager which deals on their team pipeline carry next-best-action signals, ranked by priority. Reuses the Phase 80 `deriveNextBestActions` derivation once per team-deal; aggregates HIGH/MEDIUM/LOW counts and ranks the top 5 deals.

No AI. No automation. No new schema. No new write surface. No executive expansion. Manager visibility scope is unchanged — the rollup evaluates only the deals already in `teamPipeline`.

## Why this phase

Phase 80 shipped Deal Autopilot Lite as a per-deal banker surface. The Microsoft Vibe scope also expects manager-level operational intelligence: which deals on my team need attention right now, who owns them, how soon do they close. Phase 81 extends the same deterministic signal engine to that need without introducing AI, automation, or new writes.

The slogan is unchanged:

> **Autopilot suggests. Banker decides. Manager surveys.**

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.17 (Deal autopilot) — advanced from "Partially operational (advanced by Phase 80)" to "(advanced by Phase 80 + Phase 81)". The autopilot capability now spans banker-side (per-deal panel) AND manager-side (team rollup).
- §1.22 (Manager workspace) — current-state notes the new `<ManagerAutopilotRollup />` card; Gap / Safe-next-step updated to call out the future child-data loader that would broaden manager-side signal coverage.

## Relationship to Phase 80

Phase 81 is a thin aggregator over Phase 80. The Phase 80 `deriveNextBestActions` function and its `NextBestAction` type are consumed unchanged. Specifically:

- `src/shared/autopilot/managerAutopilotRollup.ts` imports `deriveNextBestActions` + `AutopilotPriority` + `NextBestAction` from `./dealAutopilot`.
- For each `TeamDeal`, the rollup builds a minimal `AutopilotInput` (deal record fields + `modifiedOn` as the activity proxy + empty child collections) and calls `deriveNextBestActions`.
- Aggregation: count deals by their TOP suggestion's priority; rank deals by priority → suggestion count → nearest target close → name.
- Output cap: `TOP_N_ROLLUP_DEALS = 5` deals on the card. The brief allowed 5 or 10; 5 keeps the card visually compact.
- Phase 80's `MAX_NEXT_BEST_ACTIONS = 3` cap per deal continues to apply — the rollup sees at most 3 suggestions per deal.

## Signal reuse

The rollup reuses Phase 80's signal language verbatim. No new signals were introduced, no signal text was rewritten. Each row on the card surfaces the deal's TOP suggestion (from `deriveNextBestActions(...)[0]`) so a manager sees the same `title` + `reason` + `suggestedActionLabel` the banker would see on the per-deal panel.

### Signal coverage on the manager surface (honestly narrower)

`TeamDeal` (from `src/manager/managerQueries.ts`) carries deal-record fields only: `id`, `name`, `stage`, `targetCloseDate`, `stageEntryDate`, `modifiedOn`, `assignedBankerName`, etc. It does NOT carry per-deal open tasks, outstanding documents, received documents, or credit memos. The rollup therefore passes empty arrays for those collections and `deal.modifiedOn` as the `mostRecentActivityIso` proxy.

That means **five of Phase 80's eight signals are silenced on the manager surface**:

- `overdue-tasks` (HIGH) — no task data on manager surface → never fires.
- `pending-review-documents` (HIGH) — no document data → never fires.
- `outstanding-documents` (MEDIUM) — no document data → never fires.
- `memo-consistency-findings` (MEDIUM) — no memo data → never fires.
- `draft-memo` (LOW) — no memo data → never fires.

**The three signals that DO fire on the manager surface:**

- `closing-soon-stale-activity` (HIGH) — `targetCloseDate ≤14d` AND `modifiedOn > 7d ago`.
- `closing-soon` (MEDIUM) — `targetCloseDate ≤14d` with fresh activity.
- `stage-aging` (MEDIUM) — `stageEntryDate ≥30d ago`.
- `stale-activity` (LOW) — `modifiedOn > 14d ago` and not closing-soon.

The card disclaimer states this verbatim: "Manager rollup uses deal-record signals only (closing-soon, stage-aging, modifiedon staleness). Per-deal task / document / memo signals appear in the banker's deal workspace; they do not fire on the manager surface today."

`deal.modifiedOn` is also less precise than `activity[0]?.eventAt` (which the Phase 80 panel uses on the banker side) because `modifiedOn` is touched by any record write — not just timeline events. This is a known coarseness; surfaced honestly in the doc.

## Rollup ranking logic

`compareRollupDeals` orders flagged deals by:

1. **Priority desc** — HIGH > MEDIUM > LOW (`PRIORITY_RANK`).
2. **Suggestion count desc** — more signals fired on this deal means more attention warranted.
3. **Nearest target close date** — deals closing sooner sort earlier; missing target-close goes to the back.
4. **Deal name asc** — stable lexicographic fallback for determinism.

The first 5 ranked deals appear in `topDeals`. The total `dealsWithSuggestions` count + per-priority counts always reflect the **complete** flagged set; only the visible list is capped.

## Manager card UI

`src/manager/ManagerAutopilotRollup.tsx` renders, top-to-bottom:

- Card header: "Team next-best-action signals" + subtitle "Derived from current records. Nothing happens automatically."
- Priority count chip row: HIGH/MEDIUM/LOW deal counts as outline badges (each with an `aria-label="High priority: N deal(s)"` long-form name). A scan line ("Scanned N team deals · M with signals") closes the row.
- Top deals list: at most 5 `<li>` rows. Each row shows:
  - Deal name as a `<button>` (`aria-label="Open deal <name>"`) that calls `navigate('/deals/<id>')` — destination workspace runs its own access check via Phase 36 `loadDealForManager`; no bypass.
  - Priority badge (HIGH/MEDIUM/LOW with `aria-label="High priority signal"` etc.).
  - The top suggestion's `title` line (with "(+N more on this deal)" inline tag when `suggestionCount > 1`).
  - The top suggestion's `reason` paragraph (in muted text).
  - Meta row: banker (or "— (unassigned)"), stage, target close (or "—").
- Signal-coverage limitation paragraph (renders on both populated AND no-signals states): "Manager rollup uses deal-record signals only … Per-deal task / document / memo signals appear in the banker's deal workspace; they do not fire on the manager surface today."
- Conservative disclaimer paragraph: "Derived from current records. Nothing happens automatically. No AI or automated decisions. Manager visibility is scoped to the manager's team pipeline; deals outside that scope are not evaluated and not surfaced here."

## Empty states

Three empty states render different copy:

- **`teamPipeline.kind === 'loading'`** — "Loading team signals…"
- **`teamPipeline.kind === 'failed'`** — `role="alert"` block with the error message and "Refresh to retry."
- **`teamPipeline.data.length === 0`** — "No active deals on the team yet. Signals will populate as deals enter the pipeline." + the conservative disclaimer.
- **`rollup.dealsWithSuggestions === 0`** — "No next-best-action suggestions from current records." + the signal-coverage limitation paragraph + the conservative disclaimer.

The rendered DOM is statically asserted NOT to contain "all clear" / "no risk" / "portfolio healthy" / "everything is fine" — those forbidden empty-state phrases would each be a false confidence claim.

## Role boundaries

- **Manager** — sees `<ManagerAutopilotRollup />` on `ManagerWorkspace`. Mounted between `<TeamWorkQueue />` and `<TeamPipelineSummary />`.
- **Banker** — unchanged. The Phase 80 per-deal panel remains the banker-side autopilot surface. No banker UI change.
- **Team** — unchanged. The brief noted team-workspace was optional "if safe"; deferred to keep Phase 81 scoped. Adding a team-scoped sibling card is straightforward (uses `TeamDataProvider.deals` which has the same structural shape) and is named as a future phase.
- **Executive** — unchanged. Executive workspace remains snapshot-only; the rollup is not mounted there.
- **Admin** — unchanged.

The card consumes `useManagerData()` and `useNavigate()` only — no SDK calls, no new query shapes. The manager's authorization is enforced upstream by `ManagerProvider` + `loadTeamPipeline(teamId)`; the rollup operates on whatever team-scoped deals are already authorized.

## Why this is not AI / not automation

- **No model invocation.** The rollup is a pure function over the same typed inputs Phase 80 consumes, plus a sort + slice on the aggregate.
- **`isAutomated: false` is preserved.** Each suggestion the manager sees is a Phase 80 `NextBestAction` with the literal-typed false flag. The manager card does not relax the contract.
- **No action runs on the manager's behalf.** Clicking a deal-name navigates to that deal workspace; the destination workspace (Phase 36 manager read-only path) re-runs the access check.
- **Module-hygiene test forbids the vocabulary.** `managerAutopilotRollup.test.ts` asserts the source never contains "AI-generated", "autopilot executed", "automatic(ally)", "is/was/has been approved", "decisioned", "guaranteed", "system will complete", "predicts", "prediction".
- **Rendered-DOM test forbids the same vocabulary in the card output.** `ManagerAutopilotRollup.test.tsx` asserts the rendered DOM never contains those tokens as positive claims. The disclaimer's "Nothing happens automatically" is allowed (explicit negation); only affirmative claims ("executes/runs/completes/approves/decides automatically") are forbidden.

## Limitations

- **Manager signal coverage is narrower than banker coverage.** Five of Phase 80's eight signals do not fire on the manager surface (see above). The disclaimer states this verbatim.
- **`modifiedOn` is a coarse activity proxy.** It captures any deal-record write, not just timeline events. A deal whose `cr664_amount` was edited by an admin appears "fresh" even if no borrower communication has occurred. The banker-side Phase 80 panel uses the more-precise `activity[0]?.eventAt` because the per-deal activity timeline is loaded there.
- **No suggestion ledger.** The card does not remember which suggestions the manager scanned, ignored, or actioned. Adding a ledger is the natural Phase 80/81 sibling.
- **No drill-through to per-deal signals.** Clicking a deal name navigates to the manager's read-only deal workspace (Phase 36), which does not currently mount the autopilot panel (banker-only). A future phase could mount a read-only autopilot panel on the manager Deal Workspace, OR have the navigation deep-link the banker to the deal so they can see the full signal set.
- **No banker rollup.** A banker who carries deals across multiple clients does not see a banker-side "deals with HIGH-priority autopilot signals" rollup. That's the natural Phase 75 / 80 sibling on the Banker Command Center; Phase 81 ships the manager half only.
- **Top 5 cap.** A manager with 20 flagged deals sees only the 5 highest-ranked. The chip row counts always reflect the complete flagged set so the manager isn't misled about the total.
- **Banker name is text.** Same as Phase 71: `assignedBankerName` is `cr664_assignedbankername` (text, possibly stale). No drill-through to banker contact; no per-banker filter.

## Future upgrade path

1. **Manager-scoped child-data loader.** A `loadManagerWorkQueueData(teamId)` analogous to `loadBankerWorkQueueData(bankerId)` — two-step pattern: fetch authorized team deal ids, then fetch tasks / documents / memos scoped to those ids. With that loader, the manager rollup gains the full Phase 80 signal coverage. Schema change: none. Connector permission: same as today (manager already reads `cr664_dealtask1` etc. for their `loadDealForManager` path).
2. **Banker-side rollup.** A `<BankerAutopilotRollup />` card on the Banker Command Center surfacing the banker's own pipeline deals with HIGH-priority signals. Uses `loadBankerWorkQueueData` (already exists) — would have full Phase 80 signal coverage.
3. **Team-side rollup.** A `<TeamAutopilotRollup />` mirror on the Team Workspace using `TeamDataProvider.deals`. Same shape as manager rollup, same coverage limitations.
4. **Suggestion ledger.** Persistent (or LOCAL_ONLY) record of accept/reject decisions per manager and per banker, fed back into a future rule-tuning phase. Phase 78's LOCAL_ONLY pattern is the cheap stop-gap.
5. **Teams notifications.** When a HIGH-priority signal appears for the first time on a manager's team pipeline, fire a Teams card. Lane E.
6. **AI-assisted explanation.** Optional Copilot brief that summarizes "why these deals are flagged together." Lane F; opt-in only.
7. **Manager assignment workflows.** Once stage progression unblocks (§1.26), the manager could action a HIGH-priority signal directly from the rollup ("Reassign this deal to a different banker", "Schedule a 1:1") — each becomes a Phase-21-style governed write.

## Files created

- `src/shared/autopilot/managerAutopilotRollup.ts` — pure rollup primitive (`deriveManagerAutopilotRollup` + `ManagerAutopilotRollup` + `ManagerRollupDeal` + `ManagerRollupDealInput` + `TOP_N_ROLLUP_DEALS`).
- `src/shared/autopilot/managerAutopilotRollup.test.ts` — 14 derivation + module-hygiene tests covering empty input, quiet deals, priority counts, ranking (priority → count → close → name), the top-N cap, the top-suggestion shape, the banker passthrough, the no-SDK / no-role / no-AI source vocabulary discipline.
- `src/manager/ManagerAutopilotRollup.tsx` — manager-only card component.
- `src/manager/ManagerAutopilotRollup.test.tsx` — 9 card-rendering tests covering loading / failed / no-deals empty / no-signals empty / populated with priority chips + scan line + top rows + banker meta, deal-name navigation, signal-coverage disclaimer, conservative disclaimer, and rendered-DOM forbidden-vocab scan.
- `docs/PHASE_81_MANAGER_AUTOPILOT_ROLLUP.md` — this document.

## Files modified

- `src/workspaces/ManagerWorkspace.tsx` — mounts `<ManagerAutopilotRollup />` between `<TeamWorkQueue />` and `<TeamPipelineSummary />`. No other workspace touched.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.17 + §1.22 advanced.

## Vibe capability advanced

§1.17 (Deal autopilot) is the headline change — "Partially operational (advanced by Phase 80 + Phase 81)". §1.22 (Manager workspace) updated for the new card.

## Rollup signals implemented

Four signals fire on the manager surface (the deal-record subset of Phase 80's eight): `closing-soon-stale-activity` (HIGH), `closing-soon` (MEDIUM), `stage-aging` (MEDIUM), `stale-activity` (LOW). Five signals are silenced because their input arrays are empty on the manager side (documented in the card disclaimer + this doc).

## Ranking rules

Priority desc → suggestion count desc → nearest target close → name asc. Cap at `TOP_N_ROLLUP_DEALS = 5`.

## Role surfaces updated

- **Manager workspace** — new `<ManagerAutopilotRollup />` card.
- **Banker / Team / Executive / Admin workspaces** — unchanged.

## Tests added / updated

- 14 new derivation tests in `src/shared/autopilot/managerAutopilotRollup.test.ts`.
- 9 new card-rendering tests in `src/manager/ManagerAutopilotRollup.test.tsx`.

No existing test was changed. Phase 80's panel + derivation tests continue to pass — the rollup imports `deriveNextBestActions` but does not modify it.

## Confirmation: no writes / schema / AI / automation added

- **No new write surface.** No `GOVERNED_WRITES` entry was added.
- **No new `LOCAL_ONLY_FLOWS` entry.** The card is pure render; no state persisted.
- **No schema change.** Every field consumed already existed on `TeamDeal`.
- **No AI.** Pure deterministic function; rendered-DOM + source-text vocab scans pin the contract.
- **No automation.** Phase 80's `isAutomated: false` flag flows through unchanged; the card never executes anything.
- **No permission widening.** The rollup operates only on `teamPipeline.data`, which is already manager-scoped by `loadTeamPipeline(teamId)`. Deal-name navigation goes through `loadDealForManager` (Phase 36 read-only path).
- **No executive expansion.** Executive workspace unchanged.

## Test + build counts (at acceptance)

- Full suite: **1354 / 1354 tests passing** (Phase 80 baseline 1331 + 14 derivation + 9 card = 23 new).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the coverage map after Phase 81:

- **Manager / Team Deal Workspace Relationship Context (Phase 77 sibling)** — extends the Phase 77 relationship-context card across the manager and team Deal Workspaces using their already-authorized deal lists. Pure reuse of `deriveRelationshipMemory`. Low risk; closes role parity on the relationship-memory branch.
- **Banker-side Autopilot Rollup** — `<BankerAutopilotRollup />` on the Banker Command Center, surfacing the banker's own pipeline deals with HIGH-priority signals. Uses `loadBankerWorkQueueData` which is already loaded (so full Phase 80 signal coverage is available). Banker-side counterpart to Phase 81; advances §1.17 + §1.1 in parallel.
- **Suggestion ledger (LOCAL_ONLY)** — record which Phase 80 / Phase 81 suggestions the banker or manager opened. Phase-23-style local clipboard / state surface; data source for a future rule-tuning phase.
- **High-contrast theme palette** — declare `[data-theme="high-contrast"]` on top of Phase 79's foundation. Closes the remaining a11y gap named in Phase 74 / 79.
- **Manager-scoped child-data loader** — broadens manager rollup signal coverage to include tasks / documents / memos. Two-step pattern modeled on Phase 32; no schema change.

The **banker-side rollup** would close the rollup parity (manager + banker both have it). The **manager-scoped child-data loader** would close the coverage parity (manager rollup uses the same 8 signals the banker panel does). Either is a natural Phase 82.
