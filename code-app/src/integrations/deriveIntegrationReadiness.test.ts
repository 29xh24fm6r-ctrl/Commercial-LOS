import { describe, it, expect } from 'vitest';
import { deriveIntegrationReadiness } from './deriveIntegrationReadiness';

describe('Phase 142F — integration readiness deriver', () => {
  it('derives a required credit bureau when the template requires it', () => {
    const r = deriveIntegrationReadiness({ templateRequiresCreditBureau: true });
    expect(r.requiredIntegrations).toContain('credit_bureau_provider');
  });

  it('derives AML/KYC for an onboarding route', () => {
    const r = deriveIntegrationReadiness({ templateRequiresAmlKyc: true });
    expect(r.requiredIntegrations).toContain('aml_kyc_provider');
    expect(r.requiredIntegrations).toContain('sanctions_screening_provider');
  });

  it('derives core banking + servicing lookups for a servicing lifecycle', () => {
    const r = deriveIntegrationReadiness({ servicingStage: 'booked_active' });
    expect(r.requiredIntegrations).toContain('core_banking_provider');
    expect(r.requiredIntegrations).toContain('servicing_system_provider');
  });

  it('reports every provider as blocked (all disabled)', () => {
    const r = deriveIntegrationReadiness({ templateRequiresCreditBureau: true });
    expect(r.blockedIntegrations.length).toBe(r.providerReadiness.length);
    expect(r.providerReadiness.every((p) => p.readiness.allowed === false)).toBe(true);
  });

  it('surfaces missing policy approvals and transports for required providers', () => {
    const r = deriveIntegrationReadiness({ templateRequiresCreditBureau: true });
    expect(r.missingPolicyApprovals).toContain('bureau_pull_approval');
    expect(r.missingTransports).toContain('credit_bureau_provider');
  });

  it('makes no external call and recommends configure / approve, not execute', () => {
    const r = deriveIntegrationReadiness({ templateRequiresCreditBureau: true });
    expect(r.auditSummary.containsLiveCall).toBe(false);
    const labels = r.nextBestActions.map((a) => a.label).join(' ');
    expect(labels).toMatch(/Configure|approval/i);
    expect(labels).not.toMatch(/\bRun\b|\bPull\b|\bExecute\b/i);
  });
});
