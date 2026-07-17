/**
 * Data-driven field specs for the editable portfolio boarding form
 * (`PortfolioLoanBoardingForm.tsx`). Complements the readiness-focused
 * `PORTFOLIO_LOAN_BOARDING_FIELDS` catalog (`portfolioLoanBoardingCatalog.ts`,
 * which only lists the ~24 fields that drive completeness scoring) with the
 * FULL field inventory of `PortfolioLoanBoardingPackage`
 * (`portfolioLoanBoardingTypes.ts`), so the form can render every documented
 * field generically instead of one hand-written input per field.
 *
 * Each spec's `key` is the bare property name on its section object (root-
 * level for scalar sections, item-level for repeatable sections) — the form
 * itself scopes it to the right object; this module never touches IO or the
 * package shape directly.
 */

export type BoardingFieldInputType = 'string' | 'text' | 'number' | 'date' | 'boolean' | 'enum' | 'string-array';

export interface BoardingFieldSpec {
  key: string;
  label: string;
  inputType: BoardingFieldInputType;
  options?: readonly string[];
}

function field(key: string, label: string, inputType: BoardingFieldInputType, options?: readonly string[]): BoardingFieldSpec {
  return { key, label, inputType, options };
}

export const IDENTITY_FIELDS: readonly BoardingFieldSpec[] = [
  field('loanNumber', 'Loan number', 'string'),
  field('dealName', 'Deal name', 'string'),
  field('borrowerLegalName', 'Borrower legal name', 'string'),
  field('borrowerDba', 'Borrower DBA', 'string'),
  field('relationshipName', 'Relationship name', 'string'),
  field('originatingBanker', 'Originating banker', 'string'),
  field('portfolioManager', 'Portfolio manager', 'string'),
  field('servicingOwner', 'Servicing owner', 'string'),
  field('branchMarket', 'Branch / market', 'string'),
  field('loanStatus', 'Loan status', 'enum', ['active', 'matured', 'renewed', 'paid_off', 'charged_off', 'closed']),
  field('bookingDate', 'Booking date', 'date'),
  field('closingDate', 'Closing date', 'date'),
  field('maturityDate', 'Maturity date', 'date'),
  field('renewalDate', 'Renewal date', 'date'),
  field('paidOffDate', 'Paid-off date', 'date'),
  field('originatedDealId', 'Originated deal ID', 'string'),
  field('legacySystemId', 'Legacy system ID', 'string'),
  field('coreSystemLoanId', 'Core system loan ID', 'string'),
];

export const BORROWER_FIELDS: readonly BoardingFieldSpec[] = [
  field('legalEntityType', 'Legal entity type', 'string'),
  field('taxIdentifier', 'Tax identifier', 'string'),
  field('naicsIndustry', 'NAICS / industry', 'string'),
  field('address', 'Address', 'text'),
  field('stateOfFormation', 'State of formation', 'string'),
  field('ownershipSummary', 'Ownership summary', 'text'),
  field('managementSummary', 'Management summary', 'text'),
  field('depositRelationshipSummary', 'Deposit relationship summary', 'text'),
];

export const TERMS_FIELDS: readonly BoardingFieldSpec[] = [
  field('originalCommitmentAmount', 'Original commitment amount', 'number'),
  field('currentOutstandingPrincipal', 'Current outstanding principal', 'number'),
  field('availableBalance', 'Available balance', 'number'),
  field('interestRateType', 'Interest rate type', 'enum', ['fixed', 'variable']),
  field('index', 'Index', 'string'),
  field('spread', 'Spread', 'number'),
  field('floor', 'Floor', 'number'),
  field('ceiling', 'Ceiling', 'number'),
  field('paymentFrequency', 'Payment frequency', 'string'),
  field('amortization', 'Amortization', 'string'),
  field('term', 'Term', 'string'),
  field('fees', 'Fees', 'text'),
  field('prepaymentTerms', 'Prepayment terms', 'text'),
  field('unusedLineFee', 'Unused line fee', 'string'),
  field('revolvingLine', 'Revolving line', 'boolean'),
  field('borrowingBaseLoan', 'Borrowing base loan', 'boolean'),
  field('sbaLoan', 'SBA loan', 'boolean'),
  field('participationLoan', 'Participation loan', 'boolean'),
  field('guaranteeInformation', 'Guarantee information', 'text'),
];

export const CLOSING_FIELDS: readonly BoardingFieldSpec[] = [
  field('closingDate', 'Closing date', 'date'),
  field('fundedDate', 'Funded date', 'date'),
  field('closingAgent', 'Closing agent', 'string'),
  field('closingConditionsCleared', 'Closing conditions cleared', 'boolean'),
  field('fundingAmount', 'Funding amount', 'number'),
  field('notes', 'Notes', 'text'),
];

