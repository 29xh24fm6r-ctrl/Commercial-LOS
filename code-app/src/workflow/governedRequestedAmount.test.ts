import { describe, it, expect } from 'vitest';
import { resolveGovernedRequestedAmount } from './governedRequestedAmount';

describe('resolveGovernedRequestedAmount', () => {
  it('resolves to the deal amount when both agree', () => {
    const r = resolveGovernedRequestedAmount(500_000, 500_000);
    expect(r).toEqual({ kind: 'resolved', amount: 500_000 });
  });

  it('resolves to the deal amount when both agree within cent-level float tolerance', () => {
    const r = resolveGovernedRequestedAmount(500_000.001, 500_000);
    expect(r).toEqual({ kind: 'resolved', amount: 500_000.001 });
  });

  it('reports a conflict when the deal amount and request-profile amount disagree — never silently picks one', () => {
    const r = resolveGovernedRequestedAmount(500_000, 750_000);
    expect(r).toEqual({ kind: 'conflict', dealAmount: 500_000, requestProfileAmount: 750_000 });
  });

  it('resolves to the deal amount alone when no request-profile amount is supplied', () => {
    const r = resolveGovernedRequestedAmount(500_000, undefined);
    expect(r).toEqual({ kind: 'resolved', amount: 500_000 });
  });

  it('falls back to the request-profile amount when the deal amount is missing', () => {
    const r = resolveGovernedRequestedAmount(undefined, 500_000);
    expect(r).toEqual({ kind: 'resolved', amount: 500_000 });
  });

  it('reports missing when neither amount is available', () => {
    const r = resolveGovernedRequestedAmount(undefined, undefined);
    expect(r).toEqual({ kind: 'missing' });
  });

  it('reports a conflict even when the deal amount is zero and request-profile amount is not', () => {
    const r = resolveGovernedRequestedAmount(0, 100_000);
    expect(r.kind).toBe('conflict');
  });
});
