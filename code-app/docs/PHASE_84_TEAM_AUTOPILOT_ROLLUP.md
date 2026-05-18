# Phase 84 — Team Autopilot Rollup

## Goal

Add a deterministic team-workspace rollup on the Team Command Center showing the team's shared deals with next-best-action signals. Reuses the Phase 82 banker derivation against `TeamDataProvider`'s already-loaded deals + tasks + documents + memos; aggregates HIGH/MEDIUM/LOW counts and ranks the top 5 deals. Closes the autopilot-rollup parity across the three operating workspaces (banker, manager, team).

No AI. No automation. No new schema. No new write surface. No new query shape. No executive expansion.

## Why this phase

Phase 80 shipped per-deal Autopilot Lite inside each Deal Workspace. Phase 81 added a manager-side rollup. Phase 82 added the banker-side personal rollup. The team workspace was the remaining symmetric gap — team members share the pipeline but had no command-center view of which team deals had the most urgent next-best actions across HIGH / MEDIUM / LOW.

Four surfaces now share the same Phase 80 derivation engine:

- **Per-deal (banker)** — Phase 80 panel inside each Deal Workspace.
- **Team rollup (manager)** — Phase 81 card on Manager Command Center.
- **Personal rollup (banker)** — Phase 82 card on Banker Command Center.
- **Team rollup (team workspace)** — Phase 84 card on Team Command Center.

Phase 84 is the role-parity move that completes the triad.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.17 (Deal autopilot) — advanced to "Partially operational (advanced by Phase 80 + Phase 81 + Phase 82 + Phase 83 + Phase 84)". Autopilot capability now spans four surfaces with honestly bounded per-surface signal coverage.
- §1.23 (Team workspace) — advanced from "Operational (Phase 37)" to "Operational (Phase 37 + Phase 84)" with `<TeamAutopilotRollup />` mounted between `<SharedWorkQueue />` and `<TeamPipelineSummary />`.

## Relationship to Phases 80 / 81 / 82 / 83

Phase 84 is a thin aggregator over Phase 82, applied on the team surface.

| | Phase 80 panel | Phase 81 manager rollup | Phase 82 banker rollup | Phase 84 team rollup |
|---|---|---|---|---|
| Surface | Per-deal Deal Workspace | Manager Command Center | Banker Command Center | Team Command Center |
| Data source | `useDealData()` | `ManagerDataProvider.teamPipeline` | `loadBankerWorkQueueData(bankerId)` | `useTeamData()` |
| Tasks loaded | ✓ (full per-deal) | ✗ | ✓ (work-queue: open tasks) | ✓ (team task feed) |
| Documents loaded | ✓ (full per-deal) | ✗ | ✓ (outstanding + pending-review) | ✓ (with `status` discriminant) |
| Memos loaded | ✓ (full per-deal w/ sections) | ✗ | ✓ (status only, no sections) | ✓ (status only, no sections) |
| Activity timeline | ✓ (`activity[0]?.eventAt`) | proxy (`deal.modifiedOn`) | proxy (`deal.lastActivityOn`) | proxy (`deal.modifiedOn`) |
| Memo consistency | ✓ (full check) | ✗ | ✗ (no sections) | ✗ (no sections) |
| Coverage | 8/8 signals | 3–4/8 signals | 7/8 signals | 7/8 signals |
| Cap | 3 suggestions per deal | top 5 deals | top 5 deals | top 5 deals |
| Output shape | `NextBestAction[]` | `ManagerAutopilotRollup` | `BankerAutopilotRollup` | `TeamAutopilotRollup` (alias of `BankerAutopilotRollup`) |
| Ledger surface | `deal-panel` | `manager-rollup` | `banker-rollup` | `team-rollup` |

Phase 84's `deriveTeamAutopilotRollup` reshapes the team workspace data into the Phase 82 banker derivation's expected shape and delegates. Re-using the banker derivation keeps the rule set in one place; a future change to the rules applies to all per-deal + rollup surfaces without drift.

The team rollup specifically does **not** alias the manager rollup, because the team data provider loads tasks + documents + memos — strictly richer than the manager `TeamDeal[]`. Aliasing the banker derivation yields 7/8 signal coverage on the team surface, the same as the personal banker rollup.

## Signal coverage on the team rollup