export const CREDIT_APPROVAL_FIELDS: readonly BoardingFieldSpec[] = [
  field('approvalAuthority', 'Approval authority', 'string'),
  field('approvalDate', 'Approval date', 'date'),
  field('approvedStructure', 'Approved structure', 'text'),
  field('approvedPurpose', 'Approved purpose', 'text'),
  field('approvedSourcesAndUses', 'Approved sources and uses', 'text'),
  field('approvedCollateral', 'Approved collateral', 'text'),
  field('approvedGuarantors', 'Approved guarantors', 'text'),
  field('boardApprovalRequired', 'Board approval required', 'boolean'),
  field('boardApprovalDate', 'Board approval date', 'date'),
  field('approvalMemoDocumentId', 'Approval memo document ID', 'string'),
  field('creditMemoDocumentId', 'Credit memo document ID', 'string'),
];

export const SERVICING_FIELDS: readonly BoardingFieldSpec[] = [
  field('currentRiskRating', 'Current risk rating', 'string'),
  field('priorRiskRating', 'Prior risk rating', 'string'),
  field('riskRatingDate', 'Risk rating date', 'date'),
  field('nextReviewDate', 'Next review date', 'date'),
  field('annualReviewStatus', 'Annual review status', 'enum', ['current', 'past_due', 'not_started']),
  field('watchlistFlag', 'Watchlist flag', 'boolean'),
  field('criticizedClassifiedStatus', 'Criticized/classified status', 'string'),
  field('accrualStatus', 'Accrual status', 'enum', ['accrual', 'nonaccrual']),
  field('pastDueDays', 'Past-due days', 'number'),
  field('paymentStatus', 'Payment status', 'string'),
  field('covenantStatus', 'Covenant status', 'string'),
  field('collateralMonitoringStatus', 'Collateral monitoring status', 'string'),
  field('insuranceStatus', 'Insurance status', 'string'),
  field('financialReportingStatus', 'Financial reporting status', 'string'),
  field('borrowingBaseStatus', 'Borrowing base status', 'string'),
];

export const COLLATERAL_ITEM_FIELDS: readonly BoardingFieldSpec[] = [
  field('collateralType', 'Collateral type', 'enum', ['real_estate', 'equipment', 'accounts_receivable', 'inventory', 'cash', 'securities', 'vehicle', 'general_business_assets', 'other', 'unsecured']),
  field('description', 'Description', 'text'),
  field('lienPosition', 'Lien position', 'string'),
  field('perfected', 'Perfected', 'boolean'),
  field('perfectionMethod', 'Perfection method', 'string'),
  field('uccFilingNumber', 'UCC filing number', 'string'),
  field('uccFilingDate', 'UCC filing date', 'date'),
  field('uccContinuationDate', 'UCC continuation date', 'date'),
  field('mortgageInstrumentNumber', 'Mortgage instrument number', 'string'),
  field('deedOfTrustInstrumentNumber', 'Deed of trust instrument number', 'string'),
  field('titlePolicyNumber', 'Title policy number', 'string'),
  field('titlePolicyAmount', 'Title policy amount', 'number'),
  field('appraisalRequired', 'Appraisal required', 'boolean'),
  field('appraisalDate', 'Appraisal date', 'date'),
  field('appraisedValue', 'Appraised value', 'number'),
  field('valuationDate', 'Valuation date', 'date'),
  field('valuationAmount', 'Valuation amount', 'number'),
  field('advanceRate', 'Advance rate', 'number'),
  field('environmentalStatus', 'Environmental status', 'string'),
  field('floodDeterminationStatus', 'Flood determination status', 'string'),
  field('insuranceRequired', 'Insurance required', 'boolean'),
  field('releaseStatus', 'Release status', 'string'),
];

export const GUARANTOR_FIELDS: readonly BoardingFieldSpec[] = [
  field('guarantorName', 'Guarantor name', 'string'),
  field('guarantorType', 'Guarantor type', 'enum', ['individual', 'entity']),
  field('guaranteeType', 'Guarantee type', 'string'),
  field('guaranteeScope', 'Guarantee scope', 'enum', ['limited', 'unlimited']),
  field('guaranteeAmount', 'Guarantee amount', 'number'),
  field('spouseConsentRequired', 'Spouse consent required', 'boolean'),
  field('spouseConsentReceived', 'Spouse consent received', 'boolean'),
  field('globalDebtServiceNotes', 'Global debt service notes', 'text'),
  field('personalFinancialStatementDate', 'Personal financial statement date', 'date'),
  field('liquidity', 'Liquidity', 'number'),
  field('netWorth', 'Net worth', 'number'),
  field('contingentLiabilitiesSummary', 'Contingent liabilities summary', 'text'),
];

export const COVENANT_FIELDS: readonly BoardingFieldSpec[] = [
  field('covenantName', 'Covenant name', 'string'),
  field('covenantType', 'Covenant type', 'string'),
  field('testingFrequency', 'Testing frequency', 'string'),
  field('nextDueDate', 'Next due date', 'date'),
  field('requiredThreshold', 'Required threshold', 'string'),
  field('currentStatus', 'Current status', 'enum', ['in_compliance', 'breach', 'waived', 'not_tested']),
  field('lastTestedDate', 'Last tested date', 'date'),
  field('lastReportedValue', 'Last reported value', 'string'),
  field('ticklerOwner', 'Tickler owner', 'string'),
  field('ticklerSeverity', 'Tickler severity', 'enum', ['low', 'medium', 'high']),
];

