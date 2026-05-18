# Phase 80 — Deal Autopilot Lite: Next Best Actions Panel

## Goal

Add a deterministic, read-only "Next Best Actions" panel to the Banker Deal Workspace that surfaces at most three priority-ordered next-step suggestions derived from existing deal signals (overdue tasks, pending-review documents past 7 days, closing-soon, stage-aging, outstanding documents, memo consistency findings, draft memos, stale activity). No AI. No automation. No new schema. No new write surface.

The contract is enforced both in copy and at the type level: every suggestion carries `isAutomated: false` as a literal, so the no-automation pledge holds even as future authors extend the rule set.

## Why this phase

The Microsoft Vibe scope expects Deal Autopilot / operational intelligence / recommended next actions. Phase 78 closed the deterministic relationship-memory branch (snapshot → cross-deal context → notes capture). Phase 79 closed the dark-theme foundation. The next visible-Vibe-value swing is autopilot — and after Phases 71/73/75/76/77 we now have enough deterministic signal coverage to ship the suggestion floor without pretending to ship the AI ceiling.

The slogan is intentional:

> **Autopilot suggests. Banker decides.**

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.17 (Deal autopilot) — advanced from **"Not started"** to **"Partially operational (advanced by Phase 80)"**. Gap / Blocker / Safe-next-step refocused on: write-capable autopilot (auto-create-task with confirmation), AI-assisted explanations, Teams notifications, suggestion ledger.
- §1.18 (Activity intelligence) — extended; the autopilot's stale-activity signal touches activity intelligence in a deterministic way (LOW priority, no AI).
- §1.2 (Deal Workspace) — current-state notes the new `<DealAutopilotPanel />` between `<DealSummary />` and `<RelationshipContext />`, and the `data-deal-card="…"` wrappers added to Tasks / Documents / Credit Memo / Borrower Communication / Activity Timeline / Stage Progression for scroll-target anchoring.

## Deterministic signal list

The panel inspects existing `DealData` slots already loaded by `DealDataProvider` plus the Phase 73 consistency check. Eight signals can fire; the top three (by priority, stable insertion order on ties) surface.

### HIGH priority

1. **Overdue tasks** (`overdue-tasks`) — any open (non-completed) task whose `dueDate` is in the past. Title: "N overdue task(s)". Suggested action: Open Tasks card.
2. **Documents may require review** (`pending-review-documents`) — any received-bucket document with no reviewer where `receivedDate` is ≥ `PENDING_REVIEW_AT_RISK_DAYS` (7) days ago. Title: "N document(s) may require review". Suggested action: Open Documents card.
3. **Closes soon + light recent activity** (`closing-soon-stale-activity`) — `targetCloseDate` within `CLOSING_SOON_DAYS` (14) days AND most-recent timeline event > 7 days old (or no events on record). Title: "Closes in Nd and recent activity is light". Suggested action: Review activity & contact borrower (scrolls to Borrower Communication).

### MEDIUM priority

4. **Closes soon** (`closing-soon`) — `targetCloseDate` within 14 days; activity is fresh. Title: "Closes in Nd". Suggested action: Open Tasks.
5. **Stage aging** (`stage-aging`) — `stageEntryDate` ≥ `STAGE_AGING_AT_RISK_DAYS` (30) days ago. Title: "N days in current stage". Suggested action: Open Tasks.
6. **Outstanding documents** (`outstanding-documents`) — any document in the outstanding bucket. Title: "N outstanding document(s)". Suggested action: Open Documents.
7. **Memo consistency findings** (`memo-consistency-findings`) — Phase 73 `checkCreditMemoConsistency` returned ≥ 1 finding. Title: "N memo consistency finding(s)". Suggested action: Open Credit Memo. Suppresses the LOW `draft-memo` signal.

### LOW priority

8. **Draft memo present** (`draft-memo`) — at least one memo with `statusKey === 'draft'`, only when consistency findings count is 0 (else memo-consistency-findings is the more specific call to action). Title: "Draft credit memo on this deal" / "N draft credit memos on this deal". Suggested action: Open Credit Memo.
9. **Stale activity** (`stale-activity`) — most-recent timeline event > `STALE_ACTIVITY_DAYS` (14) days ago (or no events on record), and the deal is NOT closing soon (else `closing-soon-stale-activity` is the more specific signal). Title: "No timeline activity in Nd" / "No timeline activity on record". Suggested action: Open Borrower Communication.

