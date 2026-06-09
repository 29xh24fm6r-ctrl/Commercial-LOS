// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnualReviewFinancialCovenantPanel } from './AnnualReviewFinancialCovenantPanel';
import { deriveAnnualReviewFinancialAnalysisSnapshot } from './deriveAnnualReviewFinancialAnalysisSnapshot';
import { deriveAnnualReviewFinancialSpreadSnapshot } from './deriveAnnualReviewFinancialSpreadSnapshot';
import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { testAnnualReviewCovenants } from './testAnnualReviewCovenants';
import { resolveAnnualReviewCovenantDefinitions, type RawCovenantRecord } from './resolveAnnualReviewCovenantDefinitions';
import { period, doc, trustedFacts2025 } from './financialTestFixtures';
import type { AnnualReviewFinancialFactRef } from './annualReviewFinancialTypes';

function snapshot(opts: { covenants?: RawCovenantRecord[]; facts?: AnnualReviewFinancialFactRef[] } = {}) {
  const facts = opts.facts ?? trustedFacts2025();
  const readiness = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents: [doc('annual_financial_statements')], facts, periods: [period()] });
  const spread = deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness, facts, periods: [period()] });
  const cov = testAnnualReviewCovenants({ definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: opts.covenants ?? [] }), spread, readiness });
  return deriveAnnualReviewFinancialAnalysisSnapshot({ annualReviewId: 'AR1', readiness, spread, covenants: cov });
}

describe('Phase 141O — financial & covenant panel', () => {
  it('renders the ready state', () => {
    render(<AnnualReviewFinancialCovenantPanel snapshot={snapshot({ covenants: [{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true }] })} />);
    expect(screen.getAllByText(/spread ready/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Revenue/i)).toBeInTheDocument();
  });

  it('renders missing-data blockers', () => {
    render(<AnnualReviewFinancialCovenantPanel snapshot={snapshot({ facts: [] })} />);
    expect(screen.getAllByText(/blocked/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders a covenant failure as a finding', () => {
    render(<AnnualReviewFinancialCovenantPanel snapshot={snapshot({ covenants: [{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 5.0, active: true }] })} />);
    expect(screen.getByText(/fail \(finding\)/i)).toBeInTheDocument();
  });

  it('renders an unknown covenant as review/unknown', () => {
    render(<AnnualReviewFinancialCovenantPanel snapshot={snapshot({ covenants: [{ covenantId: 'C', covenantType: 'dscr', active: true }] })} />);
    expect(screen.getByText(/unknown_no_definition/i)).toBeInTheDocument();
  });

  it('renders evidence references', () => {
    render(<AnnualReviewFinancialCovenantPanel snapshot={snapshot({ covenants: [{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 1.2, active: true }] })} />);
    expect(screen.getByText(/fact\(s\),/i)).toBeInTheDocument();
  });

  it('has no approve / waive / override / send / upload buttons', () => {
    const { container } = render(<AnnualReviewFinancialCovenantPanel snapshot={snapshot()} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    // No action-control labels (the panel may state that no waiver occurs).
    expect(text).not.toContain('approve credit');
    expect(text).not.toMatch(/waive covenant|override covenant|approve and send/);
  });
});