export const TICKLER_FIELDS: readonly BoardingFieldSpec[] = [
  field('ticklerName', 'Tickler name', 'string'),
  field('ticklerType', 'Tickler type', 'string'),
  field('dueDate', 'Due date', 'date'),
  field('frequency', 'Frequency', 'string'),
  field('owner', 'Owner', 'string'),
  field('severity', 'Severity', 'enum', ['low', 'medium', 'high']),
  field('status', 'Status', 'string'),
  field('relatedDocumentType', 'Related document type', 'string'),
  field('notes', 'Notes', 'text'),
];

export const INSURANCE_FIELDS: readonly BoardingFieldSpec[] = [
  field('insuranceType', 'Insurance type', 'string'),
  field('policyType', 'Policy type', 'string'),
  field('carrier', 'Carrier', 'string'),
  field('policyNumber', 'Policy number', 'string'),
  field('coverageAmount', 'Coverage amount', 'number'),
  field('effectiveDate', 'Effective date', 'date'),
  field('expirationDate', 'Expiration date', 'date'),
  field('requiredCoverageAmount', 'Required coverage amount', 'number'),
  field('evidenceReceived', 'Evidence received', 'boolean'),
  field('status', 'Status', 'string'),
  field('exception', 'Exception', 'text'),
];

export const DOCUMENT_FIELDS: readonly BoardingFieldSpec[] = [
  field('documentType', 'Document type', 'string'),
  field('documentName', 'Document name', 'string'),
  field('category', 'Category', 'string'),
  field('obligorAssociation', 'Obligor association', 'string'),
  field('effectiveDate', 'Effective date', 'date'),
  field('periodEndDate', 'Period end date', 'date'),
  field('receivedDate', 'Received date', 'date'),
  field('reviewedDate', 'Reviewed date', 'date'),
  field('reviewer', 'Reviewer', 'string'),
  field('status', 'Status', 'enum', ['received', 'pending', 'waived', 'not_applicable']),
  field('exception', 'Exception', 'boolean'),
  field('missing', 'Missing', 'boolean'),
  field('stale', 'Stale', 'boolean'),
  field('fileReference', 'File reference', 'string'),
  field('notes', 'Notes', 'text'),
];

export const RISK_RATING_FIELDS: readonly BoardingFieldSpec[] = [
  field('rating', 'Rating', 'string'),
  field('priorRating', 'Prior rating', 'string'),
  field('ratingDate', 'Rating date', 'date'),
  field('ratingType', 'Rating type', 'string'),
  field('ratingAuthority', 'Rating authority', 'string'),
  field('ratedBy', 'Rated by', 'string'),
  field('rationale', 'Rationale', 'text'),
  field('repaymentSource', 'Primary repayment source', 'string'),
  field('secondaryRepaymentSource', 'Secondary repayment source', 'string'),
  field('migrationDirection', 'Migration direction', 'string'),
  field('nextReviewDate', 'Next review date', 'date'),
];

export const EXCEPTION_FIELDS: readonly BoardingFieldSpec[] = [
  field('exceptionType', 'Exception type', 'string'),
  field('description', 'Description', 'text'),
  field('severity', 'Severity', 'enum', ['low', 'medium', 'high']),
  field('identifiedDate', 'Identified date', 'date'),
  field('dueDate', 'Due date', 'date'),
  field('owner', 'Owner', 'string'),
  field('status', 'Status', 'enum', ['open', 'cleared']),
  field('clearedDate', 'Cleared date', 'date'),
  field('remediationPlan', 'Remediation plan', 'text'),
];

export const REVIEW_FIELDS: readonly BoardingFieldSpec[] = [
  field('reviewType', 'Review type', 'string'),
  field('reviewDate', 'Review date', 'date'),
  field('reviewer', 'Reviewer', 'string'),
  field('outcome', 'Outcome', 'text'),
  field('notes', 'Notes', 'text'),
  field('nextReviewDate', 'Next review date', 'date'),
];

export const EVIDENCE_LINK_FIELDS: readonly BoardingFieldSpec[] = [
  field('sourceType', 'Source type', 'string'),
  field('sourceId', 'Source ID', 'string'),
  field('documentId', 'Document ID', 'string'),
  field('factKey', 'Fact key', 'string'),
  field('description', 'Description', 'text'),
];

export const EXAMINER_NOTE_FIELDS: readonly BoardingFieldSpec[] = [
  field('examinerRequestId', 'Examiner request ID', 'string'),
  field('note', 'Note', 'text'),
  field('responseStatus', 'Response status', 'string'),
  field('owner', 'Owner', 'string'),
];
