/**
 * Phase 141L — CRM runtime persistence resolver.
 *
 * The single decision point that combines feature flags, the verified-schema
 * gate, operator authorization, and an injected transport into either the live
 * CRM persistence adapter or the disabled one. It FAILS CLOSED: the live adapter
 * is returned ONLY when every gate passes AND a transport is injected. It never
 * enables a route or any UI by itself.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO. No default transport is ever constructed here.
 *   - Disabled by default. Live persistence requires: a transport, the live
 *     persistence flag, an authorized operator, and a schema-ready verification.
 */

import type { CrmFeatureFlagState } from './crmFeatureFlags';
import type { CrmLivePersistenceAdapter } from './crmPersistenceTypes';
import {
  createCrmLiveDataverseAdapter,
  createDisabledCrmLiveDataverseAdapter,
} from './crmLiveDataverseAdapter';
import type { CrmDataverseTransport } from './crmLiveDataverseTransport';
import {
  deriveCrmRuntimeSchemaGate,
  type VerifiedCrmSchemaState,
  type CrmRuntimeSchemaGateResult,
} from './crmRuntimeSchemaGate';

export interface CrmRuntimeAdapterResolveInput {
  flags: CrmFeatureFlagState;
  verified: VerifiedCrmSchemaState;
  isAuthorizedOperator: boolean;
  /** The injected transport. Absent → disabled adapter. */
  transport?: CrmDataverseTransport;
}

export interface CrmRuntimeAdapterResolution {
  gate: CrmRuntimeSchemaGateResult;
  adapter: CrmLivePersistenceAdapter;
  /** True when the live adapter was constructed. */
  live: boolean;
}

export function resolveCrmPersistenceAdapter(
  input: CrmRuntimeAdapterResolveInput,
): CrmRuntimeAdapterResolution {
  const wantLive =
    input.transport !== undefined &&
    input.flags.CRM_LIVE_PERSISTENCE_ENABLED === true &&
    input.isAuthorizedOperator === true;

  const gate = deriveCrmRuntimeSchemaGate({
    verified: input.verified,
    flags: input.flags,
    adapterEnabled: wantLive,
    isAuthorizedOperator: input.isAuthorizedOperator,
  });

  if (wantLive && gate.schemaReady && input.transport) {
    return {
      gate,
      live: true,
      adapter: createCrmLiveDataverseAdapter({
        transport: input.transport,
        featureFlags: input.flags,
        schemaGate: gate,
        authorization: { isAuthorizedOperator: input.isAuthorizedOperator },
      }),
    };
  }

  return {
    gate,
    live: false,
    adapter: createDisabledCrmLiveDataverseAdapter(),
  };
}
