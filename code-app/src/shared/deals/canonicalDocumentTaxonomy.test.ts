import { describe, it, expect } from 'vitest';
import type { AnnualReviewDocumentType } from '../annualReview/annualReviewTypes';
import type { PortfolioLoanDocumentType } from '../portfolioBoarding/portfolioLoanBoardingTypes';
import {
  CANONICAL_DOCUMENT_TAXONOMY,
  PORTFOLIO_BOARDING_OUT_OF_SCOPE,
  ANNUAL_REVIEW_OUT_OF_SCOPE,
  canonicalDocumentKeyForAnnualReviewType,
  canonicalDocumentKeyForPortfolioBoardingType,
  canonicalDocumentLabel,
} from './canonicalDocumentTaxonomy';

/**
 * Final LOS Completion arc — Workstream B tests.
 *
 * These lists mirror the full union literals in annualReviewTypes.ts / portfolioLoanBoardingTypes.ts
 * verbatim, so this suite can prove EVERY value of each source enum is accounted for — either mapped
 * to a canonical key or explicitly declared out of scope — rather than merely testing the handful of
 * values the taxonomy module happens to mention. If either source union changes, these lists must be
 * updated to match, and the exhaustiveness assertions below will catch a value that falls through the
 * cracks in either direction.
 */
const ALL_ANNUAL_REVIEW_TYPES: readonly AnnualReviewDocumentType[] = [
  'annual_financial_statements',
  'interim_financial_statements',
  'tax_returns',
  'personal_financial_statement',
  'covenant_compliance_certificate',
  'borrowing_base_certificate',
  'ar_aging',
  'ap_aging',
  'inventory_report',
  'rent_roll',
  'insurance_evidence',
  'guarantor_financials',
  'other',
];

const ALL_PORTFOLIO_BOARDING_TYPES: readonly PortfolioLoanDocumentType[] = [
  'note',
  'loan_agreement',
  'business_loan_agreement',
  'security_agreement',
  'guaranty',
  'mortgage_deed_of_trust',
  'assignment_of_rents',
  'ucc',
  'title_policy',
  'appraisal',
  'environmental_report',
  'flood_determination',
  'insurance_evidence',
  'approval_memo',
  'credit_memo',
  'commitment_letter',
  'board_approval',
  'borrowing_resolution',
  'secretary_certificate',
  'entity_formation',
  'tax_returns',
  'financial_statements',
  'interim_financials',
  'covenant_compliance_certificate',
  'borrowing_base_certificate',
  'ar_aging',
  'ap_aging',
  'inventory_report',
  'rent_roll',
  'lease_agreement',
  'sba_authorization',
  'sba_guarantee',
  'participation_agreement',
  'servicing_notes',
  'site_visit',
  'annual_review',
  'risk_rating_review',
  'modification_documents',
  'renewal_documents',
  'payoff_documents',
  'correspondence',
  'examiner_requested_artifact',
  'other',
];