## Suggestion priority rules

- HIGH: anything overdue / past-threshold / time-critical that materially raises closing risk.
- MEDIUM: timely attention items (closing-soon with fresh activity, stage aging, outstanding documents, memo findings).
- LOW: housekeeping items (draft memo without findings, stale activity without close pressure).

Sort order: HIGH → MEDIUM → LOW. Within a priority, insertion order is preserved by a stable secondary sort key (index pairing). Cap: `MAX_NEXT_BEST_ACTIONS = 3`. When more than three signals fire, the highest priorities win — lower-priority signals are dropped without rendering.

## What the panel does

- Reads from `useDealData()` only. No new query is issued. The panel is purely consumed.
- Calls `checkCreditMemoConsistency(deal, creditMemo.data)` (Phase 73) to get the findings count, then passes the integer to `deriveNextBestActions`. The pure derivation module never imports the consistency check directly — keeping it modular.
- Renders a `<Card>` with three states:
  - **Loading.** Any of tasks / documents / creditMemo / activity is non-ready → "Loading deal signals…".
  - **Empty.** All ready, derivation returned `[]` → "No next-best-action suggestions from current records." (explicitly avoids "all clear" / "no risk").
  - **Populated.** Renders a `<ul aria-label="Next best actions for this deal">` with up to three list items. Each item shows: title, priority badge (HIGH/MEDIUM/LOW with `aria-label="N priority suggestion"`), reason paragraph (linked via `aria-describedby` from the action button), `suggestedActionLabel` button (`aria-label="… — banker chooses what to do"`), and a `Basis: <signals>` line in mono font that names the input fields the suggestion was derived from.
- Each action button's click handler calls `document.querySelector('[data-deal-card="<target>"]')?.scrollIntoView(...)` and applies `tabindex="-1"` so the wrapper accepts programmatic focus.
- Always renders the verbatim disclaimer: "Autopilot suggests, banker decides. This panel is read-only; it never creates tasks, sends emails, advances the stage, marks documents reviewed, or calls AI. Suggestions are derived from current deal records only."

## What the panel does NOT do

- **Does not write to Dataverse.** No `GOVERNED_WRITES` entry, no audit row, no timeline event.
- **Does not call AI.** No model invocation, no Copilot, no LLM. Module-hygiene tests forbid the vocabulary in source.
- **Does not execute the suggestion.** Clicking the button scrolls to a card — the banker still has to click the actual action button (Mark received, Complete task, etc.).
- **Does not create a task.** A future Phase-21-style governed-write extension could; Phase 80 does not.
- **Does not send email.** The Phase 61/63 governed-send / handoff surfaces are reached only via their own buttons.
- **Does not advance the stage.** Stage progression remains DELIBERATELY_BLOCKED (§1.26).
- **Does not mark documents reviewed.** That is the Phase 55 modal, accessed via its own button.
- **Does not persist a suggestion ledger.** No localStorage / sessionStorage write. A future phase could add a ledger to record accept/reject for rule tuning.
- **Does not learn from banker behavior.** Each render starts fresh from current deal records; no preference adaptation.
- **Does not surface on the manager / team / executive Deal Workspaces.** Banker-only. Manager / team / executive workspaces mount their own cards and do not import the panel.

## Why this is not AI / not automation

