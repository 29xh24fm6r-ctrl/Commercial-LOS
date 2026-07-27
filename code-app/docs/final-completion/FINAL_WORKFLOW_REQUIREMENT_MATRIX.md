# Final Workflow Requirement Matrix — Workstream U

**Grounded directly in source** (`src/workflow/loanWorkflowRequirementRegistry.ts`,
`src/workflow/loanWorkflowRequirementEngine.ts`), as of this arc's Workstream U. This supersedes the
need to re-read [`LOS_WORKFLOW_TRUTH_MATRIX.md`](../LOS_WORKFLOW_TRUTH_MATRIX.md)'s many appended
corrections to understand current state — that doc's own lineage convention is to append rather
than rewrite, which is honest but, after several updates, no longer a quick read. This is a fresh,
complete snapshot of exactly what gates each stage exit and each non-forward action **today**,
without re-deriving or contradicting anything that document already established; it is the
authoritative reference for the rest of this session's remaining workstreams (V/W/X) and for the
eventual PR body.

## How to read this matrix

Every stage exit and non-forward action (Return/Decline/Withdraw) is gated by a set of
`CanonicalRequirement` objects in `LOAN_WORKFLOW_REQUIREMENTS`. Each requirement is either:

- **tracked: true** — a real, durable, deal-scoped fact the engine actually evaluates before
  allowing the transition (a genuinely governed gate).
- **tracked: false** (`untracked()`) — the engine fails closed and blocks with an honest "not yet
  tracked" reason, naming exactly what capability is missing.

`severity: 'blocking'` vs `'recommended'` further controls whether an unmet requirement actually
stops the transition or only shows as visible/at-risk. `NON_FORWARD_SEVERITY_OVERRIDE` and
`CREDIT_SEVERITY_OVERRIDE` demote specific requirements to `'recommended'` for documented reasons
(never silently hidden).

## 1. Shallow (stage-definition-derived) requirements — unchanged by this arc

Every stage's required fields/documents/tasks/credit/closing artifacts, derived directly from
`LOAN_WORKFLOW_STAGES` (`deriveShallowRequirements`). These are the facts the live gate has always
evaluated; this arc did not touch this layer. Fields are `matchMode: 'typed'`; documents/tasks/
credit are `matchMode: 'inferred'` (name-matched, no dedicated business-type key in the schema
today — a pre-existing, disclosed limitation, not new).

## 2. Deep requirements — before vs. after this arc

| Requirement id | Stage/scope | Tracked? | Backing record | Evaluator | Closed by |
|---|---|---|---|---|---|
| `UNDERWRITING:risk_rating` | UNDERWRITING | **tracked** | `cr664_riskratinginputs` | `underwritingDeepFacts.ts` | Pre-arc (Factory Arc Phase 5 / N-14) |
| `UNDERWRITING:uw_recommendation` | UNDERWRITING | **tracked** | `cr664_underwritingrecommendationinputs` | `underwritingDeepFacts.ts` | Pre-arc (Factory Arc Phase 5 / N-15) |
| `CREDIT_APPROVAL:memo_finalized` | CREDIT_APPROVAL | **untracked** | — | — | Not closed — see §3 |
| `CREDIT_APPROVAL:approval_decision` | CREDIT_APPROVAL | **tracked** | `cr664_creditapprovaldecision` | `evaluateCreditApprovalDecisionReadiness` | **Workstream C** |
| `CREDIT_APPROVAL:approval_authority` | CREDIT_APPROVAL | **tracked** | `cr664_creditapprovaldecision` | `evaluateCreditApprovalDecisionReadiness` | **Workstream C** |
| `CREDIT_APPROVAL:approval_conditions` | CREDIT_APPROVAL | **tracked** | `cr664_creditapprovaldecision` | `evaluateCreditApprovalDecisionReadiness` | **Workstream C** |
| `COMMITMENT:commitment_issued` | COMMITMENT | **tracked** | `cr664_commitmentrecord` | `evaluateCommitmentReadiness` | **Workstream D** |
| `COMMITMENT:borrower_acceptance` | COMMITMENT | **tracked** | `cr664_commitmentrecord` | `evaluateCommitmentReadiness` | **Workstream D** |
| `DOCUMENTATION:conditions_precedent` | DOCUMENTATION | **tracked** | `cr664_conditionverification` | `evaluateConditionVerificationReadiness` | **Workstream E** |
| `DOCUMENTATION:collateral_verified` | DOCUMENTATION | **tracked** | `cr664_conditionverification` | `evaluateConditionVerificationReadiness` | **Workstream E** |
| `DOCUMENTATION:insurance_verified` | DOCUMENTATION | **tracked** | `cr664_conditionverification` | `evaluateConditionVerificationReadiness` | **Workstream E** |
| `CLOSING_FUNDING:executed_docs` | CLOSING_FUNDING | **tracked** | `cr664_executeddocattestation` | `evaluateExecutedDocumentAttestationReadiness` | **Workstream F** |
| `CLOSING_FUNDING:funds_disbursed` | CLOSING_FUNDING | **tracked** | `cr664_fundingauthorization` | funding authorization fact | Pre-arc (Factory Arc Phase 12) |
| `CLOSING_FUNDING:booking_qc` | CLOSING_FUNDING | **tracked** | `cr664_bookingqccheck` | `evaluateBookingQcReadiness` | **Workstream H** |
| `BOARDED:boarded_loan_record` | BOARDED | **tracked** | `cr664_portfolioboardedloan` | `boardingHandoffReadiness.ts` | Pre-arc (WFLOW-H), wired to write-seam by **Workstream H** |
| `BOARDED:servicing_owner` | BOARDED | **tracked** | `cr664_portfolioboardedloan` | `boardingHandoffReadiness.ts` | **Workstream H** |

