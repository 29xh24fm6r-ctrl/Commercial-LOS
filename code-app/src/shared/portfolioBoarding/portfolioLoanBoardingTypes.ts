/**
 * Phase 140B — Portfolio Loan Boarding System of Record (canonical types).
 *
 * Defines the structure for MANUALLY boarding a fully closed / existing
 * portfolio loan into the LOS so the platform can support FDIC exams, board
 * review, portfolio management, manager oversight, and long-term credit
 * administration.
 *
 * This is a CLOSED-loan system of record — not an active origination deal.
 * It represents information an operator manually enters for a loan that has
 * already booked.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - These are TYPES + a structural empty-package factory only. No IO, no
 *     React, no Dataverse, no network, no connector code.
 *   - NO fake data. The empty-package factory populates nothing but the
 *     required object/array shells; every scalar is left `undefined`.
 *   - Missing means missing. Optional fields are genuinely optional and are
 *     never defaulted to a fabricated value.
 *   - `taxIdentifier` is a placeholder FIELD only; the platform never seeds a
 *     sample value into it.
 */

// ---------------------------------------------------------------------------
// Enumerations (string-literal unions — no runtime enums)
// ---------------------------------------------------------------------------

export type PortfolioLoanStatus =
  | 'active'
  | 'matured'
  | 'renewed'
  | 'paid_off'
  | 'charged_off'
  | 'closed';

export type PortfolioCollateralType =
  | 'real_estate'
  | 'equipment'
  | 'accounts_receivable'
  | 'inventory'
  | 'cash'
  | 'securities'
  | 'vehicle'
  | 'general_business_assets'
  | 'other'
  | 'unsecured';

export type PortfolioGuarantorType = 'individual' | 'entity';

export type PortfolioGuaranteeScope = 'limited' | 'unlimited';

export type CovenantStatus =
  | 'in_compliance'
  | 'breach'
  | 'waived'
  | 'not_tested';

export type ExceptionSeverity = 'low' | 'medium' | 'high';

export type ExceptionStatus = 'open' | 'cleared';

export type AccrualStatus = 'accrual' | 'nonaccrual';

export type AnnualReviewStatus = 'current' | 'past_due' | 'not_started';

export type BoardingStatus =
  | 'draft'
  | 'in_review'
  | 'boarded'
  | 'needs_correction';

export type PortfolioDocumentStatus =
  | 'received'
  | 'pending'
  | 'waived'
  | 'not_applicable';

/**
 * Canonical document types for portfolio loan boarding. Covers every artifact
 * an FDIC exam, board review, or portfolio-administration process may need.
 */
export type PortfolioLoanDocumentType =
  | 'note'
  | 'loan_agreement'
  | 'business_loan_agreement'
  | 'security_agreement'
  | 'guaranty'
  | 'mortgage_deed_of_trust'
  | 'assignment_of_rents'
  | 'ucc'
  | 'title_policy'
  | 'appraisal'
  | 'environmental_report'
  | 'flood_determination'
  | 'insurance_evidence'
  | 'approval_memo'
  | 'credit_memo'
  | 'commitment_letter'
  | 'board_approval'
  | 'borrowing_resolution'
  | 'secretary_certificate'
  | 'entity_formation'
  | 'tax_returns'
  | 'financial_statements'
  | 'interim_financials'
  | 'covenant_compliance_certificate'
  | 'borrowing_base_certificate'
  | 'ar_aging'
  | 'ap_aging'
  | 'inventory_report'
  | 'rent_roll'
  | 'lease_agreement'
  | 'sba_authorization'
  | 'sba_guarantee'
  | 'participation_agreement'
  | 'servicing_notes'
  | 'site_visit'
  | 'annual_review'
  | 'risk_rating_review'
  | 'modification_documents'
  | 'renewal_documents'
  | 'payoff_documents'
  | 'correspondence'
  | 'examiner_requested_artifact'
  | 'other';

// ---------------------------------------------------------------------------
// A. Loan identity
// ---------------------------------------------------------------------------

