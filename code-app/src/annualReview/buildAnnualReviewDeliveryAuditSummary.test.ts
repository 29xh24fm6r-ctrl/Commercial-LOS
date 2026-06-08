import { describe, it, expect } from 'vitest';
import { buildAnnualReviewDeliveryAuditSummary, redactDeliveryContact } from './buildAnnualReviewDeliveryAuditSummary';
import type { AnnualReviewDeliveryValidationResult, AnnualReviewDeliveryApproval } from './annualReviewDeliveryTypes';

/**
 * Phase 141N — delivery audit summary builder pins (redacted).
 */

const VALIDATION: AnnualReviewDeliveryValidationResult = {
  channel: 'email',
  intent: 'annual_review_financial_request',
  eligibleForPreview: false,
  safeForSend: false,
  approvalSatisfied: false,
  blockers: [
    { code: 'delivery_send_disabled', message: 'send disabled' },
    { code: 'delivery_dry_run_only', message: 'dry run' },
  ],
  errorCode: 'delivery_send_disabled',
};

const APPROVAL: AnnualReviewDeliveryApproval = { state: 'pending_human_approval' };

describe('Phase 141N — delivery audit summary', () => {
  it('redacts an email contact', () => {
    const s = buildAnnualReviewDeliveryAuditSummary({ channel: 'email', intent: 'annual_review_financial_request', approval: APPROVAL, validation: VALIDATION, recipientContact: 'a-b.c@x-y.com' });
    expect(s.recipientContactMasked).toBe('[redacted]');
  });

  it('redacts a phone contact', () => {
    expect(redactDeliveryContact('call 555-123-4567')).toContain('[redacted]');
  });

  it('omits any upload token and live URL (structural)', () => {
    const s = buildAnnualReviewDeliveryAuditSummary({ channel: 'upload_link', intent: 'annual_review_financial_request', approval: APPROVAL, validation: VALIDATION });
    expect(s.containsUploadToken).toBe(false);
    expect(s.containsLiveUrl).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/https?:\/\//);
  });

  it('includes the blocker codes', () => {
    const s = buildAnnualReviewDeliveryAuditSummary({ channel: 'email', intent: 'annual_review_financial_request', approval: APPROVAL, validation: VALIDATION });
    expect(s.blockerCodes).toContain('delivery_send_disabled');
    expect(s.blockerCodes).toContain('delivery_dry_run_only');
  });

  it('includes the approval state', () => {
    const s = buildAnnualReviewDeliveryAuditSummary({ channel: 'email', intent: 'annual_review_financial_request', approval: { state: 'approved_not_sent' }, validation: VALIDATION });
    expect(s.approvalState).toBe('approved_not_sent');
  });
});
