import { describe, it, expect } from 'vitest';
import {
  resolveAdminConfigPersistenceFeatureFlags,
  ADMIN_CONFIG_PERSISTENCE_FEATURE_FLAG_DEFAULTS,
} from './adminConfigurationPersistenceFeatureFlags';
import { resolveAdminConfigurationPersistenceAdapter } from './resolveAdminConfigurationPersistenceAdapter';
import { deriveAdminConfigurationSchemaReadiness } from './deriveAdminConfigurationSchemaReadiness';
import { ADMIN_CONFIG_TARGET_TABLES, ADMIN_CONFIG_TARGET_RELATIONSHIPS, adminConfigTargetColumnsForTable } from './adminConfigurationDataverseSchemaPlan';
import type { AdminConfigPersistenceTransport } from './createAdminConfigurationDataversePersistenceAdapter';

const TRANSPORT: AdminConfigPersistenceTransport = { kind: 'admin_config_persistence_transport' };

function readySchema() {
  return deriveAdminConfigurationSchemaReadiness({
    publisherPrefixConfirmed: true,
    inspectedTables: ADMIN_CONFIG_TARGET_TABLES.map((t) => ({ logicalName: t.logicalName, exists: true, presentColumns: adminConfigTargetColumnsForTable(t.logicalName).map((c) => c.logicalName) })),
    relationshipsPresent: ADMIN_CONFIG_TARGET_RELATIONSHIPS.map((r) => r.relationshipSchemaName),
  });
}

describe('Phase 142J — persistence feature flags', () => {
  it('defaults every unsafe flag off, dry-run on', () => {
    const d = ADMIN_CONFIG_PERSISTENCE_FEATURE_FLAG_DEFAULTS;
    expect(d.ADMIN_CONFIG_PERSISTENCE_ENABLED).toBe(false);
    expect(d.ADMIN_CONFIG_PERSISTENCE_READ_ENABLED).toBe(false);
    expect(d.ADMIN_CONFIG_PERSISTENCE_WRITE_ENABLED).toBe(false);
    expect(d.ADMIN_CONFIG_PERSISTENCE_APPLY_ENABLED).toBe(false);
    expect(d.ADMIN_CONFIG_PERSISTENCE_DRY_RUN_ONLY).toBe(true);
  });

  it('never enables write or apply even when config asks for them', () => {
    const f = resolveAdminConfigPersistenceFeatureFlags({ persistenceEnabled: true, writeEnabled: true, applyEnabled: true });
    expect(f.ADMIN_CONFIG_PERSISTENCE_WRITE_ENABLED).toBe(false);
    expect(f.ADMIN_CONFIG_PERSISTENCE_APPLY_ENABLED).toBe(false);
    expect(f.ADMIN_CONFIG_PERSISTENCE_ENABLED).toBe(true);
  });

  it('resolves nothing from a missing config (fail-closed)', () => {
    const f = resolveAdminConfigPersistenceFeatureFlags();
    expect(f.ADMIN_CONFIG_PERSISTENCE_ENABLED).toBe(false);
    expect(f.ADMIN_CONFIG_PERSISTENCE_DRY_RUN_ONLY).toBe(true);
  });
});

describe('Phase 142J — persistence adapter resolver', () => {
  const enabled = resolveAdminConfigPersistenceFeatureFlags({ persistenceEnabled: true, readEnabled: true });
  const perm = { grantedPermissions: ['admin.config.persistence.use'] };
  const policy = { persistenceAllowed: true };

  it('returns the disabled adapter by default', () => {
    const r = resolveAdminConfigurationPersistenceAdapter({ flags: resolveAdminConfigPersistenceFeatureFlags(), schemaReadiness: readySchema(), transport: TRANSPORT, permissionContext: perm, policyContext: policy });
    expect(r.live).toBe(false);
    expect(r.adapter.mode).toBe('disabled');
  });

  it('returns disabled when transport is missing', () => {
    const r = resolveAdminConfigurationPersistenceAdapter({ flags: enabled, schemaReadiness: readySchema(), permissionContext: perm, policyContext: policy });
    expect(r.live).toBe(false);
  });

  it('returns disabled when schema is not ready', () => {
    const r = resolveAdminConfigurationPersistenceAdapter({ flags: enabled, schemaReadiness: deriveAdminConfigurationSchemaReadiness(), transport: TRANSPORT, permissionContext: perm, policyContext: policy });
    expect(r.live).toBe(false);
  });

  it('constructs the seam when every gate opens but keeps save blocked', () => {
    const r = resolveAdminConfigurationPersistenceAdapter({ flags: enabled, schemaReadiness: readySchema(), transport: TRANSPORT, permissionContext: perm, policyContext: policy });
    expect(r.live).toBe(true);
    expect(r.adapter.mode).toBe('live_write_disabled');
    expect(r.adapter.getReadiness().writeEnabled).toBe(false);
  });
});
