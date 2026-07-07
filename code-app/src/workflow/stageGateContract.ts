/**
 * Stage Advancement - per-stage exit gate contract (Phase 3).
 *
 * The nCino discipline: a deal advances only when the CURRENT stage's exit criteria are all met.
 * Each criterion is a pure, FAIL-CLOSED predicate over facts the system already tracks. Facts are
 * supplied structurally (`StageGateFacts`) so this module stays decoupled from the heavy deal
 * queries and trivially testable. A fact that is:
 *   - `true`      -> requirement met,
 *   - `false`     -> requirement outstanding (tracked, not yet satisfied),
 *   - `undefined` -> requirement NOT met and surfaced honestly as "not yet tracked" - never
 *                    auto-passed. Where the backing field does not yet exist in the schema, the
 *                    requirement reads not-tracked rather than fabricating a pass.
 *
 * OGB correction, 2026-06-30: the complete loan package, including a complete credit memo, gates
 * entry into Underwriting. Underwriting reviews the completed package; it does not build the memo.
 *
 * The CREDIT_APPROVAL authority check is supplied as the `approvalAuthoritySufficient` fact, which
 * the approval-authority policy (Phase 6) computes from the approval record.
 */

import type { CanonicalStageCode } from './stageOrderingContract';

export interface StageGateRequirement {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
  readonly detail: string;
  /**
   * True when the requirement is backed by a fact the system genuinely TRACKS
   * (the fact is present — whether satisfied or outstanding). False when the fact
   * is not tracked in the current schema (absent) OR the backing system is not yet
   * implemented (a `pendingDetail` placeholder such as the risk-rating gate). An
   * untracked requirement can never be certified as satisfiable from live data —
   * WFLOW-G surfaces these as certification blockers instead of silently passing.
   */
  readonly tracked: boolean;
}

export interface StageGateResult {
  readonly stage: CanonicalStageCode;
  readonly satisfied: boolean;
  readonly requirements: readonly StageGateRequirement[];
}

/**
 * Already-tracked (or not-yet-tracked) facts behind each stage's exit gate. Every field is optional;
 * an absent field is treated as not-yet-tracked -> fail-closed.
 */
export interface StageGateFacts {
  // INTAKE
  readonly borrowerPresent?: boolean;
  readonly loanAmountPresent?: boolean;
  readonly productTypePresent?: boolean;
  readonly assignedBankerPresent?: boolean;
  readonly intakeChecklistGenerated?: boolean;
  readonly completeCreditMemoPresent?: boolean;
  readonly loanApplicationReceived?: boolean;
  readonly businessFinancialStatementsReceived?: boolean;
  readonly taxReturnsReceived?: boolean;
  readonly ownershipInformationReceived?: boolean;
  readonly collateralSupportReceived?: boolean;
  // UNDERWRITING
  readonly underwritingReviewCompleted?: boolean;
  readonly riskRatingAssigned?: boolean;
  readonly underwritingRecommendationRecorded?: boolean;
  // CREDIT_APPROVAL
  readonly creditMemoFinalized?: boolean;
  readonly approvalDecisionRecorded?: boolean;
  /** Computed by the approval-authority policy (Phase 6) from the approval record. */
  readonly approvalAuthoritySufficient?: boolean;
  readonly approvalConditionsDocumented?: boolean;
  // COMMITMENT
  readonly commitmentIssued?: boolean;
  readonly borrowerAcceptanceRecorded?: boolean;
  // DOCUMENTATION
  readonly approvalConditionsCleared?: boolean;
  readonly closingDocumentsPrepared?: boolean;
  readonly collateralVerified?: boolean;
  readonly insuranceVerified?: boolean;
  // CLOSING_FUNDING
  readonly loanDocumentsExecuted?: boolean;
  readonly fundsDisbursed?: boolean;
  // BOARDED (terminal success - reuse the portfolio-boarding completion signal)
  readonly boardingCompleted?: boolean;
}

type FactSelector = (f: StageGateFacts) => boolean | undefined;

interface RequirementDef {
  readonly id: string;
  readonly label: string;
  readonly select: FactSelector;
  readonly pendingDetail?: string;
}

