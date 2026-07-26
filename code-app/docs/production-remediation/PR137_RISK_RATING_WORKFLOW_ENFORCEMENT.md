# PR 137 — Risk Rating / Recommendation Rationale and Workflow Enforcement

**Factory Arc:** Non-Stop Production Remediation Factory Arc — Phase 6
**Findings addressed:** N-14, N-15
**Branch:** `phase6-risk-rating-workflow-enforcement`

## Problem statement

The July 25 audit found that a risk rating could be saved at `assigned`/final status with a
completely blank rationale, and the UI would still claim the record satisfied the Underwriting exit
gate (N-14). Separately, the app explicitly stated that risk rating and underwriting recommendation
were "tracked later" and not yet enforced as real workflow requirements at all (N-15).

## Investigation

Both findings were confirmed real against current `master`:

- **N-14 confirmed, real, Sev 2.** `evaluateRiskRatingReadiness`/`evaluateUnderwritingRecommendationReadiness`
  (`src/workflow/underwritingDeepFacts.ts`) checked only a non-blank `ratingValue`/`decision` and a
  minimum `status` — never `rationale`, never an assigning/recording actor, never a timestamp, never
  a match on the deal being evaluated. A confirming test already existed and asserted this as
  correct behavior (`DealRiskRatingPanel.test.tsx`: "assigning a rating value with status 'assigned'
  satisfies the default readiness policy" — no rationale typed, asserted "Would satisfy the gate").
- **N-15 confirmed, real, Sev 2.** `loanWorkflowRequirementRegistry.ts` authored
  `UNDERWRITING:risk_rating` / `UNDERWRITING:uw_recommendation` via the `untracked(...)` helper
  (`tracked: false`), and `evaluateStageExitPolicy` deliberately only consults `tracked` blocking
  requirements — so these two facts could never block a live Underwriting → Credit Approval advance
  no matter what was recorded. A confirming test already existed and asserted this as correct
  ("reviewing the analysis documents clears the tracked block (untracked deep facts remain,
  non-live)"). Additionally, no production code ever supplied `WorkflowRequirementFacts.riskRating`
  / `.underwritingRecommendation` at all (`DealStageProgressionCard.tsx`'s `facts={{...}}` omitted
  both keys) — even flipping the registry flag alone would not have been enough.
- A separate, independent "rigorous" gate module (`stageGateContract.ts`, consumed by
  `StageWorkflowControl.tsx`) also hardcodes risk rating as `select: () => false` ("not yet
  implemented"). Investigated and left untouched: the live banker workspace
  (`DealGovernedTransitionPanel.tsx`) mounts that component with `gateFacts={{}}` and
  `showAdvance={false}` specifically because its own code comment says a second, disagreeing
  Advance button would be "genuinely confusing, not a bug in either" — this module's Advance button
  is not live in production today, so it does not drive the reported defect and is out of scope for
  this evidence-backed fix. Flagged as a remaining limitation below.

## Fixes in this PR

### N-14 — durable readiness policy (rationale, actor, timestamp, exact deal linkage)
`evaluateRiskRatingReadiness` and `evaluateUnderwritingRecommendationReadiness`
(`src/workflow/underwritingDeepFacts.ts`) now additionally require, once status reaches the
configured minimum: a non-blank rating scale, a non-blank rationale, a recorded assigning/recording
actor, a recorded timestamp, and that the record's `dealId` matches the deal actually being
evaluated. A draft still may be incomplete by design (unchanged) — the new checks only apply once a
rating/recommendation claims to be final. `RiskRatingFormState`/`UnderwritingRecommendationFormState`
(the persisted JSON shape) gained `dealId`/`assignedBy`/`assignedAtIso` and
`dealId`/`underwriterActor`/`recordedAtIso` respectively — stamped by `DealRiskRatingPanel.tsx`'s
save handlers themselves (never banker-editable), so a legacy record persisted before this phase
parses those fields as blank and correctly fails the new checks rather than fabricating them.

### N-15 — real, tracked, loader-fed workflow requirements
`loanWorkflowRequirementRegistry.ts` flips `UNDERWRITING:risk_rating` /
`UNDERWRITING:uw_recommendation` from `untracked(...)` to `tracked(...)` — the same pattern
`CLOSING_FUNDING:funds_disbursed` established. Two new pure loaders,
`deriveRiskRatingRecordFromDeal` / `deriveUnderwritingRecommendationRecordFromDeal`
(`underwritingDeepFacts.ts`), read the deal's own already-persisted JSON and are now wired into
`DealStageProgressionCard.tsx`'s `facts={{...}}` object — the single facts object that already feeds
both the Advance button and the actual write seam (`stageAdvanceWriteDependency.ts`), so UI and
write path agree by construction. `evaluateDeepFactRequirement`
(`loanWorkflowRequirementEngine.ts`) now passes `facts.deal.id` through as the expected-deal-id for
both checks. An absent, malformed, or legacy record is never fabricated as met — it fails the same
way a genuinely-missing one does.

## Files changed

- `src/workflow/underwritingDeepFacts.ts` — durable readiness checks, extended persisted form-state
  shapes, two new deal-scoped loader functions
- `src/workflow/underwritingDeepFacts.test.ts` — rewritten with N-14/N-15 coverage (blank rationale,
  no actor, no timestamp, wrong-deal record, legacy-record fail-closed, loader round-trip)
- `src/workflow/loanWorkflowRequirementEngine.ts` — `evaluateDeepFactRequirement` passes the expected
  deal id through to both readiness checks
- `src/workflow/loanWorkflowRequirementEngine.test.ts` — updated deep-fact fixtures; new tests proving
  the Underwriting exit now genuinely blocks/clears on risk rating + recommendation
- `src/workflow/loanWorkflowRequirementRegistry.ts` — both requirements flipped `tracked: true`
- `src/workflow/loanWorkflowRequirementRegistry.test.ts` — updated tracked/untracked assertions; new
  "ready once durable facts are supplied" test
- `src/workflow/stageAdvanceWriteDependency.test.ts` — updated the existing "all else satisfied"
  fixture to include valid risk rating/recommendation facts; two new tests proving the write seam
  itself blocks on blank rationale and on a wrong-deal record
- `src/deals/DealStageProgressionCard.tsx` — wires the two new loaders into the shared `facts` object
- `src/deals/DealRiskRatingPanel.tsx` — save handlers stamp `dealId`/actor/timestamp; readiness calls
  updated for the new function signatures; UI copy updated to reflect real enforcement
- `src/deals/DealRiskRatingPanel.test.tsx` — updated/added tests proving blank rationale no longer
  satisfies the gate for either the rating or the recommendation; save-path assertions on the
  persisted `dealId`/`assignedBy`/`assignedAtIso`

## Schema impact

None. `dealId`/actor/timestamp are additional fields inside the same pre-existing Memo/JSON columns
(`cr664_riskratinginputs`, `cr664_underwritingrecommendationinputs`, both provisioned in PR106) — no
new Dataverse column, table, or migration.

## Runtime behavior before / after

| | Before | After |
|---|---|---|
| Risk rating, status=assigned, blank rationale | Saves; UI says "Would satisfy the gate" | Saves (nothing is lost); UI says "Would NOT satisfy the gate" — rationale required |
| Underwriting → Credit Approval advance | Risk rating/recommendation never checked (untracked) | Real, tracked blockers — missing/incomplete/blank-rationale/wrong-deal records block the advance at both the UI button and the write seam |
| A risk-rating record from a different deal | No linkage check existed | Does not satisfy this deal's requirement |
| Legacy (pre-Phase-6) saved rating/recommendation | N/A (fields didn't exist) | Parses with blank actor/timestamp/dealId — correctly fails the new checks, never fabricated as met |

## Tests added

- `underwritingDeepFacts.test.ts` — 38 tests total (rewritten; N-14/N-15 cases: blank rationale, blank
  scale, missing actor, missing timestamp, wrong-deal record, legacy-record fail-closed, and loader
  round-trip/reload tests for both risk rating and recommendation)
- `loanWorkflowRequirementEngine.test.ts` — updated deep-fact describe block; new tests for the real
  Underwriting-exit block/clear behavior and a wrong-deal risk-rating record
- `loanWorkflowRequirementRegistry.test.ts` — new tracked-status test; rewritten
  block/ready-once-supplied test for the Underwriting stage
- `stageAdvanceWriteDependency.test.ts` — 2 new tests proving the write seam (not just the UI preview)
  blocks on blank rationale and on a wrong-deal risk-rating record
- `DealRiskRatingPanel.test.tsx` — 2 new N-14 tests (blank rationale on rating and on recommendation);
  existing satisfy-the-gate tests updated to include a rationale; save-path assertions extended to
  check the persisted `dealId`/`assignedBy`/`assignedAtIso`

## Validation results

- `npx tsc -b` — 0 errors
- `npx vitest run` — 914 test files, 13415 passed, 2 skipped, 0 failed
- `npm run build` — succeeded (only pre-existing, unrelated INEFFECTIVE_DYNAMIC_IMPORT warnings)
- `npm run audit:reachability` — 0 unexpected orphans (1070 total sources, 785 reachable, 285
  allow-listed orphans, consistent with prior phases' baseline)

## Operator steps

None.

## Rollback considerations

Additive fields inside existing JSON columns plus a registry flag flip; no data migration. A plain
revert is safe. Note that reverting re-opens N-14/N-15 (risk rating/recommendation become unenforced
again) — any risk rating or recommendation recorded while this PR is live remains fully readable
after a revert (the extra fields are simply ignored by the old code), so no data is lost either way.

## Remaining limitations

- `stageGateContract.ts`'s independent "rigorous" gate still hardcodes risk rating as `select: () =>
  false` ("not yet implemented"). This is not live-enforced in production today (the mounting
  component's Advance button is disabled by its own `showAdvance={false}` in the live banker
  workspace, specifically to avoid a second, disagreeing Advance control), so it does not drive the
  N-14/N-15 defects and was left untouched — but a future phase that ever activates that module's
  Advance button should update it too.
- The persisted `assignedBy`/`underwriterActor` fields are free-text display names (`ratedBy`), not a
  resolved Dataverse system-user reference — sufficient to name "who" for this remediation's
  rationale/actor/timestamp/deal-linkage requirement, but not a queryable identity link. A future
  phase could bind these to the same actor-resolution pattern used elsewhere in the write path
  (`newDealAuditActorResolver.ts`) if a stronger identity guarantee is needed.
