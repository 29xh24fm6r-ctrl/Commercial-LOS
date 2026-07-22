# Workstream I/J — Credit Controls & Financial-Analysis Integration Dependency Report

**Branch:** `fix/production-readiness-live-audit-remediation`. Scope: block Credit Approval entry
without (1) risk rating, (2) underwriting recommendation, (3) financial-analysis readiness, (4) memo
readiness, (5) cleared/excepted hard blockers — code-only enforcement first, schema changes prepared
but NOT applied, no substitute calculation engine built.

Per the governing spec: this report is produced BEFORE any schema change, and lists what exists, what's
missing, what's enforceable now with the current schema, what needs Dataverse additions, exact proposed
schema changes, migration/backfill implications, and rollback approach.

## 1. What exists today (verified by direct code read)

| # | Gate condition | Live enforcement today | Where |
|---|---|---|---|
| 1 | Risk rating | Evaluation model READY; NOT wired (no backing record) | `underwritingDeepFacts.ts`'s `evaluateRiskRatingReadiness`; registry entry `UNDERWRITING:risk_rating` in `loanWorkflowRequirementRegistry.ts` authored `tracked: false` |
| 2 | Underwriting recommendation | Evaluation model READY; NOT wired (no backing field/entity) | `underwritingDeepFacts.ts`'s `evaluateUnderwritingRecommendationReadiness`; registry entry `UNDERWRITING:uw_recommendation`, `tracked: false` |
| 3 | Financial-analysis readiness | A real, evidence-backed engine exists (`src/annualReview/*`) but is scoped to `annualReviewId` (post-boarding portfolio monitoring), not `dealId` (origination) — not reachable at Credit Approval entry | `src/annualReview/deriveAnnualReviewFinancialAnalysisSnapshot.ts`, `deriveAnnualReviewFinancialReadiness.ts`, etc. |
| 4 | Memo readiness (existence) | LIVE, hard-enforced at both the UI and the write seam | `loanWorkflowStages.ts`'s UNDERWRITING `creditRequirements: [spreading analysis]` → `loanWorkflowRules.ts`'s `deriveCreditBlockers` → `loanWorkflowRequirementEngine.ts`'s legacy adapter → `stageAdvanceWriteDependency.ts`'s hard requirement-engine guard. Locked in this workstream by two new tests in `stageAdvanceWriteDependency.test.ts` ("memo-existence gate for Credit Approval entry"). |
| 4b | Memo *freshness* (staleness beyond mere existence) | Computed (`creditMemoFreshness.ts`'s `deriveCreditMemoFreshness`) but deliberately NOT wired to any block — decision-support banner only | `stageProgressionGuard.ts` (display only) |
| 5 | Cleared/excepted hard blockers | "Cleared" — LIVE, hard-enforced (both UI Advance button and write seam share `deriveStageExitReadiness`/`evaluateStageExitPolicy`/`dealBlockerModel.ts`). "Excepted" (an override path) — DOES NOT EXIST | `dealBlockerModel.ts`, `stageAdvanceWriteDependency.ts` |

**Already-satisfied, not rebuilt (per "prove it, don't rebuild" guardrail):** condition 5's "cleared"
half and condition 4's existence half are already real, live, end-to-end enforced controls. No new
code was needed for them; this workstream only added regression coverage locking that fact in.

## 2. What's missing, and why it was NOT coded now

### 2a. Risk rating (condition 1)

No deal-scoped risk-rating record exists in Dataverse. `cr664_RiskLevelReference` is a lookup field on
`cr664_loandeals` (`"cr664_RiskLevelReference@odata.bind"` in `Cr664_loandealsModel.ts`), but it has
**no generated reference-table model/service** anywhere in `src/generated/` — the lookup target entity
was never brought into the generated SDK, so there is nothing to bind it to or read values from.

Flipping the registry's `UNDERWRITING:risk_rating` entry to `tracked: true` without a real backing
record would make `evaluateDeepFactRequirement` fail closed as `unmet` for every single deal, forever
(the model correctly returns `met: false` when no `RiskRatingRecord` is supplied, and no loader can ever
supply one against non-existent schema). That would make Credit Approval entry **permanently
impossible for every deal in the system** — a severe, undisclosed production outage, not a control
improvement. This was explicitly avoided.

### 2b. Underwriting recommendation (condition 2)

No field or entity for "underwriting recommendation" (approve / approve-with-conditions / decline /
return) exists anywhere (`grep -rli "recommendation" src/generated/models` → 0 hits). Same brick-the-
pipeline risk as 2a applies to flipping `UNDERWRITING:uw_recommendation` to `tracked: true` — not done.

### 2c. Financial-analysis readiness at Credit Approval entry (condition 3)

`src/annualReview/*` is a genuinely rigorous, evidence-backed DSCR/leverage/liquidity/covenant engine
with a `containsFabricatedValue: false` guarantee and a `finalCreditRecommendation` field that is
**always `null`** (it never emits a decision itself — by design, a human makes the call). It is
architecturally scoped to `annualReviewId`, a **post-boarding portfolio-monitoring** record, not
`dealId`. There is no origination-time financial-analysis record or snapshot at all today.

Making this available at Credit Approval entry requires a genuine architecture/product decision: does
origination get its own financial-analysis snapshot entity (parallel to, but distinct from, the annual-
review one), or does the annual-review engine get re-scoped to also run against a `dealId`? Either
answer is a schema + design decision, not a coding task — and the spec explicitly forbids building a
substitute calculation engine. **Not implemented; flagged for operator decision.**

### 2d. Memo freshness as a hard block (part of condition 4)

`creditMemoFreshness.ts`'s own docstring states its discipline is conservative: "never claims a memo
IS stale... surfaced with 'May be stale' copy." Its `at-risk` condition fires on extremely common,
near-universal states on any active deal — a single overdue open task, or literally any deal/task/
document/timeline activity recorded after the memo was last saved. Wiring this into a hard block would
very likely block the large majority of real in-flight deals from ever reaching Credit Approval — a
severe, undisclosed behavior change far beyond "closing a narrow gap." **Deliberately NOT wired into
any blocking gate.** Memo *existence* (the genuinely narrow, already-enforced fact) is the correct scope
for "memo readiness" at entry; freshness-as-a-block needs an explicit product decision on acceptable
staleness thresholds first.

### 2e. Exception/override mechanism for hard blockers (part of condition 5)

No exception/override mechanism exists anywhere in the codebase (`grep -ri "PolicyException|exception"`
across `src/workflow` and `src/deals` finds only one unused, unwired, unvalidated lookup field,
`cr664_PolicyExceptionIndicator`, present on `cr664_loandeals` but never read or written by any code
path). Building one now would mean inventing both a data model and a governance policy (who can grant
an exception, what it requires, how it's audited) with no product requirements to build against —
exactly the kind of unauthorized governance decision this initiative's guardrails forbid making
unilaterally. **Not implemented; flagged for operator/product decision.**

## 3. What was implemented in this workstream (code-only, no schema change)

- Verified (not rebuilt) that hard-blocker clearing and credit-memo existence are already live,
  end-to-end enforced gates for Credit Approval entry.
- Added two regression tests to `src/workflow/stageAdvanceWriteDependency.test.ts` (describe block
  "memo-existence gate for Credit Approval entry (Workstream I/J)") proving: (a) zero credit memos
  blocks Underwriting → Credit Approval at the write seam (not just the UI), and (b) at least one
  memo, with the rest of the stage's requirements satisfied, allows the advance. Verified genuineness
  by temporarily removing UNDERWRITING's `creditRequirements` entry, confirming the new "blocks" test
  fails (`expected 'advanced' to be 'blocked'`), then restoring it.
- No change to `loanWorkflowRequirementRegistry.ts`'s `tracked` flags for risk rating or underwriting
  recommendation (would brick the pipeline — see §2a/2b).
- No change wiring `creditMemoFreshness.ts` into any blocking gate (see §2d).
- No substitute financial-analysis or risk-rating calculation engine was built anywhere.

## 4. Proposed schema changes (PREPARED — NOT APPLIED)

These require operator/Dataverse-admin authorization before any migration is run. None of the following
has been executed against any environment.

### 4a. Deal-scoped risk rating

Two workable shapes; either satisfies `RiskRatingRecord` in `underwritingDeepFacts.ts` verbatim:

- **Option A (recommended) — new child entity** `cr664_dealriskratings` (1:N off `cr664_loandeals`,
  most-recent-by-date = current), fields: `cr664_ratingvalue` (text or option set), `cr664_ratingscale`
  (text), `cr664_rationale` (multiline text), `cr664_assignedby` (systemuser lookup), `cr664_assignedon`
  (datetime), `cr664_reviewedby` (systemuser lookup), `cr664_reviewedon` (datetime), `cr664_status`
  (option set: draft/assigned/reviewed/approved), `cr664_dealid` (lookup to `cr664_loandeals`). Mirrors
  the existing `RiskRatingRecord` shape one-for-one — no model changes needed once a loader exists.
- **Option B — resolve the existing lookup.** Generate the reference-table model/service for whatever
  entity `cr664_RiskLevelReference` targets (confirm the target entity in Dataverse first — it was never
  regenerated into `src/generated/`), and add a single `cr664_riskratingstatus` option-set field plus
  assignment audit fields directly on `cr664_loandeals`. Simpler schema, but conflates "current rating"
  with rating history (no natural place to keep prior ratings for audit) — Option A is cleaner for audit
  trail and change history, which risk ratings typically need.

### 4b. Underwriting recommendation

New child entity `cr664_underwritingrecommendations` (1:N off `cr664_loandeals`), fields:
`cr664_decision` (option set: approve/approve_with_conditions/decline/return_for_more_information),
`cr664_rationale` (multiline text), `cr664_underwriteractor` (systemuser lookup), `cr664_recordedon`
(datetime), `cr664_status` (option set: draft/recorded/reviewed), `cr664_dealid` (lookup). Mirrors
`UnderwritingRecommendationRecord` verbatim.

### 4c. Origination-time financial-analysis snapshot (pending an architecture decision, §2c)

Not proposed in detail here — this is a design decision (new entity vs. re-scoping `annualReview`), not
a mechanical field addition. Once decided, the schema follows whichever existing `annualReview` shape is
chosen as the pattern (its snapshot/readiness records already have a well-tested shape).

### 4d. Exception/override entity (pending a policy decision, §2e)

Not proposed in detail here — requires a policy decision on approval authority for exceptions before
any field list is meaningful. A minimal starting shape, once policy is decided, would be a child entity
`cr664_stageexceptions` keyed to the deal + the specific blocked requirement id, with granter, rationale,
and expiry/scope fields — but this is a placeholder shape pending real requirements, not a proposal to
implement as-is.

## 5. Migration / backfill implications

- **4a/4b are purely additive (new child entities)** — no migration of existing `cr664_loandeals`
  records is required; a deal with no risk-rating/recommendation record simply evaluates as `unmet`
  (exactly today's behavior once the registry flips `tracked: true` for the corresponding entries).
  There is deliberately no proposal to backfill historical deals with synthetic ratings/recommendations
  — any such backfill would fabricate a value with no authoritative source, which no automated process
  should do. Backfill, if wanted, would be a manual/reviewed data-entry exercise by underwriting staff
  for in-flight deals only, at the operator's discretion.
- **4b similarly additive.**
- Because 4a/4b are additive and the registry's `tracked: false → true` flip is a single-line change
  gated on the loader existing, the **sequencing matters**: schema + loader must land and be verified
  functional in a non-production environment BEFORE the registry flip, or every deal at Underwriting
  will immediately become unable to reach Credit Approval the moment the flip ships with no backing
  data. This is the same risk already flagged in §2a/2b for why it wasn't done now.

## 6. Rollback approach

- **4a/4b (additive entities):** rollback is deleting the unused entity/fields in Dataverse (no data-
  loss risk to existing records, since nothing else references them) and reverting the registry
  `tracked` flip (single-line revert) plus the loader wiring. Because the registry flip and the loader
  are separate, small, independently revertible commits (per this initiative's one-workstream-per-commit
  discipline), a partial rollback (loader works but flip causes unexpected blocking) is a one-line revert
  of just the `tracked: true` change, without needing to also remove the schema or loader.
- **Exception mechanism (4d):** until a policy is agreed, there is nothing to roll back — this section
  documents a gap, not a shipped change.
- **Financial-analysis re-scoping (4c):** rollback approach depends entirely on which design option is
  chosen; not assessable until that decision is made.

## 7. Summary — what changes production behavior today vs. what is prepared-only

| Item | Status |
|---|---|
| Hard-blocker clearing enforced at write seam | Already live — verified, not changed |
| Credit-memo existence enforced at write seam for Credit Approval entry | Already live — verified + newly regression-tested |
| Risk rating / underwriting recommendation gating | Models ready, schema absent — explicitly NOT flipped live (would brick the pipeline) |
| Financial-analysis readiness at Credit Approval entry | Not reachable from origination scope today — flagged for an architecture decision, not built |
| Memo freshness as a block | Deliberately not wired — too disruptive to real in-flight deals |
| Exception/override mechanism | Does not exist — flagged for a policy decision, not invented |
| Proposed schema (risk rating, UW recommendation) | PREPARED in this document — NOT APPLIED to any environment |