`TeamDataProvider` returns the four `AsyncResult` slots the rest of the team workspace cards already consume:

- `deals: AsyncResult<TeamDealRow[]>` — deal-record fields + assigned-banker name.
- `tasks: AsyncResult<TeamTaskRow[]>` — open tasks across team deals.
- `documents: AsyncResult<TeamDocumentRow[]>` — documents with a pre-derived `status: 'outstanding' | 'received' | 'reviewed'` discriminant.
- `memos: AsyncResult<TeamMemoRow[]>` — memo rows with `statusKey` only (no sections).

`deriveTeamAutopilotRollup`:

- `tasks` → filtered to rows with a `dealId`, passed through to Phase 82's `tasks` bucket; Phase 80's overdue-task filter applies.
- `documents` with `status === 'outstanding'` → bucketed into Phase 82's `outstandingDocuments`.
- `documents` with `status === 'received'` → bucketed into Phase 82's `pendingReviewDocuments`; Phase 80 re-applies the 7-day threshold.
- `documents` with `status === 'reviewed'` → dropped; the Phase 80 pending-review filter already requires no-reviewer and the rule no longer fires.
- `memos` → filtered to rows with a `dealId`; Phase 80's draft-memo signal fires when `statusKey === 'draft'`.
- `deal.modifiedOn` → passed as `lastActivityOn` (modifiedon proxy — same approach Phase 81 / 82 use).
- `memoConsistencyFindingsCount` is fixed at `0` because `TeamMemoRow` carries no sections.

**7 of 8 Phase 80 signals fire on the team rollup:**

- ✓ `overdue-tasks` (HIGH)
- ✓ `pending-review-documents` (HIGH)
- ✓ `closing-soon-stale-activity` (HIGH)
- ✓ `closing-soon` (MEDIUM)
- ✓ `stage-aging` (MEDIUM)
- ✓ `outstanding-documents` (MEDIUM)
- ✓ `draft-memo` (LOW)
- ✓ `stale-activity` (LOW)
- ✗ `memo-consistency-findings` (MEDIUM) — silenced; available on per-deal Phase 80 panel.

The card disclaimer states this verbatim:

> "Team rollup uses your team workspace data (deals, tasks, documents with status, memos). Memo consistency findings appear on each deal's Next Best Actions panel inside the Deal Workspace; they do not fire on this rollup."

## Rollup ranking logic

`compareRollupDeals` (inherited from Phase 82) orders flagged deals by:

1. **Priority desc** — HIGH > MEDIUM > LOW.
2. **Suggestion count desc** — more signals on a deal = more attention warranted.
3. **Nearest target close date asc** — sooner-closing deals first; missing target-close goes to the back.
4. **Deal name asc** — stable lexicographic fallback for determinism.

The first 5 ranked deals appear in `topDeals`. The chip-row counts (HIGH/MEDIUM/LOW deal counts) always reflect the **complete** flagged set; only the visible list is capped.

This is the same ranking Phase 81 / 82 use — all three rollups feel consistent.

## Role boundaries

- **Team member** — sees `<TeamAutopilotRollup />` on Team Command Center.
- **Banker** — unchanged. The Phase 82 personal rollup remains the banker-side surface.
- **Manager** — unchanged. The Phase 81 team rollup remains the manager-side surface.
- **Executive** — unchanged.
- **Admin** — unchanged.

The card consumes `useTeamData()` — the same data the rest of the team workspace cards already share. No new query shape; no permission widening. The destination of the deal-name click (`navigate('/deals/<id>')`) runs through existing role-scoped access checks; no bypass.

Phase 48 isolation discipline is preserved: `src/shared/autopilot/teamAutopilotRollup.ts` defines its own structural input types (`TeamRollupDealInput` / `TeamRollupTaskInput` / `TeamRollupDocumentInput` / `TeamRollupMemoInput`) that mirror the team data shapes by structural typing without importing from `src/team/`.

## Team card UI

`src/team/TeamAutopilotRollup.tsx` renders:

