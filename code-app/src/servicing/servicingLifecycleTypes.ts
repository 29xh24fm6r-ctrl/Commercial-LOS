/**
 * Phase 142E — Servicing / lifecycle model types.
 *
 * A governed, READ-ONLY, metadata/deriver-driven model of a commercial loan's
 * post-origination lifecycle (Frappe-Lending-inspired). Servicing output is
 * operational decision support only — it posts no transactions, books no loans,
 * moves no money, mutates no schedules/records, creates no tasks, and writes
 * nothing. Missing data stays missing; no balances/payments are fabricated.
 */

export type ServicingLifecycleStage =
  | 'originated_not_booked'
  | 'boarding_in_progress'
  | 'boarded_pending_verification'
  | 'booked_active'
  | 'funding_or_disbursement_pending'
  | 'active_monitoring'
  | 'annual_review_due'
  | 'covenant_exception_monitoring'
  | 'servicing_exception_remediation'
  | 'renewal_or_maturity_review'
  | 'payoff_or_exit_review'
  | 'closed_or_inactive'
  | 'unknown_review_required';

export type ServicingLifecycleStatus =
  | 'healthy'
  | 'healthy_with_caveats'
  | 'attention_required'
  | 'blocked_missing_data'
  | 'blocked_missing_evidence'
  | 'exception_active'
  | 'review_required'
  | 'disabled_not_configured';

export type ServicingObligationCategory =
  | 'financial_reporting'
  | 'tax_return_delivery'
  | 'covenant_compliance'
  | 'insurance_renewal'
  | 'collateral_monitoring'
  | 'borrowing_base_reporting'
  | 'annual_review'
  | 'tickler_follow_up'
  | 'maturity_review'
  | 'renewal_review'
  | 'exception_remediation'
  | 'fdic_exam_support'
  | 'board_package_follow_up';

export type ServicingObligationStatus =
  | 'satisfied'
  | 'due_soon'
  | 'overdue'
  | 'missing_evidence'
  | 'unknown_missing_data'
  | 'review_required'
  | 'not_applicable';

export interface ServicingLifecycleBlocker {
  code: string;
  message: string;
  severity?: 'low' | 'medium' | 'high';
}
export interface ServicingLifecycleWarning {
  code: string;
  message: string;
}
export interface ServicingLifecycleNextAction {
  code: string;
  label: string;
}

export interface ServicingLifecycleMilestone {
  milestoneKey: string;
  label: string;
  status: 'candidate_complete' | 'pending' | 'blocked' | 'not_applicable';
  date?: string;
}

export interface ServicingLifecycleObligation {
  obligationId: string;
  category: ServicingObligationCategory;
  label: string;
  source: 'template_guidance' | 'live_evidence' | 'covenant_definition' | 'annual_review';
  dueDate?: string;
  frequency?: string;
  status: ServicingObligationStatus;
  evidenceRequired: boolean;
  evidencePresent: boolean;
  sourceDocumentIds: readonly string[];
  sourceTemplateKeys: readonly string[];
  blockers: readonly ServicingLifecycleBlocker[];
  warnings: readonly ServicingLifecycleWarning[];
}

export interface ServicingComponentResult<S extends string> {
  status: S;
  blockers: readonly ServicingLifecycleBlocker[];
  warnings: readonly ServicingLifecycleWarning[];
  nextBestAction: ServicingLifecycleNextAction;
}

export type ServicingCollateralStatusValue =
  | 'complete' | 'complete_with_caveats' | 'missing_evidence' | 'exception_active'
  | 'unknown_missing_data' | 'not_applicable' | 'review_required';
export interface ServicingCollateralSecurityStatus extends ServicingComponentResult<ServicingCollateralStatusValue> {
  collateralItems: readonly { collateralId: string; type?: string; perfected?: boolean }[];
  evidenceCoverage: number;
  missingEvidence: readonly string[];
  exceptions: readonly string[];
}

export type ServicingInsuranceStatusValue =
  | 'complete' | 'expired' | 'missing_evidence' | 'review_required' | 'unknown_missing_data' | 'not_applicable';
export interface ServicingInsuranceStatus extends ServicingComponentResult<ServicingInsuranceStatusValue> {
  missingEvidence: readonly string[];
}

