/**
 * Phase 141P — shared TEST fixtures / pipeline for the package builders.
 *
 * Synthetic, evidence-shaped inputs only — referenced by tests, never by the
 * app. Wires the Phase 141O derivers into the Phase 141P package builders.
 */

import { deriveAnnualReviewFinancialReadiness } from './deriveAnnualReviewFinancialReadiness';
import { deriveAnnualReviewFinancialSpreadSnapshot } from './deriveAnnualReviewFinancialSpreadSnapshot';
import { deriveAnnualReviewFinancialAnalysisSnapshot } from './deriveAnnualReviewFinancialAnalysisSnapshot';
import { testAnnualReviewCovenants } from './testAnnualReviewCovenants';
import { resolveAnnualReviewCovenantDefinitions, type RawCovenantRecord } from './resolveAnnualReviewCovenantDefinitions';
import { buildAnnualReviewEvidenceIndex } from './buildAnnualReviewEvidenceIndex';
import { deriveAnnualReviewPackageReadiness } from './deriveAnnualReviewPackageReadiness';
import { buildAnnualReviewMemoPackage } from './buildAnnualReviewMemoPackage';
import { buildAnnualReviewBoardPackage } from './buildAnnualReviewBoardPackage';
import { buildAnnualReviewFdicPackage } from './buildAnnualReviewFdicPackage';
import { fact, period, doc } from './financialTestFixtures';
import type { AnnualReviewFinancialFactRef, AnnualReviewFinancialDocumentRequirement } from './annualReviewFinancialTypes';
import type { AnnualReviewLoanSnapshot } from '../shared/annualReview/annualReviewTypes';

const ALL_METRIC_KEYS: readonly [string, string][] = [
  ['revenue', 'income_statement'], ['gross_profit', 'income_statement'], ['ebitda', 'income_statement'], ['net_income', 'income_statement'],
  ['total_assets', 'balance_sheet'], ['total_liabilities', 'balance_sheet'], ['tangible_net_worth', 'balance_sheet'],
  ['current_assets', 'balance_sheet'], ['current_liabilities', 'balance_sheet'], ['cash', 'balance_sheet'], ['debt', 'balance_sheet'],
  ['debt_service', 'cash_flow'], ['owner_distributions', 'cash_flow'], ['ar_aging', 'aging'], ['ap_aging', 'aging'], ['inventory', 'balance_sheet'],
];

/** A complete trusted fact set covering every catalog metric → spread "available". */
export function completeFacts(): AnnualReviewFinancialFactRef[] {
  return ALL_METRIC_KEYS.map(([key, st], i) =>
    fact({ factId: `F-${key}`, metricKey: key, statementType: st as AnnualReviewFinancialFactRef['statementType'], value: key === 'current_liabilities' ? 150 : 200 + i }),
  );
}

export const LOAN: AnnualReviewLoanSnapshot = {
  boardedLoanId: 'LOAN-1', loanNumber: 'LN1', borrowerName: 'Synthetic Borrower', relationshipName: 'Synthetic Relationship',
  loanStatus: 'active', currentBalance: 250, maturityDate: '2027-09-30', riskRating: '4', insuranceStatus: 'current', covenantStatus: 'in_compliance',
};

const PASS_DSCR: RawCovenantRecord = { covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 0.5, active: true };

export interface PipelineOpts {
  facts?: AnnualReviewFinancialFactRef[];
  covenants?: RawCovenantRecord[];
  documents?: AnnualReviewFinancialDocumentRequirement[];
  allowDraftBoardPackage?: boolean;
}

export function pipeline(opts: PipelineOpts = {}) {
  const facts = opts.facts ?? completeFacts();
  const documents = opts.documents ?? [doc('annual_financial_statements')];
  const periods = [period()];
  const readiness = deriveAnnualReviewFinancialReadiness({ annualReviewId: 'AR1', fiscalYear: 2025, documents, facts, periods });
  const spread = deriveAnnualReviewFinancialSpreadSnapshot({ annualReviewId: 'AR1', readiness, facts, periods });
  const covenants = testAnnualReviewCovenants({ definitions: resolveAnnualReviewCovenantDefinitions({ boardedLoanCovenants: opts.covenants ?? [PASS_DSCR] }), spread, readiness });
  const analysis = deriveAnnualReviewFinancialAnalysisSnapshot({ annualReviewId: 'AR1', readiness, spread, covenants });
  const evidenceIndex = buildAnnualReviewEvidenceIndex({ annualReviewId: 'AR1', documents, facts, spread, covenants, periods });
  const pkgReadiness = deriveAnnualReviewPackageReadiness({ annualReviewId: 'AR1', analysis, evidenceIndex, policy: { allowDraftBoardPackage: opts.allowDraftBoardPackage } });
  const memo = buildAnnualReviewMemoPackage({ annualReviewId: 'AR1', loan: LOAN, analysis, evidenceIndex, readiness: pkgReadiness });
  const board = buildAnnualReviewBoardPackage({ annualReviewId: 'AR1', memo, analysis, evidenceIndex, readiness: pkgReadiness });
  const fdic = buildAnnualReviewFdicPackage({ annualReviewId: 'AR1', memo, board, analysis, evidenceIndex, readiness: pkgReadiness, asOfDate: '2026-06-09' });
  return { readiness, spread, covenants, analysis, evidenceIndex, pkgReadiness, memo, board, fdic, documents, facts, periods };
}
