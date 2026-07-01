import { describe, it, expect } from 'vitest';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  CRM_AUTOMATION_ENABLED,
  BORROWER_INVITE_AUTOMATION_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
  TASK_GENERATION_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
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

    // Completion Phase A: reset to SAFE DEFAULTS (off). These live-write domains
    // must never assert up by source default; they are armed deliberately per domain.
    expect(AUTO_STAGE_ADVANCE_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
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

    // Completion Phase A: reset to safe defaults — the hard constants are false, so
    // these domains stay OFF/disabled even with explicit true config (fail-closed).
    expect(isDocumentChecklistEnabled(fullyTrue)).toBe(false);
    expect(isAutoStageAdvanceEnabled(fullyTrue)).toBe(false);
    expect(resolveBorrowerMessagingMode(fullyTrue)).toBe('disabled');
    expect(isAnyBorrowerTransportEnabled(fullyTrue)).toBe(false);

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
