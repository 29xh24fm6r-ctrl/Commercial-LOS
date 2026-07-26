import { LOAN_WORKFLOW_STAGES } from './loanWorkflowStages';
import type { LoanWorkflowStageDefinition } from './loanWorkflowTypes';
import type { CanonicalStageCode } from './stageOrderingContract';
import type {
  CanonicalRequirement,
  DocumentReviewLevel,
  RequirementCategory,
  RequirementSeverity,
  ResolverSurface,
  ResponsibleRole,
  RequirementScope,
} from './loanWorkflowRequirementTypes';

/**
 * ARC Phase 1 — Canonical requirement registry for the full commercial LOS workflow.
 *
 * The single catalog of what each stage exit (and each non-forward action) requires, as first-class
 * typed objects. Two layers:
 *
 *   1. SHALLOW / currently-tracked facts are DERIVED from the existing LOAN_WORKFLOW_STAGES
 *      definitions (no duplication) — required fields/documents/tasks/credit/closing. These are the
 *      facts the current live gate already evaluates; they stay behavior-compatible.
 *   2. DEEP facts (risk rating, underwriting recommendation, approval decision/authority/conditions,
 *      commitment issuance/acceptance, conditions precedent, closing/funding, boarded-loan handoff)
 *      are authored here as `tracked: false` — the capability is not wired yet, so the engine fails
 *      closed (untracked blocking) and names exactly what is missing. Each is flipped `tracked: true`
 *      by its major ARC PR (see docs/LOS_WORKFLOW_TRUTH_MATRIX.md).
 *
 * Return / Decline / Withdraw carry placeholder requirements (reason, authorization, adverse action)
 * pending their governed live paths (ARC PR 10/11/12).
 *
 * PURE data. No runtime behavior, no IO, no gate. Inert until its consuming ARC PR wires it.
 */

/** Default responsible role for a stage's documents/tasks/credit/closing work. */
const STAGE_ROLE: Record<CanonicalStageCode, ResponsibleRole> = {
  INTAKE: 'banker',
  UNDERWRITING: 'underwriter',
  CREDIT_APPROVAL: 'credit_officer',
  COMMITMENT: 'loan_ops',
  DOCUMENTATION: 'loan_ops',
  CLOSING_FUNDING: 'closer',
  BOARDED: 'portfolio_manager',
};

/** Stable registry id for a derived (stage-def) requirement. */
export function shallowRequirementId(scope: RequirementScope, category: RequirementCategory, rawId: string): string {
  return `${scope}:${category}:${rawId}`;
}

/**
 * Document-review-level policy (which documents must be REVIEWED, not merely received).
 * Key = `${scope}:${rawId}`.
 *
 * ARC Phase 3 — "underwriting review completed" goes LIVE via real typed document status: the
 * underwriting analysis documents (business financial statements, tax returns) must be REVIEWED (not
 * merely received) to exit Underwriting. This is a genuine, non-fabricated deep-review signal (an
 * underwriter reviewing the financials), enforced through the Phase 2 typed-status evaluator. The
 * Stage Map + advance gate agree via the fail-closed caller guard. Intake documents stay `received`
 * (equivalent), so the Stage Advancement smoke path is unchanged.
 */
const DOCUMENT_REVIEW_LEVEL: Readonly<Record<string, DocumentReviewLevel>> = Object.freeze({
  'UNDERWRITING:business financial statements': 'reviewed',
  'UNDERWRITING:tax returns': 'reviewed',
});

/**
 * Task-severity policy (which tasks BLOCK vs stay recommended/optional). Phase 2 keeps every live task
 * at `recommended` (Intake tasks are visible but non-blocking, preserving PR #68). A later stage phase
 * flips specific tasks to `blocking` together with adopting the engine in the write seam.
 * Key = `${scope}:${rawId}`.
 */
const TASK_SEVERITY: Readonly<Record<string, RequirementSeverity>> = Object.freeze({});

