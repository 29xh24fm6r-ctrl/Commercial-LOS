/**
 * Phase 141A — Annual Review requirement catalog.
 *
 * The canonical, data-driven catalog of what an annual portfolio review
 * requires, and the helpers that resolve which requirements apply to a given
 * loan / borrower. Pure data + pure selectors.
 *
 * Discipline:
 *   - STATIC catalog of requirement DEFINITIONS only. No borrower data.
 *   - `requiredWhen` is the machine-checkable condition the selectors evaluate
 *     against an `AnnualReviewLoanSnapshot`.
 */

import type {
  AnnualReviewDocumentType,
  AnnualReviewLoanSnapshot,
} from './annualReviewTypes';

export type AnnualReviewRequirementCondition =
  | 'always_active'
  | 'when_watchlist'
  | 'when_real_estate_collateral'
  | 'when_guarantors'
  | 'when_borrowing_base'
  | 'when_covenants'
  | 'when_sba'
  | 'when_collateral_requires_insurance'
  | 'optional';

export type AnnualReviewDueDateRule =
  | 'annual_review_due_date'
  | 'cycle_end'
  | 'fiscal_year_end';

export interface AnnualReviewRequirementDefinition {
  requirementKey: string;
  label: string;
  documentType: AnnualReviewDocumentType;
  requiredWhen: AnnualReviewRequirementCondition;
  requiredForAnnualReview: boolean;
  requiredForWatchlistReview: boolean;
  requiredForFDICReview: boolean;
  dueDateRule: AnnualReviewDueDateRule;
  staleAfterDays?: number;
  description: string;
}

export const ANNUAL_REVIEW_REQUIREMENT_CATALOG: readonly AnnualReviewRequirementDefinition[] =
  Object.freeze([
    {
      requirementKey: 'annual_financial_statements',
      label: 'Annual financial statements',
      documentType: 'annual_financial_statements',
      requiredWhen: 'always_active',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: true,
      requiredForFDICReview: true,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 365,
      description: 'Year-end borrower financial statements supporting repayment capacity.',
    },
    {
      requirementKey: 'tax_returns',
      label: 'Tax returns',
      documentType: 'tax_returns',
      requiredWhen: 'always_active',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: false,
      requiredForFDICReview: true,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 730,
      description: 'Borrower tax returns supporting global cash flow.',
    },
    {
      requirementKey: 'interim_financial_statements',
      label: 'Interim financial statements',
      documentType: 'interim_financial_statements',
      requiredWhen: 'when_watchlist',
      requiredForAnnualReview: false,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'cycle_end',
      staleAfterDays: 120,
      description: 'Interim financials required for enhanced (watchlist/criticized) review.',
    },
    {
      requirementKey: 'covenant_compliance_certificate',
      label: 'Covenant compliance certificate',
      documentType: 'covenant_compliance_certificate',
      requiredWhen: 'when_covenants',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 120,
      description: 'Borrower covenant compliance certificate where covenants exist.',
    },
    {
      requirementKey: 'borrowing_base_certificate',
      label: 'Borrowing base certificate',
      documentType: 'borrowing_base_certificate',
      requiredWhen: 'when_borrowing_base',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'cycle_end',
      staleAfterDays: 45,
      description: 'Current borrowing base certificate for an asset-based line.',
    },
    {
      requirementKey: 'ar_aging',
      label: 'AR aging',
      documentType: 'ar_aging',
      requiredWhen: 'when_borrowing_base',
      requiredForAnnualReview: false,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'cycle_end',
      staleAfterDays: 45,
      description: 'Accounts receivable aging supporting the borrowing base.',
    },
    {
      requirementKey: 'ap_aging',
      label: 'AP aging',
      documentType: 'ap_aging',
      requiredWhen: 'when_borrowing_base',
      requiredForAnnualReview: false,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'cycle_end',
      staleAfterDays: 45,
      description: 'Accounts payable aging supporting the borrowing base.',
    },
    {
      requirementKey: 'inventory_report',
      label: 'Inventory report',
      documentType: 'inventory_report',
      requiredWhen: 'when_borrowing_base',
      requiredForAnnualReview: false,
      requiredForWatchlistReview: false,
      requiredForFDICReview: false,
      dueDateRule: 'cycle_end',
      staleAfterDays: 90,
      description: 'Inventory report supporting the borrowing base.',
    },
    {
      requirementKey: 'rent_roll',
      label: 'Rent roll',
      documentType: 'rent_roll',
      requiredWhen: 'when_real_estate_collateral',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 365,
      description: 'Rent roll for income-producing real estate collateral.',
    },
    {
      requirementKey: 'insurance_evidence',
      label: 'Insurance evidence',
      documentType: 'insurance_evidence',
      requiredWhen: 'when_collateral_requires_insurance',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 365,
      description: 'Current evidence of insurance for collateral that requires it.',
    },
    {
      requirementKey: 'personal_financial_statement',
      label: 'Personal financial statement',
      documentType: 'personal_financial_statement',
      requiredWhen: 'when_guarantors',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 365,
      description: 'Guarantor personal financial statement.',
    },
    {
      requirementKey: 'guarantor_financials',
      label: 'Guarantor financials',
      documentType: 'guarantor_financials',
      requiredWhen: 'when_guarantors',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: true,
      requiredForFDICReview: false,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 365,
      description: 'Guarantor financial statements / tax returns supporting global cash flow.',
    },
    {
      requirementKey: 'sba_annual_servicing',
      label: 'SBA annual servicing artifact',
      documentType: 'other',
      requiredWhen: 'when_sba',
      requiredForAnnualReview: true,
      requiredForWatchlistReview: false,
      requiredForFDICReview: true,
      dueDateRule: 'annual_review_due_date',
      staleAfterDays: 365,
      description: 'SBA-specific annual servicing / review artifact where applicable.',
    },
  ]);

