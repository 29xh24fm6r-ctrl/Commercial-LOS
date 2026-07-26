# PR 140 (Phase 9) — Date-only integrity: eliminate one-day date drift (N-24, D-04)

## Problem statement

`targetCloseDate`, task/document due dates, and stage-entry dates are Dataverse
**DateOnly** columns — they represent a calendar date, not an instant, and are
commonly returned in the midnight-UTC form `"2026-09-08T00:00:00Z"`. Parsing
that string with a raw `new Date(iso)` treats it as a UTC-midnight instant.
Any surface that then formats it with a local-timezone method
(`toLocaleDateString()` without forcing UTC, or raw local getters) rolls the
displayed calendar date back by one day for every US timezone (west of UTC):
a banker enters "Sep 8" as the target close date and the Kanban board, Closing
Soon rail, and several rollup widgets show "Sep 7."

The same raw-instant parsing also corrupts **day-count arithmetic** —
`Math.floor((targetMs - nowMs) / MS_PER_DAY)` — which decides whether a
"closing soon" signal fires at all, whether a task reads as overdue, and what
day-count a suggestion's title shows ("Closes in 5 days"). Near a timezone's
UTC-offset boundary this can flip a signal on/off or shift the reported count
by exactly one day, not just the displayed text.

A shared, timezone-safe parser and formatter (`parseCalendarDate` /
`formatDate` / `formatCalendarDate`) already existed in
`src/shared/formatters.ts` from an earlier remediation, but no shared
"days from today" helper existed — so every surface that needed a day count
(today/tomorrow/Nd-past labels, overdue flags, closing-soon buckets)
reimplemented the same buggy raw-instant math independently.

## Root cause / Investigation

A full sweep of every date-only-field consumer across Banker, Manager, Team,
and Portfolio surfaces found:

**Genuinely broken (fixed in this PR):**
- `src/banker/PersonalPipeline.tsx` (Kanban board) — `formatTargetClose`,
  `isOverdueDate`, and the inline day-window math in `countSignals` all used
  raw `new Date(iso)` + `Date.now()` arithmetic on `targetCloseDate`.
- `src/banker/BankerShell.tsx` — the "Closing Soon" rail's
  `formatRelativeDate` had the identical bug (its `closingSoonDeals` filter
  was already correctly fixed in an earlier remediation — Workstream H — and
  was left untouched).
- `src/manager/AtRiskBlockedDeals.tsx` — `formatDate` on `targetCloseDate`.
- `src/manager/ManagerAutopilotRollup.tsx`,
  `src/banker/BankerAutopilotRollup.tsx`, `src/team/TeamAutopilotRollup.tsx`
  — each has its own `formatTargetClose` with the identical bug (their
  respective `formatLedgerDate`, which formats `recordedAt` — a true
  timestamp, not date-only — is correct as-is and was left untouched).
- `src/team/teamCardChrome.ts` — the shared `formatDate` export used by
  `SharedActiveDeals.tsx` (target close column), `TeamTaskLoad.tsx` (task due
  date), and `TeamDocumentNeeds.tsx` (document due date) — all three
  consumers are date-only fields, so fixing the one shared helper corrects
  all three surfaces consistently.
- `src/portfolio/portfolioRiskEngine.ts` — `deriveMaturityLadder`'s bucket
  math and `isClosingSoon` both used raw-instant day math on
  `targetCloseDate`. `isStale` (on `modifiedOn`, a true timestamp) is correct
  as-is and was left untouched.
- **`src/shared/autopilot/dealAutopilot.ts`** — a deeper instance of the same
  defect, found during this investigation and not part of the original
  8-surface list: `deriveNextBestActions` (the shared engine behind the
  Banker/Manager/Team Autopilot rollups and the Deal Cockpit's Next Best
  Actions panel) computed the **overdue-task check**, the **pending-review
  document count**, the **closing-soon signal itself (whether it fires, and
  the day count in its title)**, and the **stage-aging day count** all via
  raw `new Date(iso).getTime()` on date-only fields (`dueDate`,
  `receivedDate`, `targetCloseDate`, `stageEntryDate`). This is not a display
  bug — it can flip whether a signal fires at all near a timezone boundary,
  making it the most consequential fix in this PR. `mostRecentActivityIso`
  (a true timestamp) was left on its original raw-instant path.