/**
 * Credit-requirement severity policy override (which credit requirements BLOCK vs stay
 * recommended/visible). Default for category 'credit' is 'blocking' (derivedRequirement below) --
 * correct for the literal memo-presence and section requirements, which are genuinely verifiable
 * facts. These three CREDIT_APPROVAL ids ask about review / approval / committee status, which the
 * schema has no field for (CreditMemoStatusKey is only draft/final/stale). There is a matching
 * AUTHORED DEEP requirement for the real concept (CREDIT_APPROVAL:approval_authority etc., in
 * DEEP_REQUIREMENTS below, correctly untracked/fail-closed) -- these shallow, stage-def-derived
 * duplicates must NOT also hard-block, or Credit Approval exit becomes permanently unsatisfiable
 * (there is no UI path to ever clear them). Demoted to 'recommended' so they stay visible/honest
 * (loanWorkflowRules.ts's deriveCreditBlockers marks them 'at-risk', never silently "met") without
 * stranding a live write path. Key = `${scope}:${rawId}`.
 */
const CREDIT_SEVERITY_OVERRIDE: Readonly<Record<string, RequirementSeverity>> = Object.freeze({
  'CREDIT_APPROVAL:reviewed memo': 'recommended',
  'CREDIT_APPROVAL:committee package': 'recommended',
  'CREDIT_APPROVAL:approved credit memo': 'recommended',
});

function derivedRequirement(
  stage: LoanWorkflowStageDefinition,
  category: RequirementCategory,
  rawId: string,
  label: string,
): CanonicalRequirement {
  const scope = stage.id;
  const role = STAGE_ROLE[stage.id];
  const map: Record<RequirementCategory, { resolver: ResolverSurface; backing: CanonicalRequirement['backingType']; severity: CanonicalRequirement['severity']; role: ResponsibleRole; verb: string }> = {
    field: { resolver: 'Deal Profile', backing: 'deal_field', severity: 'blocking', role: 'banker', verb: 'Complete required field' },
    document: { resolver: 'Documents', backing: 'document_requirement', severity: 'blocking', role, verb: 'Provide required document' },
    task: { resolver: 'Tasks', backing: 'task_status', severity: 'recommended', role, verb: 'Complete task' },
    credit: { resolver: 'Credit Memo', backing: 'memo_status', severity: 'blocking', role, verb: 'Provide credit artifact' },
    closing: { resolver: stage.id === 'DOCUMENTATION' ? 'Documentation' : 'Closing', backing: 'closing_record', severity: 'blocking', role, verb: 'Resolve closing requirement' },
    // Unused for derived requirements, present to satisfy the exhaustive record.
    approval: { resolver: 'Approval', backing: 'approval_record', severity: 'blocking', role: 'approver', verb: 'Record' },
    funding: { resolver: 'Funding', backing: 'funding_record', severity: 'blocking', role: 'loan_ops', verb: 'Record' },
    boarding: { resolver: 'Boarding', backing: 'boarded_loan_record', severity: 'blocking', role: 'portfolio_manager', verb: 'Record' },
    servicing: { resolver: 'Portfolio', backing: 'boarded_loan_record', severity: 'blocking', role: 'portfolio_manager', verb: 'Record' },
    monitoring: { resolver: 'Portfolio', backing: 'covenant_record', severity: 'blocking', role: 'portfolio_manager', verb: 'Record' },
    exception: { resolver: 'Exceptions', backing: 'exception_record', severity: 'blocking', role: 'loan_ops', verb: 'Resolve' },
    adverse_action: { resolver: 'Approval', backing: 'review_record', severity: 'blocking', role: 'credit_officer', verb: 'Record' },
  };
  const m = map[category];
  const policyKey = `${scope}:${rawId}`;
  const severity: RequirementSeverity =
    category === 'task'
      ? (TASK_SEVERITY[policyKey] ?? 'recommended')
      : category === 'credit'
        ? (CREDIT_SEVERITY_OVERRIDE[policyKey] ?? m.severity)
        : m.severity;
  return {
    id: shallowRequirementId(scope, category, rawId),
    scope,
    label,
    description: `${stage.label} exit criterion (${category}).`,
    category,
    severity,
    resolverSurface: m.resolver,
    responsibleRole: m.role,
    backingType: m.backing,
    tracked: true,
    // Documents/tasks/credit are matched by name (no business-type key in the current schema) — an
    // inferred adapter; document STATUS is typed. Fields are matched by their typed deal-field key.
    matchMode: category === 'field' ? 'typed' : 'inferred',
    ...(category === 'document' ? { documentReviewLevel: DOCUMENT_REVIEW_LEVEL[policyKey] ?? 'received' } : {}),
    uiCopy: `${m.verb}: ${label}`,
    blockerReason: `${label} is required to exit ${stage.label}.`,
  };
}

