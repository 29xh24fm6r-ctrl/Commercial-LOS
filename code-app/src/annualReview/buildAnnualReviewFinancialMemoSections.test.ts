import { describe, it, expect } from 'vitest';
import { buildAnnualReviewFinancialMemoSections } from './buildAnnualReviewFinancialMemoSections';
import { deriveAnnualReviewFinancialAnalysisSnapshot } from './deriveAnnualReviewFinancialAnalysisSnapshot';
import { deriveAnnualReviewFinancialSpreadSnapshot } from './deriveAnnualReviewFinancialSpreadSnapshot';
import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { testAnnualReviewCovenants } from './testAnnualReviewCovenants';
import { resolveAnnualReviewCovenantDefinitions, type RawCovenantRecord } from './resolveAnnualReviewCovenantDefinitions';
import { period, doc, trustedFacts2025 } from './financialTestFixtures';

function snapshot(covenants: RawCovenantRecord[]) {
  const facts = trustedFacts2025();
  const readiness = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: [doc('annual_financial_statements')], facts, periods: [period()] });
  const spread = deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness, facts, periods: [period()] });
  const cov = testAnnualReviewCovenants({ definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: covenants }), spread, readiness });
  return deriveAnnualReviewFinancialAnalysisSnapshot({ annualReviewId: 'AR1', readiness, spread, covenants: cov });
}

describe('Phase 141O — financial memo sections', () => {
  it('builds the financial performance section with sourced metrics', () => {
    const m = buildAnnualReviewFinancialMemoSections(snapshot([{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true }]));
    expect(m.financialPerformance.lines.some((l) => /Revenue/.test(l))).toBe(true);
    expect(m.financialPerformance.evidenceFactIds).toContain('F-rev');
    expect(m.financialPerformance.draftOnly).toBe(true);
  });

  it('builds the covenant section with pass/fail/unknown findings', () => {
    const m = buildAnnualReviewFinancialMemoSections(snapshot([{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 5.0, active: true }]));
    expect(m.covenantCompliance.lines.some((l) => /fail/.test(l))).toBe(true);
    expect(m.covenantCompliance.caveats.join(' ')).toMatch(/finding/i);
  });

  it('labels unknown metrics / covenants explicitly as unknown', () => {
    // An incomplete covenant definition surfaces as an explicit unknown.
    const m = buildAnnualReviewFinancialMemoSections(snapshot([{ covenantId: 'C', covenantType: 'dscr', active: true }]));
    expect(m.missingData.lines.some((l) => /unknown/i.test(l))).toBe(true);
  });

  it('makes no final credit recommendation', () => {
    const m = buildAnnualReviewFinancialMemoSections(snapshot([]));
    const all = JSON.stringify(m);
    expect(all).not.toMatch(/\b(approve credit|recommend approval|decline)\b/i);
    expect(all).toMatch(/No final credit recommendation/i);
  });

  it('preserves evidence references', () => {
    const m = buildAnnualReviewFinancialMemoSections(snapshot([{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true }]));
    expect(m.evidenceCaveats.evidenceFactIds.length).toBeGreaterThan(0);
  });

  it('fabricates no values', () => {
    const m = buildAnnualReviewFinancialMemoSections(snapshot([]));
    // No dollar-sign literals are injected by the builder.
    expect(JSON.stringify(m)).not.toMatch(/\$\s*\d/);
  });
});
