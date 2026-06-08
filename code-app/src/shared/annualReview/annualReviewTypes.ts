/**
 * Phase 141A — Annual Portfolio Review domain model.
 *
 * The governed annual-review operating model: which loans need review, which
 * financials borrowers owe, when they are due, who owns them, whether the
 * borrower responded, and whether the borrower still appears financially sound.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - These are TYPES only. No IO, no fake data.
 *   - Missing means missing: optional fields are genuinely optional and are
 *     never defaulted to a fabricated value.
 *   - Soundness must be evidence-backed — `insufficient_information` when the
 *     financial inputs are absent.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type AnnualReviewLoanStatus =
  | 'active'
  | 'matured'
  | 'renewed'
  | 'paid_off'
  | 'charged_off'
  | 'closed';

export type AnnualReviewDocumentType =
  | 'annual_financial_statements'
  | 'interim_financial_statements'
  | 'tax_returns'
  | 'personal_financial_statement'
  | 'covenant_compliance_certificate'
  | 'borrowing_base_certificate'
  | 'ar_aging'
  | 'ap_aging'
  | 'inventory_report'
  | 'rent_roll'
  | 'insurance_evidence'
  | 'guarantor_financials'
  | 'other';

export type AnnualReviewCycleStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'closed';

export type AnnualReviewStatus =
  | 'not_started'
  | 'financials_requested'
  | 'financials_received'
  | 'in_review'
  | 'completed'
  | 'blocked'
  | 'escalated';

export type AnnualReviewRequirementStatus =
  | 'not_requested'
  | 'requested'
  | 'received'
  | 'reviewed'
  | 'accepted'
  | 'rejected'
  | 'missing'
  | 'stale'
  | 'escalated';

export type AnnualReviewSoundnessStatus =
  | 'sound'
  | 'watch'
  | 'deteriorating'
  | 'insufficient_information';

export type AnnualReviewTrend =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'not_available';

export type AnnualReviewEscalationLevel =
  | 'owner'
  | 'manager'
  | 'portfolio_manager'
  | 'executive'
  | 'board'
  | 'fdic';

export type AnnualReviewSeverity = 'low' | 'medium' | 'high';

export type AnnualReviewTaskType =
  | 'request_financials'
  | 'follow_up_borrower'
  | 'review_received_financials'
  | 'test_covenants'
  | 'review_insurance'
  | 'update_risk_rating'
  | 'complete_review_memo'
  | 'escalate_past_due'
  | 'manager_review'
  | 'board_review';

export type AnnualReviewTaskStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'completed';

// ---------------------------------------------------------------------------
// A. Review cycle
// ---------------------------------------------------------------------------

export interface AnnualReviewCycle {
  cycleId: string;
  reviewYear: number;
  asOfDate: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  status: AnnualReviewCycleStatus;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// B. Loan snapshot
// ---------------------------------------------------------------------------

export interface AnnualReviewSubmittedDocument {
  documentType: AnnualReviewDocumentType;
  status?: AnnualReviewRequirementStatus;
  effectiveDate?: string;
  periodEndDate?: string;
  receivedDate?: string;
  reviewedDate?: string;
  reviewer?: string;
  accepted?: boolean;
  rejectedReason?: string;
}

/** The per-loan context the annual-review engines operate on. */
export interface AnnualReviewLoanSnapshot {
  boardedLoanId?: string;
  originatedDealId?: string;
  loanNumber?: string;
  borrowerName?: string;
  relationshipName?: string;
  currentBalance?: number;
  maturityDate?: string;
  loanStatus?: AnnualReviewLoanStatus;
  riskRating?: string;
  priorRiskRating?: string;
  watchlistFlag?: boolean;
  criticizedClassifiedStatus?: string;
  accrualStatus?: 'accrual' | 'nonaccrual';
  pastDueDays?: number;
  nextReviewDate?: string;
  annualReviewDueDate?: string;
  portfolioManager?: string;
  servicingOwner?: string;
  team?: string;
  source?: 'manual_boarding' | 'originated_closed_deal';
  // Context flags driving requirement applicability.
  hasRealEstateCollateral?: boolean;
  hasGuarantors?: boolean;
  isBorrowingBaseLoan?: boolean;
  hasCovenants?: boolean;
  isSbaLoan?: boolean;
  collateralRequiresInsurance?: boolean;
  // Operational status.
  covenantStatus?: 'in_compliance' | 'breach' | 'waived' | 'not_tested';
  insuranceStatus?: 'current' | 'expired' | 'pending';
  openExceptionCount?: number;
  highSeverityExceptionCount?: number;
  // Borrower contact (for the request package). Never fabricated.
  borrowerContactName?: string;
  borrowerContactEmail?: string;
  // Documents the borrower has submitted this cycle.
  submittedDocuments?: readonly AnnualReviewSubmittedDocument[];
  // Optional financial inputs for soundness (absent → insufficient info).
  financialInputs?: AnnualReviewFinancialInputs;
}

