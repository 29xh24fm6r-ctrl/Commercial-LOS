import { describe, it, expect } from 'vitest';
import { deriveProductProcessTemplateSelection } from './deriveProductProcessTemplateSelection';
import type { ProductProcessTemplateDerivationInput } from './productProcessTemplateTypes';

/**
 * Phase 142D — template selection pins.
 */

function select(input: ProductProcessTemplateDerivationInput) {
  return deriveProductProcessTemplateSelection({ input });
}

describe('Phase 142D — template selection', () => {
  it('selects the SBA template for an SBA product', () => {
    expect(select({ productFamily: 'SBA', loanStructure: 'term_loan' }).primaryTemplateKey).toBe('sba_7a_standard_template');
  });

  it('selects the CRE template for a CRE product', () => {
    expect(select({ productFamily: 'CRE' }).primaryTemplateKey).toBe('commercial_real_estate_template');
  });

  it('selects the working capital line for a revolving line', () => {
    expect(select({ productFamily: 'commercial', loanStructure: 'revolving_line' }).primaryTemplateKey).toBe('working_capital_line_template');
  });

  it('selects the annual review standard template for an annual review', () => {
    expect(select({ annualReviewId: 'AR1', covenantStatus: 'in_compliance' }).primaryTemplateKey).toBe('annual_review_standard_template');
  });

  it('selects the covenant exception template when a covenant failed', () => {
    expect(select({ annualReviewId: 'AR1', covenantStatus: 'breach' }).primaryTemplateKey).toBe('annual_review_covenant_exception_template');
  });

  it('adds the FDIC companion when FDIC is required', () => {
    expect(select({ productFamily: 'commercial', fdicPackageRequired: true }).companionTemplateKeys).toContain('fdic_exam_prep_template');
  });

  it('adds the credit committee companion when the committee route is required', () => {
    expect(select({ productFamily: 'commercial', creditCommitteeRequired: true }).companionTemplateKeys).toContain('credit_committee_package_template');
  });

  it('prefers the portfolio boarded-loan template for boarded context', () => {
    expect(select({ portfolioBoardingStatus: 'boarded' }).primaryTemplateKey).toBe('portfolio_boarded_loan_review_template');
  });

  it('missing product returns review_required with candidates and never mutates', () => {
    const r = select({});
    expect(r.status).toBe('review_required');
    expect(r.primaryTemplateKey).toBeUndefined();
    expect(r.candidateTemplateKeys.length).toBeGreaterThan(0);
    expect(r.readOnly).toBe(true);
  });
});
