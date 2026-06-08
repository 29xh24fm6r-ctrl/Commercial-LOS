import { describe, it, expect } from 'vitest';
import { deriveAnnualReviewReadiness } from './deriveAnnualReviewReadiness';
import type {
  AnnualReviewCycle,
  AnnualReviewLoanSnapshot,
  AnnualReviewSubmittedDocument,
  AnnualReviewDocumentType,
} from './annualReviewTypes';

const CYCLE: AnnualReviewCycle = {
  cycleId: 'c1',
  reviewYear: 2026,
  asOfDate: '2026-06-08',
  cycleEndDate: '2026-12-31',
  status: 'in_progress',
};

function accepted(type: AnnualReviewDocumentType, effectiveDate: string): AnnualReviewSubmittedDocument {
  return { documentType: type, accepted: true, status: 'accepted', receivedDate: effectiveDate, reviewedDate: effectiveDate, effectiveDate };
}

function readyLoan(over: Partial<AnnualReviewLoanSnapshot> = {}): AnnualReviewLoanSnapshot {
  return {
    loanStatus: 'active',
    loanNumber: 'LN1',
    borrowerName: 'Synthetic Obligor',
    riskRating: '4',
    annualReviewDueDate: '2026-09-30',
    submittedDocuments: [
      accepted('annual_financial_statements', '2026-05-01'),
      accepted('tax_returns', '2026-05-01'),
    ],
    ...over,
  };
}

function readiness(loan: AnnualReviewLoanSnapshot) {
  return deriveAnnualReviewReadiness({ loan, cycle: CYCLE, asOfDate: '2026-06-08' });
}

describe('Phase 141A — annual review readiness is fail-closed', () => {
  it('a fully-documented loan is ready', () => {
    const r = readiness(readyLoan());
    expect(r.financialsComplete).toBe(true);
    expect(r.annualReviewReady).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('missing financials block readiness', () => {
    const r = readiness(readyLoan({ submittedDocuments: [] }));
    expect(r.financialsComplete).toBe(false);
    expect(r.annualReviewReady).toBe(false);
  });

  it('stale financials block readiness', () => {
    const r = readiness(
      readyLoan({
        submittedDocuments: [
          accepted('annual_financial_statements', '2024-01-01'),
          accepted('tax_returns', '2026-05-01'),
        ],
      }),
    );
    expect(r.financialsComplete).toBe(false);
    expect(r.annualReviewReady).toBe(false);
  });

  it('covenant breach, expired insurance, and unresolved exceptions each block readiness', () => {
    expect(readiness(readyLoan({ hasCovenants: true, covenantStatus: 'breach' })).covenantsComplete).toBe(false);
    expect(readiness(readyLoan({ collateralRequiresInsurance: true, insuranceStatus: 'expired' })).insuranceComplete).toBe(false);
    expect(readiness(readyLoan({ highSeverityExceptionCount: 2 })).exceptionsResolved).toBe(false);
    expect(readiness(readyLoan({ hasCovenants: true, covenantStatus: 'breach' })).annualReviewReady).toBe(false);
  });

  it('a missing risk rating blocks review completion', () => {
    const r = readiness(readyLoan({ riskRating: undefined }));
    expect(r.riskReviewComplete).toBe(false);
    expect(r.annualReviewReady).toBe(false);
  });

  it('a paid-off loan is out of scope (not ready, with an honest blocker)', () => {
    const r = readiness(readyLoan({ loanStatus: 'paid_off' }));
    expect(r.annualReviewReady).toBe(false);
    expect(r.blockers.some((b) => /not in scope/i.test(b))).toBe(true);
  });
});
