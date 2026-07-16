import { describe, it, expect } from 'vitest';
import { derivePortfolioBoardingAvailability } from './resolvePortfolioLoanBoardingPersistenceAdapter';
import type { PortfolioBoardingRuntimeSchemaGateResult } from './portfolioBoardingRuntimeSchemaGate';

const NOW = '2026-07-16T12:00:00.000Z';

function readyGate(over: Partial<PortfolioBoardingRuntimeSchemaGateResult> = {}): PortfolioBoardingRuntimeSchemaGateResult {
  return {
    schemaReady: true,
    livePersistenceEnabled: true,
    routeEnabled: true,
    canCreate: true,
    canUpdate: true,
    canRead: true,
    canSearch: true,
    blockers: [],
    warnings: [],
    ...over,
  };
}

describe('Factory Arc Phase 6 — derivePortfolioBoardingAvailability', () => {
  it('authorized operator + flags on + no schema blockers -> available', () => {
    const a = derivePortfolioBoardingAvailability(true, readyGate(), NOW);
    expect(a).toEqual({ id: 'portfolio-boarding', available: true, blockingReasons: [], checkedAt: NOW });
  });

  it('unauthorized operator -> unavailable with an audit-identity reason', () => {
    const a = derivePortfolioBoardingAvailability(false, readyGate(), NOW);
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toContainEqual(expect.objectContaining({ kind: 'audit-identity' }));
  });

  it('either deployment flag off -> unavailable with a permission reason (the actual default state today)', () => {
    const a = derivePortfolioBoardingAvailability(
      true,
      readyGate({ livePersistenceEnabled: false, routeEnabled: false }),
      NOW,
    );
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toContainEqual(
      expect.objectContaining({ kind: 'permission', detail: 'Live boarding persistence is not enabled in this environment.' }),
    );
  });

  it('schema-gate blockers each map to a connection reason using the gate\'s own text', () => {
    const gate = readyGate({
      schemaReady: false,
      blockers: ['Only 12/13 required tables verified.', '1 schema conflict(s) block runtime persistence.'],
    });
    const a = derivePortfolioBoardingAvailability(true, gate, NOW);
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toEqual([
      { kind: 'connection', detail: 'Only 12/13 required tables verified.' },
      { kind: 'connection', detail: '1 schema conflict(s) block runtime persistence.' },
    ]);
  });

  it('every real blocker appears at once (never drops one for another)', () => {
    const gate = readyGate({
      livePersistenceEnabled: false,
      routeEnabled: false,
      schemaReady: false,
      blockers: ['Only 0/13 required tables verified.'],
    });
    const a = derivePortfolioBoardingAvailability(false, gate, NOW);
    expect(a.blockingReasons.map((r) => r.kind)).toEqual(['audit-identity', 'permission', 'connection']);
  });

  it('carries checkedAt verbatim', () => {
    const a = derivePortfolioBoardingAvailability(true, readyGate(), '2020-01-01T00:00:00.000Z');
    expect(a.checkedAt).toBe('2020-01-01T00:00:00.000Z');
  });
});