export interface AnnualReviewFinancialInputs {
  revenueTrend?: AnnualReviewTrend;
  profitabilityTrend?: AnnualReviewTrend;
  liquidityTrend?: AnnualReviewTrend;
  leverageTrend?: AnnualReviewTrend;
  debtServiceCoverageTrend?: AnnualReviewTrend;
  collateralCoverageTrend?: AnnualReviewTrend;
  guarantorSupportTrend?: AnnualReviewTrend;
}

// ---------------------------------------------------------------------------
// C. Requirements
// ---------------------------------------------------------------------------

export interface AnnualReviewDocumentRequirement {
  requirementId: string;
  requirementKey: string;
  documentType: AnnualReviewDocumentType;
  label: string;
  requiredFor: string;
  dueDate?: string;
  gracePeriodDays: number;
  owner?: string;
  borrowerContact?: string;
  status: AnnualReviewRequirementStatus;
  receivedDate?: string;
  reviewedDate?: string;
  reviewer?: string;
  accepted?: boolean;
  rejectedReason?: string;
  stale: boolean;
  exceptionId?: string;
  evidenceDocumentId?: string;
}

export interface AnnualReviewBorrowerRequirement {
  borrowerName?: string;
  loanNumber?: string;
  requirements: readonly AnnualReviewDocumentRequirement[];
}

export interface AnnualReviewFinancialStatementRequirement
  extends AnnualReviewDocumentRequirement {
  periodEndDate?: string;
}

export interface AnnualReviewCollectionTask {
  taskId: string;
  loanId?: string;
  borrowerName?: string;
  taskType: AnnualReviewTaskType;
  owner?: string;
  dueDate?: string;
  severity: AnnualReviewSeverity;
  status: AnnualReviewTaskStatus;
  blocker?: string;
  relatedRequirementIds: readonly string[];
  escalationLevel: AnnualReviewEscalationLevel;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface AnnualReviewCovenantCheck {
  status: 'in_compliance' | 'breach' | 'waived' | 'not_tested' | 'unknown';
  escalationRequired: boolean;
}

export interface AnnualReviewInsuranceCheck {
  status: 'current' | 'expired' | 'pending' | 'unknown';
  escalationRequired: boolean;
}

export interface AnnualReviewRiskRatingCheck {
  current?: string;
  prior?: string;
  deteriorated: boolean;
  escalationRequired: boolean;
}

export interface AnnualReviewExceptionCheck {
  openCount: number;
  highSeverityCount: number;
  escalationRequired: boolean;
}

// ---------------------------------------------------------------------------
// D. Soundness assessment
// ---------------------------------------------------------------------------

export interface AnnualReviewSoundnessAssessment {
  status: AnnualReviewSoundnessStatus;
  supportingFactors: readonly string[];
  riskDrivers: readonly string[];
  missingInputs: readonly string[];
  recommendedActions: readonly string[];
  riskRatingRecommendation?: string;
  watchlistRecommendation?: 'add' | 'remove' | 'maintain' | 'not_available';
  escalationRequired: boolean;
  reviewer?: string;
  reviewedAt?: string;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface AnnualReviewReadinessResult {
  annualReviewReady: boolean;
  financialsComplete: boolean;
  covenantsComplete: boolean;
  insuranceComplete: boolean;
  riskReviewComplete: boolean;
  exceptionsResolved: boolean;
  fdicReviewReady: boolean;
  boardReviewReady: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Escalation + audit + package
// ---------------------------------------------------------------------------

export interface AnnualReviewEscalation {
  loanId?: string;
  borrowerName?: string;
  reason: string;
  level: AnnualReviewEscalationLevel;
  severity: AnnualReviewSeverity;
  relatedRequirementIds: readonly string[];
}

export interface AnnualReviewAuditEntry {
  actor?: string;
  action: string;
  loanId?: string;
  timestamp: string;
  fieldKey?: string;
  previousValueSummary?: string;
  newValueSummary?: string;
  reason?: string;
}

export interface AnnualReviewPackage {
  cycleId: string;
  loan: AnnualReviewLoanSnapshot;
  requirements: readonly AnnualReviewDocumentRequirement[];
  readiness: AnnualReviewReadinessResult;
  soundness: AnnualReviewSoundnessAssessment;
  status: AnnualReviewStatus;
  escalations: readonly AnnualReviewEscalation[];
  audit: readonly AnnualReviewAuditEntry[];
}