/** Derive the currently-tracked (shallow) requirements for a stage from its definition. */
function deriveShallowRequirements(stage: LoanWorkflowStageDefinition): CanonicalRequirement[] {
  return [
    ...stage.requiredFields.map((r) => derivedRequirement(stage, 'field', r.id, r.label)),
    ...stage.requiredDocuments.map((r) => derivedRequirement(stage, 'document', r.id, r.label)),
    ...stage.requiredTasks.map((r) => derivedRequirement(stage, 'task', r.id, r.label)),
    ...stage.creditRequirements.map((r) => derivedRequirement(stage, 'credit', r.id, r.label)),
    ...stage.closingRequirements.map((r) => derivedRequirement(stage, 'closing', r.id, r.label)),
  ];
}

/** An authored deep (not-yet-tracked) requirement. */
function untracked(
  id: string,
  scope: RequirementScope,
  category: RequirementCategory,
  label: string,
  resolverSurface: ResolverSurface,
  responsibleRole: ResponsibleRole,
  backingType: CanonicalRequirement['backingType'],
  missingCapability: string,
): CanonicalRequirement {
  return {
    id,
    scope,
    label,
    description: `${label} — governed exit criterion.`,
    category,
    severity: 'blocking',
    resolverSurface,
    responsibleRole,
    backingType,
    tracked: false,
    matchMode: 'typed',
    uiCopy: `${label} (not yet tracked)`,
    blockerReason: `${label} is required but not yet tracked: ${missingCapability}.`,
  };
}

/**
 * Factory Arc Phase 12 — a deep requirement whose backing capability is now real, durable, and
 * deal-scoped (not actor-relative, not session-only, not gated off by default), so it is authored
 * `tracked: true` from the start rather than via the `untracked()` helper above. See
 * loanWorkflowRequirementEngine.ts's `evaluateDeepFactRequirement` for the model this evaluates
 * against, and docs/factory-arc/PR124_WORKFLOW_REQUIREMENT_ENFORCEMENT.md for the audit that found it.
 */
function tracked(
  id: string,
  scope: RequirementScope,
  category: RequirementCategory,
  label: string,
  resolverSurface: ResolverSurface,
  responsibleRole: ResponsibleRole,
  backingType: CanonicalRequirement['backingType'],
  sourceEntity: string,
  blockerReason: string,
): CanonicalRequirement {
  return {
    id,
    scope,
    label,
    description: `${label} — governed exit criterion.`,
    category,
    severity: 'blocking',
    resolverSurface,
    responsibleRole,
    backingType,
    tracked: true,
    sourceEntity,
    matchMode: 'typed',
    uiCopy: label,
    blockerReason,
  };
}

/**
 * DEEP facts, authored as untracked-blocking until their major ARC PR wires the backing record.
 * These are the facts that make each transition genuinely governed (per the truth matrix). They do
 * NOT attach to INTAKE, so Intake → Underwriting stays behavior-compatible with the current live gate.
 */
