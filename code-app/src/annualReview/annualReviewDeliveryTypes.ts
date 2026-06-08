/**
 * Phase 141N — Annual review delivery seam types.
 *
 * Types for the (future) borrower upload-link / email / SMS delivery channels.
 * Everything here is preview-only and approval-gated. There is NO sent /
 * delivered / failed_delivery terminal state, contact values are carried only
 * masked, and previews never carry a raw upload token or live URL.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - TYPES only. No IO. No sample emails / phone numbers.
 *   - No terminal `sent` / `delivered` state. `safeForSend` is always false.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type AnnualReviewDeliveryChannel = 'upload_link' | 'email' | 'sms';

export type AnnualReviewDeliveryIntent =
  | 'annual_review_financial_request'
  | 'annual_review_covenant_request'
  | 'annual_review_insurance_request'
  | 'annual_review_general_follow_up';

/** Approval lifecycle. There is deliberately NO `sent` / `delivered` state. */
export type AnnualReviewDeliveryApprovalState =
  | 'not_requested'
  | 'pending_human_approval'
  | 'approved_not_sent'
  | 'rejected'
  | 'cancelled';

export type AnnualReviewDeliveryErrorCode =
  | 'delivery_adapter_disabled'
  | 'delivery_send_disabled'
  | 'delivery_dry_run_only'
  | 'delivery_approval_required'
  | 'delivery_not_approved'
  | 'delivery_recipient_not_authorized'
  | 'delivery_do_not_contact'
  | 'delivery_restricted_use'
  | 'delivery_contact_preference_blocked'
  | 'delivery_missing_contact_point'
  | 'delivery_upload_link_generation_disabled'
  | 'delivery_email_disabled'
  | 'delivery_sms_disabled'
  | 'delivery_transport_not_configured'
  | 'delivery_unsupported_channel'
  | 'delivery_validation_failed';

export interface AnnualReviewDeliveryBlocker {
  code: AnnualReviewDeliveryErrorCode;
  message: string;
}

export interface AnnualReviewDeliveryApproval {
  state: AnnualReviewDeliveryApprovalState;
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Audit summary (always redacted)
// ---------------------------------------------------------------------------

export interface AnnualReviewDeliveryAuditSummary {
  channel: AnnualReviewDeliveryChannel;
  intent: AnnualReviewDeliveryIntent;
  approvalState: AnnualReviewDeliveryApprovalState;
  validationOutcome: 'eligible_for_preview' | 'blocked';
  blockedReason?: string;
  blockerCodes: readonly AnnualReviewDeliveryErrorCode[];
  recipientDisplayName?: string;
  /** Masked contact only — never the raw value. */
  recipientContactMasked?: string;
  /** STRUCTURAL guarantees. */
  containsContactValue: false;
  containsUploadToken: false;
  containsLiveUrl: false;
  generatedAt?: string;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface AnnualReviewDeliveryRequestBase {
  channel: AnnualReviewDeliveryChannel;
  intent: AnnualReviewDeliveryIntent;
  annualReviewId: string;
  packageId?: string;
  recipientPersonId?: string;
  contactPointId?: string;
}

export interface AnnualReviewUploadLinkRequest extends AnnualReviewDeliveryRequestBase {
  channel: 'upload_link';
  /** Requested validity window — preview only, never realized as a live link. */
  requestedValidityDays?: number;
}

export interface AnnualReviewEmailDeliveryRequest extends AnnualReviewDeliveryRequestBase {
  channel: 'email';
}

export interface AnnualReviewSmsDeliveryRequest extends AnnualReviewDeliveryRequestBase {
  channel: 'sms';
}

export type AnnualReviewDeliveryRequest =
  | AnnualReviewUploadLinkRequest
  | AnnualReviewEmailDeliveryRequest
  | AnnualReviewSmsDeliveryRequest;

// ---------------------------------------------------------------------------
// Previews (no raw token / live URL / raw contact)
// ---------------------------------------------------------------------------

export interface AnnualReviewUploadLinkPreview {
  channel: 'upload_link';
  intent: AnnualReviewDeliveryIntent;
  recipientDisplayName?: string;
  recipientContactMasked?: string;
  instructionsPreview: string;
  requestedValidityDays?: number;
  /** STRUCTURAL: a disabled adapter never produces a live URL or token. */
  hasLiveUrl: false;
  hasToken: false;
  auditSummary: AnnualReviewDeliveryAuditSummary;
}

export interface AnnualReviewEmailDeliveryPreview {
  channel: 'email';
  intent: AnnualReviewDeliveryIntent;
  recipientDisplayName?: string;
  recipientContactMasked?: string;
  subjectPreview: string;
  bodyPreview: string;
  auditSummary: AnnualReviewDeliveryAuditSummary;
}

export interface AnnualReviewSmsDeliveryPreview {
  channel: 'sms';
  intent: AnnualReviewDeliveryIntent;
  recipientContactMasked?: string;
  textPreview: string;
  auditSummary: AnnualReviewDeliveryAuditSummary;
}

// ---------------------------------------------------------------------------
// Validation + adapter result
// ---------------------------------------------------------------------------

export interface AnnualReviewDeliveryValidationResult {
  channel: AnnualReviewDeliveryChannel;
  intent: AnnualReviewDeliveryIntent;
  /** Preview is allowed when the recipient gate passes (regardless of send). */
  eligibleForPreview: boolean;
  /** STRUCTURAL: always false in this phase. */
  safeForSend: false;
  approvalSatisfied: boolean;
  blockers: readonly AnnualReviewDeliveryBlocker[];
  /** Primary reason a live send/generation is blocked. */
  errorCode?: AnnualReviewDeliveryErrorCode;
}

export interface AnnualReviewDeliveryAdapterResult<T> {
  ok: boolean;
  operation: string;
  channel: AnnualReviewDeliveryChannel;
  /** True whenever this was a blocked (non-sending) outcome. */
  blocked: boolean;
  data?: T;
  errorCode?: AnnualReviewDeliveryErrorCode;
  message?: string;
  auditSummary?: AnnualReviewDeliveryAuditSummary;
}