export interface PortfolioLoanIdentity {
  loanNumber?: string;
  dealName?: string;
  borrowerLegalName?: string;
  borrowerDba?: string;
  relationshipName?: string;
  originatingBanker?: string;
  portfolioManager?: string;
  servicingOwner?: string;
  branchMarket?: string;
  loanStatus?: PortfolioLoanStatus;
  bookingDate?: string;
  closingDate?: string;
  maturityDate?: string;
  renewalDate?: string;
  paidOffDate?: string;
  /** Phase 140B-H: link to an originated deal if applicable. */
  originatedDealId?: string;
  /** Phase 140B-H: the boarded loan's own persistence ID. */
  boardedLoanId?: string;
  /** Phase 140B-H: ID from a legacy core system. */
  legacySystemId?: string;
  /** Phase 140B-H: core banking system loan number. */
  coreSystemLoanId?: string;
}

// ---------------------------------------------------------------------------
// B. Borrower / obligor details
// ---------------------------------------------------------------------------

export interface BorrowerProfile {
  legalEntityType?: string;
  /** Placeholder field name only — the platform never seeds a sample value. */
  taxIdentifier?: string;
  naicsIndustry?: string;
  address?: string;
  stateOfFormation?: string;
  ownershipSummary?: string;
  managementSummary?: string;
  relatedEntities?: string[];
  depositRelationshipSummary?: string;
}

// ---------------------------------------------------------------------------
// C. Loan economics
// ---------------------------------------------------------------------------

export interface LoanTerms {
  originalCommitmentAmount?: number;
  currentOutstandingPrincipal?: number;
  availableBalance?: number;
  interestRateType?: 'fixed' | 'variable';
  index?: string;
  spread?: number;
  floor?: number;
  ceiling?: number;
  paymentFrequency?: string;
  amortization?: string;
  term?: string;
  fees?: string;
  prepaymentTerms?: string;
  unusedLineFee?: string;
  revolvingLine?: boolean;
  borrowingBaseLoan?: boolean;
  sbaLoan?: boolean;
  participationLoan?: boolean;
  guaranteeInformation?: string;
}

// ---------------------------------------------------------------------------
// Closing information
// ---------------------------------------------------------------------------

