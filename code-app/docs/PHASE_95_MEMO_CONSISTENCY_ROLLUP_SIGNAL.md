# Phase 95 — Memo Consistency Findings on Rollups + Catch-Up

## Goal

Extend the deterministic Phase 73 credit-memo consistency check (today
running only on the per-deal Phase 80 Next Best Actions panel) to fire
as the 8th Phase 80 signal on the three Autopilot rollups (banker,
manager, team) and as a new 12th feed-item kind on the two Morning
Catch-Up cards (banker, manager). All five surfaces now reach memo /
section data they did not previously load; each loader stays inside
its existing scope-authorized boundary.

No new writes. No new schema. No new connectors. No new SDK install.
No AI. No document parsing. No automation. No upload-portal /
borrower-portal surface. Each role surface loads only what it was
already authorized to see, plus two narrow projections of existing
schema fields (`cr664_memotext` previewed at 240 chars, and
`cr664_creditmemodraftsection.cr664_drafttext` previewed at 240
chars).

## Why this phase

Phases 80 / 82 / 84 / 87 brought the Next Best Actions derivation to
four surfaces (per-deal, banker rollup, team rollup, manager rollup)
but the `memo-consistency-findings` signal could only fire on the
per-deal panel because only `DealAutopilotPanel` loaded the full
`CreditMemoData` (memo text + sections). The three rollup surfaces
silently passed `memoConsistencyFindingsCount: 0` to keep the
derivation honest about what the loader actually had. Phase 95 closes
that gap by giving each role's child-data loader the memo-text preview
and per-deal sections it needs to call the same Phase 73 primitive,
then routes the result through the existing rollup + catch-up
plumbing.

The Phase 88 / 89 Morning Catch-Up cards had the symmetric gap: their
11 item kinds covered overdue tasks, document review states, draft
memos, stage / activity timing, and data quality — but did not flag
inconsistency between a memo draft and the structured deal record it
was written for. Phase 95 adds a 12th kind, `memo-consistency-findings`
(MEDIUM), surfaced once per deal when the Phase 73 check returns one
or more findings on that deal's memo / sections.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.14 (Cross-document consistency checks)** — Phase 73 primitive
  now reaches five additional surfaces (3 rollups + 2 catch-up
  cards). The structured-data slice now applies everywhere a memo or
  draft section exists in a role's authorized scope. Binary parsing
  and AI semantic matching remain explicitly out of scope.
- **§1.17 (Deal autopilot)** — closes the last 1-of-8 signal gap on
  all three rollup surfaces. The four Autopilot surfaces (per-deal +
  banker rollup + manager rollup + team rollup) all fire 8 of 8
  Phase 80 signals.
- **§1.18 (Activity intelligence)** — Morning Catch-Up cards gain a
  new feed item kind (`memo-consistency-findings`) so the
  observation-style surface can flag the same inconsistencies the
  action-style autopilot surfaces flag. Same Phase 73 derivation; no
  copy duplication.
- **§1.22 (Manager workspace)** — manager rollup + manager catch-up
  card both gain the new signal / kind.
- **§1.23 (Team workspace)** — team rollup gains the new signal.

## What ships

### Primitive (`src/shared/creditMemoConsistency/`)

- `checkCreditMemoConsistency.ts` input types are refactored from
  `DealDetail` / `CreditMemoData` (which lived under `src/deals/`) to
  narrower structural shapes so the module under `src/shared/` no
  longer needs to import from a role-or-deals directory.
  - New: `ConsistencyCheckDealInput`, `ConsistencyCheckMemoInput`,
    `ConsistencyCheckSectionInput`, `ConsistencyCheckMemoData`.
  - New helper: `countConsistencyFindingsForDeal(deal, memos,
    sections)` — returns the integer count without forcing rollup
    callers to construct a full `CreditMemoData` object.
- All 30 Phase 73 tests continue to pass against the refactored
  shapes. No rule change, no severity change.

