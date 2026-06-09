import { describe, it, expect } from 'vitest';
import { deriveAnnualReviewFinancialAnalysisSnapshot } from './deriveAnnualReviewFinancialAnalysisSnapshot';
import { deriveAnnualReviewFinancialSpreadSnapshot } from './deriveAnnualReviewFinancialSpreadSnapshot';
import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { testAnnualReviewCovenants } from './testAnnualReviewCovenants';
import { resolveAnnualReviewCovenantDefinitions, type RawCovenantRecord } from './resolveAnnualReviewCovenantDefinitions';
import { period, doc, trustedFacts2025 } from './financialTestFixtures';
import type { AnnualReviewFinancialFactRef } from './annualReviewFinancialTypes';

function pipeline(opts: { covenants?: RawCovenantRecord[]; facts?: AnnualReviewFinancialFactRef[]; docs?: ReturnType<typeof doc>[] } = {}) {
  const facts = opts.facts ?? trustedFacts2025();
  const readiness = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: opts.docs ?? [doc('annual_financial_statements')], facts, periods: [period()] });
  const spread = deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness, facts, periods: [period()] });
  const covenants = testAnnualReviewCovenants({ definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: opts.covenants ?? [] }), spread, readiness });
  return deriveAnnualReviewFinancialAnalysisSnapshot({ annualReviewId: 'AR1', readiness, spread, covenants });
}

const PASS_DSCR: RawCovenantRecord = { covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true };

describe('Phase 141O — financial analysis snapshot', () => {
  it('ready snapshot when spread + covenants are evidence-backed', () => {
    const s = pipeline({ covenants: [PASS_DSCR] });
    expect(s.overallFinancialReadiness).toBe('spread_ready');
    expect(s.covenantStatus).toBe('all_pass');
    expect(s.boardPackageReady).toBe(true);
    expect(s.fdicPackageReady).toBe(true);
  });

  it('blocked when financial data is missing', () => {
    const s = pipeline({ facts: [], covenants: [PASS_DSCR] });
    expect(s.overallFinancialReadiness).toBe('blocked');
    expect(s.boardPackageReady).toBe(false);
  });

  it('blocked package when a covenant is unknown', () => {
    const noDs = trustedFacts2025().filter((f) => f.metricKey !== 'debt_service');
    const s = pipeline({ facts: noDs, covenants: [PASS_DSCR] });
    expect(s.covenantStatus).toBe('has_unknowns');
    expect(s.boardPackageReady).toBe(false);
  });

  it('a failed covenant becomes a finding, not an approval/decline', () => {
    const s = pipeline({ covenants: [{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 5.0, active: true }] });
    expect(s.covenantStatus).toBe('has_failures');
    expect(s.finalCreditRecommendation).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/\b(approve|approved|decline|declined|recommend approval)\b/i);
  });

  it('emits no final credit recommendation and no fake values', () => {
    const s = pipeline({ covenants: [PASS_DSCR] });
    expect(s.finalCreditRecommendation).toBeNull();
    expect(s.auditSummary.containsFabricatedValue).toBe(false);
  });
});