**Net effect of this arc on the deep-requirement layer:** 6 durable-record tables shipped
(Workstreams C/D/E/F/H), collectively flipping **11 requirements** from untracked to tracked
(3 Credit Approval + 2 Commitment + 3 Condition Verification + 1 Executed Document + 1 Booking QC +
1 servicing owner). Of the deep requirements authored in the registry, **only one remains
untracked**: `CREDIT_APPROVAL:memo_finalized`.

## 3. What remains genuinely untracked, and why (not gaps — disclosed, ratified positions)

- **`CREDIT_APPROVAL:memo_finalized`** — requires a credit-memo lifecycle status field (draft →
  under review → finalized) that does not exist in the schema today (`CreditMemoStatusKey` is only
  `draft | final | stale`). This is out of scope for this arc — it is its own, separately-scoped
  schema effort (originally "ARC PR 8"), not attempted here. `CREDIT_SEVERITY_OVERRIDE` demotes
  three shallow, stage-def-derived duplicates of this same concept (`reviewed memo`, `committee
  package`, `approved credit memo`) to `'recommended'` specifically so this one real authored
  requirement remains the single source of truth, rather than three unsatisfiable hard blocks.
- **`RETURN:authorization`** — deliberately left untracked. `docs/governance/
  CANONICAL_TRANSITION_POLICY_CONTRACT.md` §5 explicitly rules out inventing a new authorization
  tier beyond identity resolution for this initiative ("out of scope... left for a future,
  separately-ratified revision"). This is a ratified design decision, not missing infrastructure —
  see Workstream J's disposition in `FINAL_REMAINING_GAP_LEDGER.md` §14.

Both are demoted to `severity: 'recommended'` via their respective overrides, so neither strands a
live transition while remaining honestly visible (never silently marked "met").

## 4. Return / Decline / Withdraw — confirmed LIVE, not preview-only

Per the Governance Initiative (2026-07-21, pre-dating this arc) and reconfirmed here:
`loanWorkflowRequirementEngine.ts`'s `deriveTransitionReadiness` checks these for real, delegating
to `canonicalStageTransition.ts`'s pure policy. `DealGovernedTransitionPanel.tsx` mounts
`StageWorkflowControl` with live deps in `BankerDealWorkspace.tsx` — not a preview surface.

- `RETURN:reason`, `DECLINE:reason`, `WITHDRAW:reason` — real, checkable (`checkableNonForward`),
  `tracked: true`, `blocking`.
- `RETURN:authorization` — untracked, `recommended` (see §3).
- `DECLINE:adverse_action` — **tracked by Workstream J** (`cr664_adverseactionrecord`, evaluated via
  `evaluateAdverseActionReadiness`), `recommended` severity per `NON_FORWARD_SEVERITY_OVERRIDE` (a
  DECLINE is already a live, terminal action; this requirement stays visible, never stranding it).

## 5. Registry-completeness discipline this matrix confirms

- Every `tracked()` entry in the registry cites a real, durable, deal-scoped Dataverse-backed
  record — never a session-only or actor-relative fact (confirmed by direct source read of each
  evaluator function this arc's Workstreams C–H added).
- No requirement in `LOAN_WORKFLOW_REQUIREMENTS` claims `tracked: true` without a corresponding
  live evaluator wired into `loanWorkflowRequirementEngine.ts` — verified by cross-referencing
  every id above against its evaluator function.
- The two remaining `untracked()` facts are each backed by an explicit, documented reason (§3), not
  a silent gap.

See `docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md` for the full workstream-by-workstream
disposition narrative this matrix summarizes, and `docs/factory-arc/PR124_WORKFLOW_REQUIREMENT_ENFORCEMENT.md`
for the original audit that established the registry's `tracked()`/`untracked()` discipline.
