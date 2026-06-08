import { describe, it, expect } from 'vitest';
import { validateAnnualReviewDeliveryRequest } from './validateAnnualReviewDeliveryRequest';
import { deriveAnnualReviewDeliveryFeatureFlagState, type AnnualReviewDeliveryFeatureFlagState } from './annualReviewDeliveryFeatureFlags';
import type {
  AnnualReviewBorrowerRecipientCandidate,
  AnnualReviewBorrowerRequestRecipientDecision,
  AnnualReviewBorrowerRequestPackage,
} from './annualReviewBorrowerRequestTypes';
import type { AnnualReviewDeliveryApproval } from './annualReviewDeliveryTypes';

/**
 * Phase 141N — delivery validation gate pins.
 */

function candidate(over: Partial<AnnualReviewBorrowerRecipientCandidate> = {}): AnnualReviewBorrowerRecipientCandidate {
  return {
    candidateId: 'P1', personId: 'P1', organizationId: 'ORG1', displayName: 'Synthetic Contact',
    roleTypes: ['borrower_contact'],
    contactPoints: [{ contactPointId: 'CP1', channel: 'email', masked: '•••@•••', verified: true, preferred: true, usable: true }],
    authorizationFlags: { financialRequests: true, uploadLinks: true, loanNotices: true },
    communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: [], preferredChannel: 'email' },
    source: 'crm', confidence: 'high', blockers: [], warnings: [],
    ...over,
  };
}

function readyDecision(cand = candidate()): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    selectedRecipientId: 'P1', selectedDisplayName: 'Synthetic Contact', selectedContactPointId: 'CP1', selectedContactValueMasked: '•••@•••',
    decision: 'ready_for_human_approval', confidence: 'high', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: true, safeForSend: false, candidates: [cand],
  };
}

function blockedDecision(status: string): AnnualReviewBorrowerRequestRecipientDecision {
  return { decision: status as never, confidence: 'low', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: false, safeForSend: false, candidates: [] };
}

const PKG = { packageId: 'p', annualReviewId: 'AR1', requestItems: [], recipientDecision: readyDecision(), approvalState: 'draft_only', deliveryMode: 'draft_preview', status: 'draft_only', blockers: [], auditSummary: { itemCount: 0, containsContactValue: false, redactedFields: [] } } as unknown as AnnualReviewBorrowerRequestPackage;

const APPROVED: AnnualReviewDeliveryApproval = { state: 'approved_not_sent' };
const PENDING: AnnualReviewDeliveryApproval = { state: 'pending_human_approval' };

function flags(): AnnualReviewDeliveryFeatureFlagState {
  return deriveAnnualReviewDeliveryFeatureFlagState({ uploadLinkAdapterEnabled: true, emailAdapterEnabled: true, smsAdapterEnabled: true });
}

// Hand-built flag state to isolate the send / dry-run conditions (the real
// derive pins both, so tests construct custom states to exercise each path).
function customFlags(send: boolean, dryRun: boolean): AnnualReviewDeliveryFeatureFlagState {
  return {
    ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED: true,
    ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED: true,
    ANNUAL_REVIEW_SMS_ADAPTER_ENABLED: true,
    ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED: true,
    ANNUAL_REVIEW_DELIVERY_SEND_ENABLED: send,
    ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY: dryRun,
  } as unknown as AnnualReviewDeliveryFeatureFlagState;
}

function validate(over: Partial<Parameters<typeof validateAnnualReviewDeliveryRequest>[0]> = {}) {
  return validateAnnualReviewDeliveryRequest({
    channel: 'email', intent: 'annual_review_financial_request', package: PKG, recipientDecision: readyDecision(), flags: flags(), approval: APPROVED, ...over,
  });
}

describe('Phase 141N — delivery validation gate', () => {
  it('blocks when delivery send is disabled', () => {
    const r = validate({ flags: customFlags(false, false) });
    expect(r.errorCode).toBe('delivery_send_disabled');
    expect(r.eligibleForPreview).toBe(true);
  });

  it('blocks when dry-run only', () => {
    const r = validate({ flags: customFlags(true, true) });
    expect(r.errorCode).toBe('delivery_dry_run_only');
  });

  it('blocks when approval is missing', () => {
    const r = validate({ approval: PENDING });
    expect(r.errorCode).toBe('delivery_approval_required');
    expect(r.approvalSatisfied).toBe(false);
  });

  it('blocks do-not-contact', () => {
    const r = validate({ recipientDecision: blockedDecision('blocked_do_not_contact') });
    expect(r.errorCode).toBe('delivery_do_not_contact');
    expect(r.eligibleForPreview).toBe(false);
  });

  it('blocks restricted-use mismatch', () => {
    const r = validate({ recipientDecision: blockedDecision('blocked_restricted_use') });
    expect(r.errorCode).toBe('delivery_restricted_use');
  });

  it('blocks missing authorization', () => {
    const r = validate({ recipientDecision: blockedDecision('blocked_no_authorized_contact') });
    expect(r.errorCode).toBe('delivery_recipient_not_authorized');
  });

  it('blocks email when email preference is prohibited', () => {
    const r = validate({ recipientDecision: readyDecision(candidate({ communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: ['email'], preferredChannel: 'mail' } })) });
    expect(r.errorCode).toBe('delivery_contact_preference_blocked');
    expect(r.eligibleForPreview).toBe(false);
  });

  it('blocks SMS when SMS preference is prohibited', () => {
    const cand = candidate({ contactPoints: [{ contactPointId: 'CP2', channel: 'phone', masked: '•••-•••-••••', usable: true }], communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: ['phone'] } });
    const r = validate({ channel: 'sms', recipientDecision: readyDecision(cand) });
    expect(r.errorCode).toBe('delivery_contact_preference_blocked');
  });

  it('blocks upload link when upload-link authorization is missing', () => {
    const r = validate({ channel: 'upload_link', recipientDecision: readyDecision(candidate({ authorizationFlags: { financialRequests: true, uploadLinks: false, loanNotices: true } })) });
    expect(r.errorCode).toBe('delivery_recipient_not_authorized');
  });

  it('blocks a missing contact point for the channel', () => {
    const r = validate({ channel: 'email', recipientDecision: readyDecision(candidate({ contactPoints: [{ contactPointId: 'CP2', channel: 'phone', masked: '•••-•••-••••', usable: true }] })) });
    expect(r.errorCode).toBe('delivery_missing_contact_point');
  });

  it('accepts preview-only validation for an eligible recipient', () => {
    const r = validate();
    expect(r.eligibleForPreview).toBe(true);
    expect(r.safeForSend).toBe(false);
  });

  it('safeForSend remains false in every case', () => {
    expect(validate().safeForSend).toBe(false);
    expect(validate({ approval: PENDING }).safeForSend).toBe(false);
    expect(validate({ recipientDecision: blockedDecision('blocked_do_not_contact') }).safeForSend).toBe(false);
  });
});
