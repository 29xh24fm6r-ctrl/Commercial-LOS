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

export interface CreditApprovalRecord {
  approvalAuthority?: string;
  approvalDate?: string;
  approvedStructure?: string;
  approvedPurpose?: string;
  approvedSourcesAndUses?: string;
  approvedCollateral?: string;
  approvedGuarantors?: string;
  approvalConditions?: string[];
  policyExceptions?: string[];
  mitigants?: string[];
  boardApprovalRequired?: boolean;
  boardApprovalDate?: string;
}

// ---------------------------------------------------------------------------
// E. Collateral
// ---------------------------------------------------------------------------

export interface CollateralItem {
  collateralType?: PortfolioCollateralType;
  description?: string;
  lienPosition?: string;
  perfected?: boolean;
  uccFilingDetails?: string;
  mortgageDeedDetails?: string;
  titlePolicy?: string;
  appraisal?: string;
  valuationDate?: string;
  valuationAmount?: number;
  advanceRate?: number;
  environmentalStatus?: string;
  floodStatus?: string;
  insuranceRequired?: boolean;
  collateralExceptions?: string[];
}

export interface CollateralPackage {
  items: CollateralItem[];
}

// ---------------------------------------------------------------------------
// F. Guarantors
// ---------------------------------------------------------------------------

export interface GuarantorRecord {
  guarantorName?: string;
  guarantorType?: PortfolioGuarantorType;
  guaranteeType?: string;
  guaranteeScope?: PortfolioGuaranteeScope;
  guaranteeAmount?: number;
  spouseConsent?: boolean;
  globalDebtServiceNotes?: string;
  personalFinancialStatementDate?: string;
  liquidity?: number;
  netWorth?: number;
  contingentLiabilitiesSummary?: string;
}

export interface GuarantorPackage {
  guarantors: GuarantorRecord[];
}

// ---------------------------------------------------------------------------
// G. Covenants and ticklers
// ---------------------------------------------------------------------------

export interface CovenantRecord {
  covenantName?: string;
  covenantType?: string;
  testingFrequency?: string;
  nextDueDate?: string;
  requiredThreshold?: string;
  currentStatus?: CovenantStatus;
  lastTestedDate?: string;
  waiverHistory?: string[];
  breachHistory?: string[];
  ticklerOwner?: string;
  ticklerSeverity?: ExceptionSeverity;
}

export interface CovenantPackage {
  covenants: CovenantRecord[];
}

export interface TicklerRecord {
  ticklerName?: string;
  ticklerType?: string;
  dueDate?: string;
  owner?: string;
  severity?: ExceptionSeverity;
  status?: string;
}

export interface TicklerPackage {
  ticklers: TicklerRecord[];
}

// ---------------------------------------------------------------------------
// Insurance tracking
// ---------------------------------------------------------------------------

export interface InsurancePolicyRecord {
  policyType?: string;
  carrier?: string;
  coverageAmount?: number;
  effectiveDate?: string;
  expirationDate?: string;
  evidenceReceived?: boolean;
  status?: string;
}

export interface InsuranceTrackingPackage {
  policies: InsurancePolicyRecord[];
}

// ---------------------------------------------------------------------------
// H. Documents
// ---------------------------------------------------------------------------

export interface PortfolioLoanDocumentRecord {
  documentType?: PortfolioLoanDocumentType;
  documentName?: string;
  obligorAssociation?: string;
  effectiveDate?: string;
  periodEndDate?: string;
  receivedDate?: string;
  reviewedDate?: string;
  reviewer?: string;
  source?: string;
  status?: PortfolioDocumentStatus;
  exception?: boolean;
  missing?: boolean;
  stale?: boolean;
  fileReference?: string;
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
  ratingDate?: string;
  ratingType?: string;
  ratedBy?: string;
  rationale?: string;
  priorRating?: string;
}

export interface ExceptionRecord {
  exceptionType?: string;
  description?: string;
  severity?: ExceptionSeverity;
  identifiedDate?: string;
  owner?: string;
  status?: ExceptionStatus;
  clearedDate?: string;
}

export interface ReviewHistoryRecord {
  reviewType?: string;
  reviewDate?: string;
  reviewer?: string;
  outcome?: string;
  nextReviewDate?: string;
}

export interface AuditTrailRecord {
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
}

// ---------------------------------------------------------------------------
// The boarding package
// ---------------------------------------------------------------------------

export interface PortfolioLoanBoardingPackage {
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
  };
}
