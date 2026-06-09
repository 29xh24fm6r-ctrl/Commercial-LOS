import { describe, it, expect } from 'vitest';
import { deriveServicingMaturityRenewalStatus } from './deriveServicingMaturityRenewalStatus';

/**
 * Phase 142E — maturity / renewal / payoff status pins.
 */

const AS_OF = '2026-06-09';

describe('Phase 142E — maturity / renewal status', () => {
  it('maturity due soon routes to review', () => {
    expect(deriveServicingMaturityRenewalStatus({ maturityDate: '2026-07-01', asOfDate: AS_OF }).status).toBe('renewal_or_maturity_review');
  });

  it('past maturity is attention_required', () => {
    expect(deriveServicingMaturityRenewalStatus({ maturityDate: '2025-01-01', asOfDate: AS_OF }).status).toBe('attention_required');
  });

  it('payoff context routes to payoff_or_exit_review', () => {
    expect(deriveServicingMaturityRenewalStatus({ payoffContext: true, asOfDate: AS_OF }).status).toBe('payoff_or_exit_review');
  });

  it('missing maturity date is unknown', () => {
    expect(deriveServicingMaturityRenewalStatus({ asOfDate: AS_OF }).status).toBe('unknown_missing_data');
  });

  it('an active loan well before maturity is active', () => {
    expect(deriveServicingMaturityRenewalStatus({ maturityDate: '2030-01-01', asOfDate: AS_OF }).status).toBe('active');
  });

  it('generates no payoff statement / write', () => {
    const r = deriveServicingMaturityRenewalStatus({ payoffContext: true, asOfDate: AS_OF });
    expect(JSON.stringify(r)).not.toMatch(/generatePayoff|payoffStatement|createRecord|postPayment/i);
  });
});
