import { describe, it, expect } from 'vitest';
import {
  ANNUAL_REVIEW_REQUIREMENT_CATALOG,
  getAnnualReviewRequirementsForLoan,
  getAnnualReviewRequirementsForBorrower,
  getAnnualReviewRequirementsByRiskRating,
  loanRequiresAnnualReview,
} from './annualReviewRequirementCatalog';
import type { AnnualReviewLoanSnapshot } from './annualReviewTypes';

function loan(over: Partial<AnnualReviewLoanSnapshot> = {}): AnnualReviewLoanSnapshot {
  return { loanStatus: 'active', loanNumber: 'LN1', borrowerName: 'Synthetic Obligor', riskRating: '4', ...over };
}

describe('Phase 141A — requirement catalog integrity', () => {
  it('has unique requirement keys and well-formed definitions', () => {
    const keys = ANNUAL_REVIEW_REQUIREMENT_CATALOG.map((d) => d.requirementKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of ANNUAL_REVIEW_REQUIREMENT_CATALOG) {
      expect(d.label.length).toBeGreaterThan(3);
      expect(d.description.length).toBeGreaterThan(10);
    }
  });
});

describe('Phase 141A — annual review scope', () => {
  it('active loans are in scope; paid-off loans are not', () => {
    expect(loanRequiresAnnualReview(loan({ loanStatus: 'active' }))).toBe(true);
    expect(loanRequiresAnnualReview(loan({ loanStatus: 'paid_off' }))).toBe(false);
  });

  it('paid-off loans require no requirements', () => {
    expect(getAnnualReviewRequirementsForLoan(loan({ loanStatus: 'paid_off' }))).toEqual([]);
  });
});

describe('Phase 141A — requirement applicability', () => {
  it('every active loan requires annual financials and tax returns', () => {
    const keys = getAnnualReviewRequirementsForLoan(loan()).map((d) => d.requirementKey);
    expect(keys).toContain('annual_financial_statements');
    expect(keys).toContain('tax_returns');
  });

  it('borrowing-base loans require the borrowing base certificate', () => {
    const keys = getAnnualReviewRequirementsForLoan(loan({ isBorrowingBaseLoan: true })).map((d) => d.requirementKey);
    expect(keys).toContain('borrowing_base_certificate');
  });

  it('covenant loans require the covenant compliance certificate', () => {
    const keys = getAnnualReviewRequirementsForLoan(loan({ hasCovenants: true })).map((d) => d.requirementKey);
    expect(keys).toContain('covenant_compliance_certificate');
  });

  it('real estate collateral requires a rent roll; insurance-required collateral requires insurance evidence', () => {
    const re = getAnnualReviewRequirementsForLoan(loan({ hasRealEstateCollateral: true, collateralRequiresInsurance: true })).map((d) => d.requirementKey);
    expect(re).toContain('rent_roll');
    expect(re).toContain('insurance_evidence');
  });

  it('guarantor loans require guarantor financials; SBA loans require an SBA servicing artifact', () => {
    const g = getAnnualReviewRequirementsForLoan(loan({ hasGuarantors: true })).map((d) => d.requirementKey);
    expect(g).toContain('guarantor_financials');
    const sba = getAnnualReviewRequirementsForLoan(loan({ isSbaLoan: true })).map((d) => d.requirementKey);
    expect(sba).toContain('sba_annual_servicing');
  });

  it('watchlist loans pull enhanced (interim financials) requirements', () => {
    const keys = getAnnualReviewRequirementsForLoan(loan({ watchlistFlag: true })).map((d) => d.requirementKey);
    expect(keys).toContain('interim_financial_statements');
  });

  it('borrower selector returns only borrower-financial documents', () => {
    const types = getAnnualReviewRequirementsForBorrower(loan({ hasGuarantors: true })).map((d) => d.documentType);
    expect(types).toContain('annual_financial_statements');
    expect(types).not.toContain('rent_roll');
  });

  it('risk-rating selector returns watchlist-enhanced set for criticized loans', () => {
    const keys = getAnnualReviewRequirementsByRiskRating(loan({ criticizedClassifiedStatus: 'substandard' })).map((d) => d.requirementKey);
    expect(keys).toContain('interim_financial_statements');
  });
});
