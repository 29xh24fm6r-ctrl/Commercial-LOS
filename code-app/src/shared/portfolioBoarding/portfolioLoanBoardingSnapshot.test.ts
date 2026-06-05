import { describe, it, expect } from 'vitest';
import { derivePortfolioLoanBoardingSnapshot } from './portfolioLoanBoardingSnapshot';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
  type PortfolioLoanDocumentRecord,
  type PortfolioLoanDocumentType,
} from './portfolioLoanBoardingTypes';

/**
 * Phase 140B — Portfolio loan boarding snapshot pins.
 */

const NOW = new Date('2026-06-05T00:00:00Z');

function received(
  documentType: PortfolioLoanDocumentType,
  effectiveDate: string,
): PortfolioLoanDocumentRecord {
  return { documentType, status: 'received', receivedDate: effectiveDate, effectiveDate };
}

function completeActivePackage(): PortfolioLoanBoardingPackage {
  const pkg = createEmptyPortfolioLoanBoardingPackage();
  pkg.identity = {
    loanNumber: 'LOAN-0001',
    dealName: 'Boarding Test Facility',
    borrowerLegalName: 'Synthetic Test Obligor',
    loanStatus: 'active',
    bookingDate: '2026-01-15',
    closingDate: '2026-01-10',
    maturityDate: '2031-01-10',
    portfolioManager: 'Portfolio Manager Placeholder',
  };
  pkg.borrower = { legalEntityType: 'LLC', naicsIndustry: '236220' };
  pkg.terms = {
    originalCommitmentAmount: 1_000_000,
    currentOutstandingPrincipal: 750_000,
    interestRateType: 'fixed',
    paymentFrequency: 'monthly',
  };
  pkg.creditApproval = {
    approvalAuthority: 'Loan Committee',
    approvalDate: '2026-01-05',
    approvedPurpose: 'Working capital',
    approvedStructure: 'Term loan',
  };
  pkg.servicing = {
    currentRiskRating: '4',
    riskRatingDate: '2026-01-15',
    nextReviewDate: '2027-01-15',
    annualReviewStatus: 'current',
    accrualStatus: 'accrual',
    covenantStatus: 'in_compliance',
    pastDueDays: 0,
  };
  pkg.documents = {
    documents: [
      received('note', '2026-01-10'),
      received('loan_agreement', '2026-01-10'),
      received('approval_memo', '2026-01-05'),
      received('credit_memo', '2026-01-05'),
      received('financial_statements', '2026-03-31'),
      received('annual_review', '2026-02-01'),
    ],
  };
  return pkg;
}

describe('Phase 140B — snapshot of a complete package', () => {
  it('passes identity through and reports 100% completeness + ready', () => {
    const snap = derivePortfolioLoanBoardingSnapshot({
      package: completeActivePackage(),
      now: NOW,
    });
    expect(snap.borrowerName).toBe('Synthetic Test Obligor');
    expect(snap.loanNumber).toBe('LOAN-0001');
    expect(snap.currentBalance).toBe(750_000);
    expect(snap.riskRating).toBe('4');
    expect(snap.fieldCompletenessPct).toBe(100);
    expect(snap.documentCompletenessPct).toBe(100);
    expect(snap.fdicReady).toBe(true);
    expect(snap.boardReady).toBe(true);
    expect(snap.portfolioMonitoringReady).toBe(true);
    expect(snap.topBlockers).toEqual([]);
  });
});

describe('Phase 140B — snapshot never invents values', () => {
  it('leaves missing scalars undefined and reports 0% / not-ready', () => {
    const snap = derivePortfolioLoanBoardingSnapshot({
      package: createEmptyPortfolioLoanBoardingPackage(),
      now: NOW,
    });
    expect(snap.borrowerName).toBeUndefined();
    expect(snap.loanNumber).toBeUndefined();
    expect(snap.currentBalance).toBeUndefined();
    expect(snap.maturityDate).toBeUndefined();
    expect(snap.riskRating).toBeUndefined();
    expect(snap.fieldCompletenessPct).toBe(0);
    expect(snap.documentCompletenessPct).toBe(0);
    expect(snap.fdicReady).toBe(false);
    expect(snap.boardReady).toBe(false);
    expect(snap.portfolioMonitoringReady).toBe(false);
    expect(snap.topBlockers.length).toBeGreaterThan(0);
  });
});

describe('Phase 140B — snapshot summaries', () => {
  it('summarizes covenants, collateral, guarantors, and stale documents honestly', () => {
    const pkg = completeActivePackage();
    pkg.covenants.covenants = [
      { covenantName: 'DSCR', currentStatus: 'in_compliance' },
      { covenantName: 'Leverage', currentStatus: 'breach' },
      { covenantName: 'Liquidity', currentStatus: 'waived' },
    ];
    pkg.collateral.items = [
      { collateralType: 'real_estate', insuranceRequired: true },
      { collateralType: 'equipment' },
    ];
    pkg.guarantors.guarantors = [
      { guarantorName: 'G1', personalFinancialStatementDate: '2026-01-01' },
      { guarantorName: 'G2' },
    ];
    const snap = derivePortfolioLoanBoardingSnapshot({ package: pkg, now: NOW });

    expect(snap.covenantSummary).toEqual({ total: 3, inBreach: 1, waived: 1 });
    expect(snap.collateralSummary.itemCount).toBe(2);
    expect(snap.collateralSummary.hasRealEstate).toBe(true);
    expect(snap.collateralSummary.types).toEqual(
      expect.arrayContaining(['real_estate', 'equipment']),
    );
    expect(snap.guarantorSummary.count).toBe(2);
    expect(snap.guarantorSummary.missingFinancialStatementCount).toBe(1);
  });

  it('respects the topBlockerLimit', () => {
    const snap = derivePortfolioLoanBoardingSnapshot({
      package: createEmptyPortfolioLoanBoardingPackage(),
      now: NOW,
      topBlockerLimit: 2,
    });
    expect(snap.topBlockers.length).toBeLessThanOrEqual(2);
  });
});
