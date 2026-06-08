import { describe, it, expect } from 'vitest';
import {
  deriveCrmRuntimeSchemaGate,
  EXPECTED_CRM_SCHEMA,
  type VerifiedCrmSchemaState,
} from './crmRuntimeSchemaGate';
import { deriveCrmFeatureFlagState } from './crmFeatureFlags';

/**
 * Phase 141L — CRM runtime schema gate pins.
 *
 * Fail-closed: schemaReady requires the verified table + column counts to meet
 * the plan with zero conflicts. Create/update additionally require live
 * persistence, a live adapter, and an authorized operator.
 */

const LIVE_FLAGS = deriveCrmFeatureFlagState({ livePersistenceEnabled: true });
const OFF_FLAGS = deriveCrmFeatureFlagState();

function verified(over: Partial<VerifiedCrmSchemaState> = {}): VerifiedCrmSchemaState {
  return {
    tablesFound: EXPECTED_CRM_SCHEMA.tables,
    columnsFound: EXPECTED_CRM_SCHEMA.columns,
    relationshipsFound: EXPECTED_CRM_SCHEMA.relationships,
    conflicts: 0,
    ...over,
  };
}

describe('Phase 141L — CRM schema gate readiness', () => {
  it('the exact verified state passes and grants create/update when fully authorized', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified(),
      flags: LIVE_FLAGS,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(r.schemaReady).toBe(true);
    expect(r.canCreate).toBe(true);
    expect(r.canUpdate).toBe(true);
    expect(r.canRead).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('the plan-derived expectations are 10 tables / 147 columns / 28 relationships', () => {
    expect(EXPECTED_CRM_SCHEMA.tables).toBe(10);
    expect(EXPECTED_CRM_SCHEMA.columns).toBe(147);
    expect(EXPECTED_CRM_SCHEMA.relationships).toBe(28);
  });

  it('a missing table blocks schemaReady', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified({ tablesFound: EXPECTED_CRM_SCHEMA.tables - 1 }),
      flags: LIVE_FLAGS,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(r.schemaReady).toBe(false);
    expect(r.canCreate).toBe(false);
  });

  it('a missing column blocks schemaReady', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified({ columnsFound: EXPECTED_CRM_SCHEMA.columns - 1 }),
      flags: LIVE_FLAGS,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(r.schemaReady).toBe(false);
  });

  it('a conflict blocks schemaReady', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified({ conflicts: 1 }),
      flags: LIVE_FLAGS,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(r.schemaReady).toBe(false);
  });

  it('missing optional relationships are a warning, not a blocker', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified({ relationshipsFound: 0 }),
      flags: LIVE_FLAGS,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(r.schemaReady).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('Phase 141L — CRM schema gate fail-closed on flags / adapter / authorization', () => {
  it('the persistence flag off blocks create/update', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified(),
      flags: OFF_FLAGS,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(r.canCreate).toBe(false);
    expect(r.canUpdate).toBe(false);
  });

  it('a disabled adapter blocks create/update', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified(),
      flags: LIVE_FLAGS,
      adapterEnabled: false,
      isAuthorizedOperator: true,
    });
    expect(r.canCreate).toBe(false);
  });

  it('an unauthorized operator blocks create/update and read', () => {
    const r = deriveCrmRuntimeSchemaGate({
      verified: verified(),
      flags: LIVE_FLAGS,
      adapterEnabled: true,
      isAuthorizedOperator: false,
    });
    expect(r.canCreate).toBe(false);
    expect(r.canRead).toBe(false);
  });
});
