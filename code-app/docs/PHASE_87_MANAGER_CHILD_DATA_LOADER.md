# Phase 87 — Manager-Scoped Child Data Loader for Autopilot Rollup

## Goal

Broaden `<ManagerAutopilotRollup />` signal coverage from Phase 81's 4-of-8 floor (deal-record fields only) to the same 7-of-8 the banker (Phase 82) and team (Phase 84) rollups carry, by loading manager-authorized child data — open tasks, document checklist rows with `status`, and credit memo status — scoped by the parent deal's team.

No new writes. No new schema. No new connector. No AI. No automation. No executive expansion. No permission widening.

## Why this phase

Phase 81 shipped the manager rollup but honestly limited it: `teamPipeline` (`TeamDeal[]`) carried only deal-record fields, so 5 of the 8 Phase 80 signals (overdue-tasks, pending-review-documents, outstanding-documents, draft-memo, memo-consistency-findings) silently passed empty arrays into `deriveNextBestActions` and could not fire on the manager surface. The card disclaimer was honest about this — "Manager rollup uses deal-record signals only (closing-soon, stage-aging, modifiedon staleness)" — but it left a real Vibe-expected operational surface short of its full value.

The Microsoft Vibe scope expects the manager workspace to act as the team's operational command center: who's behind, where the bottlenecks are, which deals have document gaps, which deals have stale memos. Those are exactly the signals Phase 80 already encodes; the only gap was the manager-side data plumbing. Phase 87 closes that gap.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.17 (Deal autopilot) — extended to "Partially operational (advanced by Phase 80 + Phase 81 + Phase 82 + Phase 83 + Phase 84 + Phase 87)". Four autopilot surfaces now share comparable richness; the only remaining gap on all three rollups is `memo-consistency-findings`.
- §1.22 (Manager workspace) — extended to "Operational (Phase 36 + Phase 71 + Phase 81 + Phase 87)". Manager-side autopilot now matches the banker / team rollups at 7 of 8 signals.
- §1.18 (Activity intelligence) — extended; Phase 87 widens the activity-driven signal coverage on the manager surface (overdue tasks, pending review documents, outstanding documents, draft memos, stale activity).

## Data loaded

`ManagerDataProvider` now fires **five** parallel loads on mount (Phase 87 adds three to the two it already issued):

| Loader | Source | Filter | Rows surfaced |
|---|---|---|---|
| `loadTeamPipeline(teamId)` | `Cr664_loandealsService` | `_cr664_team_value eq <teamId> and statecode eq 0 and (isterminalstatus eq false or null)` | Active, non-terminal deals on the manager's team |
| `loadTeamBankers(teamId)` | `Cr664_bankersService` | `_cr664_team_value eq <teamId> and statecode eq 0` | Active bankers on the team |
| **`loadManagerTeamTasks(teamId)`** *(Phase 87)* | `Cr664_dealtask1sService` | `cr664_Deal/_cr664_team_value eq <teamId> and statecode eq 0` | Open / non-deleted deal tasks whose parent deal sits on the manager's team |
| **`loadManagerTeamDocuments(teamId)`** *(Phase 87)* | `Cr664_documentchecklistsService` | `cr664_Deal/_cr664_team_value eq <teamId> and statecode eq 0` | Document checklist rows whose parent deal sits on the manager's team; client-side `status` derivation matches Phase 84's `deriveDocStatus` (`'outstanding' | 'received' | 'reviewed'`) |
| **`loadManagerTeamMemos(teamId)`** *(Phase 87)* | `Cr664_creditmemo1sService` | `cr664_Deal/_cr664_team_value eq <teamId> and statecode eq 0` | Credit memo header rows whose parent deal sits on the manager's team; `statusKey` only (no sections) |

The three new loaders sit in `src/manager/managerQueries.ts`. Each is a thin wrapper over the typed generated `Cr664_*Service.getAll(...)`; each returns a manager-local row type (`TeamScopedTask`, `TeamScopedDocument`, `TeamScopedMemo`); no new schema is read.

## Services / fields used

The generated services consumed are already in the SDK (no regeneration needed). Per loader:

- **`Cr664_dealtask1sService`** — fields `cr664_dealtask1id`, `cr664_taskname`, `cr664_completed`, `cr664_duedate`, `cr664_assignedtoname`, `modifiedon`, `_cr664_deal_value`, `cr664_dealname`. Same fields the Phase 84 team workspace already pulls.
- **`Cr664_documentchecklistsService`** — fields `cr664_documentchecklistid`, `cr664_documentname`, `cr664_duedate`, `cr664_requestdate`, `cr664_receiveddate`, `cr664_reviewer`, `cr664_uploadstatus`, `modifiedon`, `_cr664_deal_value`, `cr664_dealname`. Status derived client-side from the same inputs the team query uses.
- **`Cr664_creditmemo1sService`** — fields `cr664_creditmemo1id`, `cr664_memoname`, `cr664_status`, `cr664_generatedat`, `modifiedon`, `_cr664_deal_value`, `cr664_dealname`. Same status option-set lookup the team query uses.

