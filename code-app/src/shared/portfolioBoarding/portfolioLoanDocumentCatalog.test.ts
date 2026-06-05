import { describe, it, expect } from 'vitest';
import {
  PORTFOLIO_LOAN_DOCUMENTS,
  getDocumentDefinition,
  documentsRequiredForFDICReview,
} from './portfolioLoanDocumentCatalog';

/**
 * Phase 140B — Portfolio loan document catalog pins.
 */

describe('Phase 140B — document catalog integrity', () => {
  it('has unique document types', () => {
    const types = PORTFOLIO_LOAN_DOCUMENTS.map((d) => d.documentType);
    expect(new Set(types).size).toBe(types.length);
  });

  it('requiredForAllLoans is consistent with requiredWhen === always', () => {
    for (const d of PORTFOLIO_LOAN_DOCUMENTS) {
      expect(d.requiredForAllLoans, d.documentType).toBe(
        d.requiredWhen === 'always',
      );
    }
  });

  it('every document has a label, category, and description', () => {
    for (const d of PORTFOLIO_LOAN_DOCUMENTS) {
      expect(d.label.length).toBeGreaterThan(2);
      expect(d.category.length).toBeGreaterThan(2);
      expect(d.description.length).toBeGreaterThan(10);
    }
  });
});

describe('Phase 140B — document requirement conditions', () => {
  it('note is required for all loans', () => {
    expect(getDocumentDefinition('note')?.requiredForAllLoans).toBe(true);
    expect(getDocumentDefinition('note')?.requiredWhen).toBe('always');
  });

  it('guaranty is required when guarantors exist', () => {
    expect(getDocumentDefinition('guaranty')?.requiredWhen).toBe(
      'when_guarantors',
    );
  });

  it('appraisal and flood determination are required when real estate collateral exists', () => {
    expect(getDocumentDefinition('appraisal')?.requiredWhen).toBe(
      'when_real_estate_collateral',
    );
    expect(getDocumentDefinition('flood_determination')?.requiredWhen).toBe(
      'when_real_estate_collateral',
    );
  });

  it('borrowing base certificate is required when borrowing base loan', () => {
    expect(
      getDocumentDefinition('borrowing_base_certificate')?.requiredWhen,
    ).toBe('when_borrowing_base');
  });

  it('SBA authorization is required when SBA loan', () => {
    expect(getDocumentDefinition('sba_authorization')?.requiredWhen).toBe(
      'when_sba',
    );
  });

  it('annual review is required when active monitored', () => {
    expect(getDocumentDefinition('annual_review')?.requiredWhen).toBe(
      'when_active_monitored',
    );
  });

  it('insurance evidence is required when collateral requires insurance and tracks staleness', () => {
    const def = getDocumentDefinition('insurance_evidence');
    expect(def?.requiredWhen).toBe('when_collateral_requires_insurance');
    expect(def?.staleAfterDays).toBeGreaterThan(0);
  });
});

describe('Phase 140B — FDIC document requirements are represented', () => {
  it('has FDIC-required documents including the note', () => {
    const fdic = documentsRequiredForFDICReview().map((d) => d.documentType);
    expect(fdic.length).toBeGreaterThan(0);
    expect(fdic).toContain('note');
    expect(fdic).toContain('loan_agreement');
    expect(fdic).toContain('approval_memo');
    expect(fdic).toContain('credit_memo');
  });
});
