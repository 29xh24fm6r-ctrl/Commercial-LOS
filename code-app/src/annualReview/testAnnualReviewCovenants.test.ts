import { describe, it, expect } from 'vitest';
import { testAnnualReviewCovenants } from './testAnnualReviewCovenants';
import { deriveAnnualReviewFinancialSpreadSnapshot } from './deriveAnnualReviewFinancialSpreadSnapshot';
import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { resolveAnnualReviewCovenantDefinitions, type RawCovenantRecord } from './resolveAnnualReviewCovenantDefinitions';
import { period, doc, trustedFacts2025 } from './financialTestFixtures';
import type { AnnualReviewFinancialFactRef } from './annualReviewFinancialTypes';

function readiness(opts: { ambiguous?: boolean; docs?: ReturnType<typeof doc>[] } = {}) {
  return deriveAnnualReviewFinancialReadiness({
    annualReviewId: 'AR1', fiscalYear: 2025,
    documents: opts.docs ?? [doc('annual_financial_statements')],
    facts: trustedFacts2025(),
    periods: [period({ periodReviewRequired: opts.ambiguous === true })],
  });
}
function spread(facts: AnnualReviewFinancialFactRef[] = trustedFacts2025()) {
  return deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness: readiness(), facts, periods: [period()] });
}
function test1(defs: RawCovenantRecord[], opts: { ambiguous?: boolean; facts?: AnnualReviewFinancialFactRef[]; docs?: ReturnType<typeof doc>[] } = {}) {
  return testAnnualReviewCovenants({
    definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: defs }),
    spread: spread(opts.facts),
    readiness: readiness({ ambiguous: opts.ambiguous, docs: opts.docs }),
  }).results[0];
}

describe('Phase 141O — covenant testing engine', () => {
  it('DSCR passes / fails against source facts', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true }]).status).toBe('pass'); // 200/100 = 2.0
    expect(test1([{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 3.0, active: true }]).status).toBe('fail');
  });

  it('DSCR is unknown when debt service is missing', () => {
    const noDs = trustedFacts2025().filter((f) => f.metricKey !== 'debt_service');
    expect(test1([{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true }], { facts: noDs }).status).toBe('unknown_missing_data');
  });

  it('current ratio passes / fails', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'current_ratio', operator: 'gte', thresholdValue: 1.0, active: true }]).status).toBe('pass'); // 300/150 = 2.0
    expect(test1([{ covenantId: 'C', covenantType: 'current_ratio', operator: 'gte', thresholdValue: 3.0, active: true }]).status).toBe('fail');
  });

  it('debt / tangible net worth passes / fails', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'debt_to_tangible_net_worth', operator: 'lte', thresholdValue: 1.0, active: true }]).status).toBe('pass'); // 250/500 = 0.5
    expect(test1([{ covenantId: 'C', covenantType: 'debt_to_tangible_net_worth', operator: 'lte', thresholdValue: 0.25, active: true }]).status).toBe('fail');
  });

  it('liquidity minimum passes / fails', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'liquidity_minimum', operator: 'gte', thresholdValue: 100, active: true }]).status).toBe('pass'); // cash 120
    expect(test1([{ covenantId: 'C', covenantType: 'liquidity_minimum', operator: 'gte', thresholdValue: 200, active: true }]).status).toBe('fail');
  });

  it('a reporting covenant tests document receipt', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'reporting_requirement', active: true }]).status).toBe('pass');
    expect(test1([{ covenantId: 'C', covenantType: 'reporting_requirement', active: true }], { docs: [doc('annual_financial_statements', { received: false, accepted: false })] }).status).toBe('fail');
  });

  it('an insurance covenant tests accepted evidence', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'insurance_requirement', active: true }], { docs: [doc('annual_financial_statements'), doc('insurance_evidence')] }).status).toBe('pass');
  });

  it('a missing/incomplete definition is unknown_no_definition', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'dscr', active: true }]).status).toBe('unknown_no_definition');
  });

  it('an ambiguous period is unknown_ambiguous_period', () => {
    expect(test1([{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true }], { ambiguous: true }).status).toBe('unknown_ambiguous_period');
  });

  it('never produces an automatic waiver', () => {
    const snap = testAnnualReviewCovenants({ definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: [{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 3.0, active: true }] }), spread: spread(), readiness: readiness() });
    expect(JSON.stringify(snap)).not.toMatch(/waiv|approved|approval/i);
  });
});
