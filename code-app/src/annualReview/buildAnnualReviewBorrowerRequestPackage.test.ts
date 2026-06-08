import { describe, it, expect } from 'vitest';
import { buildAnnualReviewBorrowerRequestPackage } from './buildAnnualReviewBorrowerRequestPackage';
import { deriveAnnualReviewCollectionPlan } from '../shared/annualReview/deriveAnnualReviewCollectionPlan';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';
import type { AnnualReviewBorrowerRequestRecipientDecision } from './annualReviewBorrowerRequestTypes';

/**
 * Phase 141M — request package builder pins.
 */

const CYCLE: AnnualReviewCycle = { cycleId: 'CY1', reviewYear: 2026, asOfDate: '2026-06-08', status: 'in_progress' };
const LOAN: AnnualReviewLoanSnapshot = {
  loanNumber: 'LN1',
  borrowerName: 'Synthetic Borrower',
  loanStatus: 'active',
  annualReviewDueDate: '2026-09-30',
};

const READY: AnnualReviewBorrowerRequestRecipientDecision = {
  selectedRecipientId: 'P1',
  selectedDisplayName: 'Synthetic Contact',
  selectedContactPointId: 'CP1',
  selectedContactValueMasked: '•••@•••',
  decision: 'ready_for_human_approval',
  confidence: 'high',
  blockers: [],
  warnings: [],
  requiresHumanSelection: false,
  safeForDraft: true,
  safeForSend: false,
  candidates: [],
};

const BLOCKED: AnnualReviewBorrowerRequestRecipientDecision = {
  decision: 'blocked_no_recipient',
  confidence: 'low',
  blockers: [{ code: 'no_recipient', message: 'No borrower organization linked in CRM.' }],
  warnings: [],
  requiresHumanSelection: false,
  safeForDraft: false,
  safeForSend: false,
  candidates: [],
};

function build(decision: AnnualReviewBorrowerRequestRecipientDecision) {
  return buildAnnualReviewBorrowerRequestPackage({
    annualReviewId: 'AR1',
    loan: LOAN,
    cycle: CYCLE,
    recipientDecision: decision,
    requestedAt: '2026-06-08T00:00:00Z',
    asOfDate: '2026-06-08',
  });
}

describe('Phase 141M — request package', () => {
  it('builds request items from the existing annual review requirements', () => {
    const pkg = build(READY);
    const reqs = deriveAnnualReviewCollectionPlan({ loans: [LOAN], cycle: CYCLE, asOfDate: '2026-06-08' }).requirementsByLoan[0].requirements;
    expect(pkg.requestItems.length).toBe(reqs.length);
    expect(pkg.requestItems.length).toBeGreaterThan(0);
    const reqIds = new Set(reqs.map((r) => r.requirementId));
    for (const item of pkg.requestItems) {
      expect(item.source).toBe('annual_review_requirement');
      expect(reqIds.has(item.itemId)).toBe(true);
    }
    expect(pkg.status).toBe('draft_only');
  });

  it('a blocked recipient blocks package readiness', () => {
    const pkg = build(BLOCKED);
    expect(pkg.status).toBe('blocked');
    expect(pkg.blockers.length).toBeGreaterThan(0);
  });

  it('generates no upload link', () => {
    const pkg = build(READY);
    expect(JSON.stringify(pkg)).not.toMatch(/https?:\/\//);
    for (const item of pkg.requestItems) {
      expect(item.allowedUploadMethods.join(' ')).toMatch(/disabled/i);
    }
  });

  it('mutates no document / task (input loan is untouched)', () => {
    const snapshot = JSON.stringify(LOAN);
    build(READY);
    expect(JSON.stringify(LOAN)).toBe(snapshot);
  });

  it('fabricates no documents (all items map to real requirement types)', () => {
    const pkg = build(READY);
    const reqs = deriveAnnualReviewCollectionPlan({ loans: [LOAN], cycle: CYCLE, asOfDate: '2026-06-08' }).requirementsByLoan[0].requirements;
    const validTypes = new Set(reqs.map((r) => r.documentType));
    for (const item of pkg.requestItems) {
      expect(validTypes.has(item.documentType)).toBe(true);
    }
  });

  it('preserves due dates', () => {
    const pkg = build(READY);
    const reqs = deriveAnnualReviewCollectionPlan({ loans: [LOAN], cycle: CYCLE, asOfDate: '2026-06-08' }).requirementsByLoan[0].requirements;
    const byId = new Map(reqs.map((r) => [r.requirementId, r.dueDate]));
    for (const item of pkg.requestItems) {
      expect(item.dueDate).toBe(byId.get(item.itemId));
    }
  });

  it('the audit summary redacts contact details', () => {
    const pkg = build(READY);
    expect(pkg.auditSummary.containsContactValue).toBe(false);
    expect(pkg.auditSummary.redactedFields.length).toBeGreaterThan(0);
    expect(JSON.stringify(pkg)).not.toContain('present');
  });
});
