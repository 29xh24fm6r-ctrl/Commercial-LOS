import { describe, it, expect } from 'vitest';
import { INTEGRATION_PROVIDER_REGISTRY, getIntegrationProvider, getIntegrationProvidersByCategory } from './integrationProviderRegistry';
import { INTEGRATION_CATEGORIES } from './integrationAdapterTypes';

describe('Phase 142F — integration provider registry', () => {
  it('includes a provider for every integration category', () => {
    for (const category of INTEGRATION_CATEGORIES) {
      expect(getIntegrationProvidersByCategory(category).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('defaults every provider to disabled', () => {
    for (const p of INTEGRATION_PROVIDER_REGISTRY) {
      expect(p.mode).toBe('disabled');
      expect(p.auditSummary.mode).toBe('disabled');
    }
  });

  it('declares risk class and data sensitivity for every provider', () => {
    for (const p of INTEGRATION_PROVIDER_REGISTRY) {
      expect(p.riskClass).toBeTruthy();
      expect(p.dataSensitivities.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('requires human approval and permissible purpose for the credit bureau', () => {
    const bureau = getIntegrationProvider('credit_bureau_provider');
    expect(bureau?.humanApproval.required).toBe(true);
    expect(bureau?.requiresPermissiblePurpose).toBe(true);
  });

  it('keeps the scoring provider unable to approve / decline credit', () => {
    const scoring = getIntegrationProvider('credit_scoring_provider');
    expect(scoring?.canProduceCreditDecision).toBe(false);
    expect(JSON.stringify(scoring)).not.toMatch(/approveCredit|declineCredit|finalDecision:\s*true/i);
  });

  it('exposes no core banking write capability', () => {
    const core = getIntegrationProvider('core_banking_provider');
    expect(core?.capabilities.every((c) => c.writeCapable === false)).toBe(true);
    expect(core?.capabilities.every((c) => /^lookup_|^retrieve_/.test(c.capability))).toBe(true);
  });

  it('carries no live call / pii / write / credit-pull flags set true', () => {
    for (const p of INTEGRATION_PROVIDER_REGISTRY) {
      expect(p.auditSummary.containsLiveCall).toBe(false);
      expect(p.auditSummary.containsPiiTransmission).toBe(false);
      expect(p.auditSummary.containsCreditPull).toBe(false);
      expect(p.auditSummary.containsWrite).toBe(false);
    }
  });

  it('contains no vendor SDK imports, secrets, URLs, or fetch (data only)', () => {
    const s = JSON.stringify(INTEGRATION_PROVIDER_REGISTRY);
    expect(s).not.toMatch(/https?:\/\//);
    expect(s).not.toMatch(/api[_-]?key|secret|token|bearer/i);
  });
});
