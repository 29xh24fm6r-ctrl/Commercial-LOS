/**
 * Phase 142F — Integration adapter resolver.
 *
 * PURE, READ-ONLY. Resolves a provider key (from an ALLOWLIST — the registry) to
 * a DISABLED adapter. It never performs a direct fetch, never dynamically
 * imports by provider name, and never accepts an arbitrary provider key. Even
 * when a feature flag, transport, permission, and policy would theoretically
 * permit a future adapter, this phase still returns a disabled adapter: live
 * external calls remain disabled.
 */

import type { IntegrationAdapter } from './integrationAdapterContracts';
import type {
  IntegrationAdapterDefinition,
  IntegrationPermissionContext,
  IntegrationPolicyState,
} from './integrationAdapterTypes';
import { INTEGRATION_PROVIDER_REGISTRY } from './integrationProviderRegistry';
import { createDisabledIntegrationAdapter } from './createDisabledIntegrationAdapters';

export type IntegrationAdapterResolution =
  | 'unsupported_provider'
  | 'disabled_default'
  | 'feature_flag_off'
  | 'transport_missing'
  | 'permission_denied'
  | 'policy_blocked'
  | 'disabled_live_calls';

export interface ResolveIntegrationAdapterInput {
  providerKey: string;
  registry?: readonly IntegrationAdapterDefinition[];
  featureFlags?: Readonly<Record<string, boolean>>;
  permissionContext?: IntegrationPermissionContext;
  /** providerKey → whether a transport adapter is configured. */
  transportRegistry?: Readonly<Record<string, boolean>>;
  policyState?: IntegrationPolicyState;
}

export interface ResolvedIntegrationAdapter {
  providerKey: string;
  /** Always a disabled adapter in this phase, or null for an unsupported key. */
  adapter: IntegrationAdapter | null;
  resolution: IntegrationAdapterResolution;
  message: string;
}

export function resolveIntegrationAdapter(
  input: ResolveIntegrationAdapterInput,
): ResolvedIntegrationAdapter {
  const registry = input.registry ?? INTEGRATION_PROVIDER_REGISTRY;

  // Allowlist only — an unknown / arbitrary provider key is never resolvable.
  const def = registry.find((p) => p.providerKey === input.providerKey);
  if (!def) {
    return { providerKey: input.providerKey, adapter: null, resolution: 'unsupported_provider', message: 'Unknown provider key — not in the registry allowlist.' };
  }

  const adapter = createDisabledIntegrationAdapter(def);

  const flagOn = input.featureFlags?.[def.providerKey] === true;
  if (!flagOn) {
    return { providerKey: def.providerKey, adapter, resolution: 'feature_flag_off', message: `${def.displayName} feature flag is off; returning disabled adapter.` };
  }

  const transportPresent = input.transportRegistry?.[def.providerKey] === true;
  if (!transportPresent) {
    return { providerKey: def.providerKey, adapter, resolution: 'transport_missing', message: `${def.displayName} has no configured transport; returning disabled adapter.` };
  }

  const granted = new Set(input.permissionContext?.grantedPermissions ?? []);
  const missingPermission = def.permissionRequirements.some((p) => !granted.has(p.permissionKey));
  if (missingPermission) {
    return { providerKey: def.providerKey, adapter, resolution: 'permission_denied', message: `${def.displayName} permission not granted; returning disabled adapter.` };
  }

  if (input.policyState?.externalCallsAllowed !== true) {
    return { providerKey: def.providerKey, adapter, resolution: 'policy_blocked', message: `${def.displayName} external calls not permitted by policy; returning disabled adapter.` };
  }

  // Even fully "resolvable" — this phase keeps live external calls disabled.
  return { providerKey: def.providerKey, adapter, resolution: 'disabled_live_calls', message: `${def.displayName} resolves but live external calls are disabled in this phase.` };
}
