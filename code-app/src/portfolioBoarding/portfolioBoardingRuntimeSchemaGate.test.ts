import { describe, it, expect } from 'vitest';
import {
  derivePortfolioBoardingRuntimeSchemaGate,
  assertPortfolioBoardingSchemaReadyForRuntime,
  PortfolioBoardingSchemaNotReadyError,
  EXPECTED_BOARDING_SCHEMA,
  type VerifiedBoardingSchemaState,
} from './portfolioBoardingRuntimeSchemaGate';

const OK_VERIFIED: VerifiedBoardingSchemaState = {
  tablesFound: EXPECTED_BOARDING_SCHEMA.tables,
  columnsFound: EXPECTED_BOARDING_SCHEMA.columns,
  requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships,
  optionalRelationshipsFound: EXPECTED_BOARDING_SCHEMA.optionalRelationships,
  conflicts: 0,
};

const ALL_ON = {
  PORTFOLIO_BOARDING_ROUTE_ENABLED: true,
  PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: true,
};

describe('Phase 140Q — runtime schema gate expectations match the live state', () => {
  it('expects 13 tables, 12 required lookups, and 6 optional relationships', () => {
    expect(EXPECTED_BOARDING_SCHEMA.tables).toBe(13);
    expect(EXPECTED_BOARDING_SCHEMA.requiredRelationships).toBe(12);
    expect(EXPECTED_BOARDING_SCHEMA.optionalRelationships).toBe(6);
    expect(EXPECTED_BOARDING_SCHEMA.columns).toBeGreaterThan(150);
  });
});

describe('Phase 140Q — schemaReady is fail-closed', () => {
  it('schemaReady true only when all required checks pass', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({
      verified: OK_VERIFIED,
      flags: ALL_ON,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(g.schemaReady).toBe(true);
    expect(g.blockers).toEqual([]);
  });

  it('a missing required table blocks schemaReady', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({
      verified: { ...OK_VERIFIED, tablesFound: EXPECTED_BOARDING_SCHEMA.tables - 1 },
      flags: ALL_ON,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(g.schemaReady).toBe(false);
    expect(g.canCreate).toBe(false);
  });

  it('a missing required column or relationship blocks schemaReady', () => {
    expect(
      derivePortfolioBoardingRuntimeSchemaGate({
        verified: { ...OK_VERIFIED, columnsFound: 1 },
        flags: ALL_ON,
        adapterEnabled: true,
        isAuthorizedOperator: true,
      }).schemaReady,
    ).toBe(false);
    expect(
      derivePortfolioBoardingRuntimeSchemaGate({
        verified: { ...OK_VERIFIED, requiredRelationshipsFound: 11 },
        flags: ALL_ON,
        adapterEnabled: true,
        isAuthorizedOperator: true,
      }).schemaReady,
    ).toBe(false);
  });

  it('a conflict blocks schemaReady', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({
      verified: { ...OK_VERIFIED, conflicts: 1 },
      flags: ALL_ON,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(g.schemaReady).toBe(false);
  });

  it('a missing optional relationship is a warning, not a blocker', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({
      verified: { ...OK_VERIFIED, optionalRelationshipsFound: 5 },
      flags: ALL_ON,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(g.schemaReady).toBe(true);
    expect(g.warnings.length).toBeGreaterThan(0);
  });
});

describe('Phase 140Q — write gating combines schema + flags + adapter + authorization', () => {
  const base = {
    verified: OK_VERIFIED,
    flags: ALL_ON,
    adapterEnabled: true,
    isAuthorizedOperator: true,
  };

  it('all green → canCreate/canUpdate true', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate(base);
    expect(g.canCreate).toBe(true);
    expect(g.canUpdate).toBe(true);
  });

  it('live persistence off → no create/update', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({
      ...base,
      flags: { ...ALL_ON, PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: false },
    });
    expect(g.canCreate).toBe(false);
    expect(g.canUpdate).toBe(false);
  });

  it('route off → no create/update', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({
      ...base,
      flags: { ...ALL_ON, PORTFOLIO_BOARDING_ROUTE_ENABLED: false },
    });
    expect(g.canCreate).toBe(false);
  });

  it('disabled adapter → no create/update', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({ ...base, adapterEnabled: false });
    expect(g.canCreate).toBe(false);
  });

  it('unauthorized → no create/update, and read-only does not grant write', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({ ...base, isAuthorizedOperator: false });
    expect(g.canCreate).toBe(false);
    expect(g.canRead).toBe(false);
  });

  it('read is allowed read-only (authorized + adapter) without write authority', () => {
    const g = derivePortfolioBoardingRuntimeSchemaGate({
      ...base,
      flags: { PORTFOLIO_BOARDING_ROUTE_ENABLED: false, PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: false },
    });
    expect(g.canRead).toBe(true);
    expect(g.canCreate).toBe(false);
  });
});

describe('Phase 140Q — assert helper throws structured error when not ready', () => {
  it('throws PortfolioBoardingSchemaNotReadyError with blockers', () => {
    expect(() =>
      assertPortfolioBoardingSchemaReadyForRuntime({
        verified: { ...OK_VERIFIED, tablesFound: 0 },
        flags: ALL_ON,
        adapterEnabled: true,
        isAuthorizedOperator: true,
      }),
    ).toThrow(PortfolioBoardingSchemaNotReadyError);
  });

  it('returns the gate when ready', () => {
    const g = assertPortfolioBoardingSchemaReadyForRuntime({
      verified: OK_VERIFIED,
      flags: ALL_ON,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(g.schemaReady).toBe(true);
  });
});
