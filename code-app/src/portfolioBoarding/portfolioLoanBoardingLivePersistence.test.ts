import { describe, it, expect } from 'vitest';
import {
  createDisabledPortfolioBoardingLivePersistenceAdapter,
  createPortfolioBoardingLivePersistenceAdapter,
  ALLOWED_BOARDING_ENTITIES,
  PORTFOLIO_BOARDING_ROOT_BIND_PROPERTY,
  PORTFOLIO_BOARDING_ROOT_ENTITY_SET,
  isAllowedBoardingEntity,
  type PortfolioBoardingTransport,
  type TransportResult,
} from './portfolioLoanBoardingLivePersistence';
import {
  resolvePortfolioBoardingFeatureFlags,
  PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS,
} from './portfolioLoanBoardingFeatureFlags';
import { resolvePortfolioBoardingPersistenceAdapter } from './resolvePortfolioLoanBoardingAdapter';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

interface RecordedCall {
  op: 'create' | 'update' | 'retrieve' | 'retrieveMultiple';
  entity: string;
  fields?: Record<string, unknown>;
  id?: string;
}

function recordingTransport(
  overrides: Partial<PortfolioBoardingTransport> = {},
): PortfolioBoardingTransport & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async create(entity, fields): Promise<TransportResult> {
      calls.push({ op: 'create', entity, fields });
      if (overrides.create) return overrides.create(entity, fields);
      return { ok: true, id: `id-${entity}-${calls.length}` };
    },
    async update(entity, id, fields): Promise<TransportResult> {
      calls.push({ op: 'update', entity, id, fields });
      if (overrides.update) return overrides.update(entity, id, fields);
      return { ok: true };
    },
    async retrieve(entity, id): Promise<TransportResult> {
      calls.push({ op: 'retrieve', entity, id });
      if (overrides.retrieve) return overrides.retrieve(entity, id);
      return {
        ok: true,
        record: { cr664_loannumber: 'LN-RECORD', cr664_boardingsource: 'manual_boarding' },
      };
    },
    async retrieveMultiple(entity, query): Promise<TransportResult> {
      calls.push({ op: 'retrieveMultiple', entity });
      if (overrides.retrieveMultiple) return overrides.retrieveMultiple(entity, query);
      return { ok: true, records: [{ cr664_loannumber: 'LN-1' }, { cr664_loannumber: 'LN-2' }] };
    },
  };
}

