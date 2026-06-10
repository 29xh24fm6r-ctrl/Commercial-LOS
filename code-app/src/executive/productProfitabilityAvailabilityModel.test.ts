import { describe, it, expect } from 'vitest';
import {
  deriveProductProfitabilityAvailability,
  type ProductProfitabilityAvailabilityInput,
} from './productProfitabilityAvailabilityModel';

function input(over: Partial<ProductProfitabilityAvailabilityInput> = {}): ProductProfitabilityAvailabilityInput {
  return { dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', productType: 'commercial', loanStructure: 'term_loan', pricingType: 'fixed', ...over };
}

const ALL_SOURCES = {
  interestRateAvailable: true, feeIncomeAvailable: true, costOfFundsAvailable: true, chargeOffDataAvailable: true,
  servicingPerformanceAvailable: true, generalLedgerDataAvailable: true, capitalAllocationDataAvailable: true,
};

describe('Phase 142S — product profitability / ROE availability model', () => {
  it('returns unknown with a warning when deal identity is missing', () => {
    const r = deriveProductProfitabilityAvailability(input({ dealId: undefined }));
    expect(r.availabilityStatus).toBe('unknown');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('returns source_data_required when core product/loan/pricing dimensions are missing', () => {
    expect(deriveProductProfitabilityAvailability({ dealId: 'D1', ...ALL_SOURCES }).availabilityStatus).toBe('source_data_required');
  });

  it('returns not_available when no source data is available', () => {
    expect(deriveProductProfitabilityAvailability(input()).availabilityStatus).toBe('not_available');
  });

  it('returns partially_available when some but not all source categories are available', () => {
    const r = deriveProductProfitabilityAvailability(input({ interestRateAvailable: true, feeIncomeAvailable: true }));
    expect(r.availabilityStatus).toBe('partially_available');
    expect(r.availableSourceCount).toBe(2);
    expect(r.missingSourceCount).toBeGreaterThan(0);
  });

  it('returns ready_for_future_modeling with all sources but calculates no metric', () => {
    const r = deriveProductProfitabilityAvailability(input(ALL_SOURCES));
    expect(r.availabilityStatus).toBe('ready_for_future_modeling');
    expect(r.profitabilityCalculated).toBe(false);
    expect(r.roeCalculated).toBe(false);
    expect(Object.values(r.futureMetricReadiness).every((v) => v === 'ready_for_future_modeling')).toBe(true);
  });

  it('produces deterministic missing-source and blocked-metric labels', () => {
    const a = deriveProductProfitabilityAvailability(input());
    const b = deriveProductProfitabilityAvailability(input());
    expect(a.missingSourceLabels).toEqual(b.missingSourceLabels);
    expect(a.blockedMetricLabels).toEqual(b.blockedMetricLabels);
    expect(a.blockedMetricLabels.length).toBeGreaterThan(0);
  });

  it('keeps all safety booleans false except readOnly', () => {
    const r = deriveProductProfitabilityAvailability(input({ interestRateAvailable: true }));
    expect(r.readOnly).toBe(true);
    expect(r.profitabilityCalculated).toBe(false);
    expect(r.roeCalculated).toBe(false);
    expect(r.yieldCalculated).toBe(false);
    expect(r.marginCalculated).toBe(false);
    expect(r.feeIncomeCalculated).toBe(false);
    expect(r.externalSystemChanged).toBe(false);
  });

  it('emits no numeric profitability / ROE / yield / margin / fee output', () => {
    const r = deriveProductProfitabilityAvailability(input(ALL_SOURCES));
    expect(Object.values(r.futureMetricReadiness).every((v) => typeof v === 'string')).toBe(true);
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/"(roe|yield|margin|nim|raroc|spread|profit)(value|pct|percent|amount|figure)?"\s*:\s*-?\d/i);
    expect(s).not.toMatch(/\$\s*\d/);
  });

  it('emits no profitable / unprofitable / high-ROE / low-ROE fact label', () => {
    const r = deriveProductProfitabilityAvailability(input(ALL_SOURCES));
    const s = JSON.stringify(r).toLowerCase();
    for (const w of ['unprofitable', 'profitable', 'high roe', 'low roe', 'margin available', 'yield calculated']) {
      expect(s).not.toContain(w);
    }
  });
});
