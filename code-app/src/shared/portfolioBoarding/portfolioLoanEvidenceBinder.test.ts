import { describe, it, expect } from 'vitest';
import { deriveEvidenceBinder } from './portfolioLoanEvidenceBinder';
import { createEmptyPortfolioLoanBoardingPackage } from './portfolioLoanBoardingTypes';

describe('Phase 140B-H — portfolioLoanEvidenceBinder', () => {
  it('returns all examiner sections for an empty package', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    const binder = deriveEvidenceBinder(pkg);
    expect(binder.length).toBeGreaterThan(10);
    expect(binder.every((s) => s.sectionKey && s.label)).toBe(true);
  });

  it('groups a note document into loan_terms', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.documents.documents.push({ documentType: 'note', documentName: 'Promissory Note', status: 'received' });
    const binder = deriveEvidenceBinder(pkg);
    const loanTerms = binder.find((s) => s.sectionKey === 'loan_terms');
    expect(loanTerms!.documentCount).toBe(1);
  });

  it('counts missing and stale documents per section', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.documents.documents.push({ documentType: 'approval_memo', documentName: 'Approval', missing: true });
    pkg.documents.documents.push({ documentType: 'credit_memo', documentName: 'Credit', stale: true });
    const binder = deriveEvidenceBinder(pkg);
    const approval = binder.find((s) => s.sectionKey === 'loan_approval');
    expect(approval!.missingCount).toBe(1);
    expect(approval!.staleCount).toBe(1);
  });

  it('empty package sections have zero counts', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    const binder = deriveEvidenceBinder(pkg);
    expect(binder.every((s) => s.documentCount === 0)).toBe(true);
  });
});
