import { describe, it, expect } from 'vitest';
import { derivePortfolioBoardedLoanCommandRows, mergeBoardedLoansIntoPortfolioSnapshotInput } from './portfolioBoardingCommandCenterAdapter';
import { createEmptyPortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

describe('Phase 140B-H — portfolioBoardingCommandCenterAdapter', () => {
  it('derives command rows from boarded loan packages', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.identity.dealName = 'Test Loan';
    pkg.identity.borrowerLegalName = 'Test Borrower';
    pkg.source = 'manual_boarding';
    const rows = derivePortfolioBoardedLoanCommandRows([pkg]);
    expect(rows.length).toBe(1);
    expect(rows[0].loanName).toBe('Test Loan');
    expect(rows[0].source).toBe('manual_boarding');
  });

  it('does not create fake rows for empty input', () => {
    const rows = derivePortfolioBoardedLoanCommandRows([]);
    expect(rows).toEqual([]);
  });

  it('preserves source marker on command rows', () => {
    const pkg1 = createEmptyPortfolioLoanBoardingPackage();
    pkg1.source = 'manual_boarding';
    const pkg2 = createEmptyPortfolioLoanBoardingPackage();
    pkg2.source = 'originated_closed_deal';
    const rows = derivePortfolioBoardedLoanCommandRows([pkg1, pkg2]);
    expect(rows[0].source).toBe('manual_boarding');
    expect(rows[1].source).toBe('originated_closed_deal');
  });

  it('merge helper adds boardedLoans to existing input', () => {
    const existing = { dealCount: 5, boardedLoans: undefined as any };
    const rows = derivePortfolioBoardedLoanCommandRows([]);
    const merged = mergeBoardedLoansIntoPortfolioSnapshotInput(existing, rows);
    expect(merged.boardedLoans).toEqual([]);
  });
});