- **No model.** The derivation is a pure function over typed input arrays. No `fetch` to any AI endpoint, no Copilot connector, no embedding lookup, no semantic similarity match.
- **`isAutomated: false` is a literal type.** The `NextBestAction` interface declares `isAutomated: false` (not `boolean`), so the TypeScript compiler refuses any future suggestion that flips the bit. The no-automation pledge is type-system enforced.
- **No action runs on the banker's behalf.** Every "Open …" button only scrolls. Once the relevant card is in view, the banker must click the actual action button (whether that's Complete task, Mark reviewed, Open in Outlook, etc.).
- **Module-hygiene test forbids the vocabulary in source.** `dealAutopilot.test.ts` asserts the source never contains "AI-generated", "autopilot executed", "is/was/has been approved", "decisioned", "guaranteed", "system will complete", "prediction".
- **Rendered-DOM test forbids the same vocabulary in the panel output.** `DealAutopilotPanel.test.tsx` asserts the rendered DOM never contains "AI-generated", "autopilot executed", "executes/runs/completes/approves/decides automatically", "decisioned", "guaranteed", "system will complete", "prediction".
- **Conservative-copy guard remains green.** The phrase-based guard (Phase 45) continues to pass — Phase 80 added an allowlist entry for the panel's truthful-negation disclaimer ("never … calls AI") with a stated reason, the same pattern Phase 24/73 used.

## Future upgrade path

Phase 80 ships the deterministic floor. The Vibe-expected autopilot capability extends through these future phases:

1. **Suggestion ledger.** A LOCAL_ONLY (or governed-write) record of which suggestions the banker opened, dismissed, or actioned. Surfaced for rule tuning. Schema: simple key/value with timestamps; LOCAL_ONLY localStorage is the cheap start.
2. **Accept / reject feedback.** Each suggestion gains an inline "Dismiss for this deal" affordance. Tied to the ledger.
3. **AI-assisted explanations.** Optional Copilot brief that summarizes "why this suggestion fired and what the borrower might say." Lane F. Explicit opt-in, "review before use" warning.
4. **Teams notifications.** When a high-priority signal first appears for a deal, fire a Teams card notification to the assigned banker. Lane E connector phase.
5. **Stage-gate integration.** Once stage progression unblocks (§1.26), autopilot can suggest "Ready to advance: all closing-stage tasks complete + documents received" with a confirmation flow.
6. **Auto-create-task with banker confirmation.** A Phase-21-style governed write: "Create a follow-up task from this suggestion?" → if banker clicks Confirm, create the task. Governed write entry: `deal-autopilot-task-create`. Mirrors Phase 70.
7. **Cross-deal rollup.** A banker workspace summary of "deals with HIGH priority suggestions", so the banker can prioritize across the pipeline.

## Files created

- `src/shared/autopilot/dealAutopilot.ts` — pure derivation primitive (`deriveNextBestActions`, `NextBestAction`, `AutopilotInput`, structural input types, `MAX_NEXT_BEST_ACTIONS`, `STALE_ACTIVITY_DAYS`).
- `src/shared/autopilot/dealAutopilot.test.ts` — 21 derivation + module-hygiene tests covering each signal, priority ordering, the cap, the stable insertion-order tiebreak, the `isAutomated: false` contract, and the no-AI / no-automation / no-decisioning source vocabulary discipline.
- `src/deals/DealAutopilotPanel.tsx` — banker-only Deal Workspace card.
- `src/deals/DealAutopilotPanel.test.tsx` — 7 rendering tests covering loading state, empty state (with explicit "no 'all clear' / 'no risk'" assertion), populated state with priority badges and Basis line, scrollIntoView wiring, conservative disclaimer, rendered-DOM forbidden-vocab scan, and the at-most-three cap.
- `docs/PHASE_80_DEAL_AUTOPILOT_LITE.md` — this document.

## Files modified