**Already correct (confirmed via direct code inspection; left untouched):**
`src/deals/creditMemoDraft.ts`, `src/deals/DealMetricDeck.tsx` (Cockpit's
target-close tile), `src/deals/DealSummary.tsx`, `src/deals/blockerRules.ts`,
`src/manager/ClosingForecast.tsx`, `src/team/SharedClosingCalendar.tsx`,
`src/deals/DealProfileEditModal.tsx` (raw string slice, no `Date` round-trip).

**Raw `new Date` used correctly on true timestamps (out of scope, not a
bug):** `CreditMemo.tsx` (`generatedAt`), the three rollups'
`formatLedgerDate` (`recordedAt`), `BankerMorningCatchUp.tsx`
(`recordedAt`/`occurredAt`), `DealAutopilotPanel.tsx` (`recordedAt`),
`PersonalPipeline.tsx`'s `isStaleActivity`/`formatRelative`
(`lastActivityOn`), `portfolioRiskEngine.ts`'s `isStale` (`modifiedOn`).

## Files changed

- `src/shared/formatters.ts` — added `daysUntilCalendarDate(value, now)` and
  `isPastCalendarDate(value, now)`, the shared calendar-day-safe "days from
  today" helpers every fixed surface now delegates to. Both compare
  local-midnight-to-local-midnight (never raw epoch-ms), so a DST-transition
  day's 23-or-25-hour skew resolves to exactly ±1 day.
- `src/shared/formatters.test.ts` — new test block covering today/
  tomorrow/yesterday, undefined/unparseable, 31-day and 30-day month-end,
  leap-day vs. non-leap-year, a genuine DST-boundary test (US spring-forward
  2026-03-08 / fall-back 2026-11-01 via real `process.env.TZ` mutation), a
  genuine UTC-offset-boundary test (`America/New_York` vs. `Asia/Kolkata`),
  and `isPastCalendarDate` boundary behavior.
- `src/banker/PersonalPipeline.tsx` / `.test.tsx` — `countSignals`,
  `isOverdueDate`, `formatTargetClose` now delegate to
  `parseCalendarDate`/`daysUntilCalendarDate`/`isPastCalendarDate`. New test:
  a date-only `targetCloseDate` renders the stored day under
  `America/New_York`, never the prior day.
- `src/banker/BankerShell.tsx` / `.test.tsx` — `formatRelativeDate` fixed the
  same way. New test: Closing Soon renders the stored day and the correct
  day count under a fixed, faked `Date` in `America/New_York`.
- `src/manager/AtRiskBlockedDeals.tsx` — `formatDate` fixed.
- `src/manager/ManagerAutopilotRollup.tsx`,
  `src/banker/BankerAutopilotRollup.tsx`, `src/team/TeamAutopilotRollup.tsx`
  — `formatTargetClose` fixed in each.
- `src/team/teamCardChrome.ts` — exported `formatDate` fixed.
- `src/portfolio/portfolioRiskEngine.ts` — `deriveMaturityLadder`'s bucket
  math and `isClosingSoon` fixed.
- `src/shared/autopilot/dealAutopilot.ts` / `.test.ts` — `deriveNextBestActions`'s
  overdue-task check, pending-review-document count, closing-soon signal, and
  stage-aging day count now use `daysUntilCalendarDate`/`isPastCalendarDate`.
  New test block: a task due exactly "today" is never flagged overdue, a task
  due yesterday is, and the closing-soon day count is exact for a date-only
  `targetCloseDate` — all under `America/New_York`.

## Schema impact

None. Every change is display/derivation logic operating on already-loaded
field values; no Dataverse column, entity, or relationship was added,
removed, or altered.

