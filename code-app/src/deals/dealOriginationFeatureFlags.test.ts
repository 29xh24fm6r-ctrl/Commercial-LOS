import { describe, it, expect } from 'vitest';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  CRM_AUTOMATION_ENABLED,
  BORROWER_INVITE_AUTOMATION_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
  TASK_GENERATION_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  DOCUMENT_FILE_UPLOAD_ENABLED,
  PORTFOLIO_SIDE_EFFECTS_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
  BORROWER_SMS_TRANSPORT_ENABLED,
  BORROWER_TWILIO_TRANSPORT_ENABLED,
  DUPLICATE_DETECTION_ENABLED,
  DUPLICATE_MERGE_APPLY_ENABLED,
  isBankerCreateEnabled,
  isCrmAutomationEnabled,
  isAutoStageAdvanceEnabled,
  isTaskGenerationEnabled,
  isDocumentChecklistEnabled,
  isDocumentFileUploadEnabled,
  isPortfolioSideEffectsEnabled,
  isDuplicateDetectionEnabled,
  isDuplicateMergeApplyEnabled,
  isAnyBorrowerTransportEnabled,
  resolveBorrowerInviteMode,
  resolveBorrowerMessagingMode,
  isMalformedOriginationConfig,
} from './dealOriginationFeatureFlags';

/**
 * Phase 171-180 -- origination feature flags fail-closed by default.
 */

describe('origination flags -- Phase 228A production core constants', () => {
  it('enables the launched production core constants; risk domains stay off', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(TASK_GENERATION_ENABLED).toBe(true);
    expect(DUPLICATE_DETECTION_ENABLED).toBe(true);

    // WF-1A: AUTO_STAGE_ADVANCE_ENABLED is INTENTIONALLY armed for the "walk one
    // deal" pilot — a deliberate per-domain arming, not an up-by-source-default. Every
    // OTHER live-write domain remains at its safe default (off).
    expect(AUTO_STAGE_ADVANCE_ENABLED).toBe(true);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(DOCUMENT_FILE_UPLOAD_ENABLED).toBe(true);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(false);

    for (const c of [
      CRM_AUTOMATION_ENABLED,
      BORROWER_INVITE_AUTOMATION_ENABLED,
      PORTFOLIO_SIDE_EFFECTS_ENABLED,
      BORROWER_SMS_TRANSPORT_ENABLED,
      BORROWER_TWILIO_TRANSPORT_ENABLED,
      DUPLICATE_MERGE_APPLY_ENABLED,
    ]) {
      expect(c).toBe(false);
    }
  });
});

describe('origination flags -- Phase 228A production core gates', () => {
  const fullyTrue = {
    bankerCreateEnabled: true,
    crmAutomationEnabled: true,
    autoStageAdvanceEnabled: true,
    taskGenerationEnabled: true,
    documentChecklistEnabled: true,
    portfolioSideEffectsEnabled: true,
    borrowerEmailTransportEnabled: true,
    borrowerSmsTransportEnabled: true,
    borrowerTwilioTransportEnabled: true,
    duplicateDetectionEnabled: true,
    duplicateMergeApplyEnabled: true,
    borrowerInviteMode: 'send_enabled' as const,
    borrowerMessagingMode: 'send_enabled' as const,
  };

  it('gate readers keep the reset live-write domains off even when config is true', () => {
    expect(isBankerCreateEnabled(fullyTrue)).toBe(false);
    expect(isTaskGenerationEnabled(fullyTrue)).toBe(true);
    expect(isDuplicateDetectionEnabled(fullyTrue)).toBe(true);

    // These domains' hard constants are false, so they stay OFF/disabled even with
    // explicit true config (fail-closed).
    expect(isDocumentChecklistEnabled(fullyTrue)).toBe(false);
    expect(resolveBorrowerMessagingMode(fullyTrue)).toBe('disabled');
    expect(isAnyBorrowerTransportEnabled(fullyTrue)).toBe(false);
    // WF-1A: AUTO_STAGE_ADVANCE_ENABLED is armed, so with an explicit true config the
    // gate reader now enables it (deliberate per-domain arming for the walk).
    expect(isAutoStageAdvanceEnabled(fullyTrue)).toBe(true);

    expect(isCrmAutomationEnabled(fullyTrue)).toBe(false);
    expect(isPortfolioSideEffectsEnabled(fullyTrue)).toBe(false);
    expect(isDuplicateMergeApplyEnabled(fullyTrue)).toBe(false);
    expect(resolveBorrowerInviteMode(fullyTrue)).toBe('disabled');
  });

  it('default (no config) is disabled everywhere', () => {
    expect(isBankerCreateEnabled()).toBe(false);
    expect(resolveBorrowerInviteMode()).toBe('disabled');
    expect(resolveBorrowerMessagingMode()).toBe('disabled');
    expect(isAnyBorrowerTransportEnabled()).toBe(false);
    expect(isDocumentFileUploadEnabled()).toBe(true);
    expect(isDocumentFileUploadEnabled({ documentFileUploadEnabled: false })).toBe(false);
  });
});

describe('origination flags -- malformed config fails closed', () => {
  it('detects malformed configs', () => {
    expect(isMalformedOriginationConfig({ bankerCreateEnabled: 'yes' })).toBe(true);
    expect(isMalformedOriginationConfig({ borrowerInviteMode: 'whenever' })).toBe(true);
    expect(isMalformedOriginationConfig('nope')).toBe(true);
    expect(isMalformedOriginationConfig(undefined)).toBe(false);
    expect(isMalformedOriginationConfig({ bankerCreateEnabled: true })).toBe(false);
  });

  it('malformed config disables every gate', () => {
    const bad = { crmAutomationEnabled: 1 } as unknown as Parameters<typeof isCrmAutomationEnabled>[0];
    expect(isCrmAutomationEnabled(bad)).toBe(false);
    expect(resolveBorrowerInviteMode(bad)).toBe('disabled');
  });
});