const DEEP_REQUIREMENTS: readonly CanonicalRequirement[] = [
  // Underwriting → Credit Approval: Production Remediation Factory Arc Phase 6 (N-14/N-15) flips
  // these tracked. Factory Arc Phase 5 already made the backing record real, durable, and
  // deal-scoped (cr664_riskratinginputs / cr664_underwritingrecommendationinputs, read via
  // deriveRiskRatingRecordFromDeal / deriveUnderwritingRecommendationRecordFromDeal in
  // underwritingDeepFacts.ts) — the missing piece N-15 found was that the registry still called
  // these facts untracked and evaluateStageExitPolicy therefore never consulted them. See the
  // `tracked()` helper's docstring for the CLOSING_FUNDING:funds_disbursed precedent this follows.
  tracked('UNDERWRITING:risk_rating', 'UNDERWRITING', 'credit', 'Risk rating assigned', 'Credit Memo', 'underwriter', 'risk_rating_record', 'cr664_riskratinginputs', 'A final risk rating with rationale, actor, and timestamp has not been recorded for this deal.'),
  tracked('UNDERWRITING:uw_recommendation', 'UNDERWRITING', 'credit', 'Underwriting recommendation recorded', 'Credit Memo', 'underwriter', 'review_record', 'cr664_underwritingrecommendationinputs', 'A final underwriting recommendation with rationale, actor, and timestamp has not been recorded for this deal.'),
  // Credit Approval → Commitment (ARC PR 8/9)
  untracked('CREDIT_APPROVAL:memo_finalized', 'CREDIT_APPROVAL', 'credit', 'Credit memo finalized', 'Credit Memo', 'credit_officer', 'memo_status', 'credit memo lifecycle status not yet implemented (ARC PR 8)'),
  // Final LOS Completion arc (Workstream C) flips these tracked — submitCreditApprovalDecision.ts /
  // creditApprovalDecisionStore.ts now provide a real, durable, deal-scoped Credit Approval Decision
  // record (cr664_creditapprovaldecision, see scripts/schema-migrations/final-arc-credit-approval-
  // decision/), evaluated via evaluateCreditApprovalDecisionReadiness in
  // loanWorkflowRequirementEngine.ts. Same "backing capability became real" discipline the
  // UNDERWRITING risk-rating/recommendation flips above and CLOSING_FUNDING:funds_disbursed below
  // already followed.
  tracked('CREDIT_APPROVAL:approval_decision', 'CREDIT_APPROVAL', 'approval', 'Approval decision recorded', 'Approval', 'approver', 'approval_record', 'cr664_creditapprovaldecision', 'No approved credit approval decision has been recorded for this deal.'),
  tracked('CREDIT_APPROVAL:approval_authority', 'CREDIT_APPROVAL', 'approval', 'Authorized approver / committee approval', 'Approval', 'approver', 'approval_record', 'cr664_creditapprovaldecision', 'The recorded credit approval decision has no authority tier recorded.'),
  tracked('CREDIT_APPROVAL:approval_conditions', 'CREDIT_APPROVAL', 'approval', 'Conditions of approval documented', 'Approval', 'credit_officer', 'condition_record', 'cr664_creditapprovaldecision', 'No approved credit approval decision has been recorded for this deal.'),
  // Commitment → Documentation (ARC PR 13). Final LOS Completion arc (Workstream D) flips these
  // tracked — submitCommitmentAction.ts / commitmentRecordStore.ts now provide a real, durable,
  // deal-scoped Commitment Record (cr664_commitmentrecord, see
  // scripts/schema-migrations/final-arc-commitment-record/), evaluated via
  // evaluateCommitmentReadiness in loanWorkflowRequirementEngine.ts.
  tracked('COMMITMENT:commitment_issued', 'COMMITMENT', 'closing', 'Commitment / term sheet issued', 'Commitment', 'loan_ops', 'review_record', 'cr664_commitmentrecord', 'No commitment letter has been issued for this deal.'),
  tracked('COMMITMENT:borrower_acceptance', 'COMMITMENT', 'closing', 'Borrower acceptance recorded', 'Commitment', 'banker', 'review_record', 'cr664_commitmentrecord', 'The borrower has not yet accepted a commitment for this deal.'),
  // Documentation → Closing & Funding (ARC PR 14). Final LOS Completion arc (Workstream E) flips
  // these tracked — submitConditionVerificationAction.ts / conditionVerificationStore.ts now
  // provide a real, durable, deal-scoped Condition Verification record
  // (cr664_conditionverification, see
  // scripts/schema-migrations/final-arc-condition-verification/), evaluated via
  // evaluateConditionVerificationReadiness in loanWorkflowRequirementEngine.ts.
  tracked('DOCUMENTATION:conditions_precedent', 'DOCUMENTATION', 'closing', 'Conditions precedent cleared', 'Documentation', 'loan_ops', 'condition_record', 'cr664_conditionverification', 'Conditions precedent have not been cleared for this deal.'),
  tracked('DOCUMENTATION:collateral_verified', 'DOCUMENTATION', 'closing', 'Collateral verified', 'Documentation', 'closer', 'condition_record', 'cr664_conditionverification', 'Collateral has not been verified for this deal.'),
  tracked('DOCUMENTATION:insurance_verified', 'DOCUMENTATION', 'closing', 'Insurance verified', 'Documentation', 'closer', 'condition_record', 'cr664_conditionverification', 'Insurance has not been verified for this deal.'),
  // Closing & Funding → Boarded (ARC PR 15). Final LOS Completion arc (Workstream F) flips this
  // tracked — submitExecutedDocumentAttestationAction.ts / executedDocumentAttestationStore.ts
  // now provide a real, durable, deal-scoped Executed Document Attestation record
  // (cr664_executeddocattestation, see
  // scripts/schema-migrations/final-arc-executed-document-attestation/), evaluated via
  // evaluateExecutedDocumentAttestationReadiness in loanWorkflowRequirementEngine.ts. Distinct
  // from the pre-existing cr664_closingdocumentmanifest (PR107/PR123), which tracks GENERATION of
  // closing documents, never whether the borrower actually executed (signed) them.
  tracked('CLOSING_FUNDING:executed_docs', 'CLOSING_FUNDING', 'closing', 'Loan documents executed', 'Closing', 'closer', 'closing_record', 'cr664_executeddocattestation', 'Executed loan documents have not been attested for this deal.'),
  // Factory Arc Phase 12 -- PR 112's Dataverse-backed funding-authorization store
  // (createDataverseFundingAuthorizationStore(), unconditionally mounted in
  // DealFundingAuthorizationPanel.tsx) makes FUNDED a real, durable, deal-scoped fact. Flipped
  // tracked: true; evaluated against WorkflowRequirementFacts.fundingAuthorization (a loader-supplied
  // fact, never fabricated -- see loanWorkflowRequirementEngine.ts).
  tracked('CLOSING_FUNDING:funds_disbursed', 'CLOSING_FUNDING', 'funding', 'Funds disbursed', 'Funding', 'loan_ops', 'funding_record', 'cr664_fundingauthorization', 'Funds have not yet been disbursed for this deal (the funding authorization record is not FUNDED).'),
  // Final LOS Completion arc (Workstream H) flips this tracked -- submitBookingQcCheckAction.ts /
  // bookingQcCheckStore.ts now provide a real, durable, deal-scoped Booking QC Check record
  // (cr664_bookingqccheck, see scripts/schema-migrations/final-arc-booking-qc-check/), evaluated via
  // evaluateBookingQcReadiness in loanWorkflowRequirementEngine.ts. No such concept existed
  // anywhere in the codebase before this record (confirmed by direct search).
  tracked('CLOSING_FUNDING:booking_qc', 'CLOSING_FUNDING', 'closing', 'Booking quality control complete', 'Closing', 'loan_ops', 'closing_record', 'cr664_bookingqccheck', 'Booking quality control has not been completed for this deal.'),
  // Boarded / Servicing (ARC PR 16). Final LOS Completion arc (Workstream H) flips both tracked --
  // WFLOW-H's own loadBoardingHandoffForDeal.ts / boardingHandoffReadiness.ts already made
  // cr664_portfolioboardedloans (via cr664_OriginatedLoanDeal) the real per-deal source of truth for
  // display; this wires that same evidence into the write-seam gate for the first time, and extends
  // it to also read cr664_AssignedServicingOwner for the second fact.
  tracked('BOARDED:boarded_loan_record', 'BOARDED', 'boarding', 'Boarded loan / servicing handoff record created', 'Boarding', 'portfolio_manager', 'boarded_loan_record', 'cr664_portfolioboardedloan', 'No active portfolio boarded-loan handoff record exists for this deal.'),
  tracked('BOARDED:servicing_owner', 'BOARDED', 'servicing', 'Servicing owner assigned', 'Boarding', 'portfolio_manager', 'boarded_loan_record', 'cr664_portfolioboardedloan', 'No servicing owner has been assigned on this deal\'s boarded-loan record.'),
];

