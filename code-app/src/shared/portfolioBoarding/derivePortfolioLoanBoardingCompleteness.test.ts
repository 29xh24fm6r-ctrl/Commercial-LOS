import { describe, it, expect } from 'vitest';
import { derivePortfolioLoanBoardingCompleteness } from './derivePortfolioLoanBoardingCompleteness';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
  type PortfolioLoanDocumentRecord,
  type PortfolioLoanDocumentType,
} from './portfolioLoanBoardingTypes';

/**
 * Phase 140B — Portfolio loan boarding completeness pins.
 *
 * Test fixtures use OBVIOUSLY-synthetic placeholder values; they live only in
 * this .test.ts file. The shared source modules carry no borrower data — the
 * governance test pins that separately.
 */

const NOW = new Date('2026-06-05T00:00:00Z');

function received(
  documentType: PortfolioLoanDocumentType,
  effectiveDate: string,
): PortfolioLoanDocumentRecord {
  return { documentType, status: 'received', receivedDate: effectiveDate, effectiveDate };
}

/** A fully-complete, FDIC/board/monitoring-ready active loan package. */
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

function derive(pkg: PortfolioLoanBoardingPackage) {
  return derivePortfolioLoanBoardingCompleteness({ package: pkg, now: NOW });
}

describe('Phase 140B — a complete package is ready on all three lenses', () => {
  it('reports fdic / board / monitoring ready with no blockers', () => {
    const r = derive(completeActivePackage());
    expect(r.fdicReady).toBe(true);
    expect(r.boardReady).toBe(true);
    expect(r.portfolioMonitoringReady).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.missingRequiredFields).toEqual([]);
    expect(r.missingRequiredDocuments).toEqual([]);
    expect(r.completedRequiredFields).toBe(r.totalRequiredFields);
  });
});

describe('Phase 140B — readiness is fail-closed', () => {
  it('an empty package is not ready on any lens', () => {
    const r = derive(createEmptyPortfolioLoanBoardingPackage());
    expect(r.fdicReady).toBe(false);
    expect(r.boardReady).toBe(false);
    expect(r.portfolioMonitoringReady).toBe(false);
    expect(r.completedRequiredFields).toBe(0);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('a single missing required FDIC field flips fdicReady false', () => {
    const pkg = completeActivePackage();
    pkg.servicing.currentRiskRating = undefined;
    expect(derive(pkg).fdicReady).toBe(false);
  });
});

describe('Phase 140B — specific FDIC / board / monitoring blockers', () => {
  it('missing note blocks FDIC readiness (board stays ready)', () => {
    const pkg = completeActivePackage();
    pkg.documents.documents = pkg.documents.documents.filter(
      (d) => d.documentType !== 'note',
    );
    const r = derive(pkg);
    expect(r.fdicReady).toBe(false);
    expect(r.boardReady).toBe(true);
    expect(r.missingRequiredDocuments).toContain('note');
  });

  it('missing approval memo blocks board readiness', () => {
    const pkg = completeActivePackage();
    pkg.documents.documents = pkg.documents.documents.filter(
      (d) => d.documentType !== 'approval_memo',
    );
    const r = derive(pkg);
    expect(r.boardReady).toBe(false);
    expect(r.missingRequiredDocuments).toContain('approval_memo');
  });

  it('missing annual review blocks portfolio monitoring readiness when active', () => {
    const pkg = completeActivePackage();
    pkg.documents.documents = pkg.documents.documents.filter(
      (d) => d.documentType !== 'annual_review',
    );
    const r = derive(pkg);
    expect(r.portfolioMonitoringReady).toBe(false);
    expect(r.missingRequiredDocuments).toContain('annual_review');
  });
});

describe('Phase 140B — staleness is surfaced', () => {
  it('stale insurance evidence appears in staleDocuments and blockers', () => {
    const pkg = completeActivePackage();
    pkg.collateral.items = [
      { collateralType: 'equipment', insuranceRequired: true },
    ];
    // Insurance evidence received but well over a year old → stale.
    pkg.documents.documents.push(received('insurance_evidence', '2024-01-01'));
    const r = derive(pkg);
    expect(r.staleDocuments).toContain('insurance_evidence');
    expect(r.blockers.some((b) => /Stale document: Insurance evidence/i.test(b))).toBe(
      true,
    );
  });
});

describe('Phase 140B — collateral-driven document requirements', () => {
  it('real estate collateral requires appraisal, title, flood, insurance, and mortgage/deed', () => {
    const pkg = completeActivePackage();
    pkg.collateral.items = [
      { collateralType: 'real_estate', insuranceRequired: true },
    ];
    const r = derive(pkg);
    for (const docType of [
      'mortgage_deed_of_trust',
      'title_policy',
      'appraisal',
      'flood_determination',
      'insurance_evidence',
    ] as const) {
      expect(r.missingRequiredDocuments, docType).toContain(docType);
    }
  });
});

describe('Phase 140B — guarantor-driven requirements', () => {
  it('guarantors require a guaranty document and guarantor financial info', () => {
    const pkg = completeActivePackage();
    pkg.guarantors.guarantors = [{ guarantorName: 'Synthetic Guarantor' }];
    const r = derive(pkg);
    expect(r.missingRequiredDocuments).toContain('guaranty');
    expect(
      r.blockers.some((b) => /Guarantor financial statement date missing/i.test(b)),
    ).toBe(true);
  });
});

describe('Phase 140B — SBA-driven requirements', () => {
  it('SBA loans require SBA authorization and guarantee documents', () => {
    const pkg = completeActivePackage();
    pkg.terms.sbaLoan = true;
    const r = derive(pkg);
    expect(r.missingRequiredDocuments).toContain('sba_authorization');
    expect(r.missingRequiredDocuments).toContain('sba_guarantee');
  });
});

describe('Phase 140B — exceptions are counted honestly', () => {
  it('counts open and high-severity exceptions and never invents them', () => {
    const empty = derive(createEmptyPortfolioLoanBoardingPackage());
    expect(empty.exceptionCount).toBe(0);
    expect(empty.highSeverityExceptionCount).toBe(0);

    const pkg = completeActivePackage();
    pkg.exceptions = [
      { exceptionType: 'doc', severity: 'high', status: 'open' },
      { exceptionType: 'doc', severity: 'low', status: 'open' },
      { exceptionType: 'doc', severity: 'high', status: 'cleared' },
    ];
    const r = derive(pkg);
    expect(r.exceptionCount).toBe(2); // cleared excluded
    expect(r.highSeverityExceptionCount).toBe(1);
  });
});
