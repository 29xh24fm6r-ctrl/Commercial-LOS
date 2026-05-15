# Phase 75 — Banker Personal Activity Summary

## Goal

Add a deterministic personal activity / workload summary to the Banker Workspace using existing banker-scoped data. The card complements Phase 71's manager / team analytics surfaces by giving the banker the same caliber of derived view of their own workload — not a score, not a ranking, not predictive, not AI.

## Why this phase

The Microsoft Vibe scope expects bankers to see personal pipeline health, active deals, closing-soon items, overdue / stale items, document / request status, and workload visibility at-a-glance on their command center. Phase 71 added derived analytics to the manager and team workspaces; Phase 75 is the banker-side counterpart so all three role workspaces have a derived snapshot at their root.

## Scope

- Banker-facing read-only analytics only.
- Deterministic derivation only.
- No new writes (no `GOVERNED_WRITES` entry).
- No schema work.
- No AI.
- No performance scoring or ranking.
- No compensation metrics.
- No Teams / Outlook integration.
- No workflow automation.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.1 (Banker Command Center) — current-state note updated; the workspace now has a deterministic personal workload snapshot at its top.
- §1.19 (Performance scoring) — current-state note updated; the in-repo derivation slice is now complete across banker, manager, and team workspaces.

## Metrics implemented

The card surfaces deterministic counts across four logical sections, derived from the same `BankerWorkQueueData` shape `loadBankerWorkQueueData` already produces for MyWorkQueue:

### Pipeline shape

- `activeDeals` — count of active deals assigned to the banker (`deals.length`).
- `totalAmount` — sum of `amount` across active deals.
- `dealsMissingAmount` — honest gap count of deals with no parseable amount. Surfaced as a hint line ("N deals have no amount on the record. Total pipeline above is estimated from available fields.") when non-zero.

### Attention (time-sensitive deal signals)

- `closingSoonCount` — count of deals whose `targetCloseDate` is within `CLOSING_SOON_DAYS = 14` days of now.
- `pastTargetCloseCount` — count of deals whose `targetCloseDate` is in the past.
- `stageAtRiskCount` — count of deals at or past `STAGE_AGING_AT_RISK_DAYS = 30` days in their current stage.
- `missingStageEntryDateCount` — honest gap count of deals where `stageEntryDate` is missing / unparseable / in the future. Surfaced as a hint line when non-zero.

### Work items

- `openTaskCount` — count of open tasks across the banker's deals (from `data.tasks.length`, which is already open-only).
- `overdueTaskCount` — subset of `openTaskCount` whose `dueDate` is in the past.
- `outstandingDocumentCount` — count of documents on the banker's deals that have no `receivedDate` and are not `uploaded`.
- `pendingReviewDocumentCount` — count of received documents past the `PENDING_REVIEW_AT_RISK_DAYS = 7` threshold without a reviewer.

### Memos

- `draftMemoCount` — count of credit memos whose `statusKey` is `'draft'`. Section renders only when this count is non-zero.

The card concludes with a conservative disclaimer line: "Derived from current records. This is a workload snapshot, not a performance evaluation. No ranking, no predictive claim, no compensation impact. Open the relevant deal to act."

## Source fields used

Every field consumed by the derivation already exists on either `PipelineDeal` (from `src/banker/dealQueries.ts`) or one of the row shapes inside `BankerWorkQueueData` (from `src/banker/workQueueQueries.ts`). No new Dataverse column is read.

- From `PipelineDeal` (already loaded by `loadBankerPipeline`):
  - `amount` — `cr664_amount`
  - `targetCloseDate` — `cr664_targetclosedate`
  - `stageEntryDate` — `cr664_stageentrydate`
- From `WorkQueueTaskRow` (already loaded by `loadOpenTasksForDeals`):
  - `dueDate` — `cr664_duedate`
- From `WorkQueueDocumentRow` (already loaded by `loadDocumentsAwaitingActionForDeals`):
  - `receivedDate` — `cr664_receiveddate`
  - `reviewer` — `cr664_reviewer`
  - `uploaded` — `cr664_uploadstatus`
- From `WorkQueueMemoRow` (already loaded by `loadMemosForDeals`):
  - `statusKey` — derived from `cr664_status` via the existing memo-status map.

