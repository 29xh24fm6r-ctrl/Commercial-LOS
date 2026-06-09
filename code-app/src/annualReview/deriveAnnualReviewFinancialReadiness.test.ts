import { describe, it, expect } from 'vitest';
import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { fact, period, doc, trustedFacts2025 } from './financialTestFixtures';

/**
 * Phase 141O — financial spreading readiness pins.
 */

function run(over: Partial<Parameters<typeof deriveAnnualReviewFinancialReadiness>[0]> = {}) {
  return deriveAnnualReviewFinancialReadiness({
    annualReviewId: 'AR1', fiscalYear: 2025,
    documents: [doc('annual_financial_statements'), doc('tax_returns')],
    facts: trustedFacts2025(),
    periods: [period()],
    ...over,
  });
}

describe('Phase 141O — financial readiness', () => {
  it('ready when required accepted documents and trusted facts exist', () => {
    const r = run();
    expect(r.readinessStatus).toBe('spread_ready');
    expect(r.nextBestAction.code).toBe('spread_financials');
  });

  it('blocked when the balance sheet period is ambiguous', () => {
    const r = run({ facts: [fact({ metricKey: 'current_assets', statementType: 'balance_sheet', value: 300 })], periods: [period({ periodReviewRequired: true })] });
    expect(r.readinessStatus).toBe('blocked');
    expect(r.blockers.some((b) => b.code === 'ambiguous_balance_sheet_period')).toBe(true);
  });

  it('blocked when the income statement period is ambiguous', () => {
    const r = run({ facts: [fact({ metricKey: 'revenue', statementType: 'income_statement', value: 1000 })], periods: [period({ periodReviewRequired: true })] });
    expect(r.readinessStatus).toBe('blocked');
    expect(r.blockers.some((b) => b.code === 'ambiguous_income_statement_period')).toBe(true);
  });

  it('excludes superseded / system-invalidated / rejected facts (no trusted facts → blocked)', () => {
    const superseded = trustedFacts2025().map((f) => ({ ...f, isSuperseded: true }));
    expect(run({ facts: superseded }).readinessStatus).toBe('blocked');
    const invalidated = trustedFacts2025().map((f) => ({ ...f, systemInvalidated: true }));
    expect(run({ facts: invalidated }).readinessStatus).toBe('blocked');
    const rejected = trustedFacts2025().map((f) => ({ ...f, status: 'rejected' as const }));
    expect(run({ facts: rejected }).readinessStatus).toBe('blocked');
  });

  it('generic financial keys do not satisfy readiness', () => {
    const generic = [fact({ metricKey: 'generic_amount', canonicalType: 'generic', value: 999 })];
    const r = run({ facts: generic });
    expect(r.readinessStatus).toBe('blocked');
    expect(r.blockers.some((b) => b.code === 'no_trusted_facts')).toBe(true);
  });

  it('missing required fiscal year document blocks readiness', () => {
    const r = run({ documents: [doc('annual_financial_statements', { received: false, accepted: false })] });
    expect(r.readinessStatus).toBe('blocked');
    expect(r.blockers.some((b) => b.code === 'missing_required_document')).toBe(true);
    expect(r.nextBestAction.code).toBe('collect_required_documents');
  });

  it('next best action is honest', () => {
    expect(run().nextBestAction.code).toBe('spread_financials');
    expect(run({ facts: [] }).nextBestAction.code).toBe('extract_financials');
  });
});
