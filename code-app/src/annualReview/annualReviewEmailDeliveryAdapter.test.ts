import { describe, it, expect } from 'vitest';
import {
  createAnnualReviewEmailDeliveryAdapter,
  createDisabledAnnualReviewEmailDeliveryAdapter,
  type AnnualReviewEmailDeliveryAdapterInput,
} from './annualReviewEmailDeliveryAdapter';
import { deriveAnnualReviewDeliveryFeatureFlagState } from './annualReviewDeliveryFeatureFlags';
import type { AnnualReviewBorrowerRequestRecipientDecision, AnnualReviewBorrowerRequestPackage } from './annualReviewBorrowerRequestTypes';

function readyDecision(): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    selectedRecipientId: 'P1', selectedDisplayName: 'Synthetic Contact', selectedContactPointId: 'CP1', selectedContactValueMasked: '•••@•••',
    decision: 'ready_for_human_approval', confidence: 'high', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: true, safeForSend: false,
    candidates: [{ candidateId: 'P1', personId: 'P1', organizationId: 'ORG1', displayName: 'Synthetic Contact', roleTypes: ['borrower_contact'], contactPoints: [{ contactPointId: 'CP1', channel: 'email', masked: '•••@•••', usable: true }], authorizationFlags: { financialRequests: true, uploadLinks: true, loanNotices: true }, communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: [] }, source: 'crm', confidence: 'high', blockers: [], warnings: [] }],
  };
}
const PKG = { packageId: 'p', annualReviewId: 'AR1', borrowerName: 'Synthetic Borrower', requestItems: [], recipientDecision: readyDecision(), approvalState: 'draft_only', deliveryMode: 'draft_preview', status: 'draft_only', blockers: [], auditSummary: { itemCount: 0, containsContactValue: false, redactedFields: [] } } as unknown as AnnualReviewBorrowerRequestPackage;

function input(approvalApproved = true): AnnualReviewEmailDeliveryAdapterInput {
  return { request: { channel: 'email', intent: 'annual_review_financial_request', annualReviewId: 'AR1' }, package: PKG, recipientDecision: readyDecision(), approval: { state: approvalApproved ? 'approved_not_sent' : 'pending_human_approval' } };
}

describe('Phase 141N — email delivery adapter', () => {
  it('the disabled adapter blocks sendEmail', () => {
    const a = createDisabledAnnualReviewEmailDeliveryAdapter();
    expect(a.enabled).toBe(false);
    const r = a.sendEmail(input());
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('delivery_email_disabled');
  });

  it('the preview masks the contact', () => {
    const a = createDisabledAnnualReviewEmailDeliveryAdapter();
    const r = a.previewEmail(input());
    expect(r.ok).toBe(true);
    expect(r.data?.recipientContactMasked).toBe('•••@•••');
    expect(JSON.stringify(r)).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('approval missing blocks send (enabled adapter)', () => {
    const a = createAnnualReviewEmailDeliveryAdapter({ featureFlags: deriveAnnualReviewDeliveryFeatureFlagState({ emailAdapterEnabled: true }) });
    const r = a.sendEmail(input(false));
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('delivery_approval_required');
  });

  it('the send flag false blocks send (enabled adapter + approved)', () => {
    const a = createAnnualReviewEmailDeliveryAdapter({ featureFlags: deriveAnnualReviewDeliveryFeatureFlagState({ emailAdapterEnabled: true }) });
    const r = a.sendEmail(input(true));
    expect(r.ok).toBe(false);
    expect(['delivery_send_disabled', 'delivery_dry_run_only']).toContain(r.errorCode);
  });

  it('no raw email in the audit summary', () => {
    const a = createDisabledAnnualReviewEmailDeliveryAdapter();
    const r = a.sendEmail(input());
    expect(JSON.stringify(r.auditSummary)).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});