### Rollup primitives

`src/shared/autopilot/bankerAutopilotRollup.ts`,
`src/shared/autopilot/managerAutopilotRollup.ts`,
`src/shared/autopilot/teamAutopilotRollup.ts`:

- `*RollupDealInput` gains optional `clientName?`, `amount?`,
  `collateralSummary?` so the Phase 73 check has the structured deal
  fields it compares against.
- `*RollupMemoInput` gains optional `textPreview?`.
- New `*RollupMemoSectionInput` shape (`{ id, dealId, sectionLabel,
  textPreview }`).
- `*RollupInput` gains optional `memoSections?: readonly
  *RollupMemoSectionInput[]`.
- The derivations bucket memos + sections by deal, run
  `countConsistencyFindingsForDeal` per deal, and replace the prior
  hardcoded `memoConsistencyFindingsCount: 0` with the real count.
- All fields added are optional; pre-Phase-95 callers (e.g. tests
  that mocked the primitives without memo content) continue to
  compile and produce the same output. When the caller passes no
  memo text and no sections the count stays 0 and the signal does
  not fire.

### Catch-up primitives

`src/shared/activity/managerMorningCatchUp.ts`,
`src/shared/activity/bankerMorningCatchUp.ts`:

- `ManagerCatchUpKind` gains `'memo-consistency-findings'` (the 12th
  kind).
- `ManagerCatchUpDealInput` gains optional `clientName?`, `amount?`,
  `collateralSummary?`.
- `ManagerCatchUpMemoInput` gains optional `textPreview?`.
- New `ManagerCatchUpMemoSectionInput` shape.
- `ManagerCatchUpInput` gains optional `memoSections?`.
- The derivation runs `countConsistencyFindingsForDeal` per deal and
  emits one MEDIUM-priority feed item per deal when count > 0. Title
  reads `"Memo consistency finding"` (singular) or `"N memo
  consistency findings"` (plural). Reason: `"Deterministic check
  found differences between the saved memo draft and structured deal
  fields; banker review recommended."` — same observational phrasing
  Phase 88 already used.
- The banker adapter (`bankerMorningCatchUp.ts`) gains symmetric
  optional fields and forwards them to the manager primitive.

### Banker work-queue loader (`src/banker/workQueueQueries.ts`)

- `WorkQueueMemoRow` gains `textPreview` (derived from
  `cr664_memotext` via the same 240-char `preview` helper Phase 27
  uses on `<DealCreditMemo />`).
- New `WorkQueueMemoSectionRow` shape (`{ id, dealId, sectionKey,
  sectionLabel, textPreview }`) and a new
  `loadMemoSectionsForDeals(dealIds)` private loader.
- `BankerWorkQueueData` gains `memoSections: WorkQueueMemoSectionRow[]`.
- The Phase 32 two-step pattern is preserved exactly — sections are
  filtered server-side by the OR-chain on `_cr664_deal_value`. No
  "all rows" fallback. If the banker has zero active deals, no
  sections are fetched.

### Banker pipeline projection (`src/banker/dealQueries.ts`)

- `PipelineDeal` gains `collateralSummary: string | undefined`
  (projected from `cr664_collateralsummary`). Not rendered on any
  pipeline list; consumed only by the rollup + catch-up derivations
  for the Phase 73 collateral-section check.

### Manager + team queries

- `src/manager/managerQueries.ts`:
  - `TeamDeal` gains `collateralSummary`.
  - `TeamScopedMemo` gains `textPreview`.
  - New `TeamScopedMemoSection` interface.
  - New `loadManagerTeamMemoSections(teamId)` async loader — same
    parent-deal team navigation filter as the existing manager
    memo / task / document loaders.
- `src/team/teamQueries.ts`:
  - Symmetric changes: `TeamDealRow.collateralSummary`,
    `TeamMemoRow.textPreview`, new `TeamMemoSectionRow` type, new
    `loadTeamMemoSections(teamId)` loader.

