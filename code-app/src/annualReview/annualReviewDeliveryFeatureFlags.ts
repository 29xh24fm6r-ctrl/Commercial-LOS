/**
 * Phase 141N — Annual review delivery feature flags.
 *
 * Gates the (future) borrower upload-link / email / SMS delivery channels. Every
 * outbound and link-generation capability is OFF, approval is required, and the
 * workflow is dry-run-only. Send is PINNED OFF in this phase regardless of
 * config — this phase introduces seams, it never delivers.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no secrets, no env reads.
 *   - `SEND_ENABLED` is always false, `DRY_RUN_ONLY` is always true, and
 *     `APPROVAL_REQUIRED` is always true here — no config can flip them.
 */

export const ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED = false;
export const ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED = false;
export const ANNUAL_REVIEW_SMS_ADAPTER_ENABLED = false;
export const ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED = true;
export const ANNUAL_REVIEW_DELIVERY_SEND_ENABLED = false;
export const ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY = true;

export interface AnnualReviewDeliveryFeatureFlagConfig {
  /** Enables the upload-link adapter seam. Default: disabled. */
  uploadLinkAdapterEnabled?: boolean;
  /** Enables the email adapter seam. Default: disabled. */
  emailAdapterEnabled?: boolean;
  /** Enables the SMS adapter seam. Default: disabled. */
  smsAdapterEnabled?: boolean;
  /** Would relax approval. PINNED ON in this phase. */
  approvalRequired?: boolean;
  /** Would enable live send. PINNED OFF in this phase. */
  sendEnabled?: boolean;
  /** Would leave dry-run. PINNED ON in this phase. */
  dryRunOnly?: boolean;
}

export interface AnnualReviewDeliveryFeatureFlagState {
  readonly ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED: boolean;
  readonly ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED: boolean;
  readonly ANNUAL_REVIEW_SMS_ADAPTER_ENABLED: boolean;
  readonly ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED: true;
  readonly ANNUAL_REVIEW_DELIVERY_SEND_ENABLED: false;
  readonly ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY: true;
}

/** Safe defaults: every outbound adapter off, approval required, dry-run only. */
export const ANNUAL_REVIEW_DELIVERY_FEATURE_FLAG_DEFAULTS: AnnualReviewDeliveryFeatureFlagState =
  Object.freeze({
    ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED: false,
    ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED: false,
    ANNUAL_REVIEW_SMS_ADAPTER_ENABLED: false,
    ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED: true,
    ANNUAL_REVIEW_DELIVERY_SEND_ENABLED: false,
    ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY: true,
  });

/**
 * Resolve the delivery flags from an optional config. Adapter-enabled flags may
 * be toggled (so the seam can be constructed in a future phase / in tests), but
 * SEND stays off, DRY-RUN stays on, and APPROVAL stays required — no config can
 * silently enable a live send or upload-link generation.
 */
export function deriveAnnualReviewDeliveryFeatureFlagState(
  config?: AnnualReviewDeliveryFeatureFlagConfig,
): AnnualReviewDeliveryFeatureFlagState {
  return {
    ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED: config?.uploadLinkAdapterEnabled === true,
    ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED: config?.emailAdapterEnabled === true,
    ANNUAL_REVIEW_SMS_ADAPTER_ENABLED: config?.smsAdapterEnabled === true,
    // Pinned in this phase — no config can flip these.
    ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED: true,
    ANNUAL_REVIEW_DELIVERY_SEND_ENABLED: false,
    ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY: true,
  };
}
