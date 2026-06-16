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

describe('origination flags -- hard constants all OFF this phase', () => {
  it('every domain hard constant is false', () => {
    for (const c of [
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
    ]) {
      expect(c).toBe(false);
    }
  });
});

describe('origination flags -- every gate fails closed even with config "true"', () => {
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

  it('all gate readers return false / disabled because the hard constants are false', () => {
    expect(isBankerCreateEnabled(fullyTrue)).toBe(false);
    expect(isCrmAutomationEnabled(fullyTrue)).toBe(false);
    expect(isAutoStageAdvanceEnabled(fullyTrue)).toBe(false);
    expect(isTaskGenerationEnabled(fullyTrue)).toBe(false);
    expect(isDocumentChecklistEnabled(fullyTrue)).toBe(false);
    expect(isPortfolioSideEffectsEnabled(fullyTrue)).toBe(false);
    expect(isDuplicateDetectionEnabled(fullyTrue)).toBe(false);
    expect(isDuplicateMergeApplyEnabled(fullyTrue)).toBe(false);
    expect(isAnyBorrowerTransportEnabled(fullyTrue)).toBe(false);
    expect(resolveBorrowerInviteMode(fullyTrue)).toBe('disabled');
    expect(resolveBorrowerMessagingMode(fullyTrue)).toBe('disabled');
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
