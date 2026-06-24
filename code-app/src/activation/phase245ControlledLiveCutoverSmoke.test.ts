import { describe, it, expect } from 'vitest';
import { resolveCrmPersistenceAdapter } from '../crm/resolveCrmPersistenceAdapter';
import { deriveCrmFeatureFlagState, CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { EXPECTED_CRM_SCHEMA } from '../crm/crmRuntimeSchemaGate';
import type { CrmDataverseTransport } from '../crm/crmLiveDataverseTransport';
import { crmWriteback } from './crmActivation';
import {
  derivePortfolioBoardingRuntimeSchemaGate,
  EXPECTED_BOARDING_SCHEMA,
  type VerifiedBoardingSchemaState,
} from '../portfolioBoarding/portfolioBoardingRuntimeSchemaGate';
import { boardPortfolioLoan } from './portfolioBoardingActivation';
import { advanceStage } from './stageProgressionActivation';

/**
 * Phase 245 — Controlled live gate cutover SMOKE tests for the PASS domains.
 *
 * These exercise the governed live path with INJECTED mock transports/verified state
 * (not the live SDK, not real Dataverse). They prove each governed adapter behaves
 * correctly on the success / guardrail / rollback / blocked / sink-failure paths AND
 * that the COMMITTED defaults fail closed. They flip NO committed feature flag — the
 * "live" flag states here are injected config, the verified-schema states are local
 * test fixtures. Real activation still requires an operator-injected VerifiedSchemaState
 * + recorded production smoke, which these tests do not (and cannot) substitute for.
 */

// --- CRM writeback ----------------------------------------------------------

const CRM_READY = {
  tablesFound: EXPECTED_CRM_SCHEMA.tables,
  columnsFound: EXPECTED_CRM_SCHEMA.columns,
  relationshipsFound: EXPECTED_CRM_SCHEMA.relationships,
  conflicts: 0,
};
const crmTransport: CrmDataverseTransport = {
  createRecord: async () => ({ ok: true, id: 'x' }),
  updateRecord: async () => ({ ok: true }),
  readRecord: async () => ({ ok: true, record: {} }),
  searchRecords: async () => ({ ok: true, records: [] }),
};

describe('Phase 245 cutover smoke — CRM writeback', () => {
  it('success: with verified schema + injected transport + authorized operator, the live adapter resolves and a write succeeds', async () => {
    const r = resolveCrmPersistenceAdapter({
      flags: deriveCrmFeatureFlagState({ livePersistenceEnabled: true }),
      verified: CRM_READY,
      isAuthorizedOperator: true,
      transport: crmTransport,
    });
    expect(r.live).toBe(true);
    expect(r.gate.canCreate).toBe(true);

    const out = await crmWriteback({
      entity: 'organization',
      record: { cr664_name: 'Acme' },
      enabled: true,
      actorAuthorized: true,
      schemaVerified: true,
      correlationId: 'c1',
      requiredFields: ['cr664_name'],
      transport: { create: async () => ({ ok: true, id: 'org-1' }) },
      auditSink: { write: async () => ({ ok: true }) },
      timelineEnabled: false,
    });
    expect(out.outcome).toBe('written');
    expect(out.recordId).toBe('org-1');
  });

  it('guardrail: a missing required field is rejected (no write)', async () => {
    const out = await crmWriteback({
      entity: 'organization',
      record: {},
      enabled: true,
      actorAuthorized: true,
      schemaVerified: true,
      correlationId: 'c1',
      requiredFields: ['cr664_name'],
      transport: { create: async () => ({ ok: true, id: 'org-1' }) },
      auditSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('validation_error');
    expect(out.recordId).toBeNull();
  });

  it('rollback/disable: flag off (committed default) fails closed even with transport + ready schema', async () => {
    const r = resolveCrmPersistenceAdapter({
      flags: CRM_FEATURE_FLAG_DEFAULTS,
      verified: CRM_READY,
      isAuthorizedOperator: true,
      transport: crmTransport,
    });
    expect(r.live).toBe(false);
    expect(r.adapter.enabled).toBe(false);

    const out = await crmWriteback({
      entity: 'organization',
      record: { cr664_name: 'Acme' },
      enabled: false,
      actorAuthorized: true,
      schemaVerified: true,
      correlationId: 'c1',
      requiredFields: ['cr664_name'],
      transport: { create: async () => ({ ok: true, id: 'org-1' }) },
      auditSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('disabled');
  });
});

// --- Portfolio boarding -----------------------------------------------------

const BOARD_READY: VerifiedBoardingSchemaState = {
  tablesFound: EXPECTED_BOARDING_SCHEMA.tables,
  columnsFound: EXPECTED_BOARDING_SCHEMA.columns,
  requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships,
  optionalRelationshipsFound: EXPECTED_BOARDING_SCHEMA.optionalRelationships,
  conflicts: 0,
};
const BOARD_ALL_ON = {
  PORTFOLIO_BOARDING_ROUTE_ENABLED: true,
  PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: true,
};

describe('Phase 245 cutover smoke — portfolio boarding', () => {
  it('success: with verified schema + route + live + authorized, the gate permits create and a single loan boards', async () => {
    const gate = derivePortfolioBoardingRuntimeSchemaGate({
      verified: BOARD_READY,
      flags: BOARD_ALL_ON,
      adapterEnabled: true,
      isAuthorizedOperator: true,
    });
    expect(gate.canCreate).toBe(true);

    const out = await boardPortfolioLoan({
      enabled: true,
      actorAuthorized: true,
      schemaVerified: true,
      correlationId: 'c1',
      loanMaster: { cr664_name: 'Loan1' },
      loanMasterRequiredFields: ['cr664_name'],
      childRecords: { borrower: [{ cr664_name: 'B' }] },
      transport: {
        createLoanMaster: async () => ({ ok: true, id: 'loan-1' }),
        writeChildGroup: async () => ({ ok: true }),
      },
      auditSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('boarded');
    expect(out.loanId).toBe('loan-1');
    expect(out.childResults.borrower).toBe('written');
  });

  it('missing/invalid prerequisite: unverified schema and a missing loan-master field both fail closed', async () => {
    const notVerified = await boardPortfolioLoan({
      enabled: true,
      actorAuthorized: true,
      schemaVerified: false,
      correlationId: 'c1',
      loanMaster: { cr664_name: 'Loan1' },
      loanMasterRequiredFields: ['cr664_name'],
      transport: { createLoanMaster: async () => ({ ok: true, id: 'loan-1' }), writeChildGroup: async () => ({ ok: true }) },
      auditSink: { write: async () => ({ ok: true }) },
    });
    expect(notVerified.outcome).toBe('schema_not_verified');

    const missingField = await boardPortfolioLoan({
      enabled: true,
      actorAuthorized: true,
      schemaVerified: true,
      correlationId: 'c1',
      loanMaster: {},
      loanMasterRequiredFields: ['cr664_name'],
      transport: { createLoanMaster: async () => ({ ok: true, id: 'loan-1' }), writeChildGroup: async () => ({ ok: true }) },
      auditSink: { write: async () => ({ ok: true }) },
    });
    expect(missingField.outcome).toBe('validation_error');
  });

  it('rollback/disable: route+live off (committed default) blocks create, and disabled boarding returns disabled', async () => {
    const gate = derivePortfolioBoardingRuntimeSchemaGate({
      verified: BOARD_READY,
      flags: { PORTFOLIO_BOARDING_ROUTE_ENABLED: false, PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: false },
      adapterEnabled: false,
      isAuthorizedOperator: true,
    });
    expect(gate.canCreate).toBe(false);

    const out = await boardPortfolioLoan({
      enabled: false,
      actorAuthorized: true,
      schemaVerified: true,
      correlationId: 'c1',
      loanMaster: { cr664_name: 'Loan1' },
      loanMasterRequiredFields: ['cr664_name'],
      transport: { createLoanMaster: async () => ({ ok: true, id: 'loan-1' }), writeChildGroup: async () => ({ ok: true }) },
      auditSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('disabled');
  });
});

// --- Stage advancement ------------------------------------------------------

const STAGES = [
  { id: 's1', name: 'Intake', order: 1 },
  { id: 's2', name: 'Review', order: 2 },
];

describe('Phase 245 cutover smoke — stage advancement', () => {
  it('success: a single governed advancement writes the update + audit + timeline', async () => {
    const out = await advanceStage({
      writeEnabled: true,
      actorAuthorized: true,
      correlationId: 'c1',
      dealId: 'd1',
      currentStageId: 's1',
      rowVersion: 'v1',
      entryDateIso: '2026-01-01T00:00:00Z',
      stages: STAGES,
      orderingContractProven: true,
      transport: { updateDealStage: async () => ({ ok: true }) },
      auditSink: { write: async () => ({ ok: true }) },
      timelineSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('advanced');
    expect(out.nextStageId).toBe('s2');
  });

  it('blocked transition: a terminal current stage yields no_next_stage (no write)', async () => {
    const out = await advanceStage({
      writeEnabled: true,
      actorAuthorized: true,
      correlationId: 'c1',
      dealId: 'd1',
      currentStageId: 's2',
      rowVersion: 'v1',
      entryDateIso: '2026-01-01T00:00:00Z',
      stages: STAGES,
      orderingContractProven: true,
      transport: { updateDealStage: async () => ({ ok: true }) },
      auditSink: { write: async () => ({ ok: true }) },
      timelineSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('no_next_stage');
  });

  it('sink update failure: a failed transport update surfaces update_failed honestly', async () => {
    const out = await advanceStage({
      writeEnabled: true,
      actorAuthorized: true,
      correlationId: 'c1',
      dealId: 'd1',
      currentStageId: 's1',
      rowVersion: 'v1',
      entryDateIso: '2026-01-01T00:00:00Z',
      stages: STAGES,
      orderingContractProven: true,
      transport: { updateDealStage: async () => ({ ok: false, error: 'dataverse_unavailable' }) },
      auditSink: { write: async () => ({ ok: true }) },
      timelineSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('update_failed');
  });

  it('rollback/disable: write flag off (committed default) returns disabled', async () => {
    const out = await advanceStage({
      writeEnabled: false,
      actorAuthorized: true,
      correlationId: 'c1',
      dealId: 'd1',
      currentStageId: 's1',
      rowVersion: 'v1',
      entryDateIso: '2026-01-01T00:00:00Z',
      stages: STAGES,
      orderingContractProven: true,
      transport: { updateDealStage: async () => ({ ok: true }) },
      auditSink: { write: async () => ({ ok: true }) },
      timelineSink: { write: async () => ({ ok: true }) },
    });
    expect(out.outcome).toBe('disabled');
  });
});
