/**
 * Phase 141O — shared TEST fixtures for the financial/covenant derivers.
 *
 * Synthetic, evidence-shaped inputs only — referenced by tests, never by the
 * app. Values here are test scaffolding, not production financials.
 */

import type {
  AnnualReviewFinancialFactRef,
  AnnualReviewFinancialPeriod,
  AnnualReviewFinancialDocumentRequirement,
} from './annualReviewFinancialTypes';
import type { AnnualReviewDocumentType } from '../shared/annualReview/annualReviewTypes';

export function fact(over: Partial<AnnualReviewFinancialFactRef> = {}): AnnualReviewFinancialFactRef {
  return {
    factId: 'F1', canonicalType: 'income_statement_line', statementType: 'income_statement', metricKey: 'revenue', periodId: 'PER-2025', value: 1000, unit: 'currency', sourceDocumentId: 'DOC1', confidence: 'high', status: 'accepted', isSuperseded: false, systemInvalidated: false, reviewRequired: false,
    ...over,
  };
}

export function period(over: Partial<AnnualReviewFinancialPeriod> = {}): AnnualReviewFinancialPeriod {
  return {
    periodId: 'PER-2025', fiscalYear: 2025, periodType: 'annual', sourceDocumentIds: ['DOC1'], confidence: 'high', periodReviewRequired: false, warnings: [], blockers: [],
    ...over,
  };
}

export function doc(documentType: AnnualReviewDocumentType, over: Partial<AnnualReviewFinancialDocumentRequirement> = {}): AnnualReviewFinancialDocumentRequirement {
  return {
    requirementId: `REQ-${documentType}`, documentType, label: documentType, fiscalYear: 2025, required: true, received: true, accepted: true, sourceDocumentId: 'DOC1',
    ...over,
  };
}

/** A complete, trusted FY2025 fact set sufficient for spreading + ratio covenants. */
export function trustedFacts2025(): AnnualReviewFinancialFactRef[] {
  return [
    fact({ factId: 'F-rev', metricKey: 'revenue', statementType: 'income_statement', value: 1000 }),
    fact({ factId: 'F-ebitda', metricKey: 'ebitda', statementType: 'income_statement', value: 200 }),
    fact({ factId: 'F-ni', metricKey: 'net_income', statementType: 'income_statement', value: 80 }),
    fact({ factId: 'F-ds', metricKey: 'debt_service', statementType: 'cash_flow', value: 100 }),
    fact({ factId: 'F-ca', metricKey: 'current_assets', statementType: 'balance_sheet', value: 300 }),
    fact({ factId: 'F-cl', metricKey: 'current_liabilities', statementType: 'balance_sheet', value: 150 }),
    fact({ factId: 'F-tnw', metricKey: 'tangible_net_worth', statementType: 'balance_sheet', value: 500 }),
    fact({ factId: 'F-debt', metricKey: 'debt', statementType: 'balance_sheet', value: 250 }),
    fact({ factId: 'F-cash', metricKey: 'cash', statementType: 'balance_sheet', value: 120 }),
    fact({ factId: 'F-tl', metricKey: 'total_liabilities', statementType: 'balance_sheet', value: 400 }),
  ];
}
