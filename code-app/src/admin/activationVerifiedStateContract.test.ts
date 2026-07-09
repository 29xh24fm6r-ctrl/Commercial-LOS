// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
} from './runtimeVerifiedSchemaBridge';
import {
  EXPECTED_CRM_SCHEMA,
  type VerifiedCrmSchemaState,
} from '../crm/crmRuntimeSchemaGate';
import { EXPECTED_BOARDING_SCHEMA } from '../portfolioBoarding/portfolioBoardingRuntimeSchemaGate';
import { resolveCrmPersistenceAdapter } from '../crm/resolveCrmPersistenceAdapter';
import { deriveCrmFeatureFlagState } from '../crm/crmFeatureFlags';
import type { CrmDataverseTransport } from '../crm/crmLiveDataverseTransport';
import { resolvePortfolioLoanBoardingRuntimeAdapter } from '../portfolioBoarding/resolvePortfolioLoanBoardingPersistenceAdapter';
import { resolvePortfolioBoardingFeatureFlags } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import type { DataverseWriteClient } from '../portfolioBoarding/portfolioLoanBoardingLiveDataverseTransport';

/**
 * Activation prep — verified-state wiring contract (committed-evidence path).
 *
 * The runtime verified-state bridge (runtimeVerifiedSchemaBridge.ts) and its fixture-based
 * unit test already exist. This contract pins the four activation guarantees against the
 * ACTUAL COMMITTED evidence (CURRENT_CRM/PORTFOLIO_VERIFICATION_EVIDENCE) flowing through the
 * REAL persistence resolvers — the same path production reads — so a regression in either the
 * committed evidence or a resolver is caught here:
 *
 *   1. missing verified state → the schema gate stays blocked (no live adapter);
 *   2. conflicts > 0 → blocked, even with full table/column counts;
 *   3. complete verified state (the committed evidence) → satisfies the gate;
 *   4. the feature flag must still be true — a hydrated state alone never enables a live write.
 *
 * It flips no flag and performs no IO (noop transports); it only proves the fail-closed wiring.
 */

const CRM_NOOP_TRANSPORT: CrmDataverseTransport = {
  createRecord: async () => ({ ok: true, id: 'noop' }),
  updateRecord: async () => ({ ok: true }),
  readRecord: async () => ({ ok: true, record: {} }),
  searchRecords: async () => ({ ok: true, records: [] }),
};

const BOARDING_NOOP_CLIENT: DataverseWriteClient = {
  create: async () => ({ ok: true, id: 'noop' }),
  update: async () => ({ ok: true }),
  retrieve: async () => ({ ok: true, record: {} }),
  retrieveMultiple: async () => ({ ok: true, records: [] }),
};

const ZEROED_CRM: VerifiedCrmSchemaState = { tablesFound: 0, columnsFound: 0, relationshipsFound: 0, conflicts: 0 };