## Why this is not scoring / ranking / AI

- **No score.** The card produces non-negative integer counts and a currency total. No weighted formula, no rubric, no comparison against any threshold beyond the existing operational threshold constants (`STAGE_AGING_AT_RISK_DAYS = 30`, `CLOSING_SOON_DAYS = 14`, `PENDING_REVIEW_AT_RISK_DAYS = 7`). Each constant matches what the work queue already uses, so the snapshot is consistent with the row-level signals the banker already sees.
- **No ranking.** The banker sees only their own figures. No comparison against peers, no ordinal placement, no "you are #3 in your team" output.
- **No predictive claim.** Every metric describes the present state of records the system holds. No forecast, no extrapolation, no probability.
- **No AI.** The derivation is a pure function over input arrays. The Phase 24 / 73 conservative discipline is preserved — the source file is also static-tested to ensure the words "score", "ranking", "approved", "rejected", "AI-generated", "predictive", "guaranteed", "performance rating", and "underperforming" never appear in the implementation.
- **No compensation impact.** The card does not produce any metric that maps to compensation. The disclaimer says so explicitly.
- **No credit-decision claim.** The card does not say a deal is approved, declined, blocked, or compliant. It only counts.

## Relationship to Phase 71

Phase 71 produced three derivation primitives in `src/shared/analytics/derivedAnalytics.ts`:

- `summarizeStageAging(deals, now)` — manager-side stage-aging stats.
- `summarizePipelineMix(deals)` — manager-side mix indicators.
- `derivePerBankerActivity(deals, now)` — per-banker rows for team / manager workspaces.

Phase 75 adds a fourth, single-banker-focused primitive in a sibling file `src/shared/analytics/bankerPersonalActivity.ts`:

- `deriveBankerPersonalActivity(data, now)` — banker-side single-banker workload snapshot, consuming the richer `BankerWorkQueueData` shape (which includes tasks + documents + memos in addition to deals).

The new primitive intentionally re-exports the Phase 71 threshold constants (`STAGE_AGING_AT_RISK_DAYS`, `CLOSING_SOON_DAYS`) plus the work-queue's `PENDING_REVIEW_AT_RISK_DAYS` so the banker snapshot, the team / manager analytics, and the per-row work-queue signals all agree on the same definitions.

## Role / security boundaries

- The Phase 75 card is mounted only inside `BankerWorkspace`, which is gated by `BankerProvider`. Manager and team workspaces continue to render their Phase 71 cards (`ManagerActivitySummary`, `TeamBankerActivityBreakdown`) — those surfaces are unchanged.
- Executive workspace remains snapshot-only — unchanged.
- Admin workspace — unchanged.
- The static role-isolation tests (Phase 48) continue to forbid the banker module from importing role-specific modules under `manager/`, `team/`, `executive/`, or `admin/`. The new derivation imports only from `src/shared/analytics/derivedAnalytics`, `src/shared/workQueue/primitives`, and *types* from `banker/workQueueQueries` and `banker/dealQueries` (input shape only).
- No new connector permission is required. The card consumes `loadBankerWorkQueueData` which has already been in production since Phase 32 / 54.

## Files created

- `src/shared/analytics/bankerPersonalActivity.ts` — pure derivation primitive (`deriveBankerPersonalActivity` + `BankerPersonalActivity` interface).
- `src/shared/analytics/bankerPersonalActivity.test.ts` — 15 derivation tests + module-hygiene assertions.
- `src/banker/PersonalActivitySummary.tsx` — banker-side card component (`<PersonalActivitySummary />`).
- `src/banker/PersonalActivitySummary.test.tsx` — 8 rendered-card tests (loading / failed / empty / populated / gap-hints / Memos-section visibility / conservative-disclaimer + forbidden-language scan).
- `docs/PHASE_75_BANKER_PERSONAL_ACTIVITY_SUMMARY.md` — this document.

## Files modified

- `src/workspaces/BankerWorkspace.tsx` — mounts `<PersonalActivitySummary />` at the top of `<main>`, above `<MyWorkQueue />` and `<PersonalPipeline />`.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.1 + §1.19 advanced.

## Tests added

