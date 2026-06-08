import { describe, it, expect } from 'vitest';
import {
  createAnnualReviewUploadLinkAdapter,
  createDisabledAnnualReviewUploadLinkAdapter,
  type AnnualReviewUploadLinkAdapterInput,
} from './annualReviewUploadLinkAdapter';
import { deriveAnnualReviewDeliveryFeatureFlagState } from './annualReviewDeliveryFeatureFlags';
import type { AnnualReviewBorrowerRequestRecipientDecision, AnnualReviewBorrowerRequestPackage } from './annualReviewBorrowerRequestTypes';

function readyDecision(): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    selectedRecipientId: 'P1', selectedDisplayName: 'Synthetic Contact', selectedContactPointId: 'CP1', selectedContactValueMasked: '•••@•••',
    decision: 'ready_for_human_approval', confidence: 'high', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: true, safeForSend: false,
    candidates: [{ candidateId: 'P1', personId: 'P1', organizationId: 'ORG1', displayName: 'Synthetic Contact', roleTypes: ['borrower_contact'], contactPoints: [{ contactPointId: 'CP1', channel: 'email', masked: '•••@•••', usable: true }], authorizationFlags: { financialRequests: true, uploadLinks: true, loanNotices: true }, communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: [] }, source: 'crm', confidence: 'high', blockers: [], warnings: [] }],
  };
}
const PKG = { packageId: 'p', annualReviewId: 'AR1', requestItems: [], recipientDecision: readyDecision(), approvalState: 'draft_only', deliveryMode: 'draft_preview', status: 'draft_only', blockers: [], auditSummary: { itemCount: 0, containsContactValue: false, redactedFields: [] } } as unknown as AnnualReviewBorrowerRequestPackage;

function input(): AnnualReviewUploadLinkAdapterInput {
  return { request: { channel: 'upload_link', intent: 'annual_review_financial_request', annualReviewId: 'AR1', requestedValidityDays: 14 }, package: PKG, recipientDecision: readyDecision(), approval: { state: 'approved_not_sent' } };
}

describe('Phase 141N — upload-link adapter', () => {
  it('the disabled adapter blocks createUploadLink', () => {
    const a = createDisabledAnnualReviewUploadLinkAdapter();
    expect(a.enabled).toBe(false);
    const r = a.createUploadLink(input());
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.errorCode).toBe('delivery_upload_link_generation_disabled');
  });

  it('the preview includes no live URL or token', () => {
    const a = createDisabledAnnualReviewUploadLinkAdapter();
    const r = a.previewUploadLinkRequest(input());
    expect(r.ok).toBe(true);
    expect(r.data?.hasLiveUrl).toBe(false);
    expect(r.data?.hasToken).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/https?:\/\//);
  });

  it('createUploadLink stays blocked even when enabled + approved (phase send-disabled)', () => {
    const a = createAnnualReviewUploadLinkAdapter({ featureFlags: deriveAnnualReviewDeliveryFeatureFlagState({ uploadLinkAdapterEnabled: true }) });
    expect(a.enabled).toBe(true);
    const r = a.createUploadLink(input());
    expect(r.ok).toBe(false);
    expect(['delivery_send_disabled', 'delivery_dry_run_only']).toContain(r.errorCode);
  });

  it('the output carries no raw token (audit summary structural guarantees)', () => {
    const a = createDisabledAnnualReviewUploadLinkAdapter();
    const r = a.createUploadLink(input());
    expect(r.auditSummary?.containsUploadToken).toBe(false);
    expect(r.auditSummary?.containsLiveUrl).toBe(false);
  });
});
