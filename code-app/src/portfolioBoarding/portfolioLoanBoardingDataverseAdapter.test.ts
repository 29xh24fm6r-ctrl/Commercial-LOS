import { describe, it, expect } from 'vitest';
import { createDisabledPortfolioLoanBoardingDataverseAdapter } from './portfolioLoanBoardingDataverseAdapter';

describe('Phase 140B-H — portfolioLoanBoardingDataverseAdapter', () => {
  const adapter = createDisabledPortfolioLoanBoardingDataverseAdapter();

  it('is not enabled', () => {
    expect(adapter.enabled).toBe(false);
  });

  it('createBoardedLoan returns not-ok with adapter_not_configured', () => {
    const result = adapter.createBoardedLoan({});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('adapter_not_configured');
  });

  it('updateBoardedLoan returns not-ok', () => {
    expect(adapter.updateBoardedLoan('id', {}).ok).toBe(false);
  });

  it('readBoardedLoan returns not-ok', () => {
    expect(adapter.readBoardedLoan('id').ok).toBe(false);
  });

  it('searchBoardedLoans returns empty data', () => {
    const result = adapter.searchBoardedLoans({});
    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
  });

  it('performs no write (all operations fail with adapter_not_configured)', () => {
    const ops = [
      adapter.attachDocumentRecord('id', {}),
      adapter.updateDocumentRecord('id', {}),
      adapter.addException('id', {}),
      adapter.resolveException('id'),
      adapter.addReview('id', {}),
      adapter.addEvidenceLink('id', {}),
    ];
    for (const op of ops) {
      expect(op.ok).toBe(false);
      expect(op.errorCode).toBe('adapter_not_configured');
    }
  });
});
