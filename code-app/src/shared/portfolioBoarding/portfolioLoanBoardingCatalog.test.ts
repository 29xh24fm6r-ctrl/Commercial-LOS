import { describe, it, expect } from 'vitest';
import {
  PORTFOLIO_LOAN_BOARDING_FIELDS,
  fieldsRequiredForBoarding,
  fieldsRequiredForFDICReview,
  fieldsRequiredForBoardReporting,
  fieldsRequiredForPortfolioMonitoring,
} from './portfolioLoanBoardingCatalog';
import { createEmptyPortfolioLoanBoardingPackage } from './portfolioLoanBoardingTypes';

/**
 * Phase 140B — Portfolio loan boarding field catalog pins.
 */

const PACKAGE_ROOTS = Object.keys(createEmptyPortfolioLoanBoardingPackage());

describe('Phase 140B — boarding field catalog integrity', () => {
  it('has unique field keys', () => {
    const keys = PORTFOLIO_LOAN_BOARDING_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every field key is a dotted path rooted in the boarding package', () => {
    for (const f of PORTFOLIO_LOAN_BOARDING_FIELDS) {
      const root = f.key.split('.')[0]!;
      expect(PACKAGE_ROOTS, `${f.key} root`).toContain(root);
      expect(f.key).toContain('.');
    }
  });

  it('every field has a label, section, dataType, and description', () => {
    for (const f of PORTFOLIO_LOAN_BOARDING_FIELDS) {
      expect(f.label.length).toBeGreaterThan(2);
      expect(f.section.length).toBeGreaterThan(2);
      expect(f.dataType.length).toBeGreaterThan(2);
      expect(f.description.length).toBeGreaterThan(10);
    }
  });
});

describe('Phase 140B — required field subsets are represented', () => {
  it('has required-for-boarding fields', () => {
    expect(fieldsRequiredForBoarding().length).toBeGreaterThan(0);
  });

  it('represents required FDIC review fields', () => {
    const fdic = fieldsRequiredForFDICReview();
    expect(fdic.length).toBeGreaterThan(0);
    const keys = fdic.map((f) => f.key);
    // Core FDIC underwriting/credit fields must be present.
    expect(keys).toContain('identity.borrowerLegalName');
    expect(keys).toContain('terms.originalCommitmentAmount');
    expect(keys).toContain('creditApproval.approvalAuthority');
    expect(keys).toContain('servicing.currentRiskRating');
  });

  it('represents board reporting and portfolio monitoring fields', () => {
    expect(fieldsRequiredForBoardReporting().length).toBeGreaterThan(0);
    const monitoring = fieldsRequiredForPortfolioMonitoring().map((f) => f.key);
    expect(monitoring).toContain('servicing.currentRiskRating');
    expect(monitoring).toContain('servicing.nextReviewDate');
    expect(monitoring).toContain('servicing.annualReviewStatus');
  });
});
