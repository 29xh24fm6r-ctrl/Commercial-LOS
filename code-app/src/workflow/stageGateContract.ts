/**
 * Stage Advancement — per-stage exit gate contract (Phase 3).
 *
 * The nCino discipline: a deal advances only when the CURRENT stage's exit criteria are all met.
 * Each criterion is a pure, FAIL-CLOSED predicate over facts the system already tracks. Facts are
 * supplied structurally (`StageGateFacts`) so this module stays decoupled from the heavy deal
 * queries and trivially testable. A fact that is:
 *   - `true`      → requirement met,
 *   - `false`     → requirement outstanding (tracked, not yet satisfied),
 *   - `undefined` → requirement NOT met and surfaced honestly as "not yet tracked" — never
 *                   auto-passed. Where the backing field does not yet exist in the schema, the
 *                   requirement reads not-tracked rather than fabricating a pass.
 *
 * The CREDIT_APPROVAL authority check is supplied as the `approvalAuthoritySufficient` fact, which
 * the approval-authority matrix (Phase 6) computes from the approval record + loan amount.
 */

import type { CanonicalStageCode } from './stageOrderingContract';

export interface StageGateRequirement {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
  readonly detail: string;
}

export interface StageGateResult {
  readonly stage: CanonicalStageCode;
  readonly satisfied: boolean;
  readonly requirements: readonly StageGateRequirement[];
}

/**
 * Already-tracked (or not-yet-tracked) facts behind each stage's exit gate. Every field is optional;
 * an absent field is treated as not-yet-tracked → fail-closed.
 */
export interface StageGateFacts {
  // INTAKE
  readonly borrowerPresent?: boolean;
  readonly loanAmountPresent?: boolean;
  readonly productTypePresent?: boolean;
  readonly assignedBankerPresent?: boolean;
  readonly intakeChecklistGenerated?: boolean;
  // UNDERWRITING
  readonly requiredDocumentsReceived?: boolean;
  readonly creditMemoDraftExists?: boolean;
  readonly riskRatingAssigned?: boolean;
  // CREDIT_APPROVAL
  readonly creditMemoFinalized?: boolean;
  readonly approvalDecisionRecorded?: boolean;
  /** Computed by the approval-authority matrix (Phase 6) from the approval record + loan amount. */
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
  // BOARDED (terminal success — reuse the portfolio-boarding completion signal)
  readonly boardingCompleted?: boolean;
}

type FactSelector = (f: StageGateFacts) => boolean | undefined;

interface RequirementDef {
  readonly id: string;
  readonly label: string;
  readonly select: FactSelector;
}

const GATE_DEFS: Record<CanonicalStageCode, readonly RequirementDef[]> = {
  INTAKE: [
    { id: 'intake.borrower', label: 'Borrower identified', select: (f) => f.borrowerPresent },
    { id: 'intake.amount', label: 'Loan amount captured', select: (f) => f.loanAmountPresent },
    { id: 'intake.product', label: 'Product type selected', select: (f) => f.productTypePresent },
    { id: 'intake.banker', label: 'Assigned banker set', select: (f) => f.assignedBankerPresent },
    { id: 'intake.checklist', label: 'Initial document checklist generated', select: (f) => f.intakeChecklistGenerated },
  ],
  UNDERWRITING: [
    { id: 'uw.documents', label: 'Required financial documents received', select: (f) => f.requiredDocumentsReceived },
    { id: 'uw.memo-draft', label: 'Credit memo drafted', select: (f) => f.creditMemoDraftExists },
    { id: 'uw.risk-rating', label: 'Risk rating assigned', select: (f) => f.riskRatingAssigned },
  ],
  CREDIT_APPROVAL: [
    { id: 'ca.memo-final', label: 'Credit memo finalized', select: (f) => f.creditMemoFinalized },
    { id: 'ca.decision', label: 'Approval decision recorded', select: (f) => f.approvalDecisionRecorded },
    { id: 'ca.authority', label: 'Approver authority covers the loan amount', select: (f) => f.approvalAuthoritySufficient },
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
  const detail =
    value === true
      ? 'Met.'
      : value === false
        ? 'Outstanding — tracked but not yet satisfied.'
        : 'Not yet tracked in the current schema — treated as not met (fail-closed).';
  return { id: def.id, label: def.label, met, detail };
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

/** Outstanding (not-met) requirements for a stage — what's blocking the next move. */
export function outstandingRequirements(result: StageGateResult): readonly StageGateRequirement[] {
  return result.requirements.filter((r) => !r.met);
}

/** Requirement ids whose backing fact is not yet tracked — candidate schema follow-ups. */
export function untrackedRequirementIds(stage: CanonicalStageCode, facts: StageGateFacts): readonly string[] {
  return GATE_DEFS[stage].filter((def) => def.select(facts) === undefined).map((def) => def.id);
}
