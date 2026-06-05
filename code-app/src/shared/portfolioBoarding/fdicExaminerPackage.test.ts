import { describe, it, expect } from 'vitest';
import { deriveFdicExaminerPackage, deriveFdicExaminerRequestChecklist } from './fdicExaminerPackage';
import { createEmptyPortfolioLoanBoardingPackage } from './portfolioLoanBoardingTypes';

describe('Phase 140B-H — fdicExaminerPackage', () => {
  it('derives a package with all sections for an empty loan', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    const result = deriveFdicExaminerPackage(pkg);
    expect(result.sections.length).toBeGreaterThan(10);
    expect(result.fdicReady).toBe(false);
    expect(result.boardReady).toBe(false);
  });

  it('discloses missing documents', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    // An empty package will have missing required documents
    const result = deriveFdicExaminerPackage(pkg);
    expect(result.missingDisclosure.length).toBeGreaterThan(0);
  });

  it('discloses exception documents', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.documents.documents.push({ documentType: 'note', documentName: 'Note', exception: true });
    const result = deriveFdicExaminerPackage(pkg);
    expect(result.exceptionDisclosure.length).toBe(1);
    expect(result.exceptionDisclosure[0]).toBe('Note');
  });

  it('passes through identity fields', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.identity.dealName = 'Test Loan';
    pkg.identity.borrowerLegalName = 'Test Borrower';
    pkg.identity.loanNumber = 'LN-001';
    const result = deriveFdicExaminerPackage(pkg);
    expect(result.loanName).toBe('Test Loan');
    expect(result.borrowerName).toBe('Test Borrower');
    expect(result.loanNumber).toBe('LN-001');
  });

  it('derives examiner request checklist from examiner notes', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.examinerNotes.push({
      noteId: 'n1',
      note: 'Please provide 2024 financials',
      responseStatus: 'pending',
      relatedEvidenceIds: [],
    });
    const checklist = deriveFdicExaminerRequestChecklist(pkg);
    expect(checklist.length).toBe(1);
    expect(checklist[0].requestId).toBe('n1');
    expect(checklist[0].description).toBe('Please provide 2024 financials');
  });
});
