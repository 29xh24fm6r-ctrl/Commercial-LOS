/**
 * Phase 141N — Annual review delivery audit summary builder.
 *
 * PURE. Produces a redacted audit summary for delivery previews and blocked
 * attempts. It carries the channel, intent, approval state, validation outcome,
 * blocker codes, and a MASKED recipient/contact — never a raw contact value, an
 * upload token, a live URL, or a message body.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Redacts emails / phones; omits tokens and live URLs structurally.
 */

import type {
  AnnualReviewDeliveryAuditSummary,
  AnnualReviewDeliveryChannel,
  AnnualReviewDeliveryIntent,
  AnnualReviewDeliveryApproval,
  AnnualReviewDeliveryValidationResult,
} from './annualReviewDeliveryTypes';

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

/** Redact any raw email / phone that slipped into a label. */
export function redactDeliveryContact(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(EMAIL_PATTERN, '[redacted]').replace(PHONE_PATTERN, '[redacted]');
}

export interface BuildDeliveryAuditSummaryInput {
  channel: AnnualReviewDeliveryChannel;
  intent: AnnualReviewDeliveryIntent;
  approval: AnnualReviewDeliveryApproval;
  validation: AnnualReviewDeliveryValidationResult;
  recipientDisplayName?: string;
  /** May arrive masked or (defensively) raw — it is always redacted. */
  recipientContact?: string;
  blockedReason?: string;
  generatedAt?: string;
}

export function buildAnnualReviewDeliveryAuditSummary(
  input: BuildDeliveryAuditSummaryInput,
): AnnualReviewDeliveryAuditSummary {
  return {
    channel: input.channel,
    intent: input.intent,
    approvalState: input.approval.state,
    validationOutcome: input.validation.eligibleForPreview ? 'eligible_for_preview' : 'blocked',
    blockedReason: input.blockedReason,
    blockerCodes: input.validation.blockers.map((b) => b.code),
    recipientDisplayName: input.recipientDisplayName,
    recipientContactMasked: redactDeliveryContact(input.recipientContact),
    containsContactValue: false,
    containsUploadToken: false,
    containsLiveUrl: false,
    generatedAt: input.generatedAt,
  };
}