Sections (`Cr664_creditmemodraftsectionsService`) are **not** loaded — keeping the memo-consistency-findings signal silenced on the rollup surface, same as banker (Phase 82) and team (Phase 84) rollups.

## Permission boundary

The manager's authorization scope is **the manager's team**, resolved once by `loadManagerIdentity(upn)` and exposed by `useManager().teamId`. Every loader the rollup consumes uses that same `teamId` as a server-side filter:

- The pipeline loader filters on the deal's team FK directly: `_cr664_team_value eq <teamId>`.
- The three Phase 87 child loaders filter on the **parent deal's** team FK via the OData navigation-property pattern: `cr664_Deal/_cr664_team_value eq <teamId>`. If Dataverse rejects the navigation filter at runtime, the fallback documented in `src/team/teamQueries.ts` (two-step: load team deal ids, then OR-chain `_cr664_deal_value`) applies — the team workspace has been running this query shape since Phase 84.

What this preserves:

- **No bypass of manager / team authorization.** A row whose parent deal sits on a different team never satisfies the OData filter and never reaches the client. There is no client-side trust step.
- **No banker-context fetches.** The manager never calls `loadDealTasks(dealId)` / `loadDealDocuments(dealId)` / `loadDealCreditMemo(dealId)` from `src/deals/` — those are the per-deal loaders authorized by `loadDealForBanker(dealId, bankerId)`. The manager-side loaders read by team scope, not by deal id.
- **No widening to executive / admin.** The new loaders sit under `src/manager/` and are only mounted inside `ManagerDataProvider`, which is only mounted inside `ManagerProvider`. Executive / admin workspaces are untouched.
- **No deal-id leakage.** The manager only ever sees rows whose parent deal is already in their `teamPipeline` — the boundary is identical to what Phase 81 / Phase 71 already enforced.

The Phase 48 isolation invariant is preserved: `src/manager/managerQueries.ts` does **not** import from `src/team/teamQueries.ts` or any other role module. It duplicates the team workspace's child-data filter pattern by design — the module comment block at the head of each side already documents this is intentional and that the two role data layers stay separate to prevent coupling drift.

## Signals unlocked

After Phase 87, the manager rollup fires **7 of 8** Phase 80 signals — matching the banker (Phase 82) and team (Phase 84) rollups:

| Signal | Priority | Status before Phase 87 | Status after Phase 87 |
|---|---|---|---|
| `closing-soon-stale-activity` | HIGH | ✓ fires | ✓ fires |
| `closing-soon` | MEDIUM | ✓ fires | ✓ fires |
| `stage-aging` | MEDIUM | ✓ fires | ✓ fires |
| `stale-activity` | LOW | ✓ fires | ✓ fires |
| `overdue-tasks` | HIGH | ✗ silenced (no tasks loaded) | ✓ **fires** (Phase 87) |
| `pending-review-documents` | HIGH | ✗ silenced (no documents loaded) | ✓ **fires** (Phase 87) |
| `outstanding-documents` | MEDIUM | ✗ silenced (no documents loaded) | ✓ **fires** (Phase 87) |
| `draft-memo` | LOW | ✗ silenced (no memos loaded) | ✓ **fires** (Phase 87) |
| `memo-consistency-findings` | MEDIUM | ✗ silenced | ✗ **still silenced** |

The activity proxy for the manager surface remains `deal.modifiedOn` (not a per-deal Activity Timeline replay) — same proxy the banker / team rollups carry. The per-deal Phase 80 panel inside the Deal Workspace continues to use the precise `activity[0]?.eventAt` because `useDealData()` loads the full timeline; that level of richness is per-deal-only by design.

## Signals still unavailable

- **`memo-consistency-findings`** — requires `CreditMemoData` with `sections` (the structured field comparison Phase 73 deterministically runs). The Phase 87 manager memo loader pulls header status only. Loading sections team-wide would inflate query volume; the per-deal Phase 80 panel inside the Deal Workspace is the canonical surface for this signal.
- **Banker velocity / win-rate / trend lines** — explicitly out of scope per the brief; would require historic stage-transition data which the schema does not store today.
- **Per-banker / per-priority manager filters** — Phase 87 keeps the rollup top-N undifferentiated by banker. A future phase could add a "banker filter" affordance once the broader set is stable.