const GATE_DEFS: Record<CanonicalStageCode, readonly RequirementDef[]> = {
  INTAKE: [
    { id: 'intake.borrower', label: 'Borrower identified', select: (f) => f.borrowerPresent },
    { id: 'intake.amount', label: 'Loan amount captured', select: (f) => f.loanAmountPresent },
    { id: 'intake.product', label: 'Product type selected', select: (f) => f.productTypePresent },
    { id: 'intake.banker', label: 'Assigned banker set', select: (f) => f.assignedBankerPresent },
    { id: 'intake.checklist', label: 'Initial document checklist generated', select: (f) => f.intakeChecklistGenerated },
    { id: 'intake.memo-complete', label: 'Complete credit memo present', select: (f) => f.completeCreditMemoPresent },
    { id: 'intake.loan-application', label: 'Loan application received', select: (f) => f.loanApplicationReceived },
    {
      id: 'intake.business-financials',
      label: 'Business financial statements received',
      select: (f) => f.businessFinancialStatementsReceived,
    },
    { id: 'intake.tax-returns', label: 'Tax returns received', select: (f) => f.taxReturnsReceived },
    { id: 'intake.ownership', label: 'Ownership information received', select: (f) => f.ownershipInformationReceived },
    { id: 'intake.collateral-support', label: 'Collateral support received', select: (f) => f.collateralSupportReceived },
  ],
  UNDERWRITING: [
    { id: 'uw.review-complete', label: 'Underwriting review completed', select: (f) => f.underwritingReviewCompleted },
    {
      id: 'uw.risk-rating',
      label: 'Risk rating assigned',
      select: () => false,
      pendingDetail: 'risk rating system not yet implemented',
    },
    {
      id: 'uw.recommendation',
      label: 'Underwriting recommendation recorded',
      select: (f) => f.underwritingRecommendationRecorded,
    },
  ],
  CREDIT_APPROVAL: [
    { id: 'ca.memo-final', label: 'Credit memo finalized', select: (f) => f.creditMemoFinalized },
    { id: 'ca.decision', label: 'Approval decision recorded', select: (f) => f.approvalDecisionRecorded },
    { id: 'ca.authority', label: 'Authorized approver recorded approval', select: (f) => f.approvalAuthoritySufficient },
    { id: 'ca.conditions', label: 'Conditions of approval documented', select: (f) => f.approvalConditionsDocumented },
  ],
  COMMITMENT: [
    { id: 'commit.issued', label: 'Commitment / term sheet issued', select: (f) => f.commitmentIssued },
    { id: 'commit.acceptance', label: 'Borrower acceptance recorded', select: (f) => f.borrowerAcceptanceRecorded },
  ],
  DOCUMENTATION: [
    { id: 'doc.conditions-cleared', label: 'All approval conditions cleared', select: (f) => f.approvalConditionsCleared },
    { id: 'doc.closing-docs', label: 'Closing documents prepared', select: (f) => f.closingDocumentsPrepared },
    { id: 'doc.collateral', label: 'Collateral verified', select: (f) => f.collateralVerified },
    { id: 'doc.insurance', label: 'Insurance verified', select: (f) => f.insuranceVerified },
  ],
  CLOSING_FUNDING: [
    { id: 'close.executed', label: 'Loan documents executed', select: (f) => f.loanDocumentsExecuted },
    { id: 'close.disbursed', label: 'Funds disbursed', select: (f) => f.fundsDisbursed },
  ],
  BOARDED: [
    { id: 'boarded.completed', label: 'Loan boarded to servicing', select: (f) => f.boardingCompleted },
  ],
};

function evaluateRequirement(def: RequirementDef, facts: StageGateFacts): StageGateRequirement {
  const value = def.select(facts);
  const met = value === true;
  // A requirement is TRACKED only when the fact is present (true/false) AND the
  // backing system exists (no pendingDetail placeholder). A `pendingDetail` def
  // (e.g. risk rating "system not yet implemented") is not-tracked even though its
  // selector returns a concrete false.
  const tracked = def.pendingDetail === undefined && value !== undefined;
  const detail = def.pendingDetail
    ? def.pendingDetail
    : value === true
      ? 'Met.'
      : value === false
        ? 'Outstanding - tracked but not yet satisfied.'
        : 'Not yet tracked in the current schema - treated as not met (fail-closed).';
  return { id: def.id, label: def.label, met, detail, tracked };
}

/**
 * Evaluate a stage's exit gate. `satisfied` is true ONLY when every requirement is met; an empty
 * requirement set is never "satisfied".
 */
export function evaluateExitGate(stage: CanonicalStageCode, facts: StageGateFacts): StageGateResult {
  const requirements = GATE_DEFS[stage].map((def) => evaluateRequirement(def, facts));
  const satisfied = requirements.length > 0 && requirements.every((r) => r.met);
  return { stage, satisfied, requirements };
}

/** Outstanding (not-met) requirements for a stage - what's blocking the next move. */
export function outstandingRequirements(result: StageGateResult): readonly StageGateRequirement[] {
  return result.requirements.filter((r) => !r.met);
}

/** Requirement ids whose backing fact is not yet tracked - candidate schema follow-ups. */
export function untrackedRequirementIds(stage: CanonicalStageCode, facts: StageGateFacts): readonly string[] {
  return GATE_DEFS[stage].filter((def) => def.select(facts) === undefined).map((def) => def.id);
}
