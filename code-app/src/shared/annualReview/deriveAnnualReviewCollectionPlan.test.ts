import { describe, it, expect } from 'vitest';
import { deriveAnnualReviewCollectionPlan } from './deriveAnnualReviewCollectionPlan';
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

function loan(over: Partial<AnnualReviewLoanSnapshot> = {}): AnnualReviewLoanSnapshot {
  return {
    loanStatus: 'active',
    loanNumber: 'LN1',
    borrowerName: 'Synthetic Obligor',
    riskRating: '4',
    annualReviewDueDate: '2026-09-30',
    ...over,
  };
}

function accepted(type: AnnualReviewDocumentType, effectiveDate: string): AnnualReviewSubmittedDocument {
  return { documentType: type, accepted: true, status: 'accepted', receivedDate: effectiveDate, reviewedDate: effectiveDate, effectiveDate };
}

describe('Phase 141A — collection plan honest empty + scope', () => {
  it('empty portfolio returns an honest empty result', () => {
    const r = deriveAnnualReviewCollectionPlan({ loans: [], cycle: CYCLE });
    expect(r.totalLoansInScope).toBe(0);
    expect(r.loansRequiringReview).toBe(0);
    expect(r.blockers).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('paid-off loans are counted as not requiring review', () => {
    const r = deriveAnnualReviewCollectionPlan({ loans: [loan({ loanStatus: 'paid_off' })], cycle: CYCLE });
    expect(r.loansRequiringReview).toBe(0);
    expect(r.loansNotRequiringReview).toBe(1);
  });
});

describe('Phase 141A — missing / past-due / stale produce blockers + escalations', () => {
  it('an active loan with no documents has missing required financials (blocker)', () => {
    const r = deriveAnnualReviewCollectionPlan({ loans: [loan()], cycle: CYCLE, asOfDate: '2026-06-08' });
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.blockers.some((b) => /missing Annual financial statements/i.test(b))).toBe(true);
  });

  it('a past-due required financial creates an escalation', () => {
    const r = deriveAnnualReviewCollectionPlan({
      loans: [loan({ annualReviewDueDate: '2026-01-01' })],
      cycle: CYCLE,
      asOfDate: '2026-06-08',
    });
    expect(r.pastDue.length).toBeGreaterThan(0);
    expect(r.escalations.some((e) => /Past-due/i.test(e.reason))).toBe(true);
  });

  it('stale accepted financials are surfaced as a stale blocker', () => {
    const r = deriveAnnualReviewCollectionPlan({
      loans: [
        loan({
          submittedDocuments: [
            accepted('annual_financial_statements', '2024-01-01'), // > 365 days old
            accepted('tax_returns', '2026-05-01'),
          ],
        }),
      ],
      cycle: CYCLE,
      asOfDate: '2026-06-08',
    });
    expect(r.stale.length).toBeGreaterThan(0);
    expect(r.blockers.some((b) => /stale/i.test(b))).toBe(true);
  });

  it('fresh accepted required financials produce no missing/stale blockers', () => {
    const r = deriveAnnualReviewCollectionPlan({
      loans: [
        loan({
          submittedDocuments: [
            accepted('annual_financial_statements', '2026-05-01'),
            accepted('tax_returns', '2026-05-01'),
          ],
        }),
      ],
      cycle: CYCLE,
      asOfDate: '2026-06-08',
    });
    expect(r.blockers).toEqual([]);
    expect(r.reviewedAccepted.length).toBe(2);
  });

  it('covenant breach + past-due days create operational escalations', () => {
    const r = deriveAnnualReviewCollectionPlan({
      loans: [loan({ hasCovenants: true, covenantStatus: 'breach', pastDueDays: 20, insuranceStatus: 'expired', collateralRequiresInsurance: true })],
      cycle: CYCLE,
      asOfDate: '2026-06-08',
    });
    expect(r.escalations.some((e) => /Covenant breach/i.test(e.reason))).toBe(true);
    expect(r.escalations.some((e) => /Past due 20/i.test(e.reason))).toBe(true);
    expect(r.escalations.some((e) => /Insurance lapse/i.test(e.reason))).toBe(true);
  });
});
