import { describe, it, expect } from 'vitest';
import { resolveAnnualReviewDeliveryAdapters, type AnnualReviewDeliveryFacadeInput } from './resolveAnnualReviewDeliveryAdapters';
import type { AnnualReviewBorrowerRequestRecipientDecision, AnnualReviewBorrowerRequestPackage } from './annualReviewBorrowerRequestTypes';
import type { AnnualReviewDeliveryChannel } from './annualReviewDeliveryTypes';

function readyDecision(): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    selectedRecipientId: 'P1', selectedDisplayName: 'Synthetic Contact', selectedContactPointId: 'CP1', selectedContactValueMasked: '•••@•••',
    decision: 'ready_for_human_approval', confidence: 'high', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: true, safeForSend: false,
    candidates: [{ candidateId: 'P1', personId: 'P1', organizationId: 'ORG1', displayName: 'Synthetic Contact', roleTypes: ['borrower_contact'], contactPoints: [{ contactPointId: 'CP1', channel: 'email', masked: '•••@•••', usable: true }], authorizationFlags: { financialRequests: true, uploadLinks: true, loanNotices: true }, communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: [] }, source: 'crm', confidence: 'high', blockers: [], warnings: [] }],
  };
}
const PKG = { packageId: 'p', annualReviewId: 'AR1', borrowerName: 'Synthetic Borrower', requestItems: [], recipientDecision: readyDecision(), approvalState: 'draft_only', deliveryMode: 'draft_preview', status: 'draft_only', blockers: [], auditSummary: { itemCount: 0, containsContactValue: false, redactedFields: [] } } as unknown as AnnualReviewBorrowerRequestPackage;

function facadeInput(): AnnualReviewDeliveryFacadeInput {
  return { request: { channel: 'email', intent: 'annual_review_financial_request', annualReviewId: 'AR1' }, package: PKG, recipientDecision: readyDecision(), approval: { state: 'approved_not_sent' } };
}

describe('Phase 141N — delivery adapter resolver', () => {
  it('returns disabled adapters by default', () => {
    const set = resolveAnnualReviewDeliveryAdapters();
    expect(set.uploadLinkAdapter.enabled).toBe(false);
    expect(set.emailAdapter.enabled).toBe(false);
    expect(set.smsAdapter.enabled).toBe(false);
    expect(set.live).toBe(false);
  });

  it('previewDelivery works for a valid package without sending', () => {
    const set = resolveAnnualReviewDeliveryAdapters();
    const r = set.previewDelivery('email', facadeInput());
    expect(r.ok).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('attemptDelivery is blocked even for a valid package', () => {
    const set = resolveAnnualReviewDeliveryAdapters();
    const r = set.attemptDelivery('email', facadeInput());
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
  });

  it('an unsupported channel is blocked', () => {
    const set = resolveAnnualReviewDeliveryAdapters();
    const r = set.previewDelivery('carrier_pigeon' as unknown as AnnualReviewDeliveryChannel, facadeInput());
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('delivery_unsupported_channel');
  });
});