- 15 derivation-primitive tests in `src/shared/analytics/bankerPersonalActivity.test.ts`:
  - empty data → all zero counts;
  - active deal count + total amount with missing-amount honest gap;
  - NaN / Infinity amounts counted as missing;
  - closing-soon threshold (≤14 days);
  - past-target-close;
  - stage-at-risk threshold (≥30 days);
  - missing / future stage-entry dates counted as gap;
  - open task count;
  - overdue task subset filter;
  - outstanding-document count;
  - pending-review document count past the 7-day threshold;
  - draft-memo count filters out final / stale / undefined statuses;
  - module hygiene: no SDK import; no role module imports beyond input-shape types; no scoring / ranking / AI / approved vocabulary in the source.
- 8 card-rendering tests in `src/banker/PersonalActivitySummary.test.tsx`:
  - loading state;
  - failed state renders the error with `role="alert"`;
  - empty state ("No active deals assigned to you");
  - populated state pins the four sections + derived figures;
  - missing-amount gap hint renders;
  - missing-stage-entry gap hint renders;
  - Memos section is hidden when no drafts exist;
  - conservative-disclaimer renders + forbidden-language scan asserts the rendered DOM never contains "score" / "underperforming" / "AI-generated" / "approved" / "rejected" / "guaranteed" / "performance ranking" / "ranked #N".

## Confirmation: no writes / schema / AI / scoring added

- **No new write surface.** No `GOVERNED_WRITES` entry was added. The card is read-only.
- **No new `LOCAL_ONLY_FLOWS` entry.** The derivation is purely on-page; nothing is persisted, nothing is logged.
- **No schema change.** Every field consumed already existed prior to Phase 75.
- **No AI.** Pure deterministic function; the module-hygiene test forbids the AI vocabulary in the source.
- **No scoring or ranking.** The metrics are counts and currency totals; no weighted combination, no comparative position is computed.

## Limitations

- **Data is fetched independently.** The Phase 75 card calls `loadBankerWorkQueueData` directly, the same way MyWorkQueue does. The banker workspace therefore issues the loader twice (once for MyWorkQueue, once for PersonalActivitySummary). Hoisting the fetch into a shared `BankerDataProvider` analogous to `ManagerDataProvider` / `TeamDataProvider` is a future cleanup. The current pattern matches PersonalPipeline (which already fetches its own deal pipeline independently).
- **No trend over time.** The snapshot is point-in-time. No "this week vs. last week" delta, no sparkline. Adding trend data would require a historical signals store; Phase 75 does not introduce one.
- **No drill-through.** The card surfaces counts only. Clicking a count does not navigate or filter — the banker uses the disclaimer's directive ("Open the relevant deal to act") and uses MyWorkQueue / PersonalPipeline for navigation. Adding drill-through could be a future Lane A phase.
- **The pending-review-document count duplicates the at-risk threshold logic that lives in `shared/workQueue/primitives.ts` via `PENDING_REVIEW_AT_RISK_DAYS`.** The constant is imported from a single source, but the receive-date filter in the derivation is independent of the work queue's per-row filter (which uses `isReceivedDocumentPendingReview`). The threshold definition is shared; the calling code is parallel. This is acceptable but could converge in a future cleanup.

## Test + build counts (at acceptance)

- Full suite: **1227 / 1227 tests passing** (Phase 74 baseline 1204 + Phase 75's 15 derivation + 8 card = 23 new).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the Microsoft Vibe coverage map:

- **Relationship Memory Lite** — §1.16 currently "Partially operational" with a "borrower-keyed memory" gap. A deterministic surface that, per borrower, lists last activity / open commitments / last deal-stage transition across the borrower's deals would close a real Vibe-expected scope without requiring new schema. This was named as the §1.1 "safe next step" in the coverage map update.
- **Dark theme tokens** — closes the largest remaining a11y gap (Phase 74 §1.28 explicitly named dark theme as the next safe step). Pure UI phase.
- **Borrower-keyed relationship card on the deal workspace** — surfaces other deals for the same borrower / total exposure / last interaction date. Requires the borrower-cross-deal query Phase 64 / 65 chose to defer.

Relationship Memory Lite is the closest match to Lane A momentum and was already flagged as the safe next step in the §1.1 coverage update.
