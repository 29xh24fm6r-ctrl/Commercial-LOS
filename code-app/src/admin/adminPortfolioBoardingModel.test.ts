import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED,
  PORTFOLIO_BOARDING_DISABLED_REASON,
  PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT,
  PORTFOLIO_BOARDING_NEXT_STEPS,
  PORTFOLIO_BOARDING_READINESS,
  PORTFOLIO_BOARDING_REQUIRED_DATA_GROUPS,
} from './adminPortfolioBoardingModel';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

/**
 * Phase 169D -- Admin Portfolio Boarding model (Case B, disabled-by-default).
 */

describe('Phase 169D -- no live admin write (Case B)', () => {
  it('the admin surface enables no live write', () => {
    expect(PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED).toBe(false);
  });

  it('reads the real (default-off) live persistence flag, not a hardcoded value', () => {
    expect(PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT).toBe(
      PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
    );
    expect(PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT).toBe(false);
  });

  it('explains the fail-closed disabled-by-default reason', () => {
    expect(PORTFOLIO_BOARDING_DISABLED_REASON).toMatch(/disabled by default/i);
    expect(PORTFOLIO_BOARDING_DISABLED_REASON).toMatch(/fails closed/i);
    expect(PORTFOLIO_BOARDING_DISABLED_REASON).toMatch(/injected/i);
  });
});

describe('Phase 169D -- readiness and data groups', () => {
  it('reports the boarding stack present but live persistence off', () => {
    const labels = PORTFOLIO_BOARDING_READINESS.map((r) => r.label);
    expect(labels).toContain('Persistence adapter');
    expect(labels).toContain('Runtime schema gate');
    const live = PORTFOLIO_BOARDING_READINESS.find(
      (r) => r.label === 'Live runtime persistence enabled',
    );
    expect(live?.present).toBe(false);
  });

  it('lists all nine required boarding data groups', () => {
    const labels = PORTFOLIO_BOARDING_REQUIRED_DATA_GROUPS.map((g) => g.label);
    expect(PORTFOLIO_BOARDING_REQUIRED_DATA_GROUPS.length).toBe(9);
    for (const expected of [
      'Loan master',
      'Borrower',
      'Collateral',
      'Guarantors',
      'Covenants',
      'Ticklers',
      'Insurance',
      'Documents / evidence references',
      'Exceptions / reviews',
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it('has five ordered next steps ending at exposing live admin create/import', () => {
    expect(PORTFOLIO_BOARDING_NEXT_STEPS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(PORTFOLIO_BOARDING_NEXT_STEPS[4]!.title).toMatch(/live admin create\/import/i);
  });
});

describe('Phase 169D -- model source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'adminPortfolioBoardingModel.ts'), 'utf8');

  it('hardcodes no Dataverse GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('introduces no fetch / XHR / Graph / Dataverse write primitives', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });
});