### Data providers

- `ManagerDataProvider` gains a `teamMemoSections` async slot, loaded
  in parallel with the other Phase 87 child slots.
- `TeamDataProvider` gains a `memoSections` async slot, loaded in
  parallel.

### Cards (the five primary surfaces)

- `<BankerAutopilotRollup />`: routes `data.memos.textPreview` +
  `data.memoSections` into the rollup primitive. Coverage comment in
  the file header is updated from "7 of 8 signals" to "8 of 8".
  Empty-state copy retired the "memo consistency findings appear on
  each deal's Next Best Actions panel" disclaimer (no longer true).
- `<ManagerAutopilotRollup />`: same wiring, same copy retirement.
- `<TeamAutopilotRollup />`: same wiring, same copy retirement.
- `<ManagerMorningCatchUp />`: passes `teamMemoSections` + memo
  `textPreview` through to the Phase 88 primitive.
- `<BankerMorningCatchUp />`: passes `memoSections` + memo
  `textPreview` through to the Phase 89 adapter.

### Failed-slot handling

Every card already had an "if X.kind === 'failed' show ErrorBlock"
branch for each of its async slots. The new memo-sections slot picks
up the same pattern: if the sections query fails (e.g. transient
service unavailability) the card surfaces `role="alert"` with the
underlying message rather than hiding behind a perpetual "Loading…"
placeholder.

## What does NOT ship

- No new Dataverse write. The check is read-only.
- No new audit row, no new timeline event, no new governed-write
  outcome.
- No new schema (every field used was already in the model — Phase 95
  only widens projections).
- No new SDK install. No new connector. No tenant work.
- No AI. The Phase 73 primitive is six pure pattern-matching checks
  with deterministic outputs.
- No document parsing. The check reads existing `cr664_memotext` and
  `cr664_drafttext` strings — never opens an uploaded PDF or DOCX.
