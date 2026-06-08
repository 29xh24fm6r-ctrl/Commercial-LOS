import { describe, it, expect } from 'vitest';
import { buildAnnualReviewBorrowerRequestDraft } from './buildAnnualReviewBorrowerRequestDraft';
import { buildAnnualReviewBorrowerRequestPackage } from './buildAnnualReviewBorrowerRequestPackage';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';
import type { AnnualReviewBorrowerRequestRecipientDecision } from './annualReviewBorrowerRequestTypes';

/**
 * Phase 141M — request draft builder pins (preview only).
 */

const CYCLE: AnnualReviewCycle = { cycleId: 'CY1', reviewYear: 2026, asOfDate: '2026-06-08', status: 'in_progress' };
const LOAN: AnnualReviewLoanSnapshot = { loanNumber: 'LN1', borrowerName: 'Synthetic Borrower', loanStatus: 'active', annualReviewDueDate: '2026-09-30' };

const READY: AnnualReviewBorrowerRequestRecipientDecision = {
  selectedRecipientId: 'P1', selectedDisplayName: 'Synthetic Contact', selectedContactPointId: 'CP1', selectedContactValueMasked: '•••@•••',
  decision: 'ready_for_human_approval', confidence: 'high', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: true, safeForSend: false, candidates: [],
};
const BLOCKED: AnnualReviewBorrowerRequestRecipientDecision = {
  decision: 'blocked_do_not_contact', confidence: 'low', blockers: [{ code: 'do_not_contact', message: 'Do-not-contact is set.' }], warnings: [], requiresHumanSelection: false, safeForDraft: false, safeForSend: false, candidates: [],
};

function draftFor(decision: AnnualReviewBorrowerRequestRecipientDecision) {
  const pkg = buildAnnualReviewBorrowerRequestPackage({ annualReviewId: 'AR1', loan: LOAN, cycle: CYCLE, recipientDecision: decision, requestedAt: '2026-06-08T00:00:00Z', asOfDate: '2026-06-08' });
  return buildAnnualReviewBorrowerRequestDraft({ package: pkg, recipientDecision: decision });
}

describe('Phase 141M — request draft preview', () => {
  it('creates a draft preview for a ready recipient', () => {
    const d = draftFor(READY);
    expect(d.subject).toContain('Synthetic Borrower');
    expect(d.bodyPreview.length).toBeGreaterThan(0);
    expect(d.requestItemSummary.length).toBeGreaterThan(0);
    expect(d.approvalRequired).toBe(true);
    expect(d.bodyPreview.toLowerCase()).toContain('human approval');
  });

  it('a blocked recipient produces a blocked draft (reason replaces the body)', () => {
    const d = draftFor(BLOCKED);
    expect(d.bodyPreview.toLowerCase()).toContain('blocked');
    expect(d.blockers.length).toBeGreaterThan(0);
  });

  it('has no send state and a populated send-disabled reason', () => {
    const d = draftFor(READY);
    expect(d.sendDisabledReason.length).toBeGreaterThan(0);
    expect(JSON.stringify(d)).not.toMatch(/"sent"|approved_and_sent/);
  });

  it('contains no outreach primitive (mailto / email / sms / upload-link send)', () => {
    const d = draftFor(READY);
    const serialized = JSON.stringify(d);
    expect(serialized).not.toMatch(/mailto:|sendEmail|sendSms|twilio|https?:\/\//i);
  });

  it('masks the contact and fabricates no borrower data', () => {
    const d = draftFor(READY);
    expect(d.recipientContactMasked).toBe('•••@•••');
    expect(JSON.stringify(d)).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});