export interface ClosingInformation {
  closingDate?: string;
  fundedDate?: string;
  closingAgent?: string;
  closingConditionsCleared?: boolean;
  fundingAmount?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// D. Credit approval
// ---------------------------------------------------------------------------

/** Phase 140B-H: sources and uses line item. */
export interface SourcesAndUsesRecord {
  category?: string;
  description?: string;
  amount?: number;
}

export interface CreditApprovalRecord {
  approvalAuthority?: string;
  approvalDate?: string;
  approvedStructure?: string;
  approvedPurpose?: string;
  approvedSourcesAndUses?: string;
  /** Phase 140B-H: structured sources and uses records. */
  sourcesAndUses?: SourcesAndUsesRecord[];
  approvedCollateral?: string;
  approvedGuarantors?: string;
  approvalConditions?: string[];
  policyExceptions?: string[];
  mitigants?: string[];
  boardApprovalRequired?: boolean;
  boardApprovalDate?: string;
  /** Phase 140B-H: linked approval memo document ID. */
  approvalMemoDocumentId?: string;
  /** Phase 140B-H: linked credit memo document ID. */
  creditMemoDocumentId?: string;
}

// ---------------------------------------------------------------------------
// E. Collateral
// ---------------------------------------------------------------------------

export interface CollateralItem {
  /** Phase 140B-H: stable collateral identifier. */
  collateralId?: string;
  collateralType?: PortfolioCollateralType;
  description?: string;
  lienPosition?: string;
  perfected?: boolean;
  /** Phase 140B-H: method of perfection. */
  perfectionMethod?: string;
  uccFilingDetails?: string;
  /** Phase 140B-H: UCC filing number. */
  uccFilingNumber?: string;
  /** Phase 140B-H: UCC filing date. */
  uccFilingDate?: string;
  /** Phase 140B-H: UCC continuation date. */
  uccContinuationDate?: string;
  mortgageDeedDetails?: string;
  /** Phase 140B-H: mortgage instrument number. */
  mortgageInstrumentNumber?: string;
  /** Phase 140B-H: deed of trust instrument number. */
  deedOfTrustInstrumentNumber?: string;
  titlePolicy?: string;
  /** Phase 140B-H: title policy number. */
  titlePolicyNumber?: string;
  /** Phase 140B-H: title policy amount. */
  titlePolicyAmount?: number;
  appraisal?: string;
  /** Phase 140B-H: whether appraisal is required. */
  appraisalRequired?: boolean;
  /** Phase 140B-H: appraisal date. */
  appraisalDate?: string;
  /** Phase 140B-H: appraised value. */
  appraisedValue?: number;
  valuationDate?: string;
  valuationAmount?: number;
  advanceRate?: number;
  environmentalStatus?: string;
  floodStatus?: string;
  /** Phase 140B-H: flood determination status. */
  floodDeterminationStatus?: string;
  insuranceRequired?: boolean;
  /** Phase 140B-H: linked insurance policy IDs. */
  insurancePolicyIds?: string[];
  collateralExceptions?: string[];
  /** Phase 140B-H: release status. */
  releaseStatus?: string;
}

export interface CollateralPackage {
  items: CollateralItem[];
}

// ---------------------------------------------------------------------------
// F. Guarantors
// ---------------------------------------------------------------------------

export interface GuarantorRecord {
  /** Phase 140B-H: stable guarantor identifier. */
  guarantorId?: string;
  guarantorName?: string;
  guarantorType?: PortfolioGuarantorType;
  guaranteeType?: string;
  guaranteeScope?: PortfolioGuaranteeScope;
  /** Phase 140B-H: limited or unlimited. */
  limitedOrUnlimited?: string;
  guaranteeAmount?: number;
  /** Phase 140B-H: whether spouse consent is required. */
  spouseConsentRequired?: boolean;
  spouseConsent?: boolean;
  /** Phase 140B-H: whether spouse consent has been received. */
  spouseConsentReceived?: boolean;
  globalDebtServiceNotes?: string;
  personalFinancialStatementDate?: string;
  liquidity?: number;
  netWorth?: number;
  contingentLiabilitiesSummary?: string;
  /** Phase 140B-H: linked guarantor document IDs. */
  guarantorDocumentIds?: string[];
  /** Phase 140B-H: guarantor-level exceptions. */
  exceptions?: string[];
}

export interface GuarantorPackage {
  guarantors: GuarantorRecord[];
}

// ---------------------------------------------------------------------------
// G. Covenants and ticklers
// ---------------------------------------------------------------------------

export interface CovenantRecord {
  /** Phase 140B-H: stable covenant identifier. */
  covenantId?: string;
  covenantName?: string;
  covenantType?: string;
  testingFrequency?: string;
  nextDueDate?: string;
  requiredThreshold?: string;
  currentStatus?: CovenantStatus;
  lastTestedDate?: string;
  /** Phase 140B-H: last reported value. */
  lastReportedValue?: string;
  waiverHistory?: string[];
  breachHistory?: string[];
  ticklerOwner?: string;
  ticklerSeverity?: ExceptionSeverity;
  /** Phase 140B-H: linked evidence document IDs. */
  evidenceDocumentIds?: string[];
}

export interface CovenantPackage {
  covenants: CovenantRecord[];
}

export interface TicklerRecord {
  /** Phase 140B-H: stable tickler identifier. */
  ticklerId?: string;
  ticklerName?: string;
  ticklerType?: string;
  dueDate?: string;
  /** Phase 140B-H: tickler frequency. */
  frequency?: string;
  owner?: string;
  severity?: ExceptionSeverity;
  status?: string;
  /** Phase 140B-H: related document type. */
  relatedDocumentType?: string;
  /** Phase 140B-H: related covenant ID. */
  relatedCovenantId?: string;
  /** Phase 140B-H: freeform notes. */
  notes?: string;
}

export interface TicklerPackage {
  ticklers: TicklerRecord[];
}

// ---------------------------------------------------------------------------
// Insurance tracking
// ---------------------------------------------------------------------------

export interface InsurancePolicyRecord {
  /** Phase 140B-H: stable insurance record identifier. */
  insuranceId?: string;
  /** Phase 140B-H: insurance type. */
  insuranceType?: string;
  policyType?: string;
  carrier?: string;
  /** Phase 140B-H: policy number. */
  policyNumber?: string;
  coverageAmount?: number;
  effectiveDate?: string;
  expirationDate?: string;
  /** Phase 140B-H: required coverage amount. */
  requiredCoverageAmount?: number;
  /** Phase 140B-H: evidence document ID. */
  evidenceDocumentId?: string;
  evidenceReceived?: boolean;
  status?: string;
  /** Phase 140B-H: stale flag. */
  stale?: boolean;
  /** Phase 140B-H: exception description. */
  exception?: string;
}

export interface InsuranceTrackingPackage {
  policies: InsurancePolicyRecord[];
}

// ---------------------------------------------------------------------------
// H. Documents
// ---------------------------------------------------------------------------

export interface PortfolioLoanDocumentRecord {
  /** Phase 140B-H: stable document identifier. */
  documentId?: string;
  documentType?: PortfolioLoanDocumentType;
  documentName?: string;
  /** Phase 140B-H: category label. */
  category?: string;
  obligorAssociation?: string;
  effectiveDate?: string;
  periodEndDate?: string;
  receivedDate?: string;
  reviewedDate?: string;
  reviewer?: string;
  source?: string;
  status?: PortfolioDocumentStatus;
  /** Phase 140B-H: exception flag. */
  exceptionFlag?: boolean;
  exception?: boolean;
  /** Phase 140B-H: missing flag. */
  missingFlag?: boolean;
  missing?: boolean;
  /** Phase 140B-H: stale flag. */
  staleFlag?: boolean;
  stale?: boolean;
  fileReference?: string;
  /** Phase 140B-H: extracted fact IDs. */
  extractedFactIds?: string[];
  /** Phase 140B-H: evidence link IDs. */
  evidenceLinkIds?: string[];
  notes?: string;
}

export interface DocumentInventory {
  documents: PortfolioLoanDocumentRecord[];
}

// ---------------------------------------------------------------------------
// I. Servicing and portfolio monitoring
// ---------------------------------------------------------------------------

export interface ServicingSnapshot {
  currentRiskRating?: string;
  priorRiskRating?: string;
  riskRatingDate?: string;
  nextReviewDate?: string;
  annualReviewStatus?: AnnualReviewStatus;
  watchlistFlag?: boolean;
  criticizedClassifiedStatus?: string;
  accrualStatus?: AccrualStatus;
  pastDueDays?: number;
  paymentStatus?: string;
  covenantStatus?: string;
  collateralMonitoringStatus?: string;
  insuranceStatus?: string;
  financialReportingStatus?: string;
  borrowingBaseStatus?: string;
  exceptionCount?: number;
  highSeverityExceptionCount?: number;
}

// ---------------------------------------------------------------------------
// Risk rating / exceptions / reviews / audit
// ---------------------------------------------------------------------------

export interface RiskRatingRecord {
  rating?: string;
  priorRating?: string;
  ratingDate?: string;
  ratingType?: string;
  /** Phase 140B-H: rating authority. */
  ratingAuthority?: string;
  ratedBy?: string;
  rationale?: string;
  /** Phase 140B-H: rating rationale. */
  ratingRationale?: string;
  /** Phase 140B-H: strengths. */
  strengths?: string[];
  /** Phase 140B-H: weaknesses. */
  weaknesses?: string[];
  /** Phase 140B-H: primary repayment source. */
  repaymentSource?: string;
  /** Phase 140B-H: secondary repayment source. */
  secondaryRepaymentSource?: string;
  /** Phase 140B-H: risk drivers. */
  riskDrivers?: string[];
  /** Phase 140B-H: migration direction. */
  migrationDirection?: string;
  /** Phase 140B-H: next review date. */
  nextReviewDate?: string;
  /** Phase 140B-H: linked evidence document IDs. */
  evidenceDocumentIds?: string[];
}

export interface ExceptionRecord {
  /** Phase 140B-H: stable exception identifier. */
  exceptionId?: string;
  exceptionType?: string;
  description?: string;
  severity?: ExceptionSeverity;
  identifiedDate?: string;
  /** Phase 140B-H: opened date alias. */
  openedDate?: string;
  /** Phase 140B-H: due date for remediation. */
  dueDate?: string;
  owner?: string;
  status?: ExceptionStatus;
  clearedDate?: string;
  /** Phase 140B-H: resolved date alias. */
  resolvedDate?: string;
  /** Phase 140B-H: remediation plan. */
  remediationPlan?: string;
  /** Phase 140B-H: linked evidence document IDs. */
  evidenceDocumentIds?: string[];
}

export interface ReviewHistoryRecord {
  /** Phase 140B-H: stable review identifier. */
  reviewId?: string;
  reviewType?: string;
  reviewDate?: string;
  reviewer?: string;
  outcome?: string;
  /** Phase 140B-H: freeform notes. */
  notes?: string;
  nextReviewDate?: string;
  /** Phase 140B-H: linked evidence document IDs. */
  evidenceDocumentIds?: string[];
}

export interface AuditTrailRecord {
  /** Phase 140B-H: stable audit record identifier. */
  auditId?: string;
  /** Phase 140B-H: actor who performed the action. */
  actor?: string;
  /** Phase 140B-H: action performed. */
  action?: string;
  /** Phase 140B-H: timestamp of the action. */
  timestamp?: string;
  /** Phase 140B-H: field key that was changed. */
  fieldKey?: string;
  /** Phase 140B-H: summary of previous value. */
  previousValueSummary?: string;
  /** Phase 140B-H: summary of new value. */
  newValueSummary?: string;
  /** Phase 140B-H: reason for the change. */
  reason?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  sourceSystem?: string;
  boardingStatus?: BoardingStatus;
  boardingReviewer?: string;
  boardingApprovedBy?: string;
  boardingApprovedAt?: string;
  changeHistory?: string[];
  evidenceLinks?: string[];
  examinerNotes?: string;
  /** Phase 140B-H: linked evidence link IDs. */
  evidenceLinkIds?: string[];
}

// ---------------------------------------------------------------------------
// Evidence links (Phase 140B-H)
// ---------------------------------------------------------------------------

export interface EvidenceLinkRecord {
  evidenceId: string;
  sourceType?: string;
  sourceId?: string;
  documentId?: string;
  factKey?: string;
  description?: string;
  createdAt?: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Examiner notes (Phase 140B-H)
// ---------------------------------------------------------------------------

export interface ExaminerNoteRecord {
  noteId: string;
  examinerRequestId?: string;
  note?: string;
  responseStatus?: string;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
  relatedEvidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Boarding source (Phase 140B-H)
// ---------------------------------------------------------------------------

export type PortfolioLoanBoardingSource =
  | 'manual_boarding'
  | 'originated_closed_deal';

// ---------------------------------------------------------------------------
// The boarding package
// ---------------------------------------------------------------------------

export interface PortfolioLoanBoardingPackage {
  // Phase 140B-H metadata (optional for backward compatibility)
  packageId?: string;
  source?: PortfolioLoanBoardingSource;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  boardedBy?: string;
  boardedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;