- Card header: "Team next-best-action signals" + subtitle "Derived from current records. Nothing happens automatically."
- Priority count chip row: HIGH/MEDIUM/LOW deal counts (`aria-label="High priority: N deals"` etc.). Scan line ("Scanned N team deals · M with signals") closes the row.
- Top deals list: at most 5 `<li>` rows. Each row:
  - Deal name as a button (`aria-label="Open deal <name>"`) → `navigate('/deals/<id>')`. Clicking records an `'opened'` ledger entry on the `team-rollup` surface.
  - Priority badge (`aria-label="High priority signal"` etc.).
  - Top suggestion title + "(+N more on this deal)" tag when `suggestionCount > 1`.
  - Top suggestion reason paragraph.
  - Meta row: client, stage, target close, **assigned banker** (Phase 84 addition — team members can see ownership without leaving the workspace).
  - Dismiss locally / Restore controls (Phase 83 ledger integration; surface = `team-rollup`).
- Signal-coverage limitation paragraph (memo-consistency-findings note).
- Conservative disclaimer:

> "Derived from current records. Nothing happens automatically. No AI or automated decisions. Team visibility is scoped to the team's shared pipeline; deals outside that scope are not evaluated and not surfaced here. 'Dismiss locally' and 'Opened locally' are tracked on this browser only; they do not change deal status."

## Empty states

Four empty/intermediate states:

- **Loading** — "Loading team signals…" (any of the four data slots non-ready).
- **Failed** — `role="alert"` block with the error message + "Refresh to retry." Failed-state branches are checked **before** the loading branch so a transient service error is visible rather than hidden behind a perpetual "Loading…" placeholder.
- **No deals** (team pipeline is empty) — "No active deals on the team yet. Signals will populate as deals enter the team pipeline."
- **No signals** (deals exist but none flag) — "No next-best-action suggestions from current records." Followed by the signal-coverage limitation paragraph and the conservative disclaimer.

The rendered DOM is statically asserted NOT to contain "all clear" / "no risk" / "pipeline healthy" / "everything is fine" — those forbidden empty-state phrases would each be a false confidence claim.

## Phase 83 ledger integration

The Phase 83 `SuggestionLedgerSurface` union was extended in Phase 84 with `'team-rollup'`:

```ts
export type SuggestionLedgerSurface =
  | 'deal-panel'
  | 'banker-rollup'
  | 'manager-rollup'
  | 'team-rollup';
```

The ledger key for a team-rollup entry takes the same shape Phase 83 already pins:

```
team-rollup|<dealId>|<suggestionId>
```

State lives in `localStorage` under `cc:autopilotSuggestionLedger:v1` (unchanged from Phase 83). Dismissing a team-rollup row does **not** resolve the underlying deal item; the same rule still fires; the ledger only changes how the row is rendered ("Dismissed locally · tracked on this browser · Restore"). The Phase 83 `LOCAL_ONLY_FLOWS.autopilot-suggestion-ledger` entry covers the new surface — no new flow inventory is needed.

The Phase 83 ledger test suite gains a Phase-84 parity test asserting:

- `recordSuggestionAction({ surface: 'team-rollup', ... })` returns a well-formed entry.
- The key takes the expected `team-rollup|<dealId>|<suggestionId>` shape.
- `getSuggestionLedgerEntry(...)` reads the entry back.

## Why this is not AI / not automation

- **No model invocation.** The rollup is a pure function over typed inputs plus a sort + slice. No `fetch` to AI endpoints, no Copilot connector, no embedding lookup.
- **`isAutomated: false` is preserved.** Each suggestion the team member sees is a Phase 80 `NextBestAction` with the literal-typed false flag.
- **No action runs on the team member's behalf.** Clicking a deal-name navigates; the destination workspace mounts its own action surfaces, and the team member has to click those manually.
- **Module-hygiene test forbids the vocabulary.** `teamAutopilotRollup.test.ts` asserts the source never contains "AI-generated", "autopilot executed", "automatic(ally)", "is/was/has been approved", "decisioned", "guaranteed", "system will complete", "predicts", "prediction".
- **Rendered-DOM test forbids the same vocabulary in the card output.** `TeamAutopilotRollup.test.tsx` asserts the DOM never contains those tokens as positive claims. The disclaimer's "Nothing happens automatically" passes because the regex only matches affirmative-tense forms ("executes/runs/completes/approves/decides automatically").
- **Conservative-copy guard remains green.** The Phase 45 phrase guard continues to pass — Phase 84 reuses the same truthful "No AI or automated decisions" negation Phase 80 / 81 / 82 use, with `src/team/TeamAutopilotRollup.tsx` added to the existing `unwired-ai-claim` allowlist with a stated Phase 84 reason (same pattern Phase 80 / 81 / 82 received).

