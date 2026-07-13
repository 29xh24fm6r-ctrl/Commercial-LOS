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
 * DEEP facts, authored as untracked-blocking until their major ARC PR wires the backing record.
 * These are the facts that make each transition genuinely governed (per the truth matrix). They do
 * NOT attach to INTAKE, so Intake → Underwriting stays behavior-compatible with the current live gate.
 */
const DEEP_REQUIREMENTS: readonly CanonicalRequirement[] = [
  // Underwriting → Credit Approval (ARC Phase 3): the evaluation models are READY
  // (src/workflow/underwritingDeepFacts.ts) but no deal-scoped record exists in Dataverse yet, so these
  // stay untracked/future (fail-closed) until a maker adds the backing + a loader supplies the fact.
  untracked('UNDERWRITING:risk_rating', 'UNDERWRITING', 'credit', 'Risk rating assigned', 'Credit Memo', 'underwriter', 'risk_rating_record', 'risk-rating model ready (underwritingDeepFacts.ts); needs a deal-scoped cr664 risk-rating record + loader (the cr664_RiskLevelReference lookup has no generated reference table today)'),
  untracked('UNDERWRITING:uw_recommendation', 'UNDERWRITING', 'credit', 'Underwriting recommendation recorded', 'Credit Memo', 'underwriter', 'review_record', 'recommendation model ready (underwritingDeepFacts.ts); needs a cr664 underwriting-recommendation field/record (approve/approve-with-conditions/decline/return) + loader'),
  // Credit Approval → Commitment (ARC PR 8/9)
  untracked('CREDIT_APPROVAL:memo_finalized', 'CREDIT_APPROVAL', 'credit', 'Credit memo finalized', 'Credit Memo', 'credit_officer', 'memo_status', 'credit memo lifecycle status not yet implemented (ARC PR 8)'),
  untracked('CREDIT_APPROVAL:approval_decision', 'CREDIT_APPROVAL', 'approval', 'Approval decision recorded', 'Approval', 'approver', 'approval_record', 'approval decision record not yet implemented (ARC PR 9)'),
  untracked('CREDIT_APPROVAL:approval_authority', 'CREDIT_APPROVAL', 'approval', 'Authorized approver / committee approval', 'Approval', 'approver', 'approval_record', 'approval authority computation not yet implemented (ARC PR 9)'),
  untracked('CREDIT_APPROVAL:approval_conditions', 'CREDIT_APPROVAL', 'approval', 'Conditions of approval documented', 'Approval', 'credit_officer', 'condition_record', 'approval conditions record not yet implemented (ARC PR 9)'),
  // Commitment → Documentation (ARC PR 13)
  untracked('COMMITMENT:commitment_issued', 'COMMITMENT', 'closing', 'Commitment / term sheet issued', 'Commitment', 'loan_ops', 'review_record', 'commitment issuance record not yet implemented (ARC PR 13)'),
  untracked('COMMITMENT:borrower_acceptance', 'COMMITMENT', 'closing', 'Borrower acceptance recorded', 'Commitment', 'banker', 'review_record', 'borrower acceptance record not yet implemented (ARC PR 13)'),
  // Documentation → Closing & Funding (ARC PR 14)
  untracked('DOCUMENTATION:conditions_precedent', 'DOCUMENTATION', 'closing', 'Conditions precedent cleared', 'Documentation', 'loan_ops', 'condition_record', 'conditions-precedent records not yet implemented (ARC PR 14)'),
  untracked('DOCUMENTATION:collateral_verified', 'DOCUMENTATION', 'closing', 'Collateral verified', 'Documentation', 'closer', 'condition_record', 'collateral verification record not yet implemented (ARC PR 14)'),
  untracked('DOCUMENTATION:insurance_verified', 'DOCUMENTATION', 'closing', 'Insurance verified', 'Documentation', 'closer', 'condition_record', 'insurance verification record not yet implemented (ARC PR 14)'),
  // Closing & Funding → Boarded (ARC PR 15)
  untracked('CLOSING_FUNDING:executed_docs', 'CLOSING_FUNDING', 'closing', 'Loan documents executed', 'Closing', 'closer', 'closing_record', 'executed-documents record not yet implemented (ARC PR 15)'),
  untracked('CLOSING_FUNDING:funds_disbursed', 'CLOSING_FUNDING', 'funding', 'Funds disbursed', 'Funding', 'loan_ops', 'funding_record', 'funding/disbursement record not yet implemented (ARC PR 15)'),
  untracked('CLOSING_FUNDING:booking_qc', 'CLOSING_FUNDING', 'closing', 'Booking quality control complete', 'Closing', 'loan_ops', 'closing_record', 'booking-QC record not yet implemented (ARC PR 15)'),
  // Boarded / Servicing (ARC PR 16)
  untracked('BOARDED:boarded_loan_record', 'BOARDED', 'boarding', 'Boarded loan / servicing handoff record created', 'Boarding', 'portfolio_manager', 'boarded_loan_record', 'real boarded-loan handoff record not yet the source of truth (ARC PR 16)'),
  untracked('BOARDED:servicing_owner', 'BOARDED', 'servicing', 'Servicing owner assigned', 'Boarding', 'portfolio_manager', 'boarded_loan_record', 'servicing-owner assignment not yet tracked (ARC PR 16)'),
];

/** Non-forward placeholders (governed live paths pending ARC PR 10/11/12). */
const NON_FORWARD_REQUIREMENTS: readonly CanonicalRequirement[] = [
  untracked('RETURN:reason', 'RETURN', 'task', 'Return reason + required remediation items', 'Tasks', 'banker', 'review_record', 'governed Return path not yet live (ARC PR 10)'),
  untracked('RETURN:authorization', 'RETURN', 'task', 'Authorized actor for return', 'Tasks', 'banker', 'review_record', 'governed Return path not yet live (ARC PR 10)'),
  untracked('DECLINE:reason', 'DECLINE', 'adverse_action', 'Decline reason code', 'Approval', 'credit_officer', 'review_record', 'governed Decline path not yet live (ARC PR 11)'),
  untracked('DECLINE:adverse_action', 'DECLINE', 'adverse_action', 'Adverse-action requirement tracked', 'Approval', 'credit_officer', 'review_record', 'adverse-action tracking not yet live (ARC PR 11)'),
  untracked('WITHDRAW:reason', 'WITHDRAW', 'task', 'Withdrawal reason', 'Tasks', 'banker', 'review_record', 'governed Withdraw path not yet live (ARC PR 12)'),
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
