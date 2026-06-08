/**
 * Phase 141M — Annual Review borrower request feature flags.
 *
 * Gates the borrower request workflow. Resolved from an injected config object
 * only — never from an environment secret — and FAIL CLOSED. The send and
 * upload-link-generation capabilities are PINNED OFF in this phase regardless of
 * config: this phase prepares human-reviewable drafts and never sends.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no secrets, no env reads.
 *   - `SEND_ENABLED` and `UPLOAD_LINK_GENERATION_ENABLED` are always false here.
 */

export const ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED = true;
export const ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED = true;
export const ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED = false;
export const ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED = false;

export interface AnnualReviewRequestFeatureFlagConfig {
  /** Enables the read-only request workflow + draft preview. Default: on (safe). */
  workflowEnabled?: boolean;
  /** Enables the human-reviewable draft preview. Default: on (safe). */
  draftPreviewEnabled?: boolean;
  /** Would enable sending. PINNED OFF in this phase. */
  sendEnabled?: boolean;
  /** Would enable live upload-link generation. PINNED OFF in this phase. */
  uploadLinkGenerationEnabled?: boolean;
}

export interface AnnualReviewRequestFeatureFlagState {
  readonly ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED: boolean;
  readonly ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED: boolean;
  readonly ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED: false;
  readonly ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED: false;
}

/** Safe defaults: preview on, send + upload-link generation off. */
export const ANNUAL_REVIEW_REQUEST_FEATURE_FLAG_DEFAULTS: AnnualReviewRequestFeatureFlagState =
  Object.freeze({
    ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED: true,
    ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED: true,
    ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED: false,
    ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED: false,
  });

/**
 * Resolve the flags from an optional config. Workflow + draft preview default
 * ON (read-only, safe); send and upload-link generation are ALWAYS off in this
 * phase even if the config asks for them.
 */
export function deriveAnnualReviewRequestFeatureFlagState(
  config?: AnnualReviewRequestFeatureFlagConfig,
): AnnualReviewRequestFeatureFlagState {
  return {
    ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED: config?.workflowEnabled !== false,
    ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED: config?.draftPreviewEnabled !== false,
    // Pinned off in this phase — no config can enable sending.
    ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED: false,
    // Pinned off in this phase — no config can enable upload-link generation.
    ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED: false,
  };
}