/**
 * Governance initiative (2026-07-21) — Return/Decline/Withdraw are now LIVE requirements, not
 * placeholders: `src/workflow/loanWorkflowRequirementEngine.ts`'s `deriveTransitionReadiness` checks
 * them for real (delegating to `canonicalStageTransition.ts`'s pure policy, per
 * `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` §3.2-3.4/§10). The reason facts below are
 * genuinely checkable today (the caller supplies the reason text directly — no missing Dataverse
 * record blocks them), so they are authored as real (`tracked: true`) requirements, not `untracked()`
 * placeholders. Both remain `recommended` (visible, non-blocking) via `NON_FORWARD_SEVERITY_OVERRIDE`
 * below — a DECLINE/RETURN is a live, terminal-or-corrective action already; neither item should ever
 * strand it (mirrors `CREDIT_SEVERITY_OVERRIDE`'s established pattern above):
 *
 *   - `RETURN:authorization` remains `untracked` — this app deliberately has no authorization tier
 *     beyond identity resolution, and the contract's §5 explicitly rules out inventing one for this
 *     initiative ("out of scope... left for a future, separately-ratified revision"). This is a
 *     ratified design decision, not a missing-infrastructure gap (see Final LOS Completion arc
 *     Workstream J's disposition in docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md).
 *   - `DECLINE:adverse_action` is flipped `tracked: true` by Final LOS Completion arc Workstream J:
 *     `adverseActionRecordStore.ts` / `submitAdverseActionAction.ts` now provide a real, durable,
 *     deal-scoped Adverse Action Record (`cr664_adverseactionrecord`, see
 *     scripts/schema-migrations/final-arc-adverse-action-record/), evaluated via
 *     `evaluateAdverseActionReadiness` in `adverseActionRecordTypes.ts` and wired into
 *     `deriveTransitionReadiness` below.
 */
