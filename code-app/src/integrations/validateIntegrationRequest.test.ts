import { describe, it, expect } from 'vitest';
import { validateIntegrationRequest } from './validateIntegrationRequest';
import { getIntegrationProvider } from './integrationProviderRegistry';
import type { IntegrationAdapterDefinition } from './integrationAdapterTypes';

const bureau = getIntegrationProvider('credit_bureau_provider') as IntegrationAdapterDefinition;
const core = getIntegrationProvider('core_banking_provider') as IntegrationAdapterDefinition;
const scoring = getIntegrationProvider('credit_scoring_provider') as IntegrationAdapterDefinition;

describe('Phase 142F — integration request validation gate', () => {
  it('blocks all attempts when the adapter is disabled', () => {
    const r = validateIntegrationRequest({ provider: bureau, request: { providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary' } });
    expect(r.allowed).toBe(false);
    expect(r.status).toBe('disabled_not_configured');
  });

  it('blocks when permission is missing', () => {
    const r = validateIntegrationRequest({ provider: core, request: { providerKey: core.providerKey, capability: 'lookup_customer' }, mode: 'live_read_only' });
    expect(r.status).toBe('blocked_permission');
  });

  it('blocks when human approval is missing', () => {
    const r = validateIntegrationRequest({
      provider: bureau, request: { providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary' },
      mode: 'live_read_only', permissionContext: { grantedPermissions: ['integration.bureau.use'] },
    });
    expect(r.status).toBe('blocked_human_approval');
  });

  it('blocks the credit bureau when permissible purpose is missing', () => {
    const r = validateIntegrationRequest({
      provider: bureau, request: { providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary' },
      mode: 'live_read_only', permissionContext: { grantedPermissions: ['integration.bureau.use'] },
      approvalState: { approvals: ['bureau_pull_approval'] },
    });
    expect(r.status).toBe('blocked_permissible_purpose');
  });

  it('blocks PII / credit report external transmission', () => {
    const r = validateIntegrationRequest({
      provider: bureau, request: { providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary', purpose: 'credit_underwriting' },
      mode: 'live_read_only', permissionContext: { grantedPermissions: ['integration.bureau.use'] },
      approvalState: { approvals: ['bureau_pull_approval'] },
      policyState: { permissiblePurposes: ['credit_underwriting'] },
    });
    expect(r.status).toBe('blocked_pii');
  });

  it('blocks any core banking write mode', () => {
    const r = validateIntegrationRequest({ provider: core, request: { providerKey: core.providerKey, capability: 'lookup_account' }, mode: 'live_write_enabled_future' });
    expect(r.status).toBe('blocked_policy');
    expect(r.blockers[0].code).toBe('integration_write_forbidden');
  });

  it('blocks when external transport is missing', () => {
    const r = validateIntegrationRequest({
      provider: core, request: { providerKey: core.providerKey, capability: 'lookup_customer' },
      mode: 'live_read_only', permissionContext: { grantedPermissions: ['integration.core.use'] },
    });
    expect(r.status).toBe('blocked_transport');
  });

  it('still blocks live calls even when fully configured (this phase)', () => {
    const r = validateIntegrationRequest({
      provider: core, request: { providerKey: core.providerKey, capability: 'lookup_customer' },
      mode: 'live_read_only', permissionContext: { grantedPermissions: ['integration.core.use'] },
      transportConfigured: true, policyState: { piiTransmissionAllowed: false },
    });
    expect(r.status).toBe('blocked_live_calls_disabled');
    expect(r.allowed).toBe(false);
  });

  it('flags scoring as decision support only and never returns a final decision', () => {
    const r = validateIntegrationRequest({
      provider: scoring, request: { providerKey: scoring.providerKey, capability: 'score_deal' },
      mode: 'live_read_only', permissionContext: { grantedPermissions: ['integration.scoring.use'] },
      transportConfigured: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.warnings.some((w) => w.code === 'scoring_decision_support_only')).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/approved|declined|finalDecision/i);
  });

  it('dry-run does not call transport', () => {
    const r = validateIntegrationRequest({
      provider: core, request: { providerKey: core.providerKey, capability: 'lookup_customer' },
      mode: 'dry_run', permissionContext: { grantedPermissions: ['integration.core.use'] },
      transportConfigured: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.warnings.some((w) => w.code === 'dry_run_no_transport')).toBe(true);
  });
});