## Why this is not AI / not automation

- **No model invocation.** The rollup is a pure function over typed inputs plus a sort + slice. `deriveNextBestActions` is the same deterministic primitive Phase 80 ships; no new derivation logic was added.
- **`isAutomated: false` is preserved.** Every suggestion the manager sees is a Phase 80 `NextBestAction` with the literal-typed false flag. The type system enforces this.
- **No action runs on the manager's behalf.** Clicking a deal-name navigates; the destination workspace mounts its own action surfaces, and writes still require explicit banker action inside the Deal Workspace.
- **Module-hygiene test forbids the vocabulary** in `managerAutopilotRollup.test.ts`: no `AI-generated`, `autopilot executed`, `automatically`, `is/was/has been approved`, `decisioned`, `guaranteed`, `system will complete`, `predicts`, or `prediction` in stripped source.
- **Rendered-DOM test forbids the same vocabulary** in card output (`ManagerAutopilotRollup.test.tsx`). The disclaimer's "Nothing happens automatically" passes because the regex only matches affirmative-tense forms (`executes/runs/completes/approves/decides automatically`).
- **Conservative-copy guard remains green** — Phase 87 reuses the same truthful "No AI or automated decisions" negation Phase 80 / 81 / 82 / 84 use; no new banner copy was needed.
- **Forbidden empty-state copy** — `full coverage` / `complete insight` / `guaranteed` / `real-time` / `automated intervention` / `official score` are statically asserted absent from the rendered DOM (new Phase 87 test).

## Future upgrade path

1. **Memo consistency on the manager surface.** Load `Cr664_creditmemodraftsectionsService` rows team-wide (or per visible deal) and run the Phase 73 consistency check inside `ManagerAutopilotRollup`. Trade-off: query-volume; would only be worth it if managers ask for that signal.
2. **Per-banker filter UI.** Let the manager filter the top-N rollup to a single banker (or a single priority). No new data; same derivation; new UI affordance.
3. **Trend lines.** Once a time-series schema lands, surface "deals stuck in stage > X days week-over-week" on the rollup. Lane B-G — schema work.
4. **Manager activity feed / inbox.** A timeline-driven "what happened on the team since you last looked" panel, paired with Phase 72's last-visit marker. Sibling to the autopilot rollup, distinct surface.
5. **Suggestion ledger filters.** Today the ledger surfaces opened/dismissed per row; a future phase could surface "dismissed by anyone on the team" — but that requires schema (cross-device sync), pinned at `LOCAL_ONLY_FLOWS.autopilot-suggestion-ledger`.

## Files created

- `docs/PHASE_87_MANAGER_CHILD_DATA_LOADER.md` — this document.

## Files modified

