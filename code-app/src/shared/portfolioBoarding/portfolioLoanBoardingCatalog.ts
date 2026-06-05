/**
 * Phase 140B — Portfolio Loan Boarding field catalog.
 *
 * The canonical, data-driven list of scalar fields an operator must populate
 * to board a closed portfolio loan. Each field's `key` is a dotted path into
 * a `PortfolioLoanBoardingPackage`, so the completeness deriver can read
 * presence generically without a per-field switch.
 *
 * Discipline:
 *   - STATIC catalog of field DEFINITIONS only. No borrower data, no dollar
 *     values, no sample names.
 *   - The required flags drive fail-closed readiness in the deriver. A field
 *     marked required is genuinely required; nothing is defaulted.
 */

export type BoardingFieldSection =
  | 'loan_identity'
  | 'borrower'
  | 'loan_economics'
  | 'credit_approval'
  | 'servicing_monitoring';

export type BoardingFieldDataType =
  | 'string'
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'boolean'
  | 'enum';

export interface BoardingFieldDefinition {
  /** Dotted path into a PortfolioLoanBoardingPackage (e.g. 'identity.loanNumber'). */
  key: string;
  label: string;
  section: BoardingFieldSection;
  requiredForBoarding: boolean;
  requiredForFDICReview: boolean;
  requiredForBoardReporting: boolean;
  requiredForPortfolioMonitoring: boolean;
  dataType: BoardingFieldDataType;
  description: string;
}

