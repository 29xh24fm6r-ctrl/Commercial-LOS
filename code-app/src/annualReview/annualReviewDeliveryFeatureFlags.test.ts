import { describe, it, expect } from 'vitest';
import {
  ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED,
  ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED,
  ANNUAL_REVIEW_SMS_ADAPTER_ENABLED,
  ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED,
  ANNUAL_REVIEW_DELIVERY_SEND_ENABLED,
  ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY,
  deriveAnnualReviewDeliveryFeatureFlagState,
} from './annualReviewDeliveryFeatureFlags';

/**
 * Phase 141N — delivery feature flag defaults.
 */

describe('Phase 141N — delivery feature flags', () => {
  it('all outbound adapters default disabled', () => {
    expect(ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED).toBe(false);
    expect(ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED).toBe(false);
    expect(ANNUAL_REVIEW_SMS_ADAPTER_ENABLED).toBe(false);
  });

  it('approval required defaults true', () => {
    expect(ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED).toBe(true);
    expect(deriveAnnualReviewDeliveryFeatureFlagState().ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED).toBe(true);
  });

  it('send enabled defaults false', () => {
    expect(ANNUAL_REVIEW_DELIVERY_SEND_ENABLED).toBe(false);
    expect(deriveAnnualReviewDeliveryFeatureFlagState().ANNUAL_REVIEW_DELIVERY_SEND_ENABLED).toBe(false);
  });

  it('dry-run-only defaults true', () => {
    expect(ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY).toBe(true);
    expect(deriveAnnualReviewDeliveryFeatureFlagState().ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY).toBe(true);
  });

  it('no config switch silently enables send / dry-run-off / no-approval', () => {
    const s = deriveAnnualReviewDeliveryFeatureFlagState({ sendEnabled: true, dryRunOnly: false, approvalRequired: false });
    expect(s.ANNUAL_REVIEW_DELIVERY_SEND_ENABLED).toBe(false);
    expect(s.ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY).toBe(true);
    expect(s.ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED).toBe(true);
  });

  it('adapter-enabled flags may be toggled by config (seam construction)', () => {
    const s = deriveAnnualReviewDeliveryFeatureFlagState({ emailAdapterEnabled: true });
    expect(s.ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED).toBe(true);
  });
});