- `src/manager/managerQueries.ts` — adds `loadManagerTeamTasks(teamId)`, `loadManagerTeamDocuments(teamId)`, `loadManagerTeamMemos(teamId)` and their typed row interfaces (`TeamScopedTask`, `TeamScopedDocument`, `TeamScopedMemo`). Imports three additional generated services (`Cr664_dealtask1sService`, `Cr664_documentchecklistsService`, `Cr664_creditmemo1sService`).
- `src/manager/ManagerDataProvider.tsx` — extends `ManagerData` with three new `AsyncResult` slots (`teamTasks`, `teamDocuments`, `teamMemos`), fires the three new loaders in parallel alongside the existing pipeline + bankers loads. Five parallel loads total. Existing manager cards continue to ignore the new slots.
- `src/shared/autopilot/managerAutopilotRollup.ts` — extends `ManagerRollupInput` with **optional** `tasks?`, `documents?`, `memos?` collections (Phase 81 callers that pass only `{ deals: [...] }` continue to work unchanged). When supplied, the derivation buckets by `dealId` and passes the real per-deal collections into `deriveNextBestActions` (including the documents-by-status split into Phase 80's `outstandingDocuments` / `receivedDocuments` buckets). Orphan rows (no `dealId`) and `reviewed` documents are explicitly dropped — same contract Phase 84 team rollup carries.
- `src/manager/ManagerAutopilotRollup.tsx` — consumes the four data slots (`teamPipeline`, `teamTasks`, `teamDocuments`, `teamMemos`); reshapes them into the extended derivation input; waits for ALL four to be ready before derivation; surfaces a `role="alert"` block on any slot failure; updates the signal-coverage paragraph from Phase 81's "deal-record signals only" to "the available manager-scoped records on your team's pipeline (deals, open tasks, document checklist rows, credit memos)"; explicitly continues to disclaim `memo-consistency-findings`.
- `src/shared/autopilot/managerAutopilotRollup.test.ts` — Phase 81 backward-compat tests preserved unchanged; adds 10 new tests under a "Phase 87 — child-data signals" describe block covering: backward-compat with no children, overdue-tasks HIGH, pending-review-documents HIGH, outstanding-documents MEDIUM, draft-memo LOW, orphan row drop, reviewed-document drop, memo-consistency-findings silenced contract, child-row attribution across multiple deals, HIGH→MEDIUM→LOW ranking under the broader signal set.
- `src/manager/ManagerAutopilotRollup.test.tsx` — updates `ready()` helper to include the three new slots (default to empty arrays for backward-compat); adds a Phase 87 loading-state test (one child slot loading), a Phase 87 failed-state test (child slot fails), and a new "Phase 87 — manager-scoped child data signals" describe block with 8 tests covering overdue-tasks / pending-review / outstanding / draft-memo / reviewed-doc-drop / memo-consistency-disclaimer / forbidden Phase 81 legacy phrasing / forbidden over-confident copy.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.17, §1.18, §1.22 advanced.

## Tests added / updated

- 10 new derivation tests in `src/shared/autopilot/managerAutopilotRollup.test.ts` (14 Phase 81 tests preserved → 24 total).
- 9 new card tests in `src/manager/ManagerAutopilotRollup.test.tsx` (15 Phase 81/83 tests preserved → 24 total).
- 1 Phase 81-shape disclaimer test rewritten to match the Phase 87 coverage paragraph (no semantic regression; still pins the same anti-overclaim copy).

No existing test outside the manager rollup files was changed substantively. Phase 80 / 82 / 83 / 84 / 86 tests continue to pass.

## Confirmation: no writes / schema / AI / automation / executive expansion added

- ✅ **No new write surface.** No `GOVERNED_WRITES` entry. The Phase 87 changes are purely read-only.
- ✅ **No new `LOCAL_ONLY_FLOWS` entry.** The card mounts data already provided through the manager data provider; no clipboard handoff, no localStorage state beyond Phase 83's existing ledger.
- ✅ **No schema change.** Every field consumed already existed and is read by Phase 84's team queries today. No regeneration. No new column.
- ✅ **No AI.** Pure deterministic derivation; rendered-DOM + source-text vocab scans pin the contract; the disclaimer remains "No AI or automated decisions".
- ✅ **No automation.** Phase 80's literal `isAutomated: false` flows through unchanged.
- ✅ **No permission widening.** The manager's `teamId` is the authoritative boundary; every loader filters server-side by that team. No banker-context fetch is invoked.
- ✅ **No executive expansion.** Executive workspace is untouched; `WORKSPACE_DEAL_ACCESS.executive` remains `denied`.
- ✅ **No Teams / Outlook / Graph expansion.** Phase 86 surface unchanged; no new Teams calls.
- ✅ **No borrower portal expansion.** Borrower portal remains deferred (Phase 65); no external-user data was touched.

## Recommended next phase

From the coverage map after Phase 87, the autopilot capability has reached signal-parity across the three operating workspaces. Candidates:

1. **Phase 88 candidate — Manager activity feed / "what changed since you last looked" panel.** Sibling to Phase 72 (banker per-deal marker) and Phase 80 (per-deal autopilot). Would surface a team-wide "5 new received documents, 2 stage changes, 1 new memo draft since your last visit" rollup using the new manager-scoped child data already loaded. No write, no AI.
2. **Phase 88 candidate — Per-banker filter on the manager rollup.** Lets a manager focus on one banker's deals without leaving the workspace. Pure UI; same data.
3. **Phase 88 candidate — Memo consistency findings on the rollup.** Add the sections loader + run Phase 73 deterministically per memo. Closes the 8th and final Phase 80 signal on the rollup surface, at the cost of query volume.
4. **Phase 88 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** The runner-up Teams move; LOCAL_ONLY markdown summary the banker pastes into any Teams chat. Honest no-admin extension of Phase 86.
5. **Phase 88 candidate — Borrower-side document review markers (Lane C precondition audit).** Schema-side foundation work for any future document-upload extension. Audit only; no writes.

Recommendation: **Phase 88 — Manager activity feed / "what changed since you last looked"**. It sits naturally on top of the new manager-scoped child loaders Phase 87 just landed (no new data shape required), advances Vibe §1.18 (activity intelligence) on the manager surface, and gives managers the "morning catch-up" surface the Vibe scope expects without any AI / write / schema work.
