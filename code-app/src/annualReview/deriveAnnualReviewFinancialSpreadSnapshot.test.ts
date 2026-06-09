import { describe, it, expect } from 'vitest';
import { deriveAnnualReviewFinancialSpreadSnapshot } from './deriveAnnualReviewFinancialSpreadSnapshot';
import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { fact, period, doc, trustedFacts2025 } from './financialTestFixtures';
import type { AnnualReviewFinancialFactRef, AnnualReviewFinancialPeriod } from './annualReviewFinancialTypes';

function readiness() {
  return deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: [doc('annual_financial_statements')], facts: trustedFacts2025(), periods: [period()] });
}
function spread(facts: AnnualReviewFinancialFactRef[], periods: AnnualReviewFinancialPeriod[] = [period()]) {
  return deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness: readiness(), facts, periods });
}
function metric(s: ReturnType<typeof spread>, key: string) {
  return s.metrics.find((m) => m.metricKey === key);
}

describe('Phase 141O — financial spread snapshot', () => {
  it('derives metrics from trusted facts', () => {
    const s = spread(trustedFacts2025());
    expect(metric(s, 'revenue')?.value).toBe(1000);
    expect(metric(s, 'ebitda')?.value).toBe(200);
    // Working capital derived from current assets − current liabilities.
    expect(metric(s, 'working_capital')?.value).toBe(150);
    expect(metric(s, 'working_capital')?.status).toBe('available');
  });

  it('unknown when a fact is missing', () => {
    const s = spread([fact({ factId: 'F-rev', metricKey: 'revenue', value: 1000 })]);
    expect(metric(s, 'ebitda')?.status).toBe('unknown_missing_data');
    expect(metric(s, 'ebitda')?.value).toBeNull();
  });

  it('review_required when conflicting facts exist', () => {
    const s = spread([
      fact({ factId: 'F-rev1', metricKey: 'revenue', value: 1000 }),
      fact({ factId: 'F-rev2', metricKey: 'revenue', value: 1200 }),
    ]);
    expect(metric(s, 'revenue')?.status).toBe('review_required');
    expect(metric(s, 'revenue')?.value).toBeNull();
  });

  it('excludes superseded / system-invalidated / rejected facts', () => {
    const s = spread([
      fact({ factId: 'F-rev', metricKey: 'revenue', value: 1000, isSuperseded: true }),
      fact({ factId: 'F-rev2', metricKey: 'revenue', value: 999, systemInvalidated: true }),
      fact({ factId: 'F-rev3', metricKey: 'revenue', value: 888, status: 'rejected' }),
    ]);
    expect(metric(s, 'revenue')?.status).toBe('unknown_missing_data');
  });

  it('does not annualize an interim period value', () => {
    const interim = period({ periodId: 'PER-INT', periodType: 'interim' });
    const s = spread([fact({ factId: 'F-rev', metricKey: 'revenue', value: 500, periodId: 'PER-INT' })], [interim]);
    expect(metric(s, 'revenue')?.value).toBe(500);
  });

  it('preserves source fact ids', () => {
    const s = spread(trustedFacts2025());
    expect(metric(s, 'revenue')?.sourceFactIds).toContain('F-rev');
  });

  it('fabricates no values (audit summary marks containsFabricatedValue false)', () => {
    const s = spread(trustedFacts2025());
    expect(s.auditSummary.containsFabricatedValue).toBe(false);
  });
});