- No automation. The new signal / kind never triggers an action; the
  user reads it and decides what to do (same conservative phrasing
  Phase 73 / Phase 80 already use: "banker review recommended", "may
  require review", "needs attention").
- No permission widening. Each role's loader is scoped exactly as
  before:
  - Banker: `_cr664_deal_value` OR-chain on the banker's authorized
    deal IDs (two-step pattern).
  - Manager: `cr664_Deal/_cr664_team_value eq <teamId>` navigation
    filter on the manager's team.
  - Team: same navigation filter on the team's team.
- No new LOCAL_ONLY_FLOWS entry. The existing
  `credit-memo-consistency-check` entry covers the primitive; this
  phase only adds new callers.
- No new GOVERNED_WRITES entry. None of the surfaces write.
- No copy that claims "all memos are reviewed", "consistency
  verified", "no discrepancies", "credit-decision input",
  "compliance signal", or any other absolute claim. The signal is a
  banker-review prompt, nothing more.

## Test posture

### Primitive tests

- Phase 73 (`checkCreditMemoConsistency.test.ts`): 30/30 pass after
  the input-type refactor. No rule change, no fixture change beyond
  what the new structural shapes require.
- Banker rollup primitive (`bankerAutopilotRollup.test.ts`): updates
  the prior "memo-consistency-findings is intentionally silenced"
  describe block to assert the new Phase 95 contract — quiet when
  the caller supplies no memo content (pre-Phase-95 callers stay
  unchanged); fires MEDIUM when the caller supplies memo content
  that disagrees with structured fields; does not fire when memo +
  sections agree.
- Manager rollup primitive: same Phase 95 cases (`textPreview` ⇒
  fires; pre-Phase-95 quiet contract preserved).
- Team rollup primitive: same Phase 95 cases.
- Catch-up primitives: 7 new manager-side cases + 3 new
  banker-adapter cases cover singular/plural title, dedupe per deal,
  pre-Phase-95 quiet contract, orphan-section filtering.

### Card tests

- All five card test files updated to add `memoSections` /
  `teamMemoSections` to their mock factories. The new async slot
  participates in the existing loading / failed / ready flow tests
  the same way the prior slots do.
- 1823/1823 tests pass.

## Surfaces by scope discipline

| Surface | Loader file | Authorization boundary |
|---|---|---|
| BankerAutopilotRollup | `workQueueQueries.ts` | banker's authorized deal IDs (Phase 32 two-step) |
| ManagerAutopilotRollup | `managerQueries.ts` | manager's team via parent-deal team FK |
| TeamAutopilotRollup | `teamQueries.ts` | team's team via parent-deal team FK |
| BankerMorningCatchUp | `workQueueQueries.ts` (same as banker rollup) | banker's authorized deal IDs |
| ManagerMorningCatchUp | `managerQueries.ts` (same as manager rollup) | manager's team via parent-deal team FK |

The team workspace catch-up card is intentionally NOT in scope for
Phase 95 (Phase 88 / 89 only built catch-up for manager + banker; no
team catch-up card exists yet).

## Conservative copy posture

Every new copy string was reviewed against the Phase 45 conservative
copy guard. Notable choices:

- The catch-up feed item title is `"Memo consistency finding"` /
  `"N memo consistency findings"` — singular/plural noun phrase,
  observation-only.
- The catch-up feed item reason is `"Deterministic check found
  differences between the saved memo draft and structured deal
  fields; banker review recommended."` — same phrasing as the Phase
  80 panel.
- The rollup cards' signal-coverage line previously read "Memo
  consistency findings appear on each deal's Next Best Actions panel
  inside the Deal Workspace; they do not fire on this rollup." That
  sentence is no longer true; Phase 95 removed it from all three
  rollups.
- No surface uses words like `compliant`, `verified`, `approved`,
  `safe`, `clean`, `passed` to describe a deal whose check returned
  zero findings — the absence of a finding is conveyed only by the
  absence of the signal / item.
- No surface uses words like `failed`, `non-compliant`, `risk`,
  `violation`, `blocking` to describe a deal with findings — same
  reason.

## Files modified

```
src/shared/creditMemoConsistency/checkCreditMemoConsistency.ts
src/shared/autopilot/bankerAutopilotRollup.ts
src/shared/autopilot/managerAutopilotRollup.ts
src/shared/autopilot/teamAutopilotRollup.ts
src/shared/autopilot/bankerAutopilotRollup.test.ts
src/shared/autopilot/managerAutopilotRollup.test.ts
src/shared/autopilot/teamAutopilotRollup.test.ts
src/shared/activity/managerMorningCatchUp.ts
src/shared/activity/bankerMorningCatchUp.ts
src/shared/activity/managerMorningCatchUp.test.ts
src/shared/activity/bankerMorningCatchUp.test.ts
src/banker/dealQueries.ts
src/banker/workQueueQueries.ts
src/banker/BankerAutopilotRollup.tsx
src/banker/BankerAutopilotRollup.test.tsx
src/banker/BankerMorningCatchUp.tsx
src/banker/BankerMorningCatchUp.test.tsx
src/manager/managerQueries.ts
src/manager/ManagerDataProvider.tsx
src/manager/ManagerAutopilotRollup.tsx
src/manager/ManagerAutopilotRollup.test.tsx
src/manager/ManagerMorningCatchUp.tsx
src/manager/ManagerMorningCatchUp.test.tsx
src/team/teamQueries.ts
src/team/TeamDataProvider.tsx
src/team/TeamAutopilotRollup.tsx
src/team/TeamAutopilotRollup.test.tsx
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md
docs/PHASE_95_MEMO_CONSISTENCY_ROLLUP_SIGNAL.md  (this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED`, `DELIBERATELY_BLOCKED`, or
  `LOCAL_ONLY_FLOWS`.
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No AI / Copilot / model invocation introduced.
- No document parsing.
- Each role loader stays inside its authorized scope.
- 1823/1823 tests pass.
