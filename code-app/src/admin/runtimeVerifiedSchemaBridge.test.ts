// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
  type CrmSchemaVerificationEvidence,
  type BoardingSchemaVerificationEvidence,
} from './runtimeVerifiedSchemaBridge';
import { EXPECTED_CRM_SCHEMA } from '../crm/crmRuntimeSchemaGate';
import { EXPECTED_BOARDING_SCHEMA } from '../portfolioBoarding/portfolioBoardingRuntimeSchemaGate';
import { resolveCrmPersistenceAdapter } from '../crm/resolveCrmPersistenceAdapter';
import { deriveCrmFeatureFlagState } from '../crm/crmFeatureFlags';
import type { CrmDataverseTransport } from '../crm/crmLiveDataverseTransport';

const FRESH_ISO = '2026-06-25T00:00:00.000Z';
const NOW = Date.parse(FRESH_ISO);

const VALID_CRM: CrmSchemaVerificationEvidence = {
  status: 'PASS',
  services: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
  dataSources: { found: EXPECTED_CRM_SCHEMA.tables, expected: EXPECTED_CRM_SCHEMA.tables },
  liveTables: { found: EXPECTED_CRM_SCHEMA.tables, checked: EXPECTED_CRM_SCHEMA.tables },
  measured: {
    tablesFound: EXPECTED_CRM_SCHEMA.tables,
    columnsFound: EXPECTED_CRM_SCHEMA.columns,
    relationshipsFound: EXPECTED_CRM_SCHEMA.relationships,
    conflicts: 0,
  },
  verifiedAtIso: FRESH_ISO,
};

const VALID_BOARDING: BoardingSchemaVerificationEvidence = {
  status: 'PASS',
  services: { found: EXPECTED_BOARDING_SCHEMA.tables, expected: EXPECTED_BOARDING_SCHEMA.tables },
  dataSources: { found: EXPECTED_BOARDING_SCHEMA.tables, expected: EXPECTED_BOARDING_SCHEMA.tables },
  liveTables: { found: EXPECTED_BOARDING_SCHEMA.tables, checked: EXPECTED_BOARDING_SCHEMA.tables },
  measured: {
    tablesFound: EXPECTED_BOARDING_SCHEMA.tables,
    columnsFound: EXPECTED_BOARDING_SCHEMA.columns,
    requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships,
    optionalRelationshipsFound: EXPECTED_BOARDING_SCHEMA.optionalRelationships,
    conflicts: 0,
  },
  verifiedAtIso: FRESH_ISO,
};

describe('Phase 246 — runtime verified-state bridge (CRM)', () => {
  it('valid all-live PASS evidence hydrates a VerifiedCrmSchemaState that meets the plan', () => {
    const r = hydrateVerifiedCrmSchemaState(VALID_CRM, { nowEpochMs: NOW });
    expect(r.hydrated).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.verified).toEqual({
      tablesFound: EXPECTED_CRM_SCHEMA.tables,
      columnsFound: EXPECTED_CRM_SCHEMA.columns,
      relationshipsFound: EXPECTED_CRM_SCHEMA.relationships,
      conflicts: 0,
    });
  });

  it('the CURRENT recorded CRM evidence HYDRATES — full live schema (10/147) + full SDK registration (10/10)', () => {
    const r = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE, { nowEpochMs: NOW });
    expect(r.hydrated).toBe(true);
    expect(r.verified).not.toBeNull();
  });

  it('zero-total live count does not hydrate', () => {
    const r = hydrateVerifiedCrmSchemaState({ ...VALID_CRM, liveTables: { found: 0, checked: 0 } }, { nowEpochMs: NOW });
    expect(r.hydrated).toBe(false);
  });

  it('services / datasources mismatch does not hydrate', () => {
    expect(hydrateVerifiedCrmSchemaState({ ...VALID_CRM, services: { found: EXPECTED_CRM_SCHEMA.tables - 1, expected: EXPECTED_CRM_SCHEMA.tables } }, { nowEpochMs: NOW }).hydrated).toBe(false);
    expect(hydrateVerifiedCrmSchemaState({ ...VALID_CRM, dataSources: { found: EXPECTED_CRM_SCHEMA.tables - 1, expected: EXPECTED_CRM_SCHEMA.tables } }, { nowEpochMs: NOW }).hydrated).toBe(false);
  });

  it('BLOCKED or UNKNOWN status does not hydrate', () => {
    expect(hydrateVerifiedCrmSchemaState({ ...VALID_CRM, status: 'BLOCKED' }, { nowEpochMs: NOW }).hydrated).toBe(false);
    expect(hydrateVerifiedCrmSchemaState({ ...VALID_CRM, status: 'UNKNOWN' }, { nowEpochMs: NOW }).hydrated).toBe(false);
  });

  it('a partial live count (some tables not live) does not hydrate', () => {
    const r = hydrateVerifiedCrmSchemaState({ ...VALID_CRM, liveTables: { found: EXPECTED_CRM_SCHEMA.tables - 1, checked: EXPECTED_CRM_SCHEMA.tables } }, { nowEpochMs: NOW });
    expect(r.hydrated).toBe(false);
  });

  it('absent measured schema (table existence only) does not hydrate', () => {
    const { measured, ...withoutMeasured } = VALID_CRM;
    void measured;
    const r = hydrateVerifiedCrmSchemaState(withoutMeasured, { nowEpochMs: NOW });
    expect(r.hydrated).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/measured schema/);
  });

  it('a schema conflict or short column count does not hydrate', () => {
    expect(hydrateVerifiedCrmSchemaState({ ...VALID_CRM, measured: { ...VALID_CRM.measured!, conflicts: 1 } }, { nowEpochMs: NOW }).hydrated).toBe(false);
    expect(hydrateVerifiedCrmSchemaState({ ...VALID_CRM, measured: { ...VALID_CRM.measured!, columnsFound: 0 } }, { nowEpochMs: NOW }).hydrated).toBe(false);
  });

  it('stale or missing-timestamp evidence does not hydrate', () => {
    const stale = hydrateVerifiedCrmSchemaState(VALID_CRM, { nowEpochMs: NOW + 48 * 60 * 60 * 1000, maxAgeMs: 24 * 60 * 60 * 1000 });
    expect(stale.hydrated).toBe(false);
    expect(stale.blockers.join(' ')).toMatch(/stale/);
    const { verifiedAtIso, ...noTs } = VALID_CRM;
    void verifiedAtIso;
    expect(hydrateVerifiedCrmSchemaState(noTs, { nowEpochMs: NOW }).hydrated).toBe(false);
  });
});

