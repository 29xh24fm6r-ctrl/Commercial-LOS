# Phase 88 — Manager Activity Feed / Morning Catch-Up

## Goal

Add a deterministic "Morning catch-up" feed on the Manager Command Center that summarizes recent and attention-worthy changes across the manager-authorized team pipeline. Sits on top of the Phase 87 manager-scoped child data — no new query shape, no new schema, no new SDK install — and complements (rather than duplicates) the Phase 81/87 autopilot rollup.

No new writes. No new schema. No AI. No Teams / Outlook expansion. No workflow automation. No stage progression. No borrower portal. No executive live-data expansion. Pure deterministic derivation + a read-only card.

## Why this phase

Phase 87 added manager-scoped tasks / documents / memos to `ManagerDataProvider` so the autopilot rollup could fire 7 of 8 Phase 80 signals on the manager surface. The same loaded data unlocks a second, complementary surface that the Microsoft Vibe scope explicitly expects: a "morning catch-up" feed.

The two surfaces answer different questions:

| | `<ManagerAutopilotRollup />` (Phase 81/87) | `<ManagerMorningCatchUp />` (Phase 88) |
|---|---|---|
| Question answered | "What should this banker DO next on this deal?" | "What HAPPENED across the team / what NEEDS attention?" |
| Framing | Action-oriented (forward-looking suggestion text) | Observation-oriented (past-tense / present-state record-of-events) |
| Items per deal | 1 (the top-priority Phase 80 suggestion) | Multiple — separate items per kind |
| Data-quality items | ✗ — autopilot never surfaces "no stage" / "no banker" | ✓ — surfaced as `missing-stage` / `missing-assigned-banker` |
| "Due soon" tasks (not yet overdue) | ✗ — Phase 80 only fires on overdue | ✓ — fires as `task-due-soon` MEDIUM within 3 days |
| "Newly received" documents | ✗ — Phase 80 only fires after the pending-review threshold | ✓ — fires as `newly-received-document` LOW within 3 days |
| Sort key | priority desc → suggestion count → close date | priority desc → occurredAt desc → deal name |
| Cap | 5 deals | 8 items |
| Ledger integration | Phase 83 dismiss/restore (per row) | None — current-state only; no localStorage state |

Phase 88 is the morning-feed half of activity intelligence (§1.18) on the manager surface — built deterministically from records the manager workspace already loads.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.18 (Activity intelligence)** — extended to "Partially operational (advanced by Phase 72 + Phase 80 + Phase 82 + Phase 83 + Phase 87 + Phase 88)". The morning-feed half of the manager activity-intelligence surface is now shipped.
- **§1.22 (Manager workspace)** — extended to "Operational (Phase 36 + Phase 71 + Phase 81 + Phase 87 + Phase 88)". Manager-side observability has a dedicated catch-up surface complementary to the rollup.

## Data sources used

`ManagerDataProvider` already loads (Phase 87):

