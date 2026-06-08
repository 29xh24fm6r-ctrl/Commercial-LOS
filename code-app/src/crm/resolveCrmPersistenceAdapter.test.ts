import { describe, it, expect } from 'vitest';
import { resolveCrmPersistenceAdapter } from './resolveCrmPersistenceAdapter';
import { deriveCrmFeatureFlagState } from './crmFeatureFlags';
import { EXPECTED_CRM_SCHEMA } from './crmRuntimeSchemaGate';
import type { CrmDataverseTransport } from './crmLiveDataverseTransport';

/**
 * Phase 141L — CRM persistence resolver pins.
 *
 * Disabled by default. The live adapter is returned ONLY when the live flag is
 * on, the schema is verified ready, a transport is injected, and the operator is
 * authorized. It never enables a route or any UI by itself.
 */

const READY = {
  tablesFound: EXPECTED_CRM_SCHEMA.tables,
  columnsFound: EXPECTED_CRM_SCHEMA.columns,
  relationshipsFound: EXPECTED_CRM_SCHEMA.relationships,
  conflicts: 0,
};

const noopTransport: CrmDataverseTransport = {
  createRecord: async () => ({ ok: true, id: 'x' }),
  updateRecord: async () => ({ ok: true }),
  readRecord: async () => ({ ok: true, record: {} }),
  searchRecords: async () => ({ ok: true, records: [] }),
};

describe('Phase 141L — CRM persistence resolver fails closed by default', () => {
  it('default (no transport, flags off) returns the disabled adapter', () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState(),
      verified: READY,
      isAuthorizedOperator: true,
    });
    expect(r.live).toBe(false);
    expect(r.adapter.enabled).toBe(false);
  });

  it('flag off (with transport + ready schema) returns the disabled adapter', () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: false }),
      verified: READY,
      isAuthorizedOperator: true,
      transport: noopTransport,
    });
    expect(r.live).toBe(false);
    expect(r.adapter.enabled).toBe(false);
  });

  it('schema not ready returns the disabled adapter even with the flag + transport + authorization', () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: { ...READY, tablesFound: 0 },
      isAuthorizedOperator: true,
      transport: noopTransport,
    });
    expect(r.live).toBe(false);
    expect(r.gate.schemaReady).toBe(false);
    expect(r.adapter.enabled).toBe(false);
  });

  it('a missing transport returns the disabled adapter', () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: READY,
      isAuthorizedOperator: true,
    });
    expect(r.live).toBe(false);
    expect(r.adapter.enabled).toBe(false);
  });

  it('an unauthorized operator returns the disabled adapter', () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: READY,
      isAuthorizedOperator: false,
      transport: noopTransport,
    });
    expect(r.live).toBe(false);
  });

  it('all gates true returns the live adapter (route stays off)', () => {
    const flags = deriveCrmFeatureFlagState({ livePersistenceEnabled: true });
    const r = resolveCrmPersistenceAdapter({
      flags,
      verified: READY,
      isAuthorizedOperator: true,
      transport: noopTransport,
    });
    expect(r.live).toBe(true);
    expect(r.adapter.enabled).toBe(true);
    // The resolver never enables a route.
    expect(flags.CRM_ROUTE_ENABLED).toBe(false);
  });
});
