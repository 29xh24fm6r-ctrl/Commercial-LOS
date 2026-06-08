import { describe, it, expect } from 'vitest';
import {
  createLivePortfolioBoardingTransport,
  boardingEntitySetName,
  LIVE_TRANSPORT_ALLOWED_ENTITIES,
  type DataverseWriteClient,
  type DataverseWriteClientResult,
} from './portfolioLoanBoardingLiveDataverseTransport';
import { createPortfolioBoardingLivePersistenceAdapter } from './portfolioLoanBoardingLivePersistence';
import { resolvePortfolioLoanBoardingRuntimeAdapter } from './resolvePortfolioLoanBoardingPersistenceAdapter';
import { resolvePortfolioBoardingFeatureFlags } from './portfolioBoardingFeatureFlags';
import { EXPECTED_BOARDING_SCHEMA } from './portfolioBoardingRuntimeSchemaGate';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

interface ClientCall {
  op: 'create' | 'update' | 'retrieve' | 'retrieveMultiple';
  entitySet: string;
  record?: Record<string, unknown>;
}

function recordingClient(): DataverseWriteClient & { calls: ClientCall[] } {
  const calls: ClientCall[] = [];
  let n = 0;
  return {
    calls,
    async create(entitySet, record): Promise<DataverseWriteClientResult> {
      n += 1;
      calls.push({ op: 'create', entitySet, record });
      return { ok: true, id: `id-${n}` };
    },
    async update(entitySet, _id, record): Promise<DataverseWriteClientResult> {
      calls.push({ op: 'update', entitySet, record });
      return { ok: true };
    },
    async retrieve(entitySet): Promise<DataverseWriteClientResult> {
      calls.push({ op: 'retrieve', entitySet });
      return { ok: true, record: { cr664_loannumber: 'LN-RT', cr664_boardingsource: 'manual_boarding' } };
    },
    async retrieveMultiple(entitySet): Promise<DataverseWriteClientResult> {
      calls.push({ op: 'retrieveMultiple', entitySet });
      return { ok: true, records: [] };
    },
  };
}

const OK_VERIFIED = {
  tablesFound: EXPECTED_BOARDING_SCHEMA.tables,
  columnsFound: EXPECTED_BOARDING_SCHEMA.columns,
  requiredRelationshipsFound: EXPECTED_BOARDING_SCHEMA.requiredRelationships,
  optionalRelationshipsFound: EXPECTED_BOARDING_SCHEMA.optionalRelationships,
  conflicts: 0,
};

const ALL_FLAGS_ON = resolvePortfolioBoardingFeatureFlags({
  livePersistenceEnabled: true,
  routeEnabled: true,
});

function pkgWithChildren(): PortfolioLoanBoardingPackage {
  const p = createEmptyPortfolioLoanBoardingPackage();
  p.source = 'manual_boarding';
  p.identity.loanNumber = 'LN-RT-1';
  p.collateral.items = [{ collateralType: 'real_estate' }];
  p.guarantors.guarantors = [{ guarantorName: 'Synthetic Guarantor' }];
  return p;
}

// ---------------------------------------------------------------------------
// Transport is entity-constrained
// ---------------------------------------------------------------------------

describe('Phase 140Q — live transport is constrained to the boarded-loan schema', () => {
  it('only allows cr664_portfolioboardedloan* entities; rejects everything else', async () => {
    const transport = createLivePortfolioBoardingTransport({ client: recordingClient() });
    for (const e of LIVE_TRANSPORT_ALLOWED_ENTITIES) {
      expect(e.startsWith('cr664_portfolioboardedloan')).toBe(true);
    }
    for (const forbidden of ['cr664_loandeal', 'cr664_clientrelationship', 'cr664_banker', 'cr664_team', 'systemuser']) {
      const create = await transport.create(forbidden, {});
      const update = await transport.update(forbidden, 'x', {});
      const read = await transport.retrieve(forbidden, 'x');
      expect(create.ok).toBe(false);
      expect(create.error).toBe('entity_not_allowed');
      expect(update.ok).toBe(false);
      expect(read.ok).toBe(false);
    }
  });

  it('derives the entity-set name from the logical name (no arbitrary set input)', () => {
    expect(boardingEntitySetName('cr664_portfolioboardedloan')).toBe('cr664_portfolioboardedloans');
  });

  it('exposes no delete operation', () => {
    const transport = createLivePortfolioBoardingTransport({ client: recordingClient() });
    expect('delete' in transport).toBe(false);
  });

  it('only ever calls the client with allow-listed entity sets', async () => {
    const client = recordingClient();
    const adapter = createPortfolioBoardingLivePersistenceAdapter({
      transport: createLivePortfolioBoardingTransport({ client }),
    });
    await adapter.createBoardedLoan(pkgWithChildren());
    for (const c of client.calls) {
      expect(c.entitySet.startsWith('cr664_portfolioboardedloan')).toBe(true);
    }
    // Children bind to the created root and preserve the source marker.
    const root = client.calls.find((c) => c.entitySet === 'cr664_portfolioboardedloans');
    expect(root?.record?.['cr664_boardingsource']).toBe('manual_boarding');
  });
});

// ---------------------------------------------------------------------------
// Runtime resolver is disabled by default / fail-closed
// ---------------------------------------------------------------------------

describe('Phase 140Q — runtime resolver is disabled by default', () => {
  const defaultFlags = resolvePortfolioBoardingFeatureFlags();

  it('no client + flags off → disabled adapter', () => {
    const r = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: defaultFlags,
      verified: OK_VERIFIED,
      isAuthorizedOperator: true,
    });
    expect(r.live).toBe(false);
    expect(r.adapter.enabled).toBe(false);
  });

  it('client present but flags off → disabled', () => {
    const r = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: defaultFlags,
      verified: OK_VERIFIED,
      isAuthorizedOperator: true,
      client: recordingClient(),
    });
    expect(r.live).toBe(false);
  });

  it('flags on + client but unauthorized → disabled', () => {
    const r = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: ALL_FLAGS_ON,
      verified: OK_VERIFIED,
      isAuthorizedOperator: false,
      client: recordingClient(),
    });
    expect(r.live).toBe(false);
  });

  it('flags on + client + authorized but schema NOT ready → disabled', () => {
    const r = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: ALL_FLAGS_ON,
      verified: { ...OK_VERIFIED, tablesFound: 0 },
      isAuthorizedOperator: true,
      client: recordingClient(),
    });
    expect(r.live).toBe(false);
    expect(r.gate.schemaReady).toBe(false);
  });

  it('all gates pass + client injected → LIVE adapter', () => {
    const r = resolvePortfolioLoanBoardingRuntimeAdapter({
      flags: ALL_FLAGS_ON,
      verified: OK_VERIFIED,
      isAuthorizedOperator: true,
      client: recordingClient(),
    });
    expect(r.live).toBe(true);
    expect(r.adapter.enabled).toBe(true);
    expect(r.gate.canCreate).toBe(true);
  });
});