- `src/deals/BankerDealWorkspace.tsx` — mounts `<DealAutopilotPanel />` between `<DealSummary />` and `<RelationshipContext />`. Each of the four primary scroll targets (Tasks, Documents, Credit Memo, Borrower Communication) plus Activity Timeline and Stage Progression are wrapped with a `<div data-deal-card="…">` so the panel's `scrollIntoView` lookup resolves.
- `src/deals/dealWorkspaceWriteScoping.test.tsx` — stubs `DealAutopilotPanel` so the write-scoping invariant test keeps the SDK service chain out of its module graph (same pattern Phase 77 introduced for RelationshipContext).
- `src/shared/governance/conservativeCopyGuard.test.ts` — adds `src/deals/DealAutopilotPanel.tsx` to the `unwired-ai-claim` allowlist with the stated Phase 80 reason (the panel's truthful "never … calls AI" negation needs the same allowlist treatment Phase 24 / 73 received).
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.17 advanced from "Not started" to "Partially operational (advanced by Phase 80)"; §1.18 + §1.2 updated.

## Vibe capability advanced

§1.17 (Deal autopilot) is the headline change. §1.18 (Activity intelligence) and §1.2 (Deal Workspace) are updated for the cross-touch.

## Signals implemented

8 signals total (listed under "Deterministic signal list" above): overdue-tasks, pending-review-documents, closing-soon-stale-activity, closing-soon, stage-aging, outstanding-documents, memo-consistency-findings, draft-memo, stale-activity (with the deliberate suppression rules between draft-memo ↔ memo-consistency-findings and stale-activity ↔ closing-soon-stale-activity).

## Priority rules

HIGH > MEDIUM > LOW. Stable insertion order on tiebreak. Hard cap at 3 suggestions. Suppression rules to avoid double-flagging.

## Surfaces updated

- **Banker Deal Workspace** — new `<DealAutopilotPanel />` card + `data-deal-card` wrappers around 6 existing cards.
- **Manager / Team / Executive / Admin Deal Workspaces** — unchanged. The panel is banker-only by construction (it is only mounted from `BankerDealWorkspace.tsx`).

## Tests added / updated

- 21 new derivation tests in `src/shared/autopilot/dealAutopilot.test.ts`.
- 7 new card-rendering tests in `src/deals/DealAutopilotPanel.test.tsx`.
- `src/deals/dealWorkspaceWriteScoping.test.tsx` — stubs the new panel (same pattern as Phase 77).
- `src/shared/governance/conservativeCopyGuard.test.ts` — Phase 80 allowlist entry for `DealAutopilotPanel.tsx` with a stated reason.

No existing test was changed substantively. Phase 77's RelationshipContext + Phase 73's CreditMemo + every other Deal Workspace test continues to pass — the panel is a sibling card that does not modify existing behavior.

## Confirmation: no writes / schema / AI / automation added

- **No new write surface.** No `GOVERNED_WRITES` entry was added. The panel is read-only and the source-text + rendered-DOM tests assert it.
- **No new `LOCAL_ONLY_FLOWS` entry.** The panel doesn't persist anything — no localStorage write, no sessionStorage write, no IndexedDB. State lives in React.
- **No schema change.** Every field consumed already existed.
- **No AI.** Pure deterministic function; module-hygiene + rendered-DOM tests forbid the vocabulary.
- **No automation.** `isAutomated: false` is a literal type on every suggestion; the panel never executes anything; "executes/runs/completes/approves/decides automatically" is asserted absent in the rendered DOM.
- **No permission widening.** The panel consumes the same `useDealData()` context every banker card uses. No new query, no new role surface.
- **No executive expansion.** Executive Workspace remains snapshot-only; the panel is not mounted there.

## Test + build counts (at acceptance)

- Full suite: **1331 / 1331 tests passing** (Phase 79 baseline 1303 + 21 derivation + 7 panel = 28 new).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the coverage map after Phase 80:

- **Manager / Team Deal Workspace Relationship Context** — the Phase 77 sibling extension across roles using their already-authorized deal lists. Pure reuse; low risk. Closes relationship-memory parity across the three banker-adjacent role workspaces.
- **Suggestion ledger (LOCAL_ONLY)** — record which Phase 80 suggestions the banker opens. Phase-23-style local clipboard / state surface. Becomes the data source for a future rule-tuning phase. No schema, no new writes.
- **High-contrast theme palette** — declare a `[data-theme="high-contrast"]` block on top of the Phase 79 token foundation. Closes the largest remaining a11y gap named in Phase 74 / 79.
- **Manager Activity Insights Lite — Manager-side autopilot rollup** — derive "deals with HIGH priority autopilot signals" across the manager's team pipeline. Manager-side counterpart to Phase 80. Reuses the same derivation; renders on `ManagerDealWorkspace` or `ManagerDataProvider`-fed card. Pure derivation; no new writes; advances §1.22 (Manager workspace) and §1.17 in parallel.

The suggestion ledger is the natural Phase 81 if the user wants to keep building on Phase 80's surface. The manager-side rollup is the natural sibling extension. Manager / team relationship-context extends Phase 77. High-contrast theme is the lowest-risk a11y closure.