## Runtime behavior before/after

- **Before:** for any banker/manager/team viewer in a US timezone, a deal
  with `targetCloseDate = "2026-09-08"` could show "Sep 7, 2026" on the
  Kanban board, the Closing Soon rail, and every Autopilot rollup row; the
  underlying "closing soon" / "overdue" / "stage aging" signals in
  `dealAutopilot.ts` could also flip on/off or show an off-by-one day count
  near the UTC-offset boundary.
- **After:** all of the above render and compute the exact stored calendar
  day and day count, independent of the viewer's timezone, verified with
  explicit `America/New_York` (and, for the shared helpers, `Asia/Kolkata`)
  test fixtures.

## Tests added

- `src/shared/formatters.test.ts` — 8 new tests for
  `daysUntilCalendarDate`/`isPastCalendarDate` (today/tomorrow/yesterday,
  undefined, month-end ×2, leap day, non-leap year, DST boundary, UTC-offset
  boundary, `isPastCalendarDate` boundary). All 20 tests in this file pass.
- `src/banker/PersonalPipeline.test.tsx` — 1 new test (25 total, all pass).
- `src/banker/BankerShell.test.tsx` — 1 new test (40 total, all pass).
- `src/shared/autopilot/dealAutopilot.test.ts` — 3 new tests (24 total, all
  pass).
- `src/manager/ManagerAutopilotRollup.test.tsx` (32),
  `src/banker/BankerAutopilotRollup.test.tsx` (18),
  `src/team/TeamAutopilotRollup.test.tsx` (12),
  `src/deals/DealAutopilotPanel.test.tsx` (16),
  `src/portfolio/portfolioRiskEngine.test.ts` (25) — all re-run and confirmed
  passing unchanged (these fixtures use full-instant timestamps at a fixed
  noon-UTC "now," so they exercise the non-date-only path already; the fix's
  correctness for date-only values is covered by the new tests above and by
  `formatters.test.ts`'s exhaustive helper coverage).

## Validation results

- `npx tsc -b` — 0 errors.
- `npx vitest run` (full suite) — **914 test files passed, 13,402 tests
  passed, 2 skipped**, 0 failed.
- `npm run build` — succeeded (pre-existing dynamic-import chunking warnings
  only, unrelated to this change).
- `npm run audit:reachability` — 785 reachable / 285 allow-listed orphans /
  **0 unexpected orphans**.
- `git diff --check` — clean (no whitespace errors).

## Operator steps

None. This is a client-side display/derivation fix; no schema provisioning,
migration, or manual data backfill is required.

## Rollback considerations

Safe to revert independently — every change is a pure function swap (raw
`new Date`/`Date.now()` arithmetic replaced by calls into the existing,
already-tested `src/shared/formatters.ts`). No data was written or migrated,
so reverting restores the prior (buggy) display/derivation behavior with no
data-loss risk.

## Remaining limitations

- **`src/shared/workQueue/primitives.ts`'s `isPastDue`/`daysFromNow`** were
  flagged during the investigation as using UTC-day floor division — a
  related but distinct boundary-artifact bug shape, not the identical
  raw-instant-vs-local-render drift fixed here. This primitive is reused
  widely (`workQueue.ts`, and per the investigation's own hedge, likely
  `teamWorkQueueRules.ts`/`managerDrillThrough.ts`, not independently
  confirmed). Deferred to its own dedicated review given its broader blast
  radius, rather than folded into this already-large PR.
- A handful of `formatDate`-shaped helpers that render **true timestamps**
  (`recordedAt`, `generatedAt`, `occurredAt`, `lastActivityOn`, `modifiedOn`)
  use the same raw `new Date` + local-format shape as the fixed date-only
  bugs, but are correct as-is (a timestamp genuinely is an instant — no
  calendar-day reinterpretation is needed). These were deliberately left
  untouched; consolidating them onto a shared "true timestamp" formatter for
  stylistic uniformity is a separate, non-defect cleanup, not part of this
  fix.