export type ServicingTicklerStatusValue =
  | 'current' | 'attention_required' | 'overdue' | 'unknown_missing_data' | 'not_applicable';
export interface ServicingTicklerStatus extends ServicingComponentResult<ServicingTicklerStatusValue> {
  overdueTicklers: readonly string[];
}

export type ServicingCovenantReportingStatusValue =
  | 'healthy' | 'attention_required' | 'exception_active' | 'review_required' | 'missing_evidence' | 'unknown_missing_data';
export interface ServicingCovenantReportingStatus extends ServicingComponentResult<ServicingCovenantReportingStatusValue> {
  failingCovenants: readonly string[];
  unknownCovenants: readonly string[];
}

export type ServicingMaturityRenewalStatusValue =
  | 'active' | 'renewal_or_maturity_review' | 'attention_required' | 'payoff_or_exit_review' | 'unknown_missing_data' | 'not_applicable';
export interface ServicingMaturityRenewalStatus extends ServicingComponentResult<ServicingMaturityRenewalStatusValue> {
  maturityDate?: string;
  daysToMaturity?: number;
}

export type ServicingExceptionStatusValue = 'none' | 'exception_active' | 'resolved' | 'unknown';
export interface ServicingExceptionStatus extends ServicingComponentResult<ServicingExceptionStatusValue> {
  openExceptions: readonly string[];
}

export type ServicingOwnershipTransferStatusValue = 'no_transfer' | 'transfer_pending' | 'unknown' | 'not_applicable';
export interface ServicingOwnershipTransferStatus extends ServicingComponentResult<ServicingOwnershipTransferStatusValue> {
  servicingOwner?: string;
}

export interface ServicingLifecycleReadiness {
  status: ServicingLifecycleStatus;
  blockers: readonly ServicingLifecycleBlocker[];
  warnings: readonly ServicingLifecycleWarning[];
}

export interface ServicingLifecycleHealth {
  status: ServicingLifecycleStatus;
  summary: string;
}

export interface ServicingLifecycleAuditSummary {
  lifecycleId: string;
  evidenceDocumentIds: readonly string[];
  /** STRUCTURAL guarantees. */
  containsFakeBalance: false;
  containsPaymentPosting: false;
  readOnly: true;
}

export interface ServicingLifecycleInput {
  lifecycleId: string;
  sourceLoanId?: string;
  sourceDealId?: string;
  boardedLoanId?: string;
  borrowerName?: string;
  boardedLoan?: { exists?: boolean; verified?: boolean };
  boardingReadiness?: 'complete' | 'incomplete' | 'unknown';
  annualReviewDueStatus?: 'not_due' | 'due' | 'past_due' | 'unknown';
  covenantExceptionActive?: boolean;
  servicingExceptionActive?: boolean;
  maturityDate?: string;
  payoffContext?: boolean;
  closedOrInactive?: boolean;
  asOfDate?: string | Date;
}

export interface ServicingLifecycleSnapshot {
  lifecycleId: string;
  sourceLoanId?: string;
  sourceDealId?: string;
  boardedLoanId?: string;
  borrowerName?: string;
  lifecycleStage: ServicingLifecycleStage;
  lifecycleStatus: ServicingLifecycleStatus;
  milestones: readonly ServicingLifecycleMilestone[];
  obligations: readonly ServicingLifecycleObligation[];
  readiness: ServicingLifecycleReadiness;
  health: ServicingLifecycleHealth;
  collateralSecurityStatus: ServicingCollateralSecurityStatus;
  insuranceStatus: ServicingInsuranceStatus;
  ticklerStatus: ServicingTicklerStatus;
  covenantReportingStatus: ServicingCovenantReportingStatus;
  maturityRenewalStatus: ServicingMaturityRenewalStatus;
  exceptionStatus: ServicingExceptionStatus;
  ownershipTransferStatus: ServicingOwnershipTransferStatus;
  blockers: readonly ServicingLifecycleBlocker[];
  warnings: readonly ServicingLifecycleWarning[];
  nextBestActions: readonly ServicingLifecycleNextAction[];
  auditSummary: ServicingLifecycleAuditSummary;
}

export const SERVICING_MATURITY_WINDOW_DAYS = 90;
