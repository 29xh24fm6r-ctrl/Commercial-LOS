import { describe, it, expect } from 'vitest';
import { resolveIntegrationAdapter } from './resolveIntegrationAdapter';

describe('Phase 142F — integration adapter resolver', () => {
  it('defaults to a disabled adapter', () => {
    const r = resolveIntegrationAdapter({ providerKey: 'core_banking_provider' });
    expect(r.adapter?.getStatus().status).toBe('disabled');
    expect(r.resolution).toBe('feature_flag_off');
  });

  it('returns unsupported for an unknown provider', () => {
    const r = resolveIntegrationAdapter({ providerKey: 'totally_unknown_provider' });
    expect(r.adapter).toBeNull();
    expect(r.resolution).toBe('unsupported_provider');
  });

  it('returns disabled when the feature flag is off', () => {
    const r = resolveIntegrationAdapter({ providerKey: 'core_banking_provider', featureFlags: { core_banking_provider: false } });
    expect(r.resolution).toBe('feature_flag_off');
    expect(r.adapter?.getStatus().status).toBe('disabled');
  });

  it('returns not-configured / transport-missing when transport is absent', () => {
    const r = resolveIntegrationAdapter({ providerKey: 'core_banking_provider', featureFlags: { core_banking_provider: true } });
    expect(r.resolution).toBe('transport_missing');
    expect(r.adapter?.getStatus().status).toBe('disabled');
  });

  it('returns policy-blocked when policy disallows external calls', () => {
    const r = resolveIntegrationAdapter({
      providerKey: 'core_banking_provider',
      featureFlags: { core_banking_provider: true },
      transportRegistry: { core_banking_provider: true },
      permissionContext: { grantedPermissions: ['integration.core.use'] },
      policyState: { externalCallsAllowed: false },
    });
    expect(r.resolution).toBe('policy_blocked');
    expect(r.adapter?.getStatus().status).toBe('disabled');
  });

  it('keeps live calls disabled even when everything resolves', () => {
    const r = resolveIntegrationAdapter({
      providerKey: 'core_banking_provider',
      featureFlags: { core_banking_provider: true },
      transportRegistry: { core_banking_provider: true },
      permissionContext: { grantedPermissions: ['integration.core.use'] },
      policyState: { externalCallsAllowed: true },
    });
    expect(r.resolution).toBe('disabled_live_calls');
    expect(r.adapter?.getStatus().status).toBe('disabled');
  });

  it('does not accept an arbitrary provider key (allowlist only)', () => {
    const r = resolveIntegrationAdapter({ providerKey: '../../etc/passwd' });
    expect(r.adapter).toBeNull();
    expect(r.resolution).toBe('unsupported_provider');
  });
});
