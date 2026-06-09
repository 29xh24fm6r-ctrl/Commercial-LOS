import { describe, it, expect } from 'vitest';
import { buildAnnualReviewEvidenceIndex } from './buildAnnualReviewEvidenceIndex';
import { deriveAnnualReviewFinancialSpreadSnapshot } from './deriveAnnualReviewFinancialSpreadSnapshot';
import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { testAnnualReviewCovenants } from './testAnnualReviewCovenants';
import { resolveAnnualReviewCovenantDefinitions } from './resolveAnnualReviewCovenantDefinitions';
import { fact, period, doc } from './financialTestFixtures';
import { completeFacts } from './packageTestFixtures';
import type { AnnualReviewFinancialFactRef, AnnualReviewFinancialPeriod } from './annualReviewFinancialTypes';

function build(facts: AnnualReviewFinancialFactRef[], periods: AnnualReviewFinancialPeriod[] = [period()], docs = [doc('annual_financial_statements')]) {
  const readiness = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: docs, facts, periods });
  const spread = deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness, facts, periods });
  const covenants = testAnnualReviewCovenants({ definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [] }), spread, readiness });
  return buildAnnualReviewEvidenceIndex({ annualReviewId: 'AR1', documents: docs, facts, spread, covenants, periods });
}

describe('Phase 141P — evidence index', () => {
  it('builds the index from source documents and facts', () => {
    const idx = build(completeFacts());
    expect(idx.items.some((i) => i.evidenceType === 'document')).toBe(true);
    expect(idx.items.some((i) => i.evidenceType === 'financial_fact')).toBe(true);
    expect(idx.items.find((i) => i.label === 'revenue')?.sourceFactIds).toContain('F-revenue');
  });

  it('excludes superseded facts', () => {
    const idx = build([fact({ factId: 'F-rev', metricKey: 'revenue', value: 1000, isSuperseded: true })]);
    expect(idx.items.some((i) => i.sourceFactIds.includes('F-rev'))).toBe(false);
  });

  it('excludes system-invalidated facts', () => {
    const idx = build([fact({ factId: 'F-rev', metricKey: 'revenue', value: 1000, systemInvalidated: true })]);
    expect(idx.items.some((i) => i.sourceFactIds.includes('F-rev'))).toBe(false);
  });

  it('excludes rejected facts', () => {
    const idx = build([fact({ factId: 'F-rev', metricKey: 'revenue', value: 1000, status: 'rejected' })]);
    expect(idx.items.some((i) => i.sourceFactIds.includes('F-rev'))).toBe(false);
  });

  it('missing evidence stays missing (required metric absent)', () => {
    const idx = build(completeFacts().filter((f) => f.metricKey !== 'cash'));
    expect(idx.missingItems.some((i) => i.relatedMetricKeys.includes('cash'))).toBe(true);
    expect(idx.status).not.toBe('complete');
  });

  it('marks ambiguous-period facts as review_required', () => {
    const idx = build([fact({ factId: 'F-rev', metricKey: 'revenue', value: 1000, periodId: 'PER-AMB' })], [period({ periodId: 'PER-AMB', periodReviewRequired: true })]);
    expect(idx.reviewRequiredItems.some((i) => i.sourceFactIds.includes('F-rev'))).toBe(true);
  });

  it('invents no evidence (every item traces to a provided source)', () => {
    const idx = build(completeFacts());
    const factItems = idx.items.filter((i) => i.evidenceType === 'financial_fact' && i.status === 'present');
    for (const i of factItems) expect(i.sourceFactIds.length).toBeGreaterThan(0);
  });
});
