/**
 * Phase 140B — Portfolio Loan Boarding document catalog.
 *
 * The canonical document requirements for boarding a closed portfolio loan.
 * Each definition declares WHEN a document is required (via a `requiredWhen`
 * condition the deriver evaluates against the package context) and which
 * review processes depend on it.
 *
 * Discipline:
 *   - STATIC catalog of document DEFINITIONS only. No borrower data.
 *   - `requiredWhen` is the machine-checkable condition; `requiredForAllLoans`
 *     is the human-readable mirror of `requiredWhen === 'always'`.
 *   - `staleAfterDays` is only set where freshness genuinely matters
 *     (recurring monitoring artifacts). Static closing documents are not
 *     stale-tracked.
 */

import type { PortfolioLoanDocumentType } from './portfolioLoanBoardingTypes';

/**
 * The condition under which a document becomes required, evaluated against
 * the boarding package's context by the completeness deriver.
 */
export type DocumentRequirementCondition =
  | 'always'
  | 'when_collateral'
  | 'when_real_estate_collateral'
  | 'when_collateral_requires_insurance'
  | 'when_guarantors'
  | 'when_borrowing_base'
  | 'when_sba'
  | 'when_active_monitored'
  | 'when_board_approval_required'
  | 'optional';

export type PortfolioDocumentCategory =
  | 'note'
  | 'agreement'
  | 'security'
  | 'guaranty'
  | 'collateral'
  | 'title'
  | 'appraisal'
  | 'environmental'
  | 'flood'
  | 'insurance'
  | 'approval'
  | 'credit'
  | 'entity'
  | 'financial'
  | 'covenant'
  | 'borrowing_base'
  | 'sba'
  | 'participation'
  | 'servicing'
  | 'review'
  | 'modification'
  | 'payoff'
  | 'correspondence'
  | 'examiner'
  | 'other';

export interface PortfolioDocumentDefinition {
  documentType: PortfolioLoanDocumentType;
  label: string;
  category: PortfolioDocumentCategory;
  /** Human-readable mirror of `requiredWhen === 'always'`. */
  requiredForAllLoans: boolean;
  requiredWhen: DocumentRequirementCondition;
  requiredForFDICReview: boolean;
  requiredForBoardReview: boolean;
  requiredForCollateralReview: boolean;
  requiredForGuarantorReview: boolean;
  /** Days after the document's effective/received date it is considered stale. */
  staleAfterDays?: number;
  description: string;
}