## Limitations

- **No memo-consistency-findings signal on the rollup.** Documented honestly; the per-deal Phase 80 panel surfaces it.
- **`modifiedOn` is a coarse activity proxy.** It captures any deal-record write, not just timeline events. The per-deal Phase 80 panel uses the precise `activity[0]?.eventAt` because the per-deal activity timeline is loaded in `useDealData()`.
- **No drill-through to per-deal signals from the rollup.** Clicking a deal name navigates to the Deal Workspace where the Phase 80 panel mounts. A future phase could deep-link directly to the per-deal panel or pass the top-suggestion id as a `?focus=` query param.
- **Top 5 cap.** A team with 20 flagged deals sees only the 5 highest-ranked. The chip-row counts always reflect the full flagged set so the team member isn't misled about the total.
- **Phase 37 scoping is unchanged.** Phase 84 inherits whatever team-scope `TeamDataProvider` returns; the "deals you touch" tightening flagged in §1.23 is still deferred.
- **Local-only ledger.** Dismissing a row affects this browser only. Two team members viewing the same team rollup will not see each other's dismissals.

## Future upgrade path

Phase 84 ships the deterministic rollup. The Vibe-expected autopilot capability continues to extend through these future phases:

1. **Tighter "deals you touch" scoping (§1.23).** Replace the shared-with-manager team scope with a per-user "what did you touch" filter once governance + schema lands.
2. **Manager-scoped child-data loader.** Broadens manager rollup signal coverage to match the banker / team rollups' 7/8.
3. **Accept/reject feedback per row.** Beyond Dismiss / Opened, allow "Working on it" / "Snooze 24h" / "Dismiss for this deal".
4. **Teams notifications.** When a HIGH-priority signal first appears for the team's pipeline, fire a Teams card. Lane E connector phase.
5. **AI-assisted explanation.** Optional Copilot brief that summarizes "why this deal is flagged this way and what to do first." Lane F; opt-in only; "review before use" warning.
6. **Task creation with confirmation.** Each suggestion gains an "Open and create follow-up task" affordance. Phase-21-style governed write triggered from the suggestion, with explicit team-member confirmation.
7. **Live Outlook/Teams integration.** Once contact-history ingestion lands, the autopilot can surface "Last borrower email was 12 days ago" instead of the modifiedon proxy.

## Files created

- `src/shared/autopilot/teamAutopilotRollup.ts` — pure rollup primitive (`deriveTeamAutopilotRollup` + `TeamAutopilotRollup` (= `BankerAutopilotRollup`) + `TeamRollupDeal` (= `BankerRollupDeal`) + `TeamRollupInput` + per-row structural input types + `TOP_N_TEAM_ROLLUP_DEALS = 5`).
- `src/shared/autopilot/teamAutopilotRollup.test.ts` — derivation + module-hygiene tests covering empty input, signal coverage on the team surface (overdue / pending-review / outstanding / draft-memo), orphan-row drop (tasks/docs/memos with no `dealId`), the memo-consistency-findings silenced contract, priority counts, ranking, the top-N cap, clientName passthrough, the document-status `'reviewed'` drop contract, and the no-SDK / no-role / no-AI source vocabulary discipline.
- `src/team/TeamAutopilotRollup.tsx` — team-only Command Center card.
- `src/team/TeamAutopilotRollup.test.tsx` — card-rendering tests covering header + subtitle, loading, failed (`role="alert"`), no-deals empty, no-signals empty (with "no over-confidence" assertion), overdue-tasks + pending-review-documents HIGH-priority signals, deal-name navigation + "opened" ledger recording, Dismiss / Restore round-trip, localStorage rehydration of pre-existing dismissed entries on the `team-rollup` surface, signal-coverage + conservative disclaimer rendering, rendered-DOM forbidden-vocab scan.
- `docs/PHASE_84_TEAM_AUTOPILOT_ROLLUP.md` — this document.

## Files modified

