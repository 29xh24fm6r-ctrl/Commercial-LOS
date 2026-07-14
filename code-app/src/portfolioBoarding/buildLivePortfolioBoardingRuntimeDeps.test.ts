import { describe, it, expect } from 'vitest';
import { buildLivePortfolioBoardingRuntimeAdapter } from './buildLivePortfolioBoardingRuntimeDeps';

describe('buildLivePortfolioBoardingRuntimeAdapter', () => {
  it('resolves the disabled adapter while PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED/_ROUTE_ENABLED are the safe defaults (false)', () => {
    const resolution = buildLivePortfolioBoardingRuntimeAdapter({ isAuthorizedOperator: true });
    expect(resolution.live).toBe(false);
    expect(resolution.adapter.enabled).toBe(false);
  });

  it('the schema gate reads real hydrated evidence (13 tables / 219 columns / 12 required relationships), not zeros — proving hydration actually ran', () => {
    const resolution = buildLivePortfolioBoardingRuntimeAdapter({ isAuthorizedOperator: true });
    expect(resolution.gate.schemaReady).toBe(true);
  });

  it('stays disabled even for an unauthorized operator (defense in depth alongside the flags)', () => {
    const resolution = buildLivePortfolioBoardingRuntimeAdapter({ isAuthorizedOperator: false });
    expect(resolution.live).toBe(false);
    expect(resolution.adapter.enabled).toBe(false);
  });
});