export const PORTFOLIO_LOAN_BOARDING_FIELDS: readonly BoardingFieldDefinition[] =
  Object.freeze([
    // --- A. Loan identity -------------------------------------------------
    {
      key: 'identity.loanNumber',
      label: 'Loan number',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: true,
      dataType: 'string',
      description: 'The core-system loan number that uniquely identifies the booked loan.',
    },
    {
      key: 'identity.dealName',
      label: 'Deal / loan name',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: false,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: false,
      dataType: 'string',
      description: 'The display name for the loan relationship.',
    },
    {
      key: 'identity.borrowerLegalName',
      label: 'Borrower legal name',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: true,
      dataType: 'string',
      description: 'The legal name of the primary obligor.',
    },
    {
      key: 'identity.loanStatus',
      label: 'Loan status',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: true,
      dataType: 'enum',
      description: 'Active, matured, renewed, paid off, charged off, or closed.',
    },
    {
      key: 'identity.bookingDate',
      label: 'Booking date',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'date',
      description: 'The date the loan was booked to the core system.',
    },
    {
      key: 'identity.closingDate',
      label: 'Closing date',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'date',
      description: 'The date the loan closed.',
    },
    {
      key: 'identity.maturityDate',
      label: 'Maturity date',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: true,
      dataType: 'date',
      description: 'The contractual maturity date.',
    },
    {
      key: 'identity.portfolioManager',
      label: 'Portfolio manager',
      section: 'loan_identity',
      requiredForBoarding: true,
      requiredForFDICReview: false,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: true,
      dataType: 'string',
      description: 'The portfolio manager accountable for ongoing oversight.',
    },
    // --- B. Borrower ------------------------------------------------------
    {
      key: 'borrower.legalEntityType',
      label: 'Legal entity type',
      section: 'borrower',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'string',
      description: 'The obligor’s legal form (LLC, corporation, partnership, individual, etc.).',
    },
    {
      key: 'borrower.naicsIndustry',
      label: 'NAICS / industry',
      section: 'borrower',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'string',
      description: 'The industry / NAICS classification used for concentration analysis.',
    },
    // --- C. Loan economics ------------------------------------------------
    {
      key: 'terms.originalCommitmentAmount',
      label: 'Original commitment amount',
      section: 'loan_economics',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: false,
      dataType: 'currency',
      description: 'The original committed amount of the facility.',
    },
    {
      key: 'terms.currentOutstandingPrincipal',
      label: 'Current outstanding principal',
      section: 'loan_economics',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: true,
      dataType: 'currency',
      description: 'The current outstanding principal balance.',
    },
    {
      key: 'terms.interestRateType',
      label: 'Interest rate type',
      section: 'loan_economics',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'enum',
      description: 'Fixed or variable.',
    },
    {
      key: 'terms.paymentFrequency',
      label: 'Payment frequency',
      section: 'loan_economics',
      requiredForBoarding: true,
      requiredForFDICReview: false,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'string',
      description: 'How often payments are due.',
    },
    // --- D. Credit approval ----------------------------------------------
    {
      key: 'creditApproval.approvalAuthority',
      label: 'Approval authority',
      section: 'credit_approval',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: false,
      dataType: 'string',
      description: 'The authority (officer, committee, or board) that approved the credit.',
    },
    {
      key: 'creditApproval.approvalDate',
      label: 'Approval date',
      section: 'credit_approval',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: false,
      dataType: 'date',
      description: 'The date credit approval was granted.',
    },
    {
      key: 'creditApproval.approvedPurpose',
      label: 'Approved purpose',
      section: 'credit_approval',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'text',
      description: 'The approved use of proceeds / purpose of the credit.',
    },
    {
      key: 'creditApproval.approvedStructure',
      label: 'Approved structure',
      section: 'credit_approval',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: false,
      dataType: 'text',
      description: 'The approved facility structure (term, amount, amortization).',
    },
    // --- I. Servicing / portfolio monitoring -----------------------------
    {
      key: 'servicing.currentRiskRating',
      label: 'Current risk rating',
      section: 'servicing_monitoring',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: true,
      dataType: 'string',
      description: 'The current assigned risk rating.',
    },
    {
      key: 'servicing.riskRatingDate',
      label: 'Risk rating date',
      section: 'servicing_monitoring',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: true,
      dataType: 'date',
      description: 'The date the current risk rating was assigned.',
    },
    {
      key: 'servicing.nextReviewDate',
      label: 'Next review date',
      section: 'servicing_monitoring',
      requiredForBoarding: true,
      requiredForFDICReview: false,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: true,
      dataType: 'date',
      description: 'The scheduled date of the next credit review.',
    },
    {
      key: 'servicing.annualReviewStatus',
      label: 'Annual review status',
      section: 'servicing_monitoring',
      requiredForBoarding: true,
      requiredForFDICReview: false,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: true,
      dataType: 'enum',
      description: 'Whether the annual review is current, past due, or not started.',
    },
    {
      key: 'servicing.accrualStatus',
      label: 'Accrual status',
      section: 'servicing_monitoring',
      requiredForBoarding: true,
      requiredForFDICReview: true,
      requiredForBoardReporting: true,
      requiredForPortfolioMonitoring: true,
      dataType: 'enum',
      description: 'Accrual or nonaccrual.',
    },
    {
      key: 'servicing.covenantStatus',
      label: 'Covenant status',
      section: 'servicing_monitoring',
      requiredForBoarding: false,
      requiredForFDICReview: false,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: true,
      dataType: 'string',
      description: 'The aggregate covenant compliance status.',
    },
    {
      key: 'servicing.pastDueDays',
      label: 'Past due days',
      section: 'servicing_monitoring',
      requiredForBoarding: false,
      requiredForFDICReview: false,
      requiredForBoardReporting: false,
      requiredForPortfolioMonitoring: true,
      dataType: 'number',
      description: 'The number of days the loan is past due (0 if current).',
    },
  ]);

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function fieldsRequiredForBoarding(): readonly BoardingFieldDefinition[] {
  return PORTFOLIO_LOAN_BOARDING_FIELDS.filter((f) => f.requiredForBoarding);
}

export function fieldsRequiredForFDICReview(): readonly BoardingFieldDefinition[] {
  return PORTFOLIO_LOAN_BOARDING_FIELDS.filter((f) => f.requiredForFDICReview);
}

export function fieldsRequiredForBoardReporting(): readonly BoardingFieldDefinition[] {
  return PORTFOLIO_LOAN_BOARDING_FIELDS.filter(
    (f) => f.requiredForBoardReporting,
  );
}

export function fieldsRequiredForPortfolioMonitoring(): readonly BoardingFieldDefinition[] {
  return PORTFOLIO_LOAN_BOARDING_FIELDS.filter(
    (f) => f.requiredForPortfolioMonitoring,
  );
}