const NON_FORWARD_SEVERITY_OVERRIDE: Readonly<Record<string, RequirementSeverity>> = Object.freeze({
  'RETURN:authorization': 'recommended',
  'DECLINE:adverse_action': 'recommended',
});

function checkableNonForward(
  id: string,
  scope: RequirementScope,
  category: RequirementCategory,
  label: string,
  resolverSurface: ResolverSurface,
  responsibleRole: ResponsibleRole,
): CanonicalRequirement {
  return {
    id,
    scope,
    label,
    description: `${label} — governed action requirement.`,
    category,
    severity: 'blocking',
    resolverSurface,
    responsibleRole,
    backingType: 'review_record',
    tracked: true,
    matchMode: 'typed',
    uiCopy: label,
    blockerReason: `${label} is required.`,
  };
}

const NON_FORWARD_REQUIREMENTS: readonly CanonicalRequirement[] = [
  checkableNonForward('RETURN:reason', 'RETURN', 'task', 'Return reason', 'Tasks', 'banker'),
  { ...untracked('RETURN:authorization', 'RETURN', 'task', 'Authorized actor for return', 'Tasks', 'banker', 'review_record', 'no return-authorization tier beyond identity resolution exists yet (governance contract §5)'), severity: NON_FORWARD_SEVERITY_OVERRIDE['RETURN:authorization'] },
  checkableNonForward('DECLINE:reason', 'DECLINE', 'adverse_action', 'Decline reason code', 'Approval', 'credit_officer'),
  { ...tracked('DECLINE:adverse_action', 'DECLINE', 'adverse_action', 'Adverse-action documentation recorded', 'Approval', 'credit_officer', 'review_record', 'cr664_adverseactionrecord', 'The adverse-action notification/documentation obligation for this decline has not been recorded.'), severity: NON_FORWARD_SEVERITY_OVERRIDE['DECLINE:adverse_action'] },
  checkableNonForward('WITHDRAW:reason', 'WITHDRAW', 'task', 'Withdrawal reason', 'Tasks', 'banker'),
];

