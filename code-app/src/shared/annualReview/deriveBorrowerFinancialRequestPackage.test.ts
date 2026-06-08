import { describe, it, expect } from 'vitest';
import { deriveBorrowerFinancialRequestPackage } from './deriveBorrowerFinancialRequestPackage';
import { deriveAnnualReviewTasks } from './annualReviewTaskEngine';
import type { AnnualReviewCycle, AnnualReviewLoanSnapshot } from './annualReviewTypes';

const CYCLE: AnnualReviewCycle = {
  cycleId: 'c1',
  reviewYear: 2026,
  asOfDate: '2026-06-08',
  cycleEndDate: '2026-12-31',
  status: 'in_progress',
};

function loan(over: Partial<AnnualReviewLoanSnapshot> = {}): AnnualReviewLoanSnapshot {
  return { loanStatus: 'active', loanNumber: 'LN1', borrowerName: 'Synthetic Obligor', riskRating: '4', annualReviewDueDate: '2026-09-30', ...over };
}

describe('Phase 141A — borrower financial request package is preview-only', () => {
  it('is a preview draft, sends nothing, and lists required + missing documents', () => {
    const pkg = deriveBorrowerFinancialRequestPackage({ loan: loan(), cycle: CYCLE, asOfDate: '2026-06-08' });
    expect(pkg.isPreviewOnly).toBe(true);
    expect(pkg.notes).toMatch(/no email or SMS is sent/i);
    expect(pkg.uploadInstructionsPlaceholder).toMatch(/not configured/i);
    expect(pkg.requiredDocuments.length).toBeGreaterThan(0);
    expect(pkg.missingDocuments.length).toBeGreaterThan(0);
  });

  it('surfaces a missing-contact blocker and never fabricates contact', () => {
    const pkg = deriveBorrowerFinancialRequestPackage({ loan: loan(), cycle: CYCLE });
    expect(pkg.contactConfigured).toBe(false);
    expect(pkg.borrowerContactEmail).toBeUndefined();
    expect(pkg.blockers.some((b) => /Missing borrower contact/i.test(b))).toBe(true);
  });

  it('a present contact configures the request (no blocker)', () => {
    const pkg = deriveBorrowerFinancialRequestPackage({
      loan: loan({ borrowerContactName: 'Contact Person', borrowerContactEmail: 'contact@example.test' }),
      cycle: CYCLE,
    });
    expect(pkg.contactConfigured).toBe(true);
    expect(pkg.blockers).toEqual([]);
  });
});

describe('Phase 141A — task engine derives operational tasks (no writes)', () => {
  it('a loan with missing financials yields a request-financials task', () => {
    const tasks = deriveAnnualReviewTasks({ loans: [loan()], cycle: CYCLE, asOfDate: '2026-06-08' });
    expect(tasks.some((t) => t.taskType === 'request_financials')).toBe(true);
    // No task is ever marked completed by the pure engine.
    expect(tasks.every((t) => t.status !== 'completed')).toBe(true);
  });

  it('a past-due loan escalates and follows up', () => {
    const tasks = deriveAnnualReviewTasks({ loans: [loan({ annualReviewDueDate: '2026-01-01' })], cycle: CYCLE, asOfDate: '2026-06-08' });
    expect(tasks.some((t) => t.taskType === 'escalate_past_due')).toBe(true);
    expect(tasks.some((t) => t.taskType === 'follow_up_borrower')).toBe(true);
  });

  it('a criticized loan triggers a board review task', () => {
    const tasks = deriveAnnualReviewTasks({ loans: [loan({ criticizedClassifiedStatus: 'substandard' })], cycle: CYCLE, asOfDate: '2026-06-08' });
    expect(tasks.some((t) => t.taskType === 'board_review' && t.escalationLevel === 'board')).toBe(true);
  });

  it('out-of-scope loans generate no tasks', () => {
    const tasks = deriveAnnualReviewTasks({ loans: [loan({ loanStatus: 'paid_off' })], cycle: CYCLE });
    expect(tasks).toEqual([]);
  });
});
