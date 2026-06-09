/**
 * Phase 142J — Admin configuration persistence adapter RESOLVER.
 *
 * PURE. The single decision point that returns the disabled adapter by default
 * and the (write-disabled) Dataverse seam only when persistence is enabled, the
 * schema is ready, a transport is injected, permission allows, and policy allows.
 * Even then, writes remain disabled. No dynamic import, no arbitrary adapter key,
 * no fetch, no write by the resolver.
 */

import type { AdminConfigurationPersistenceAdapter, AdminConfigurationPersistenceSchemaState } from './adminConfigurationPersistenceTypes';
import type { AdminConfigPersistenceFeatureFlags } from './adminConfigurationPersistenceFeatureFlags';
import { createDisabledAdminConfigurationPersistenceAdapter } from './createDisabledAdminConfigurationPersistenceAdapter';
import {
  createAdminConfigurationDataversePersistenceAdapter,
  type AdminConfigPersistenceTransport,
} from './createAdminConfigurationDataversePersistenceAdapter';

export interface ResolveAdminConfigPersistenceAdapterInput {
  flags: AdminConfigPersistenceFeatureFlags;
  schemaReadiness: AdminConfigurationPersistenceSchemaState;
  transport?: AdminConfigPersistenceTransport;
  permissionContext?: { grantedPermissions?: readonly string[] };
  policyContext?: { persistenceAllowed?: boolean };
  clock?: string;
}

export interface ResolvedAdminConfigPersistenceAdapter {
  adapter: AdminConfigurationPersistenceAdapter;
  /** True only when the Dataverse seam was constructed (still write-disabled). */
  live: boolean;
}

const REQUIRED_PERMISSION = 'admin.config.persistence.use';

export function resolveAdminConfigurationPersistenceAdapter(
  input: ResolveAdminConfigPersistenceAdapterInput,
): ResolvedAdminConfigPersistenceAdapter {
  const granted = new Set(input.permissionContext?.grantedPermissions ?? []);
  const wantSeam =
    input.flags.ADMIN_CONFIG_PERSISTENCE_ENABLED === true &&
    input.schemaReadiness.schemaReady === true &&
    input.transport !== undefined &&
    granted.has(REQUIRED_PERMISSION) &&
    input.policyContext?.persistenceAllowed === true;

  if (!wantSeam) {
    return { adapter: createDisabledAdminConfigurationPersistenceAdapter(), live: false };
  }

  // The seam is constructed, but writes remain disabled in this phase.
  return {
    adapter: createAdminConfigurationDataversePersistenceAdapter({
      transport: input.transport,
      flags: input.flags,
      schemaReadiness: input.schemaReadiness,
      permissionContext: input.permissionContext,
      policyContext: input.policyContext,
      clock: input.clock,
    }),
    live: true,
  };
}