/** The full canonical requirement registry (shallow derived + deep authored + non-forward placeholders). */
export const LOAN_WORKFLOW_REQUIREMENTS: readonly CanonicalRequirement[] = Object.freeze([
  ...LOAN_WORKFLOW_STAGES.flatMap(deriveShallowRequirements),
  ...DEEP_REQUIREMENTS,
  ...NON_FORWARD_REQUIREMENTS,
]);

const BY_SCOPE = new Map<RequirementScope, CanonicalRequirement[]>();
for (const req of LOAN_WORKFLOW_REQUIREMENTS) {
  const list = BY_SCOPE.get(req.scope) ?? [];
  list.push(req);
  BY_SCOPE.set(req.scope, list);
}

const BY_SHALLOW_KEY = new Map<string, CanonicalRequirement>();
for (const req of LOAN_WORKFLOW_REQUIREMENTS) {
  if (req.tracked) BY_SHALLOW_KEY.set(req.id, req);
}

/** All requirements gating a given scope (stage exit or non-forward action). */
export function requirementsForScope(scope: RequirementScope): readonly CanonicalRequirement[] {
  return BY_SCOPE.get(scope) ?? [];
}

/** The registry metadata for a derived (tracked) stage-def requirement, by scope/category/rawId. */
export function shallowRequirementMeta(
  scope: RequirementScope,
  category: RequirementCategory,
  rawId: string,
): CanonicalRequirement | undefined {
  return BY_SHALLOW_KEY.get(shallowRequirementId(scope, category, rawId));
}

/** The authored deep (not-yet-tracked) requirements for a scope. */
export function untrackedRequirementsForScope(scope: RequirementScope): readonly CanonicalRequirement[] {
  return requirementsForScope(scope).filter((r) => !r.tracked);
}

const DEEP_IDS = new Set(DEEP_REQUIREMENTS.map((r) => r.id));

/** True for an authored DEEP requirement (risk rating, approval, closing, boarding, …) — not a stage-def shallow fact. */
export function isAuthoredDeepRequirement(id: string): boolean {
  return DEEP_IDS.has(id);
}

/**
 * The authored DEEP requirements gating a stage exit (risk rating, approval, closing/funding, boarding).
 * Enumerated independently of `tracked` so the engine evaluates each via its model when a fact flips
 * tracked, and fails closed as untracked/future while it is not.
 */
export function authoredDeepRequirementsForScope(scope: RequirementScope): readonly CanonicalRequirement[] {
  return DEEP_REQUIREMENTS.filter((r) => r.scope === scope);
}
