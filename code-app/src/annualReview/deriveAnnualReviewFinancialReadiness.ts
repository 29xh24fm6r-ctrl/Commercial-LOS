/**
 * Phase 141O — Annual review financial spreading READINESS deriver.
 *
 * PURE, evidence-backed. Wraps the existing document/fact readiness inputs and
 * decides whether financial spreading can proceed. It fabricates no documents,
 * infers nothing from borrower name or memo text, excludes superseded /
 * system-invalidated / rejected / generic facts, and sends ambiguous periods to
 * review.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. Inputs are the already-classified documents, facts, and periods.
 *   - Balance-sheet / income-statement periods must be unambiguous to be ready.
 *   - Missing required documents / ambiguous periods / no trusted facts block.
 */

import type {
  AnnualReviewFinancialDocumentRequirement,
  AnnualReviewFinancialFactRef,
  AnnualReviewFinancialPeriod,
  AnnualReviewFinancialReadinessResult,
  AnnualReviewFinancialBlocker,
} from './annualReviewFinancialTypes';
import { isCountableFact } from './annualReviewFinancialFacts';

export interface DeriveAnnualReviewFinancialReadinessInput {
  annualReviewId: string;
  fiscalYear: number;
  documents: readonly AnnualReviewFinancialDocumentRequirement[];
  facts: readonly AnnualReviewFinancialFactRef[];
  periods: readonly AnnualReviewFinancialPeriod[];
  asOfDate?: string | Date;
}

function blocker(code: string, message: string, severity: AnnualReviewFinancialBlocker['severity'] = 'high'): AnnualReviewFinancialBlocker {
  return { code, message, severity };
}

/** Periods that carry facts of a given statement type. */
function periodsWithStatement(
  facts: readonly AnnualReviewFinancialFactRef[],
  periods: readonly AnnualReviewFinancialPeriod[],
  statementType: string,
): AnnualReviewFinancialPeriod[] {
  const periodIds = new Set(
    facts.filter((f) => f.statementType === statementType).map((f) => f.periodId),
  );
  return periods.filter((p) => periodIds.has(p.periodId));
}

export function deriveAnnualReviewFinancialReadiness(
  input: DeriveAnnualReviewFinancialReadinessInput,
): AnnualReviewFinancialReadinessResult {
  const { documents, facts, periods, fiscalYear } = input;

  const requiredDocuments = documents.filter((d) => d.required);
  const availableDocuments = documents.filter((d) => d.received);
  const acceptedDocuments = documents.filter((d) => d.accepted);
  const rejectedDocuments = documents.filter((d) => d.received && !d.accepted);
  const missingDocuments = requiredDocuments.filter((d) => !d.received);

  const availablePeriods = periods.filter((p) => !p.periodReviewRequired);
  const ambiguousPeriods = periods.filter((p) => p.periodReviewRequired);

  const presentFiscalYears = new Set(periods.map((p) => p.fiscalYear));
  const missingPeriods = presentFiscalYears.has(fiscalYear) ? [] : [fiscalYear];

  const countableFacts = facts.filter(isCountableFact);

  const blockers: AnnualReviewFinancialBlocker[] = [];
  const warnings: string[] = [];

  if (missingDocuments.length > 0) {
    blockers.push(blocker('missing_required_document', `${missingDocuments.length} required document(s) missing for FY ${fiscalYear}.`));
  }

  const ambiguousBs = periodsWithStatement(facts, periods, 'balance_sheet').filter((p) => p.periodReviewRequired);
  if (ambiguousBs.length > 0) {
    blockers.push(blocker('ambiguous_balance_sheet_period', 'Balance sheet period is ambiguous and requires review.'));
  }
  const ambiguousIs = periodsWithStatement(facts, periods, 'income_statement').filter((p) => p.periodReviewRequired);
  if (ambiguousIs.length > 0) {
    blockers.push(blocker('ambiguous_income_statement_period', 'Income statement period is ambiguous and requires review.'));
  }

  if (missingPeriods.length > 0) {
    blockers.push(blocker('missing_required_fiscal_year', `No financial period present for FY ${fiscalYear}.`));
  }

  if (countableFacts.length === 0) {
    blockers.push(blocker('no_trusted_facts', 'No trusted, non-generic financial facts are available.'));
  }

  const reviewRequiredFacts = countableFacts.filter((f) => f.status === 'review_required' || f.reviewRequired);
  if (reviewRequiredFacts.length > 0) {
    warnings.push(`${reviewRequiredFacts.length} fact(s) are flagged for review.`);
  }

  const acceptedRequiredPresent = requiredDocuments.every((d) => acceptedDocuments.includes(d)) && requiredDocuments.length > 0;

  let readinessStatus: AnnualReviewFinancialReadinessResult['readinessStatus'];
  if (blockers.length > 0) {
    readinessStatus = 'blocked';
  } else if (acceptedRequiredPresent && countableFacts.length > 0) {
    readinessStatus = 'spread_ready';
  } else {
    readinessStatus = 'review_required';
  }

  let nextBestAction: { code: string; label: string };
  if (missingDocuments.length > 0) {
    nextBestAction = { code: 'collect_required_documents', label: 'Collect the missing required documents.' };
  } else if (ambiguousBs.length > 0 || ambiguousIs.length > 0) {
    nextBestAction = { code: 'review_ambiguous_period', label: 'Review the ambiguous financial statement period.' };
  } else if (countableFacts.length === 0) {
    nextBestAction = { code: 'extract_financials', label: 'Extract trusted financial facts from received documents.' };
  } else if (readinessStatus === 'spread_ready') {
    nextBestAction = { code: 'spread_financials', label: 'Proceed to financial spreading.' };
  } else {
    nextBestAction = { code: 'review_financials', label: 'Review the financial inputs before spreading.' };
  }

  return {
    annualReviewId: input.annualReviewId,
    fiscalYear,
    requiredDocuments,
    availableDocuments,
    missingDocuments,
    acceptedDocuments,
    rejectedDocuments,
    availablePeriods,
    missingPeriods,
    ambiguousPeriods,
    readinessStatus,
    blockers,
    warnings,
    nextBestAction,
  };
}
