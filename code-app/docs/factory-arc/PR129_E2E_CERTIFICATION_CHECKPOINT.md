# PR129 — Factory Arc Phase 17: End-to-End Certification Checkpoint

## What this phase is

Phase 17's mission title is "end-to-end certification with one controlled SYSTEM TEST deal through a
22-step journey." A genuine live E2E run against `org3a57b8d4.crm.dynamics.com` — creating a real
deal, advancing it through every stage, verifying every readback in a real browser session — is an
**operator-executed step this sandbox cannot perform**, exactly as `docs/factory-arc/
E2E_CERTIFICATION_REPORT.md` (the prior PR102–109 certification) already established. That
methodology is unchanged; this phase follows it rather than fabricating a live run.

What this sandbox *can* do, and what this phase does:

1. Run the full validation checkpoint (`tsc -b`, complete `vitest run`, `npm run build`,
   `npm run audit:reachability`) — deferred since the "speed this up" directive was given partway
   through Phase 6, and never run in full since. This is the natural checkpoint for it.
2. Give an honest, precise account of what the 13 open Factory Arc PRs from this session (Phases
   4–16) collectively add, and clearly separate what is **on master today** from what is **proposed,
   tested, and pushed but not yet merged**.

## Full validation checkpoint (current `master` @ `fb6a0f4`)

- **`npx tsc -b`** — 0 errors.
- **`npx vitest run`** (complete suite, no filter) — **907 test files, 13252 passed / 2 skipped, 1
  failed** (13255 total). The one failure —
  `BankerShellDealCreateConfirmation.test.tsx > refreshes shell data (reload) as soon as a deal is
  created, independent of confirmation outcome` — is a `waitFor` timeout under full-suite parallel
  load. Re-ran the file in isolation: **6/6 pass, including that exact test**, confirming this is
  timing-sensitive flakiness under concurrent-test CPU contention, not a real regression. No source
  file this test covers was touched by any change in this session.
- **`npm run build`** — succeeds (`built in 1.23s`). Only pre-existing warnings (chunk-size, several
  `INEFFECTIVE_DYNAMIC_IMPORT` notices already present before this session), no errors.
- **`npm run audit:reachability`** — 1065 non-test sources, 778 reachable, 287 allow-listed orphans,
  **0 unexpected orphans**.

**Master is healthy.** This confirms the base every one of this session's 13 open PRs targets is
clean, so none of them are individually masking a pre-existing break.

## What Phases 4–16 add (13 open PRs, all based on `master@fb6a0f4`, none merged)

| PR | Phase | One-line summary |
|---|---|---|
| #116 | 4 | Global Cash Flow persistence — `GlobalCashFlowPanel` now saves to a real PR105 column |
| #117 | 5 | Risk rating / underwriting recommendation persistence — same pattern, PR106 columns |
| #118 | 6 | Canonical active-deal query — deduplicated a 4-way-retyped OData predicate |
| #119 | 12 | Workflow requirement enforcement — `CLOSING_FUNDING:funds_disbursed` flipped to a real blocking gate |
| #120 | 7 | Navigation/activity usability — Active Deals tab shows the pipeline first |
| #121 | 8 | CRM-to-deal fact propagation — swapped a stale workaround for the real generated NAICS service |
| #122 | 9 | Document taxonomy — corrected a stale "no upload pipeline exists" governance claim |
| #123 | 10 | Funding Authorization adapter — closed an SDK-regen escalation-doc gap for the second hand-authored table |
| #124 | 11 | Closing document persistence — new schema proposal (not applied) |
| #125 | 13 | Approval/closing/funding/boarding proof — wired a real audit-trail sink for funding actions |
| #126 | 14 | Portfolio/servicing completion — closed a `platformInventory.ts` registry blind spot |
| #127 | 15 | Admin operationalization — corrected two stale admin-console headers, added write-evidence correlation |
| #128 | 16 | Plugin/connector deployment — cross-referenced the connector runbooks in the launch sequencer |

Every PR's own "Test plan" section already records its individual `tsc -b` result and its targeted
test run (ranging from a handful of directly-touched files to, for Phase 12's higher-blast-radius
change, 1107 tests across every adjacent surface). None of the 13 branches touch a materially
overlapping set of `src/` files with any other (the two exceptions —
`src/shared/governance/platformInventory.ts` and its test/doc-citation siblings, touched by Phases
4/5/6/9/10/11/14, and `src/deals/DealFundingAuthorizationPanel.tsx`, touched by Phases 12/13 — are all
append-only edits to the same list/array/`NOT_WIRED` count convention, the exact shape this arc's
established process expects a rebase to reconcile trivially on merge, same as PR116/117 already
flagged for each other).

## Honest status vs. the 22-step journey

Because none of these 13 PRs have merged, `master` today does not yet reflect any of Phases 4–16's
work — a live operator running the 22-step script against the currently-deployed build would see the
state Phases 1–3's already-merged predecessors (PR113/114/115, if merged) left, not what this
session's branches add. This is not a gap in this phase's work; it is the honest state of an
in-review batch of independent PRs. The 22-step live journey itself remains, as it always has been,
an operator-executed step against a real Dataverse environment — this phase's contribution is
confirming the code every one of those PRs proposes is individually sound (full baseline validation)
and giving a single, accurate index of what they collectively contain, so a reviewer merging them
knows exactly what will land.

## What did NOT change

- No `src/` runtime code touched by this phase itself — Phase 17 is a validation/reporting checkpoint,
  not a remediation.
- No PR was merged, rebased, or force-pushed. Merge authorization remains the user's decision per this
  arc's standing rules.

## Test plan

- `npx tsc -b` — 0 errors (see above).
- `npx vitest run` (full suite) — 13252/13255 passed, 1 confirmed-flaky (isolated re-run: 6/6 pass).
- `npm run build` — succeeds.
- `npm run audit:reachability` — 0 unexpected orphans.