export const PORTFOLIO_LOAN_DOCUMENTS: readonly PortfolioDocumentDefinition[] =
  Object.freeze([
    // --- Always required ---------------------------------------------------
    {
      documentType: 'note',
      label: 'Promissory note',
      category: 'note',
      requiredForAllLoans: true,
      requiredWhen: 'always',
      requiredForFDICReview: true,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The executed promissory note evidencing the debt.',
    },
    {
      documentType: 'loan_agreement',
      label: 'Loan agreement',
      category: 'agreement',
      requiredForAllLoans: true,
      requiredWhen: 'always',
      requiredForFDICReview: true,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The executed loan / business loan agreement.',
    },
    {
      documentType: 'approval_memo',
      label: 'Approval memo',
      category: 'approval',
      requiredForAllLoans: true,
      requiredWhen: 'always',
      requiredForFDICReview: true,
      requiredForBoardReview: true,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The credit approval memorandum documenting the approval decision.',
    },
    {
      documentType: 'credit_memo',
      label: 'Credit memo',
      category: 'credit',
      requiredForAllLoans: true,
      requiredWhen: 'always',
      requiredForFDICReview: true,
      requiredForBoardReview: true,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The underwriting credit memorandum supporting the decision.',
    },
    {
      documentType: 'financial_statements',
      label: 'Financial statements',
      category: 'financial',
      requiredForAllLoans: true,
      requiredWhen: 'always',
      requiredForFDICReview: true,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      staleAfterDays: 365,
      description: 'Current borrower financial statements supporting repayment capacity.',
    },
    // --- Collateral-driven -------------------------------------------------
    {
      documentType: 'security_agreement',
      label: 'Security agreement',
      category: 'security',
      requiredForAllLoans: false,
      requiredWhen: 'when_collateral',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      description: 'The security agreement granting the lien on pledged collateral.',
    },
    {
      documentType: 'ucc',
      label: 'UCC filing',
      category: 'collateral',
      requiredForAllLoans: false,
      requiredWhen: 'when_collateral',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      description: 'The UCC financing statement perfecting the security interest.',
    },
    {
      documentType: 'mortgage_deed_of_trust',
      label: 'Mortgage / deed of trust',
      category: 'collateral',
      requiredForAllLoans: false,
      requiredWhen: 'when_real_estate_collateral',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      description: 'The recorded mortgage or deed of trust on real estate collateral.',
    },
    {
      documentType: 'title_policy',
      label: 'Title policy',
      category: 'title',
      requiredForAllLoans: false,
      requiredWhen: 'when_real_estate_collateral',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      description: 'The title insurance policy for real estate collateral.',
    },
    {
      documentType: 'appraisal',
      label: 'Appraisal',
      category: 'appraisal',
      requiredForAllLoans: false,
      requiredWhen: 'when_real_estate_collateral',
      requiredForFDICReview: true,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      description: 'The appraisal supporting the value of real estate collateral.',
    },
    {
      documentType: 'flood_determination',
      label: 'Flood determination',
      category: 'flood',
      requiredForAllLoans: false,
      requiredWhen: 'when_real_estate_collateral',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      description: 'The flood-zone determination for real estate collateral.',
    },
    {
      documentType: 'insurance_evidence',
      label: 'Insurance evidence',
      category: 'insurance',
      requiredForAllLoans: false,
      requiredWhen: 'when_collateral_requires_insurance',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      staleAfterDays: 365,
      description: 'Current evidence of insurance for collateral that requires it.',
    },
    // --- Guarantor-driven --------------------------------------------------
    {
      documentType: 'guaranty',
      label: 'Guaranty',
      category: 'guaranty',
      requiredForAllLoans: false,
      requiredWhen: 'when_guarantors',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: true,
      description: 'The executed guaranty for each guarantor on the credit.',
    },
    // --- Borrowing base ----------------------------------------------------
    {
      documentType: 'borrowing_base_certificate',
      label: 'Borrowing base certificate',
      category: 'borrowing_base',
      requiredForAllLoans: false,
      requiredWhen: 'when_borrowing_base',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      staleAfterDays: 45,
      description: 'The current borrowing base certificate for an asset-based line.',
    },
    // --- SBA ---------------------------------------------------------------
    {
      documentType: 'sba_authorization',
      label: 'SBA authorization',
      category: 'sba',
      requiredForAllLoans: false,
      requiredWhen: 'when_sba',
      requiredForFDICReview: true,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The SBA loan authorization document.',
    },
    {
      documentType: 'sba_guarantee',
      label: 'SBA guarantee documents',
      category: 'sba',
      requiredForAllLoans: false,
      requiredWhen: 'when_sba',
      requiredForFDICReview: true,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The SBA guarantee agreement evidencing the government guarantee.',
    },
    // --- Board -------------------------------------------------------------
    {
      documentType: 'board_approval',
      label: 'Board approval',
      category: 'approval',
      requiredForAllLoans: false,
      requiredWhen: 'when_board_approval_required',
      requiredForFDICReview: false,
      requiredForBoardReview: true,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The board approval record for loans requiring board authorization.',
    },
    // --- Monitoring --------------------------------------------------------
    {
      documentType: 'annual_review',
      label: 'Annual review',
      category: 'review',
      requiredForAllLoans: false,
      requiredWhen: 'when_active_monitored',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      staleAfterDays: 365,
      description: 'The most recent annual credit review for an actively monitored loan.',
    },
    {
      documentType: 'covenant_compliance_certificate',
      label: 'Covenant compliance certificate',
      category: 'covenant',
      requiredForAllLoans: false,
      requiredWhen: 'optional',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      staleAfterDays: 120,
      description: 'The borrower’s covenant compliance certificate where covenants exist.',
    },
    // --- Optional context artifacts ---------------------------------------
    {
      documentType: 'commitment_letter',
      label: 'Commitment letter',
      category: 'approval',
      requiredForAllLoans: false,
      requiredWhen: 'optional',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'The executed commitment letter, where one exists.',
    },
    {
      documentType: 'tax_returns',
      label: 'Tax returns',
      category: 'financial',
      requiredForAllLoans: false,
      requiredWhen: 'optional',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      staleAfterDays: 730,
      description: 'Borrower / guarantor tax returns supporting global cash flow.',
    },
    {
      documentType: 'environmental_report',
      label: 'Environmental report',
      category: 'environmental',
      requiredForAllLoans: false,
      requiredWhen: 'optional',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: true,
      requiredForGuarantorReview: false,
      description: 'An environmental report where the collateral profile warrants one.',
    },
    {
      documentType: 'examiner_requested_artifact',
      label: 'Examiner-requested artifact',
      category: 'examiner',
      requiredForAllLoans: false,
      requiredWhen: 'optional',
      requiredForFDICReview: false,
      requiredForBoardReview: false,
      requiredForCollateralReview: false,
      requiredForGuarantorReview: false,
      description: 'An artifact specifically requested during an examination.',
    },
  ]);

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function getDocumentDefinition(
  documentType: PortfolioLoanDocumentType,
): PortfolioDocumentDefinition | undefined {
  return PORTFOLIO_LOAN_DOCUMENTS.find((d) => d.documentType === documentType);
}

export function documentsRequiredForFDICReview(): readonly PortfolioDocumentDefinition[] {
  return PORTFOLIO_LOAN_DOCUMENTS.filter((d) => d.requiredForFDICReview);
}

export function documentsRequiredForBoardReview(): readonly PortfolioDocumentDefinition[] {
  return PORTFOLIO_LOAN_DOCUMENTS.filter((d) => d.requiredForBoardReview);
}
