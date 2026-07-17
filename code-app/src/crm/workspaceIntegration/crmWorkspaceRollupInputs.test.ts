import { describe, it, expect } from 'vitest';
import { deriveManagerCrmSurfaceInput, deriveExecutiveCrmSurfaceInput } from './crmWorkspaceRollupInputs';
import type { CrmAccountRollupRecord } from '../crmRelationshipRollups';

function account(over: Partial<CrmAccountRollupRecord> = {}): CrmAccountRollupRecord {
  return {
    accountId: 'a1',
    bankerId: 'b1',
    teamId: null,
    healthBand: 'healthy',
    openTasks: 0,
    overdueTasks: 0,
    lastActivityIso: null,
    coverageCount: 1,
    hasSourceFacts: true,
    ...over,
  };
}

describe('deriveManagerCrmSurfaceInput', () => {
  it('never falls through to a happy-path string when the viewer is not entitled', () => {
    const input = deriveManagerCrmSurfaceInput({ accounts: [account()], viewerEntitled: false }, undefined);
    expect(input.teamCrmReadiness).toMatch(/not entitled/i);
    expect(input.nextSafeManagerStep).toMatch(/not entitled/i);
    expect(input.bankerFollowUpWorkload).toBe(0);
    expect(input.accountsNeedingAttention).toBe(0);
  });

  it('returns an honest empty state (not the old static strings) for zero accounts', () => {
    const input = deriveManagerCrmSurfaceInput({ accounts: [], viewerEntitled: true }, undefined);
    expect(input.teamCrmReadiness).toBe('No CRM accounts on record yet');
    expect(input.teamCrmReadiness).not.toMatch(/CRM is active/i);
    expect(input.bankerFollowUpWorkload).toBe(0);
    expect(input.accountsNeedingAttention).toBe(0);
    expect(input.nextSafeManagerStep).toMatch(/no accounts currently flagged/i);
  });

  it('derives real non-zero numbers from real accounts', () => {
    const accounts = [
      account({ accountId: 'a1', healthBand: 'at-risk', openTasks: 2 }),
      account({ accountId: 'a2', healthBand: 'healthy', openTasks: 3 }),
      account({ accountId: 'a3', healthBand: 'unknown', openTasks: 0 }),
    ];
    const input = deriveManagerCrmSurfaceInput({ accounts, viewerEntitled: true }, 'https://example.test/crm');
    expect(input.bankerFollowUpWorkload).toBe(5); // real openTasks sum, replacing the hardcoded 0
    expect(input.accountsNeedingAttention).toBe(1); // real at-risk count, replacing the unwired "SoT conflicts" 0
    expect(input.teamCrmReadiness).toBe('2 of 3 account(s) have sufficient CRM evidence'); // 3 total - 1 unknown
    expect(input.nextSafeManagerStep).toMatch(/review 1 account\(s\)/i);
    expect(input.crmCommandCenterHref).toBe('https://example.test/crm');
  });

  it('gives the Salesforce/nCino metaphor-lane fields neutral copy, never a claimed active connection', () => {
    const input = deriveManagerCrmSurfaceInput({ accounts: [account()], viewerEntitled: true }, undefined);
    expect(input.salesforceReadinessByPipeline).toMatch(/not applicable/i);
    expect(input.ncinoReadinessByPipeline).toMatch(/not applicable/i);
    expect(input.salesforceReadinessByPipeline).not.toMatch(/CRM is active/i);
  });
});

describe('deriveExecutiveCrmSurfaceInput', () => {
  it('never falls through to a happy-path string when the viewer is not entitled', () => {
    const input = deriveExecutiveCrmSurfaceInput({ accounts: [account()], viewerEntitled: false }, undefined);
    expect(input.crmCoverageStatus).toMatch(/not entitled/i);
    expect(input.nextExecutiveStep).toMatch(/not entitled/i);
    expect(input.accountsNeedingAttention).toBe(0);
  });

  it('returns an honest empty state (not the old static strings) for zero accounts', () => {
    const input = deriveExecutiveCrmSurfaceInput({ accounts: [], viewerEntitled: true }, undefined);
    expect(input.crmCoverageStatus).toBe('No CRM accounts on record yet');
    expect(input.crmCoverageStatus).not.toMatch(/CRM is active/i);
    expect(input.accountsNeedingAttention).toBe(0);
  });

  it('derives real non-zero numbers from real accounts', () => {
    const accounts = [
      account({ accountId: 'a1', healthBand: 'at-risk', coverageCount: 1, hasSourceFacts: true }),
      account({ accountId: 'a2', healthBand: 'healthy', coverageCount: 0, hasSourceFacts: false }),
    ];
    const input = deriveExecutiveCrmSurfaceInput({ accounts, viewerEntitled: true }, undefined);
    expect(input.accountsNeedingAttention).toBe(1); // real at-risk count, replacing the unwired "intelligence gaps" 0
    expect(input.crmCoverageStatus).toBe('50% of accounts have a coverage team on record');
    expect(input.productStrategyCrmReadiness).toBe('50% of accounts have source-linked CRM evidence');
    expect(input.nextExecutiveStep).toMatch(/review 1 account\(s\)/i);
    expect(input.revenueDataAvailability).toBe('Not available (no revenue figures shown)');
  });

  it('gives the Salesforce/nCino metaphor-lane fields neutral copy, never a claimed active connection', () => {
    const input = deriveExecutiveCrmSurfaceInput({ accounts: [account()], viewerEntitled: true }, undefined);
    expect(input.salesforceActivationPosture).toMatch(/not applicable/i);
    expect(input.ncinoActivationPosture).toMatch(/not applicable/i);
    expect(input.salesforceActivationPosture).not.toBe('Active');
  });
});
