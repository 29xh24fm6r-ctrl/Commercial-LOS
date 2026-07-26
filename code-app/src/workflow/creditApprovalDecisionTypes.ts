/**
 * Final LOS Completion arc — Workstream C. Durable Credit Approval Decision record.
 *
 * Closes the CREDIT_APPROVAL:approval_decision / :approval_authority / :approval_conditions
 * untracked() gaps in loanWorkflowRequirementRegistry.ts — until now a credit-approval "decision"
 * was only ever a stage transition (CREDIT_APPROVAL -> COMMITMENT), gated by
 * evaluateCreditApprovalAuthority() but never persisted as its own record with amount, product,
 * term, pricing, collateral, conditions, authority tier, or rationale. This is that record.
 *
 * Statuses form the arc's specified lifecycle. DRAFT/SUBMITTED are request-side (a banker asks for
 * approval); RETURNED/APPROVED/APPROVED_WITH_CONDITIONS/DECLINED are decision-side (a distinct,
 * authorized credit-authority holder decides); REVOKED/SUPERSEDED handle a later correction without
 * ever mutating or deleting the original row (append-only history, same discipline as
 * fundingAuthorizationTypes.ts / closingDocumentTypes.ts).
 */

export type CreditApprovalDecisionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'RETURNED'
  | 'APPROVED'
  | 'APPROVED_WITH_CONDITIONS'
  | 'DECLINED'
  | 'REVOKED'
  | 'SUPERSEDED';

export const CREDIT_APPROVAL_DECISION_STATUSES: readonly CreditApprovalDecisionStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'RETURNED',
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'DECLINED',
  'REVOKED',
  'SUPERSEDED',
];

/** A status a credit-authority holder can affirmatively DECIDE (as opposed to request/administer). */
export const DECISION_STATUSES: ReadonlySet<CreditApprovalDecisionStatus> = new Set([
  'RETURNED',
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'DECLINED',
]);

export interface CreditApprovalDecisionRecord {
  readonly decisionId: string;
  readonly dealId: string;
  readonly status: CreditApprovalDecisionStatus;
  readonly approvedAmount: number | undefined;
  readonly approvedProduct: string | undefined;
  readonly approvedTermMonths: number | undefined;
  readonly approvedPricing: string | undefined;
  readonly collateralSummary: string | undefined;
  /** Conditions of approval — one item per line/condition, never fabricated (empty = no conditions
   *  attached, distinct from undefined = not yet known). */
  readonly conditions: readonly string[];
  /** The authority basis the decision was made under — e.g. "individual", "committee",
   *  "override" — echoing evaluateCreditApprovalAuthority()'s own reasoning, recorded durably. */
  readonly authorityTier: string | undefined;
  /** REQUIRED on every decision-side status (RETURNED/APPROVED/APPROVED_WITH_CONDITIONS/DECLINED) —
   *  a blank rationale is denied by submitCreditApprovalDecision() before any write is attempted. */
  readonly rationale: string;
  readonly requestedByActorEmail: string;
  readonly requestedAtIso: string;
  readonly decidedByActorEmail: string | undefined;
  readonly decidedAtIso: string | undefined;
  readonly correlationId: string;
  readonly supersedesDecisionId: string | undefined;
}

export interface CreditApprovalDeepFactReadiness {
  readonly met: boolean;
  /** Policy-safe reason when not met (empty when met). */
  readonly reason: string;
}

export interface CreditApprovalDecisionReadiness {
  /** CREDIT_APPROVAL:approval_decision — a durable APPROVED/APPROVED_WITH_CONDITIONS decision exists
   *  for this exact deal. */
  readonly decisionRecorded: CreditApprovalDeepFactReadiness;
  /** CREDIT_APPROVAL:approval_authority — the recorded decision carries a non-blank authority tier
   *  (individual/committee/override), proving the authority computation actually ran and was
   *  captured, not merely that some record exists. */
  readonly authorityRecorded: CreditApprovalDeepFactReadiness;
  /** CREDIT_APPROVAL:approval_conditions — the recorded decision's conditions field is present
   *  (even an explicit empty array is an honest "no conditions attached" answer; what fails this is
   *  no decision at all, never a fabricated non-empty list). */
  readonly conditionsDocumented: CreditApprovalDeepFactReadiness;
  /** The record these three readiness checks were derived from, if any (for downstream display). */
  readonly currentDecision: CreditApprovalDecisionRecord | undefined;
}

const NOT_MET: CreditApprovalDeepFactReadiness = {
  met: false,
  reason: 'No approved credit approval decision has been recorded for this deal.',
};

/**
 * Fail-closed Credit Approval decision readiness (Final LOS Completion arc, Workstream C/K). Never
 * fabricates a decision: an empty list, a deal-id mismatch, or a decision whose status is not an
 * affirmative approval (DECLINED/RETURNED/DRAFT/SUBMITTED/REVOKED/SUPERSEDED) all fail closed as
 * not-met. Picks the most recently decided affirmative record scoped to `expectedDealId` — matches
 * the append-only, deal-scoped discipline every other deep fact in this codebase uses
 * (evaluateRiskRatingReadiness / evaluateUnderwritingRecommendationReadiness).
 */
export function evaluateCreditApprovalDecisionReadiness(
  decisions: readonly CreditApprovalDecisionRecord[] | undefined,
  expectedDealId: string,
): CreditApprovalDecisionReadiness {
  const forDeal = (decisions ?? []).filter(
    (d) => d.dealId === expectedDealId && (d.status === 'APPROVED' || d.status === 'APPROVED_WITH_CONDITIONS'),
  );
  const current = [...forDeal].sort((a, b) => (b.decidedAtIso ?? '').localeCompare(a.decidedAtIso ?? ''))[0];

  if (!current) {
    return {
      decisionRecorded: NOT_MET,
      authorityRecorded: NOT_MET,
      conditionsDocumented: NOT_MET,
      currentDecision: undefined,
    };
  }

  const authorityRecorded: CreditApprovalDeepFactReadiness =
    current.authorityTier && current.authorityTier.trim().length > 0
      ? { met: true, reason: '' }
      : { met: false, reason: 'The recorded credit approval decision has no authority tier recorded.' };

  return {
    decisionRecorded: { met: true, reason: '' },
    authorityRecorded,
    // The `conditions` field is always an array (possibly empty) on a durably-written record — its
    // presence, not its length, is what "documented" means here.
    conditionsDocumented: { met: true, reason: '' },
    currentDecision: current,
  };
}