function packageWithChildren(): PortfolioLoanBoardingPackage {
  const pkg = createEmptyPortfolioLoanBoardingPackage();
  pkg.source = 'manual_boarding';
  pkg.identity.loanNumber = 'LN-0001';
  pkg.identity.borrowerLegalName = 'Synthetic Test Obligor';
  pkg.collateral.items = [{ collateralType: 'real_estate', description: 'Office building' }];
  pkg.guarantors.guarantors = [{ guarantorName: 'Synthetic Guarantor' }];
  return pkg;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

describe('Phase 140L — feature flags fail closed', () => {
  it('defaults are all disabled', () => {
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(
      false,
    );
  });

  it('resolves disabled with no config', () => {
    expect(
      resolvePortfolioBoardingFeatureFlags().PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
    ).toBe(false);
  });

  it('enables only on an exact true', () => {
    expect(
      resolvePortfolioBoardingFeatureFlags({ livePersistenceEnabled: true })
        .PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
    ).toBe(true);
    expect(
      resolvePortfolioBoardingFeatureFlags({ livePersistenceEnabled: false })
        .PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

describe('Phase 140L — resolver is disabled by default', () => {
  it('no args → disabled adapter', () => {
    expect(resolvePortfolioBoardingPersistenceAdapter().enabled).toBe(false);
  });

  it('flag on but no transport → disabled', () => {
    expect(
      resolvePortfolioBoardingPersistenceAdapter({
        flags: { PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: true },
      }).enabled,
    ).toBe(false);
  });

  it('transport present but flag off → disabled', () => {
    expect(
      resolvePortfolioBoardingPersistenceAdapter({
        flags: { PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: false },
        transport: recordingTransport(),
      }).enabled,
    ).toBe(false);
  });

  it('flag on AND transport present → live adapter', () => {
    expect(
      resolvePortfolioBoardingPersistenceAdapter({
        flags: { PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: true },
        transport: recordingTransport(),
      }).enabled,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disabled adapter fails closed
// ---------------------------------------------------------------------------

describe('Phase 140L — disabled adapter fails closed', () => {
  const adapter = createDisabledPortfolioBoardingLivePersistenceAdapter();
  it('every operation returns adapter_not_configured', async () => {
    expect(adapter.enabled).toBe(false);
    for (const res of await Promise.all([
      adapter.createBoardedLoan(createEmptyPortfolioLoanBoardingPackage()),
      adapter.updateBoardedLoan('x', createEmptyPortfolioLoanBoardingPackage()),
      adapter.readBoardedLoan('x'),
      adapter.searchBoardedLoans(),
    ])) {
      expect(res.ok).toBe(false);
      expect(res.errorCode).toBe('adapter_not_configured');
    }
  });
});

// ---------------------------------------------------------------------------
// Live adapter targets only the boarded-loan schema
// ---------------------------------------------------------------------------

describe('Phase 140L — live adapter writes only the boarded-loan schema, binds children to root', () => {
  it('create targets only cr664_portfolioboardedloan* entities', async () => {
    const transport = recordingTransport();
    const adapter = createPortfolioBoardingLivePersistenceAdapter({ transport });
    const res = await adapter.createBoardedLoan(packageWithChildren());

    expect(res.ok).toBe(true);
    expect(res.recordId).toBeTruthy();
    const creates = transport.calls.filter((c) => c.op === 'create');
    expect(creates.length).toBeGreaterThanOrEqual(3); // root + collateral + guarantor
    for (const c of creates) {
      expect(c.entity.startsWith('cr664_portfolioboardedloan')).toBe(true);
      expect(isAllowedBoardingEntity(c.entity)).toBe(true);
    }
  });

  it('child creates bind to the created root record', async () => {
    const transport = recordingTransport();
    const adapter = createPortfolioBoardingLivePersistenceAdapter({ transport });
    const res = await adapter.createBoardedLoan(packageWithChildren());

    const rootId = res.recordId!;
    const childCreates = transport.calls.filter(
      (c) => c.op === 'create' && c.entity !== 'cr664_portfolioboardedloan',
    );
    expect(childCreates.length).toBeGreaterThan(0);
    for (const c of childCreates) {
      expect(c.fields?.[PORTFOLIO_BOARDING_ROOT_BIND_PROPERTY]).toBe(
        `/${PORTFOLIO_BOARDING_ROOT_ENTITY_SET}(${rootId})`,
      );
    }
  });

  it('fails closed when the transport create fails', async () => {
    const transport = recordingTransport({
      create: async () => ({ ok: false, error: 'boom' }),
    });
    const adapter = createPortfolioBoardingLivePersistenceAdapter({ transport });
    const res = await adapter.createBoardedLoan(packageWithChildren());
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('transport_create_failed');
  });

  it('read maps the record back to a package and preserves the source marker', async () => {
    const transport = recordingTransport();
    const adapter = createPortfolioBoardingLivePersistenceAdapter({ transport });
    const res = await adapter.readBoardedLoan('root-1');
    expect(res.ok).toBe(true);
    expect(transport.calls.some((c) => c.op === 'retrieve' && c.entity === 'cr664_portfolioboardedloan')).toBe(true);
    const data = res.data as { source?: string; identity?: { loanNumber?: string } };
    expect(data.source).toBe('manual_boarding');
    expect(data.identity?.loanNumber).toBe('LN-RECORD');
  });

  it('search maps every returned record', async () => {
    const transport = recordingTransport();
    const adapter = createPortfolioBoardingLivePersistenceAdapter({ transport });
    const res = await adapter.searchBoardedLoans();
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
    expect((res.data as unknown[]).length).toBe(2);
  });

  it('the adapter exposes no delete operation', () => {
    const transport = recordingTransport();
    const adapter = createPortfolioBoardingLivePersistenceAdapter({ transport });
    expect('delete' in adapter).toBe(false);
    expect('deleteBoardedLoan' in adapter).toBe(false);
  });

  it('the allowed entity set is exactly the cr664 boarded-loan tables', () => {
    for (const e of ALLOWED_BOARDING_ENTITIES) {
      expect(e.startsWith('cr664_portfolioboardedloan')).toBe(true);
    }
    expect(isAllowedBoardingEntity('cr664_loandeal')).toBe(false);
    expect(isAllowedBoardingEntity('systemuser')).toBe(false);
  });
});
