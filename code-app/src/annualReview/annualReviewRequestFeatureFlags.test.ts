import { describe, it, expect } from 'vitest';
import {
  ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED,
  ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED,
  ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED,
  ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED,
  ANNUAL_REVIEW_REQUEST_FEATURE_FLAG_DEFAULTS,
  deriveAnnualReviewRequestFeatureFlagState,
} from './annualReviewRequestFeatureFlags';

/**
 * Phase 141M — request feature flags: preview on, send + upload-link off.
 */

describe('Phase 141M — request feature flag defaults', () => {
  it('workflow + draft preview default on; send + upload-link default off', () => {
    expect(ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED).toBe(true);
    expect(ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED).toBe(true);
    expect(ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED).toBe(false);
    expect(ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED).toBe(false);
  });

  it('the default state object keeps send + upload-link off', () => {
    expect(ANNUAL_REVIEW_REQUEST_FEATURE_FLAG_DEFAULTS.ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED).toBe(false);
    expect(ANNUAL_REVIEW_REQUEST_FEATURE_FLAG_DEFAULTS.ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED).toBe(false);
  });

  it('send + upload-link stay off even if the config asks for them', () => {
    const s = deriveAnnualReviewRequestFeatureFlagState({
      sendEnabled: true,
      uploadLinkGenerationEnabled: true,
    });
    expect(s.ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED).toBe(false);
    expect(s.ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED).toBe(false);
  });

  it('workflow + draft preview can be turned off via config', () => {
    const s = deriveAnnualReviewRequestFeatureFlagState({ workflowEnabled: false, draftPreviewEnabled: false });
    expect(s.ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED).toBe(false);
    expect(s.ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED).toBe(false);
  });
});