  identity: PortfolioLoanIdentity;
  borrower: BorrowerProfile;
  terms: LoanTerms;
  closing: ClosingInformation;
  creditApproval: CreditApprovalRecord;
  collateral: CollateralPackage;
  guarantors: GuarantorPackage;
  covenants: CovenantPackage;
  ticklers: TicklerPackage;
  insurance: InsuranceTrackingPackage;
  documents: DocumentInventory;
  servicing: ServicingSnapshot;
  riskRatings: RiskRatingRecord[];
  exceptions: ExceptionRecord[];
  reviewHistory: ReviewHistoryRecord[];
  audit: AuditTrailRecord;
  // Phase 140B-H additions
  evidenceLinks: EvidenceLinkRecord[];
  examinerNotes: ExaminerNoteRecord[];
}

// ---------------------------------------------------------------------------
// Completeness result
// ---------------------------------------------------------------------------

export interface BoardingCompletenessResult {
  totalRequiredFields: number;
  completedRequiredFields: number;
  missingRequiredFields: readonly string[];
  totalRequiredDocuments: number;
  receivedRequiredDocuments: number;
  missingRequiredDocuments: readonly PortfolioLoanDocumentType[];
  staleDocuments: readonly PortfolioLoanDocumentType[];
  exceptionCount: number;
  highSeverityExceptionCount: number;
  fdicReady: boolean;
  boardReady: boolean;
  portfolioMonitoringReady: boolean;
  blockers: readonly string[];
}

// ---------------------------------------------------------------------------
// Structural empty-package factory (NO fake data)
// ---------------------------------------------------------------------------

/**
 * Returns a structurally-complete but DATA-EMPTY boarding package: every
 * required sub-object and array shell is present, and every scalar is
 * `undefined`. Used by callers (and tests) that need a starting shape to
 * populate. It seeds NO values — missing stays missing.
 */
export function createEmptyPortfolioLoanBoardingPackage(): PortfolioLoanBoardingPackage {
  return {
    identity: {},
    borrower: {},
    terms: {},
    closing: {},
    creditApproval: {},
    collateral: { items: [] },
    guarantors: { guarantors: [] },
    covenants: { covenants: [] },
    ticklers: { ticklers: [] },
    insurance: { policies: [] },
    documents: { documents: [] },
    servicing: {},
    riskRatings: [],
    exceptions: [],
    reviewHistory: [],
    audit: {},
    evidenceLinks: [],
    examinerNotes: [],
  };
}