- `teamPipeline: TeamDeal[]` — Phase 14 (active, non-terminal deals on the manager's team, filtered by `_cr664_team_value`).
- `teamTasks: TeamScopedTask[]` — Phase 87 (`Cr664_dealtask1sService`, filtered by parent deal's team).
- `teamDocuments: TeamScopedDocument[]` — Phase 87 (`Cr664_documentchecklistsService`, with status discriminant derived client-side).
- `teamMemos: TeamScopedMemo[]` — Phase 87 (`Cr664_creditmemo1sService`, status only).

Phase 88 adds **no new generated-service imports** and **no new queries**. The catch-up card consumes only the four async slots already in `ManagerData`.

## Feed item types implemented

`src/shared/activity/managerMorningCatchUp.ts` defines 11 item kinds, each tied to a `priority` and a `source`:

| Kind | Priority | Source | Fires when |
|---|---|---|---|
| `overdue-task` | HIGH | task | Task `dueDate` is before `now` AND task is not completed |
| `pending-review-document` | HIGH | document | Document `status === 'received'`, no reviewer, received ≥ 7 days ago (PENDING_REVIEW_AT_RISK_DAYS) |
| `closing-soon` | HIGH | deal | `targetCloseDate` is within the next 14 days (CLOSING_SOON_DAYS) |
| `task-due-soon` | MEDIUM | task | Task `dueDate` is within the next 3 days (TASK_DUE_SOON_DAYS) AND not overdue |
| `outstanding-documents` | MEDIUM | document | Deal has 1+ documents with `status === 'outstanding'` (aggregated, one item per deal) |
| `stage-aging` | MEDIUM | deal | Days since `stageEntryDate` ≥ 30 (STAGE_AGING_AT_RISK_DAYS) |
| `missing-stage` | MEDIUM | deal | Deal `stage` is undefined / empty / whitespace |
| `missing-assigned-banker` | MEDIUM | deal | Deal `assignedBankerName` is undefined / empty / whitespace |
| `newly-received-document` | LOW | document | Document `status === 'received'`, no reviewer, received within last 3 days (NEWLY_RECEIVED_RECENT_DAYS) — OR — received without a `receivedDate` (informational fallback) |
| `draft-memo` | LOW | memo | Deal has 1+ memos with `statusKey === 'draft'` (aggregated, one item per deal) |
| `stale-activity` | LOW | deal | Deal `modifiedOn` ≥ 14 days old (STALE_ACTIVITY_DAYS) |

The thresholds reuse the Phase 80 / Phase 87 shared constants (`CLOSING_SOON_DAYS`, `STAGE_AGING_AT_RISK_DAYS`, `PENDING_REVIEW_AT_RISK_DAYS`). Phase 88 introduces only two new constants: `TASK_DUE_SOON_DAYS = 3` and `NEWLY_RECEIVED_RECENT_DAYS = 3`.

## Feed item model

Each item carries:

- `id` — deterministic key `<kind>:<dealId>[:<rowId>]`. Lets the card key React lists and lets tests assert membership.
- `dealId` / `dealName` — propagated from the parent deal.
- `ownerName` — `deal.assignedBankerName` (undefined when missing).
- `kind` — one of the 11 kinds.
- `priority` — `'high' | 'medium' | 'low'`.
- `title` — short scannable label ("Overdue task", "Task due soon", "Document may require review", etc.).
- `reason` — one-sentence conservative observation ("Task X was due 2 days ago; may require review.", "1 document outstanding on this deal; needs attention.").
- `occurredAt` — ISO timestamp anchored to the relevant record event (task due date, doc received date, deal `modifiedOn` for always-on items). `undefined` when no anchor exists.
- `derivedAt` — ISO timestamp the derivation ran (the caller's `now`). Surfaced for diagnostics, not displayed.
- `source` — `'task' | 'document' | 'memo' | 'deal'`.

## Priority rules

Sort: priority desc (HIGH > MEDIUM > LOW), then `occurredAt` desc (most recent past first; missing → far past so always-on items sort below time-anchored ones within a priority tier), then `dealName` asc (stable lexicographic fallback).

Hard cap: `TOP_N_CATCH_UP_ITEMS = 8`. The brief allows 5–8; 8 keeps the card useful for managers with broader teams without scrolling.

Forbidden empty-state phrasing — statically scanned in both source and rendered DOM:

- ❌ never "all clear"
- ❌ never "no risk"
- ❌ never "pipeline healthy"
- ❌ never "everything is fine"
- ❌ never "real-time"

Required disclaimers — rendered verbatim:

- "Derived from current manager-visible records. Nothing happens automatically."
- "Not AI-generated."
- "No AI or automated decisions."

## Limitations

- **Activity proxy is `modifiedOn`.** Same coarse proxy Phase 81 / 82 / 84 / 87 already use. A change to any deal field (or any child row that updates the parent) bumps the timestamp, so the stale-activity signal is a "no record-side write" indicator, not a "no business activity" indicator. The per-deal Phase 80 panel uses the more precise `activity[0]?.eventAt` because `useDealData()` loads the full timeline.
- **No memo-consistency-findings.** Same gap Phase 82 / 84 / 87 carry — needs `CreditMemoData` with sections. Available on the per-deal Phase 80 panel inside the Deal Workspace.
- **No local last-seen state.** Phase 88 deliberately does NOT track "what the manager has already seen". Adding it would require a new LOCAL_ONLY_FLOWS entry analogous to Phase 72's per-deal marker; the brief explicitly prefers to defer that. Future phase (see "Future upgrade path").
- **No push / notification surface.** The card refreshes when `ManagerDataProvider` refreshes; there is no real-time stream or websocket. Phase 86's `@microsoft/teams-js` install only powers the per-deal chat handoff; it is not used here.
- **Top-N cap is rendering-only.** Items beyond the cap are NOT shown but DO exist in the underlying records — the card never claims "you have only N attention items". A future phase could surface a "+M more" link.
- **Cross-device blindness.** The catch-up is current-state; if a manager looks at the same team on two devices both see the same feed. No state, nothing to sync.

## Why this is not AI / not real-time notification / not automation

- **No model invocation.** Pure deterministic function over typed inputs + a sort + slice. Source-text test forbids `AI-generated` / `AI-detected` / `system decided` / `predicts` / `prediction`.
- **No notification surface.** The card surfaces items the manager scans; it does not send, post, or push anything anywhere. Rendered-DOM test forbids `real-time`, `sent`, `delivered`, `synced`, `notified` as positive claims about a record.
- **No action runs on the manager's behalf.** Clicking a deal-name navigates to the Deal Workspace; the destination workspace mounts its own action surfaces. The catch-up card has zero affordances that mutate state.
- **`isAutomated` not applicable — this is observation, not suggestion.** The card never claims a Phase 80 `NextBestAction` shape; its items are pure observations of existing record state. The forbidden vocabulary scan still pins `autopilot executed` and the affirmative "automatically" forms out.
- **No "alert" / "compliance" / "critical breach" claim.** The card uses observational phrasing ("X may require review", "Y needs attention") consistent with Phase 45 conservative copy. Forbidden vocab scan: `critical breach`, `noncompliant`, `official alert`, `(was|is|has been) failed`.
- **No "guaranteed" / "decisioned" / "real-time" claim.** All three are forbidden in source and rendered DOM.
- **Conservative-copy guard remains green** — Phase 88 reuses the truthful "No AI or automated decisions" negation Phase 80 / 81 / 82 / 84 use; the allowlist entry for `src/manager/ManagerMorningCatchUp.tsx` follows the same pattern Phase 84 added for the team rollup (stated reason; same `unwired-ai-claim` rule).

## Role boundary

- **Manager Workspace** — new `<ManagerMorningCatchUp />` card mounts between `<TeamWorkQueue />` and `<ManagerAutopilotRollup />`. The card is rendered only inside `ManagerDataProvider`; it reads `useManagerData()` and never reaches into another role's data layer.
- **Banker Workspace** — unchanged. The banker has Phase 72's per-deal "since last visit" surface + the Phase 80 per-deal autopilot + the Phase 82 personal rollup. No banker-surface change.
- **Team Workspace** — unchanged. Phase 84 team rollup remains the team-side observability surface.
- **Executive Workspace** — unchanged; `WORKSPACE_DEAL_ACCESS.executive` remains `denied`. No operational child data is loaded in the executive workspace.
- **Admin Workspace** — unchanged. Phase 87 / 88 do not touch the admin diagnostics surfaces.

Phase 48 isolation is preserved: `src/shared/activity/managerMorningCatchUp.ts` defines its own structural input types (`ManagerCatchUpDealInput` / `TaskInput` / `DocumentInput` / `MemoInput`) by structural typing of the Phase 87 manager row shapes; no import from `src/manager/`.

## Future upgrade path

When upstream / governance / schema work lands, the catch-up surface can grow in these directions:

1. **Local last-seen manager state.** Phase 72-style `localStorage` marker keyed by manager + team — "since my last visit" filter on the feed. Would be a new `LOCAL_ONLY_FLOWS.manager-catch-up-last-seen` entry with explicit no-cross-device-sync disclaimer.
2. **Persisted activity ledger.** Replace `modifiedOn` proxy with the full Phase 25 `Cr664_dealtimelineevents` stream, scoped server-side by team. Would surface true "what events happened" rather than "what record state exists". Requires a manager-scoped timeline loader (would mirror Phase 87's child loaders).
3. **Teams notifications.** Once Phase 86's chat handoff matures into a Lane E Graph integration (admin-consented `TeamsActivity.Send`), the HIGH-priority catch-up items could fire a Teams card to the assigned banker. Lane E.
4. **AI summaries.** Optional Copilot Studio binding that summarizes "what's most worth your attention this morning" given the deterministic feed. Lane F. Would replace the observation list with an opt-in AI brief that the manager can disable; the deterministic feed remains the source of truth.
5. **Assign / escalate workflows.** Per-row "Reassign to another banker" / "Escalate to me" affordances. Each would be a governed write with audit + timeline + outcome union, modeled on the Phase-21 pattern. Out of scope without an explicit brief.
6. **Per-banker / per-priority filter UI.** No new data; lets a manager filter the feed to a single banker or a single priority tier.
7. **Drill-through with focus query param.** Clicking a row could navigate to `/deals/<id>?focus=<kind>` so the Deal Workspace highlights the relevant card (Phase 80 panel already supports a scroll-into-view pattern).

## Files created

- `src/shared/activity/managerMorningCatchUp.ts` — pure derivation primitive (`deriveManagerMorningCatchUp` + `ManagerCatchUpItem` + 11 `ManagerCatchUpKind` literals + structural input types + `TOP_N_CATCH_UP_ITEMS = 8` + `TASK_DUE_SOON_DAYS = 3` + `NEWLY_RECEIVED_RECENT_DAYS = 3` + `STALE_ACTIVITY_DAYS = 14`).
- `src/shared/activity/managerMorningCatchUp.test.ts` — 33 derivation tests covering empty input, each of the 11 item kinds, priority sorting, occurredAt-recency tiebreaker, top-N cap, orphan row drop, completed-task drop, reviewed-document drop, missing-field fallbacks, cross-source coexistence, ownerName propagation, and module hygiene (no SDK / role imports; forbidden vocabulary forbidden in source).
- `src/manager/ManagerMorningCatchUp.tsx` — Manager Workspace card. Reads `useManagerData()` for all four async slots; surfaces `role="alert"` on any slot failure; renders the top 8 items with priority badge + deal-name navigation button + reason + banker/source/anchor meta; renders the empty state with verbatim "No catch-up items from current records." + "Not AI-generated."
- `src/manager/ManagerMorningCatchUp.test.tsx` — 14 card-rendering tests covering header + subtitle, loading (pipeline OR child slot), failed (pipeline OR child slot), no-items empty state, populated state with priority badge / deal-name / banker meta, multiple items per deal, deal-name navigation, top-N cap rendering, data-quality items (`missing-stage` / `missing-assigned-banker`), "Not AI-generated" disclaimer, forbidden-vocab rendered-DOM scan.
- `docs/PHASE_88_MANAGER_MORNING_CATCH_UP.md` — this document.

## Files modified

- `src/workspaces/ManagerWorkspace.tsx` — imports + mounts `<ManagerMorningCatchUp />` between `<TeamWorkQueue />` and `<ManagerAutopilotRollup />`. No other workspace change.
- `src/shared/governance/conservativeCopyGuard.test.ts` — adds `src/manager/ManagerMorningCatchUp.tsx` to the `unwired-ai-claim` allowlist with a stated Phase 88 reason (same pattern Phase 80 / 81 / 82 / 84 received).
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.17 / §1.18 / §1.22 advanced.

## Tests added / updated

- 33 derivation tests (`managerMorningCatchUp.test.ts`).
- 14 card-rendering tests (`ManagerMorningCatchUp.test.tsx`).
- 1 allowlist entry in `conservativeCopyGuard.test.ts` (stated Phase 88 reason).

No existing test was changed substantively. Phase 80 / 81 / 82 / 83 / 84 / 86 / 87 tests continue to pass unchanged.

## Confirmation: no writes / schema / AI / automation / real-time added

- ✅ **No new write surface.** No `GOVERNED_WRITES` entry.
- ✅ **No new `LOCAL_ONLY_FLOWS` entry.** The card is pure render of already-loaded data; no clipboard handoff, no localStorage state.
- ✅ **No schema change.** Every field consumed already existed and is already read by Phase 87 manager queries.
- ✅ **No new generated-service import.** The card reuses `ManagerData` slots that Phase 87 added.
- ✅ **No AI.** Pure deterministic derivation; both source-text and rendered-DOM forbidden-vocab scans pin the contract.
- ✅ **No automation.** No `isAutomated` claim; no affordance that mutates state.
- ✅ **No real-time / push.** No websocket, no Teams notification, no Outlook send.
- ✅ **No permission widening.** The card operates on `useManagerData()` only; every loader filters server-side by the manager's `teamId`.
- ✅ **No executive expansion.** Executive workspace untouched.
- ✅ **No borrower portal expansion.** No external-user data touched.
- ✅ **No stage progression.** No state-change affordance; clicking a deal navigates to the Deal Workspace where existing role-scoped writes remain.

## Test + build counts (at acceptance)

- Full suite: **1562 / 1562 passing** (Phase 87 baseline 1515 → +47: 33 derivation + 14 card; no test removed or weakened).
- `tsc -b && vite build`: clean (verified separately after this writeup).

## Recommended next phase

After Phase 88 the manager observability surface is complete in-repo: per-deal autopilot rollup + morning catch-up feed both consume the same Phase 87 child data. Strongest next moves:

1. **Phase 89 candidate — Per-banker filter on the manager surfaces.** No new data, no AI; lets a manager focus the rollup AND the catch-up feed on a single banker. Pure UI / state.
2. **Phase 89 candidate — Manager catch-up "since I last looked" marker.** Phase 72-style LOCAL_ONLY marker keyed by (manager UPN + team id) so the feed can highlight "new since your last visit". Honestly disclaimed (no cross-device sync). Small, useful, no governance risk.
3. **Phase 89 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** No-admin Teams runner-up; banker pastes deterministic deal summary into Teams chat. Sibling to Phase 86.
4. **Phase 89 candidate — Memo consistency findings on the rollups.** Closes the 8th and final Phase 80 signal at the cost of loading sections. Currently silenced on all three rollups + the catch-up feed.
5. **Phase 89 candidate — Banker "morning catch-up" card.** Banker-side sibling of Phase 88, focused on the banker's own deals using Phase 32's `loadBankerWorkQueueData` data. Closes morning-feed parity across the operating workspaces.

**Recommendation: Phase 89 — Banker "morning catch-up" card.** Closes role parity on the morning-feed surface (banker workspace already has Phase 80 per-deal panel + Phase 82 rollup; the morning-feed half is the symmetric move). Reuses the Phase 88 derivation primitive verbatim — only the data source and the card placement differ — so the implementation is small and the risk is low.
