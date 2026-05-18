# Phase 89 — Banker Morning Catch-Up

## Goal

Add a deterministic banker-side "morning catch-up" feed on the Banker Command Center. Symmetric to Phase 88's manager surface: same item kinds, same priority rules, same observation-oriented framing — but scoped to the signed-in banker's authorized pipeline and consuming the existing `loadBankerWorkQueueData(bankerId)` two-step loader.

No new writes. No new schema. No new SDK install. No AI. No Teams / Outlook expansion. No workflow automation. No stage progression. No borrower portal. No executive live-data expansion.

## Why this phase

Phase 88 shipped the manager morning-feed surface. The Microsoft Vibe scope expects the banker workspace to behave as an always-on operating command center too: urgent work, overdue tasks, document attention, recent activity, closing-soon items, operational blockers — all at-a-glance. The banker side already had the Phase 80 per-deal autopilot panel + the Phase 82 personal rollup; the morning-feed half was the symmetric gap.

The two banker-side autopilot/feed surfaces complement each other:

| | `<BankerAutopilotRollup />` (Phase 82) | `<BankerMorningCatchUp />` (Phase 89) |
|---|---|---|
| Question answered | "What should I DO next on this deal?" | "What HAPPENED across my pipeline / what NEEDS attention?" |
| Framing | Action-oriented suggestion | Observation-oriented item |
| Items per deal | 1 (the top-priority Phase 80 action) | Multiple — separate items per kind |
| Data-quality items | ✗ | ✓ — `missing-stage` (data quality on the banker's own deal) |
| `missing-assigned-banker` | n/a | ✗ — the banker IS the assigned banker on their own deals; signal stays silent |
| "Due soon" tasks (not yet overdue) | ✗ — Phase 80 only fires overdue | ✓ — fires as `task-due-soon` MEDIUM within 3 days |
| "Newly received" docs | ✗ — Phase 80 only fires after the pending-review threshold | ✓ — fires as `newly-received-document` LOW within 3 days |
| Sort | priority desc → suggestion count → close date | priority desc → occurredAt desc → deal name |
| Cap | 5 deals | 8 items |
| Suggestion ledger (Phase 83) | dismiss/restore on every row | none — current-state only |

## Relationship to Phase 88

Phase 89 is a **thin adapter** over the Phase 88 primitive. The Phase 88 module (`src/shared/activity/managerMorningCatchUp.ts`) was built with structurally generic input shapes (`deals + tasks + documents-with-status + memos`) — the "manager" name reflects the first consumer, not a domain constraint. Phase 89's adapter (`src/shared/activity/bankerMorningCatchUp.ts`) reshapes banker work-queue data into that input shape and delegates to `deriveManagerMorningCatchUp`. Net result:

- **No duplication of derivation logic.** The 11 item kinds, the priority rules, the cap, and the sort live in Phase 88's module. A future change to the rules applies to both surfaces without drift.
- **No duplication of forbidden-vocabulary guards.** Phase 88's module-hygiene tests + the rendered-DOM scan continue to pin the contract; Phase 89 adds the same guards locally to ensure the adapter file is also hygienic.
- **Banker-specific reshape** is the adapter's only job: `outstandingDocuments` + `pendingReviewDocuments` arrays merge into a single `documents` array with `status: 'outstanding' | 'received'` discriminants; `lastActivityOn` forwards to the primitive's `modifiedOn` field; the signed-in banker's `fullName` stamps every deal's `assignedBankerName` so the `missing-assigned-banker` signal never fires on the banker workspace.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.1 (Banker Command Center)** — current-state notes the new `<BankerMorningCatchUp />` card mounted between `<PersonalActivitySummary />` and `<BankerAutopilotRollup />`. The morning-feed half is now shipped on the banker surface, complementary to the per-deal autopilot panel and the personal autopilot rollup.
- **§1.18 (Activity intelligence)** — extended to "Partially operational (advanced by Phase 72 + Phase 80 + Phase 82 + Phase 83 + Phase 87 + Phase 88 + Phase 89)". The morning-feed half is now shipped on both operating workspaces (manager + banker).
- **§1.17 (Deal Autopilot)** — no change; the Phase 80/81/82/84/87 autopilot triad is unaffected. Phase 89 is a sibling activity-intelligence surface, not an autopilot surface.

## Data sources used

Zero new generated-service imports, zero new queries. The card consumes only the data `loadBankerWorkQueueData(bankerId)` already returns:

- `BankerWorkQueueData.deals: PipelineDeal[]` — Phase 32 two-step loader. Carries `id`, `name`, `stage`, `targetCloseDate`, `stageEntryDate`, `lastActivityOn` (modifiedon proxy).
- `BankerWorkQueueData.tasks: WorkQueueTaskRow[]` — open tasks across the banker's authorized deals.
- `BankerWorkQueueData.outstandingDocuments: WorkQueueDocumentRow[]` — documents in the outstanding bucket.
- `BankerWorkQueueData.pendingReviewDocuments: WorkQueueDocumentRow[]` — documents in the received bucket without a reviewer.
- `BankerWorkQueueData.memos: WorkQueueMemoRow[]` — credit memos with `statusKey`.

`useBanker()` supplies `bankerId` (for the loader) and `fullName` (stamped on every deal so `missing-assigned-banker` stays silent).

## Feed item types implemented

All 11 Phase 88 kinds are reachable on the banker surface; 10 actually fire:

| Kind | Priority | Source | Fires on banker workspace? |
|---|---|---|---|
| `overdue-task` | HIGH | task | ✓ |
| `pending-review-document` | HIGH | document | ✓ (via `pendingReviewDocuments`) |
| `closing-soon` | HIGH | deal | ✓ |
| `task-due-soon` | MEDIUM | task | ✓ |
| `outstanding-documents` | MEDIUM | document | ✓ (via `outstandingDocuments`) |
| `stage-aging` | MEDIUM | deal | ✓ |
| `missing-stage` | MEDIUM | deal | ✓ (data quality on banker's own deal) |
| `missing-assigned-banker` | MEDIUM | deal | ✗ — adapter stamps `fullName`; signal stays silent |
| `newly-received-document` | LOW | document | ✓ (via `pendingReviewDocuments` received within 3d) |
| `draft-memo` | LOW | memo | ✓ |
| `stale-activity` | LOW | deal | ✓ (`lastActivityOn` → primitive's `modifiedOn`) |

## Priority rules

Inherited verbatim from Phase 88:

1. Priority desc (HIGH > MEDIUM > LOW)
2. `occurredAt` desc (most recent past first; missing → far past so always-on items sort below time-anchored ones within a tier)
3. `dealName` asc (stable lexicographic fallback)

Hard cap: `TOP_N_BANKER_CATCH_UP_ITEMS = TOP_N_CATCH_UP_ITEMS = 8`.

Thresholds inherited from Phase 80 + Phase 88: `CLOSING_SOON_DAYS=14`, `STAGE_AGING_AT_RISK_DAYS=30`, `PENDING_REVIEW_AT_RISK_DAYS=7`, `STALE_ACTIVITY_DAYS=14`, `TASK_DUE_SOON_DAYS=3`, `NEWLY_RECEIVED_RECENT_DAYS=3`.

## Role boundary

- **Banker Workspace** — new `<BankerMorningCatchUp />` card mounts between `<PersonalActivitySummary />` and `<BankerAutopilotRollup />` inside `BankerProvider`. Card uses `useBanker()` (required identity) + `loadBankerWorkQueueData(bankerId)`.
- **Manager Workspace** — unchanged. Phase 88's `<ManagerMorningCatchUp />` remains the manager-side counterpart.
- **Team Workspace** — unchanged. (No team-side morning-feed in Phase 89; the team workspace has different operational needs and the Phase 84 team autopilot rollup is sufficient for current Vibe coverage.)
- **Executive Workspace** — unchanged. Executive remains snapshot-only (Phase 15); no operational child data is loaded there. Phase 89 does not introduce any executive-side surface.
- **Admin Workspace** — unchanged.

Phase 48 isolation preserved: `src/shared/activity/bankerMorningCatchUp.ts` defines its own structural input types and imports only from `src/shared/activity/managerMorningCatchUp.ts` (sibling module). No imports from any role directory.

## Limitations

- **Activity proxy is `modifiedOn` (`lastActivityOn` on `PipelineDeal`).** Same coarse proxy Phase 82/88 already use. A change to any deal field (or any child row that bumps the parent's modifiedon) registers as "activity"; this is a no-record-side-write indicator, not a no-business-activity indicator. The per-deal Phase 80 panel uses the more precise `activity[0]?.eventAt` because `useDealData()` loads the full timeline.
- **No memo-consistency-findings.** Same gap Phase 82/84/87/88 carry — needs `CreditMemoData` with sections. Available on the per-deal Phase 80 panel inside the Deal Workspace.
- **No local last-seen state.** Phase 89 deliberately does NOT track "what the banker has already seen". Adding it would require a new LOCAL_ONLY_FLOWS entry analogous to Phase 72's per-deal marker; the brief explicitly prefers to defer.
- **No push / notification surface.** The card refreshes when its loader runs (on mount); there is no real-time stream, no Teams notification, no Outlook send. Phase 86's `@microsoft/teams-js` install only powers the per-deal chat handoff; it is not used here.
- **No suggestion-ledger integration.** The Phase 83 ledger is per-suggestion (dismiss/restore on the autopilot rollups); the catch-up feed is current-state only. A future phase could add a per-item dismiss state — see "Future upgrade path".
- **Same data-fetch duplication as Phase 75/76/78/82.** The Banker Command Center now issues `loadBankerWorkQueueData` five times (PersonalActivitySummary, BankerMorningCatchUp, BankerAutopilotRollup, MyWorkQueue, RelationshipMemory). A future BankerDataProvider refactor would deduplicate; not in scope.

## Why this is not AI / not real-time notification / not automation

- **No model invocation.** Pure deterministic delegation to the Phase 88 primitive over typed inputs + a sort + slice. Source-text test forbids `AI-generated` / `AI-detected` / `system decided` / `prediction`.
- **No notification surface.** The card surfaces items the banker scans; it does not send, post, or push anything anywhere. Rendered-DOM test forbids `real-time`, `sent`, `delivered`, `synced`, `notified` as positive claims about a record.
- **No action runs on the banker's behalf.** Clicking a deal-name navigates to the Deal Workspace; the destination workspace mounts its own action surfaces. The catch-up card has zero affordances that mutate state.
- **No alert / compliance / official-status claim.** Observation phrasing only — "X may require review", "Y needs attention". Forbidden vocab scan: `critical breach`, `noncompliant`, `official alert`, `(was|is|has been) failed`.
- **No `guaranteed` / `decisioned` claim.** Both forbidden in source and rendered DOM.
- **Conservative-copy guard remains green** — `src/banker/BankerMorningCatchUp.tsx` added to the existing `unwired-ai-claim` allowlist with stated Phase 89 reason; same pattern Phase 80/81/82/84/88 received.

## Future upgrade path

When upstream / governance / schema work lands, the banker catch-up surface can grow in these directions:

1. **Local last-seen banker state.** Phase 72-style `localStorage` marker keyed by `(banker UPN)` — "since my last visit" filter on the feed. New `LOCAL_ONLY_FLOWS.banker-catch-up-last-seen` entry with explicit no-cross-device-sync disclaimer.
2. **Persisted activity ledger.** Replace `modifiedOn` proxy with the full Phase 25 `Cr664_dealtimelineevents` stream, scoped per-deal. Would surface true "what events happened" rather than "what record state exists".
3. **Teams notifications.** Once Phase 86's chat handoff matures into a Lane E Graph integration (admin-consented `TeamsActivity.Send`), HIGH-priority items could fire a Teams card to the banker's activity feed. Lane E.
4. **AI summaries.** Optional Copilot Studio binding that summarizes "what's worth your attention this morning". Lane F. Would layer on top of the deterministic feed; the feed remains the source of truth.
5. **Accept / dismiss workflows.** Per-item "Working on it" / "Snooze 24h" / "Acknowledge" actions. Each would be a governed write modeled on the Phase-21 pattern — or a LOCAL_ONLY extension of the Phase 83 ledger surface union (`'banker-catch-up'` / `'manager-catch-up'`). Phase 83 already gates the surface enum; the addition is straightforward when prioritized.
6. **Banker-side "deal autopilot" ledger sibling for the catch-up.** Extend Phase 83's `SuggestionLedgerSurface` to support catch-up items so the banker can dismiss specific observations. Same `localStorage` slot, same shape.
7. **Per-priority filter UI.** Lets the banker focus the feed on HIGH only. No new data.

## Files created

- `src/shared/activity/bankerMorningCatchUp.ts` — thin banker adapter (`deriveBankerMorningCatchUp`) over Phase 88's `deriveManagerMorningCatchUp`. Re-exports the `BankerCatchUp*` type aliases over the manager equivalents, plus `TOP_N_BANKER_CATCH_UP_ITEMS`. Defines its own structural input types (`BankerCatchUpDealInput` / `TaskInput` / `DocumentInput` / `MemoInput` + `BankerCatchUpInput`) that mirror the banker work-queue row shapes. Reshapes `lastActivityOn` → `modifiedOn`, stamps `bankerName` on every deal, merges `outstandingDocuments` + `pendingReviewDocuments` into a single `documents` array with the right `status` discriminant.
- `src/shared/activity/bankerMorningCatchUp.test.ts` — 21 adapter tests covering empty input, each Phase 88 signal firing under banker-shaped inputs, the `missing-assigned-banker` silencing contract (banker IS the assigned banker), `ownerName` propagation from `bankerName`, `lastActivityOn` → stale-activity reshape, top-N cap delegation, module hygiene (no SDK / role imports; forbidden vocabulary forbidden in source).
- `src/banker/BankerMorningCatchUp.tsx` — Banker Command Center card. Mounts `loadBankerWorkQueueData(bankerId)` via local `useEffect` (same pattern Phase 82's `BankerAutopilotRollup` uses); renders top 8 items with priority badge + deal-name navigation button + reason + source / anchor meta; renders the empty state with verbatim "No catch-up items from current records." + "Not AI-generated."
- `src/banker/BankerMorningCatchUp.test.tsx` — 12 card tests covering header + subtitle, loading, failed (`role="alert"`), no-items empty + forbidden-empty-state-phrase scan, overdue-task populated row, multiple items per deal, deal-name navigation, `missing-assigned-banker` NOT firing on the banker workspace, `missing-stage` data-quality item rendering, "Not AI-generated" populated-state disclaimer, rendered-DOM forbidden-vocab scan.
- `docs/PHASE_89_BANKER_MORNING_CATCH_UP.md` — this document.

## Files modified

- `src/workspaces/BankerWorkspace.tsx` — imports + mounts `<BankerMorningCatchUp />` between `<PersonalActivitySummary />` and `<BankerAutopilotRollup />`. Final card order on the Banker Command Center: `PersonalActivitySummary` → `BankerMorningCatchUp` → `BankerAutopilotRollup` → `MyWorkQueue` → `RelationshipMemory` → `PersonalPipeline`.
- `src/shared/governance/conservativeCopyGuard.test.ts` — adds `src/banker/BankerMorningCatchUp.tsx` to the `unwired-ai-claim` allowlist with stated Phase 89 reason (same pattern Phase 80/81/82/84/88 received).
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.1 + §1.18 advanced.

## Tests added / updated

- 21 adapter tests (`bankerMorningCatchUp.test.ts`).
- 12 card tests (`BankerMorningCatchUp.test.tsx`).
- 1 allowlist entry in `conservativeCopyGuard.test.ts`.

No existing test was changed. Phase 80 / 81 / 82 / 83 / 84 / 86 / 87 / 88 tests continue to pass unchanged.

## Confirmation: no writes / schema / AI / automation / real-time added

- ✅ **No new write surface.** No `GOVERNED_WRITES` entry.
- ✅ **No new `LOCAL_ONLY_FLOWS` entry.** The card is pure render of already-loaded data; no clipboard handoff, no localStorage state.
- ✅ **No schema change.** Every field consumed already existed and is already read by `loadBankerWorkQueueData`.
- ✅ **No new generated-service import.** The adapter only imports from its sibling Phase 88 module.
- ✅ **No AI.** Both source-text and rendered-DOM forbidden-vocab scans pin the contract.
- ✅ **No automation.** No affordance that mutates state.
- ✅ **No real-time / push.** No websocket, no Teams notification, no Outlook send. Phase 86's Teams SDK probe is not used here.
- ✅ **No permission widening.** The card operates on `loadBankerWorkQueueData(bankerId)` only; the same banker-authorized two-step pipeline Phase 32 ships.
- ✅ **No executive expansion.** Executive workspace untouched; remains snapshot-only.
- ✅ **No borrower portal expansion.** No external-user data touched.
- ✅ **No stage progression.** Clicking a deal navigates to the Deal Workspace where existing role-scoped writes remain.

## Test + build counts (at acceptance)

- Full suite: **1595 / 1595 passing** (Phase 88 baseline 1562 → +33: 21 adapter + 12 card; no test removed or weakened).
- `tsc -b && vite build`: clean (verified separately after writeup).

## Recommended next phase

After Phase 89 the morning-feed surface is shipped on both operating workspaces (manager + banker). Strongest next moves:

1. **Phase 90 candidate — Local last-seen marker on the catch-up feeds.** Phase 72-style `localStorage` per-user marker (manager and banker) so the feed can highlight "new since your last visit". Honestly disclaimed (no cross-device sync). Useful, small, no governance risk. Two new `LOCAL_ONLY_FLOWS` entries (`manager-catch-up-last-seen` + `banker-catch-up-last-seen`).
2. **Phase 90 candidate — Catch-up item dismiss/snooze via the Phase 83 ledger.** Extend the ledger surface union with `'manager-catch-up'` and `'banker-catch-up'` and let users dismiss specific catch-up items (purely LOCAL_ONLY). Reuses existing Phase 83 plumbing; mirrors how Phase 84 extended the union for `'team-rollup'`.
3. **Phase 90 candidate — Per-banker filter on the manager surfaces.** Lets a manager focus rollup AND catch-up on a single banker. Pure UI / state.
4. **Phase 90 candidate — Memo consistency findings on the rollups + catch-up.** Closes the 8th and final Phase 80 signal at the cost of loading sections. Currently silenced on all rollups + catch-up feeds.
5. **Phase 90 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** The no-admin Teams runner-up.

**Recommendation: Phase 90 — Local last-seen marker on the catch-up feeds.** Small, useful, honest, no governance risk. Closes a real "what's new since last morning" Vibe expectation that the deterministic feed alone doesn't currently meet, while staying squarely inside the LOCAL_ONLY pattern Phase 72 and Phase 83 already established.