describe('CANONICAL_DOCUMENT_TAXONOMY — structural integrity', () => {
  it('has exactly 20 canonical keys, matching the "20-key" scope of this workstream', () => {
    expect(CANONICAL_DOCUMENT_TAXONOMY).toHaveLength(20);
  });

  it('every canonical key is unique', () => {
    const keys = CANONICAL_DOCUMENT_TAXONOMY.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('canonicalDocumentLabel resolves a label for every canonical key', () => {
    for (const def of CANONICAL_DOCUMENT_TAXONOMY) {
      expect(canonicalDocumentLabel(def.key)).toBe(def.label);
    }
  });

  it('no Annual Review alias is claimed by more than one canonical bucket', () => {
    const seen = new Map<AnnualReviewDocumentType, string>();
    for (const def of CANONICAL_DOCUMENT_TAXONOMY) {
      for (const alias of def.legacyAliases.annualReview) {
        expect(seen.has(alias)).toBe(false);
        seen.set(alias, def.key);
      }
    }
  });

  it('no Portfolio Boarding alias is claimed by more than one canonical bucket', () => {
    const seen = new Map<PortfolioLoanDocumentType, string>();
    for (const def of CANONICAL_DOCUMENT_TAXONOMY) {
      for (const alias of def.legacyAliases.portfolioBoarding) {
        expect(seen.has(alias)).toBe(false);
        seen.set(alias, def.key);
      }
    }
  });
});

describe('canonicalDocumentKeyForAnnualReviewType — exhaustive accounting', () => {
  it('every AnnualReviewDocumentType is either mapped to a canonical key or declared out of scope, never silently dropped', () => {
    for (const type of ALL_ANNUAL_REVIEW_TYPES) {
      const mapped = canonicalDocumentKeyForAnnualReviewType(type);
      const declaredOutOfScope = ANNUAL_REVIEW_OUT_OF_SCOPE.includes(type);
      expect(mapped !== undefined || declaredOutOfScope).toBe(true);
      if (declaredOutOfScope) {
        expect(mapped).toBeUndefined();
      }
    }
  });

  it("'other' is out of scope (never fabricated a canonical mapping for a non-typed catch-all)", () => {
    expect(canonicalDocumentKeyForAnnualReviewType('other')).toBeUndefined();
  });
});

describe('canonicalDocumentKeyForPortfolioBoardingType — exhaustive accounting', () => {
  it('every PortfolioLoanDocumentType (all 43) is either mapped to a canonical key or declared out of scope, never silently dropped', () => {
    expect(ALL_PORTFOLIO_BOARDING_TYPES).toHaveLength(43);
    for (const type of ALL_PORTFOLIO_BOARDING_TYPES) {
      const mapped = canonicalDocumentKeyForPortfolioBoardingType(type);
      const declaredOutOfScope = PORTFOLIO_BOARDING_OUT_OF_SCOPE.includes(type);
      expect(mapped !== undefined || declaredOutOfScope).toBe(true);
      if (declaredOutOfScope) {
        expect(mapped).toBeUndefined();
      }
    }
  });

  it('lender-internal, legal-instrument, and closing-execution artifacts resolve to undefined (a different universe by design, not a gap)', () => {
    for (const type of PORTFOLIO_BOARDING_OUT_OF_SCOPE) {
      expect(canonicalDocumentKeyForPortfolioBoardingType(type)).toBeUndefined();
    }
  });
});

describe('cross-system drift resolution (the concrete, already-diagnosed gap this workstream closes)', () => {
  it("Annual Review's 'annual_financial_statements' and Portfolio Boarding's 'financial_statements' now resolve to the SAME canonical key, despite the spelling drift", () => {
    const fromAnnualReview = canonicalDocumentKeyForAnnualReviewType('annual_financial_statements');
    const fromPortfolioBoarding = canonicalDocumentKeyForPortfolioBoardingType('financial_statements');
    expect(fromAnnualReview).toBe('business_financial_statements');
    expect(fromAnnualReview).toBe(fromPortfolioBoarding);
  });

  it('the undifferentiated tax_returns convention (documented, not derived) resolves both systems to business_tax_returns', () => {
    expect(canonicalDocumentKeyForAnnualReviewType('tax_returns')).toBe('business_tax_returns');
    expect(canonicalDocumentKeyForPortfolioBoardingType('tax_returns')).toBe('business_tax_returns');
  });

  it('AR aging, AP aging, and inventory report all collapse into the disclosed borrowing_base_support_schedules compression, for both systems', () => {
    for (const type of ['ar_aging', 'ap_aging', 'inventory_report'] as const) {
      expect(canonicalDocumentKeyForAnnualReviewType(type)).toBe('borrowing_base_support_schedules');
      expect(canonicalDocumentKeyForPortfolioBoardingType(type)).toBe('borrowing_base_support_schedules');
    }
  });
});