// ---------------------------------------------------------------------------
// Applicability
// ---------------------------------------------------------------------------

const IN_SCOPE_STATUSES: ReadonlySet<string> = new Set(['active', 'matured', 'renewed']);

/** True when a loan is in scope for annual review at all. */
export function loanRequiresAnnualReview(loan: AnnualReviewLoanSnapshot): boolean {
  return loan.loanStatus !== undefined && IN_SCOPE_STATUSES.has(loan.loanStatus);
}

function isWatchlistOrCriticized(loan: AnnualReviewLoanSnapshot): boolean {
  return (
    loan.watchlistFlag === true ||
    (loan.criticizedClassifiedStatus !== undefined &&
      loan.criticizedClassifiedStatus.trim().length > 0)
  );
}

function conditionMet(
  condition: AnnualReviewRequirementCondition,
  loan: AnnualReviewLoanSnapshot,
): boolean {
  switch (condition) {
    case 'always_active':
      return true;
    case 'when_watchlist':
      return isWatchlistOrCriticized(loan);
    case 'when_real_estate_collateral':
      return loan.hasRealEstateCollateral === true;
    case 'when_guarantors':
      return loan.hasGuarantors === true;
    case 'when_borrowing_base':
      return loan.isBorrowingBaseLoan === true;
    case 'when_covenants':
      return loan.hasCovenants === true;
    case 'when_sba':
      return loan.isSbaLoan === true;
    case 'when_collateral_requires_insurance':
      return loan.collateralRequiresInsurance === true;
    case 'optional':
      return false;
  }
}

/**
 * The requirement definitions that apply to a loan this cycle. Returns empty
 * when the loan is out of scope (e.g. paid off).
 */
export function getAnnualReviewRequirementsForLoan(
  loan: AnnualReviewLoanSnapshot,
): readonly AnnualReviewRequirementDefinition[] {
  if (!loanRequiresAnnualReview(loan)) return [];
  return ANNUAL_REVIEW_REQUIREMENT_CATALOG.filter((def) =>
    conditionMet(def.requiredWhen, loan),
  );
}

const BORROWER_FINANCIAL_DOC_TYPES: ReadonlySet<AnnualReviewDocumentType> = new Set([
  'annual_financial_statements',
  'interim_financial_statements',
  'tax_returns',
  'personal_financial_statement',
  'guarantor_financials',
]);

/** The subset of applicable requirements that are borrower-financial documents. */
export function getAnnualReviewRequirementsForBorrower(
  loan: AnnualReviewLoanSnapshot,
): readonly AnnualReviewRequirementDefinition[] {
  return getAnnualReviewRequirementsForLoan(loan).filter((def) =>
    BORROWER_FINANCIAL_DOC_TYPES.has(def.documentType),
  );
}

/** Requirements applicable to a synthetic loan-type context (flags only). */
export function getAnnualReviewRequirementsByLoanType(
  context: Pick<
    AnnualReviewLoanSnapshot,
    | 'loanStatus'
    | 'hasRealEstateCollateral'
    | 'hasGuarantors'
    | 'isBorrowingBaseLoan'
    | 'hasCovenants'
    | 'isSbaLoan'
    | 'collateralRequiresInsurance'
  >,
): readonly AnnualReviewRequirementDefinition[] {
  return getAnnualReviewRequirementsForLoan({ ...context });
}

/**
 * For a criticized/classified/watchlist loan, the enhanced requirement set
 * (watchlist-required definitions). For a non-criticized rating, the standard
 * annual-review set.
 */
export function getAnnualReviewRequirementsByRiskRating(
  loan: AnnualReviewLoanSnapshot,
): readonly AnnualReviewRequirementDefinition[] {
  const applicable = getAnnualReviewRequirementsForLoan(loan);
  if (isWatchlistOrCriticized(loan)) {
    return applicable.filter((def) => def.requiredForWatchlistReview);
  }
  return applicable.filter((def) => def.requiredForAnnualReview);
}