- `src/workspaces/TeamWorkspace.tsx` — mounts `<TeamAutopilotRollup />` between `<SharedWorkQueue />` and `<TeamPipelineSummary />`. Final card order: SharedWorkQueue → TeamAutopilotRollup → TeamPipelineSummary → (BottlenecksAgingByStage + SharedClosingCalendar) → (TeamDocumentNeeds + TeamTaskLoad) → SharedActiveDeals → TeamBankerActivityBreakdown.
- `src/shared/autopilot/suggestionLedger.ts` — `SuggestionLedgerSurface` union extended with `'team-rollup'`; `isLedgerEntry` validator accepts the new surface.
- `src/shared/autopilot/suggestionLedger.test.ts` — Phase 84 parity test asserts the new surface is accepted and produces the expected ledger key.
- `src/shared/governance/conservativeCopyGuard.test.ts` — adds `src/team/TeamAutopilotRollup.tsx` to the `unwired-ai-claim` allowlist with a stated Phase 84 reason (same pattern Phase 24 / 73 / 80 / 81 / 82 received).
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.17 + §1.23 advanced.

## Tests added / updated

- New derivation tests in `src/shared/autopilot/teamAutopilotRollup.test.ts`.
- New card-rendering tests in `src/team/TeamAutopilotRollup.test.tsx`.
- New parity test in `src/shared/autopilot/suggestionLedger.test.ts` for the `team-rollup` surface.
- 1 allowlist entry in `src/shared/governance/conservativeCopyGuard.test.ts` (`src/team/TeamAutopilotRollup.tsx` allowed for the `unwired-ai-claim` rule with stated Phase 84 reason).

No existing test was changed substantively. Phase 80 / 81 / 82 / 83 tests continue to pass — Phase 84 imports their derivations unchanged.

## Confirmation: no writes / schema / AI / automation added

- **No new write surface.** No `GOVERNED_WRITES` entry.
- **No new `LOCAL_ONLY_FLOWS` entry.** The Phase 83 ledger flow already exists; Phase 84 only extends its surface union.
- **No schema change.** Every field consumed already existed and is already loaded by `TeamDataProvider`.
- **No AI.** Pure deterministic function; rendered-DOM + source-text vocab scans pin the contract.
- **No automation.** Phase 80's literal `isAutomated: false` flows through unchanged.
- **No permission widening.** The rollup operates on `useTeamData()` only.
- **No new query.** `TeamDataProvider` already loads deals + tasks + documents + memos.
- **No executive expansion.** Executive workspace unchanged.

## Rollup signals implemented

Seven of Phase 80's eight signals fire on the team rollup surface (overdue-tasks, pending-review-documents, closing-soon-stale-activity, closing-soon, stage-aging, outstanding-documents, draft-memo, stale-activity). One signal is silenced (memo-consistency-findings) because the team memo row carries no sections. The per-deal Phase 80 panel continues to surface the missing signal.

## Ranking rules

Priority desc → suggestion count desc → nearest target close → deal name asc. Cap at `TOP_N_TEAM_ROLLUP_DEALS = 5`. Same rules Phase 81 / 82 use.

## Role surfaces updated

- **Team Command Center** — new `<TeamAutopilotRollup />` card.
- **Banker Command Center / Banker Deal Workspace / Manager / Executive / Admin** — unchanged.

## Recommended next phase

After Phase 84 the autopilot rollup capability has reached full parity across the three operating workspaces (per-deal banker + manager rollup + banker rollup + team rollup). Natural next moves:

- **Tighter Team scope (§1.23).** Replace the shared-with-manager scope with a per-user "what did you touch" filter.
- **Manager-scoped child-data loader.** Broadens manager rollup signal coverage to match the banker / team rollups' 7/8.
- **Accept/reject feedback per row.** Beyond Dismiss / Opened — "Working on it" / "Snooze 24h" / "Dismiss for this deal".
- **AI-assisted explanation (Lane F).** Optional Copilot brief on top of the rollup rows.
- **Task creation with confirmation (Phase-21-style governed write).** First write-capable extension of autopilot.
- **Live Outlook/Teams integration.** Replace modifiedon proxy with real contact-history.

The autopilot triad is complete in-repo. The next meaningful Vibe move on this capability requires either Lane E (Teams), Lane F (AI), or a write-extension governed write, all of which need an explicit brief.