describe('Activation verified-state contract — CRM (committed evidence → real resolver)', () => {
  it('1. missing verified state stays blocked (no live adapter)', () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: ZEROED_CRM,
      isAuthorizedOperator: true,
      transport: CRM_NOOP_TRANSPORT,
    });
    expect(r.gate.schemaReady).toBe(false);
    expect(r.live).toBe(false);
  });

  it('2. conflicts > 0 stays blocked even with full table/column counts', () => {
    const withConflict: VerifiedCrmSchemaState = {
      tablesFound: EXPECTED_CRM_SCHEMA.tables,
      columnsFound: EXPECTED_CRM_SCHEMA.columns,
      relationshipsFound: EXPECTED_CRM_SCHEMA.relationships,
      conflicts: 1,
    };
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: withConflict,
      isAuthorizedOperator: true,
      transport: CRM_NOOP_TRANSPORT,
    });
    expect(r.gate.schemaReady).toBe(false);
    expect(r.live).toBe(false);
    // And committed evidence with an injected conflict does not even hydrate.
    const hydrated = hydrateVerifiedCrmSchemaState({
      ...CURRENT_CRM_VERIFICATION_EVIDENCE,
      measured: { ...CURRENT_CRM_VERIFICATION_EVIDENCE.measured!, conflicts: 1 },
    });
    expect(hydrated.hydrated).toBe(false);
  });

  it('3. the committed CRM evidence hydrates and satisfies the schema gate', () => {
    const hydrated = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE);
    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.verified).not.toBeNull();
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: hydrated.verified!,
      isAuthorizedOperator: true,
      transport: CRM_NOOP_TRANSPORT,
    });
    expect(r.gate.schemaReady).toBe(true);
    expect(r.live).toBe(true);
  });

  it('4. the live flag must still be true — hydrated state alone never enables a live write', () => {
    const hydrated = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE);
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: false }),
      verified: hydrated.verified!,
      isAuthorizedOperator: true,
      transport: CRM_NOOP_TRANSPORT,
    });
    // Schema is genuinely ready, but the gate still refuses because the flag is off.
    expect(r.gate.schemaReady).toBe(true);
    expect(r.live).toBe(false);
  });
});

describe('Activation verified-state contract — portfolio boarding (committed evidence → real resolver)', () => {
  it('3. the committed boarding evidence hydrates and satisfies the schema gate', () => {
    const hydrated = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE);
    expect(hydrated.hydrated).toBe(true);
    const r = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: resolvePortfolioBoardingFeatureFlags({ livePersistenceEnabled: true, routeEnabled: true }),
      verified: hydrated.verified!,
      isAuthorizedOperator: true,
      client: BOARDING_NOOP_CLIENT,
    });
    expect(r.gate.schemaReady).toBe(true);
    expect(r.live).toBe(true);
  });

  it('4. the live + route flags must be true — hydrated state alone never enables a live write', () => {
    const hydrated = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE);
    const flagOff = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: resolvePortfolioBoardingFeatureFlags({ livePersistenceEnabled: false, routeEnabled: true }),
      verified: hydrated.verified!,
      isAuthorizedOperator: true,
      client: BOARDING_NOOP_CLIENT,
    });
    expect(flagOff.gate.schemaReady).toBe(true);
    expect(flagOff.live).toBe(false);
    // Route off is the same fail-closed outcome.
    const routeOff = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: resolvePortfolioBoardingFeatureFlags({ livePersistenceEnabled: true, routeEnabled: false }),
      verified: hydrated.verified!,
      isAuthorizedOperator: true,
      client: BOARDING_NOOP_CLIENT,
    });
    expect(routeOff.live).toBe(false);
  });

  it('1/2. missing or conflicted boarding state stays blocked', () => {
    const zeroed = { tablesFound: 0, columnsFound: 0, requiredRelationshipsFound: 0, optionalRelationshipsFound: 0, conflicts: 0 };
    const missing = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: resolvePortfolioBoardingFeatureFlags({ livePersistenceEnabled: true, routeEnabled: true }),
      verified: zeroed,
      isAuthorizedOperator: true,
      client: BOARDING_NOOP_CLIENT,
    });
    expect(missing.gate.schemaReady).toBe(false);
    expect(missing.live).toBe(false);
    const conflicted = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: resolvePortfolioBoardingFeatureFlags({ livePersistenceEnabled: true, routeEnabled: true }),
      verified: {
        tablesFound: EXPECTED_BOARDING_SCHEMA.tables,
        columnsFound: EXPECTED_BOARDING_SCHEMA.columns,
        requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships,
        optionalRelationshipsFound: EXPECTED_BOARDING_SCHEMA.optionalRelationships,
        conflicts: 1,
      },
      isAuthorizedOperator: true,
      client: BOARDING_NOOP_CLIENT,
    });
    expect(conflicted.gate.schemaReady).toBe(false);
    expect(conflicted.live).toBe(false);
  });
});