describe('Phase 246 — runtime verified-state bridge (portfolio)', () => {
  it('valid all-live PASS evidence hydrates a VerifiedBoardingSchemaState that meets the plan', () => {
    const r = hydrateVerifiedBoardingSchemaState(VALID_BOARDING, { nowEpochMs: NOW });
    expect(r.hydrated).toBe(true);
    expect(r.verified?.tablesFound).toBe(EXPECTED_BOARDING_SCHEMA.tables);
    expect(r.verified?.requiredRelationshipsFound).toBe(EXPECTED_BOARDING_SCHEMA.requiredRelationships);
    expect(r.verified?.conflicts).toBe(0);
  });

  it('the CURRENT recorded evidence (full 219/12 build) HYDRATES', () => {
    const r = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE, { nowEpochMs: NOW, maxAgeMs: Number.MAX_SAFE_INTEGER });
    expect(r.hydrated).toBe(true);
    expect(r.verified?.columnsFound).toBe(EXPECTED_BOARDING_SCHEMA.columns);
    expect(r.verified?.requiredRelationshipsFound).toBe(EXPECTED_BOARDING_SCHEMA.requiredRelationships);
  });

  it('a missing required relationship does not hydrate', () => {
    const r = hydrateVerifiedBoardingSchemaState(
      { ...VALID_BOARDING, measured: { ...VALID_BOARDING.measured!, requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships - 1 } },
      { nowEpochMs: NOW },
    );
    expect(r.hydrated).toBe(false);
  });
});

describe('Phase 246 — the runtime gate stays disabled unless flag AND verified state are present', () => {
  const noopTransport: CrmDataverseTransport = {
    createRecord: async () => ({ ok: true, id: 'x' }),
    updateRecord: async () => ({ ok: true }),
    readRecord: async () => ({ ok: true, record: {} }),
    searchRecords: async () => ({ ok: true, records: [] }),
  };

  it('hydrated verified state + live flag + transport → live adapter resolves', () => {
    const hydrated = hydrateVerifiedCrmSchemaState(VALID_CRM, { nowEpochMs: NOW });
    expect(hydrated.verified).not.toBeNull();
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: hydrated.verified!,
      isAuthorizedOperator: true,
      transport: noopTransport,
    });
    expect(r.live).toBe(true);
  });

  it('hydrated verified state but flag OFF (injected) → fails closed', () => {
    const hydrated = hydrateVerifiedCrmSchemaState(VALID_CRM, { nowEpochMs: NOW });
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: false }),
      verified: hydrated.verified!,
      isAuthorizedOperator: true,
      transport: noopTransport,
    });
    expect(r.live).toBe(false);
  });

  it('flag ON but verified state NOT hydrated (incomplete evidence) → fails closed', () => {
    const incomplete = { ...VALID_CRM, liveTables: { found: 0, checked: 0 } };
    const hydrated = hydrateVerifiedCrmSchemaState(incomplete, { nowEpochMs: NOW });
    expect(hydrated.verified).toBeNull();
    // With no hydrated state, the caller must pass a zeroed verified state → not schema-ready.
    const zeroed = { tablesFound: 0, columnsFound: 0, relationshipsFound: 0, conflicts: 0 };
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: zeroed,
      isAuthorizedOperator: true,
      transport: noopTransport,
    });
    expect(r.live).toBe(false);
    expect(r.gate.schemaReady).toBe(false);
  });
});
