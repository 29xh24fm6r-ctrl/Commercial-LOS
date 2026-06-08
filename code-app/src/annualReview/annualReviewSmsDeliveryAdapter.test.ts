import { describe, it, expect } from 'vitest';
import {
  createAnnualReviewSmsDeliveryAdapter,
  createDisabledAnnualReviewSmsDeliveryAdapter,
  type AnnualReviewSmsDeliveryAdapterInput,
} from './annualReviewSmsDeliveryAdapter';
import { deriveAnnualReviewDeliveryFeatureFlagState } from './annualReviewDeliveryFeatureFlags';
import type { AnnualReviewBorrowerRequestRecipientDecision, AnnualReviewBorrowerRequestPackage } from './annualReviewBorrowerRequestTypes';

function readyDecision(): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    selectedRecipientId: 'P1', selectedDisplayName: 'Synthetic Contact', selectedContactPointId: 'CP1', selectedContactValueMasked: '•••-•••-••••',
    decision: 'ready_for_human_approval', confidence: 'high', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: true, safeForSend: false,
    candidates: [{ candidateId: 'P1', personId: 'P1', organizationId: 'ORG1', displayName: 'Synthetic Contact', roleTypes: ['borrower_contact'], contactPoints: [{ contactPointId: 'CP1', channel: 'phone', masked: '•••-•••-••••', usable: true }], authorizationFlags: { financialRequests: true, uploadLinks: true, loanNotices: true }, communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: [] }, source: 'crm', confidence: 'high', blockers: [], warnings: [] }],
  };
}
const PKG = { packageId: 'p', annualReviewId: 'AR1', requestItems: [], recipientDecision: readyDecision(), approvalState: 'draft_only', deliveryMode: 'draft_preview', status: 'draft_only', blockers: [], auditSummary: { itemCount: 0, containsContactValue: false, redactedFields: [] } } as unknown as AnnualReviewBorrowerRequestPackage;

function input(approvalApproved = true): AnnualReviewSmsDeliveryAdapterInput {
  return { request: { channel: 'sms', intent: 'annual_review_general_follow_up', annualReviewId: 'AR1' }, package: PKG, recipientDecision: readyDecision(), approval: { state: approvalApproved ? 'approved_not_sent' : 'pending_human_approval' } };
}

describe('Phase 141N — SMS delivery adapter', () => {
  it('the disabled adapter blocks sendSms', () => {
    const a = createDisabledAnnualReviewSmsDeliveryAdapter();
    expect(a.enabled).toBe(false);
    const r = a.sendSms(input());
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('delivery_sms_disabled');
  });

  it('the preview masks the contact', () => {
    const a = createDisabledAnnualReviewSmsDeliveryAdapter();
    const r = a.previewSms(input());
    expect(r.ok).toBe(true);
    expect(r.data?.recipientContactMasked).toBe('•••-•••-••••');
    expect(JSON.stringify(r)).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  });

  it('approval missing blocks send (enabled adapter)', () => {
    const a = createAnnualReviewSmsDeliveryAdapter({ featureFlags: deriveAnnualReviewDeliveryFeatureFlagState({ smsAdapterEnabled: true }) });
    const r = a.sendSms(input(false));
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('delivery_approval_required');
  });

  it('the send flag false blocks send (enabled adapter + approved)', () => {
    const a = createAnnualReviewSmsDeliveryAdapter({ featureFlags: deriveAnnualReviewDeliveryFeatureFlagState({ smsAdapterEnabled: true }) });
    const r = a.sendSms(input(true));
    expect(r.ok).toBe(false);
    expect(['delivery_send_disabled', 'delivery_dry_run_only']).toContain(r.errorCode);
  });
});
