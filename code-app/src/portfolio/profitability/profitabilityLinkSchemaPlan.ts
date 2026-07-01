/**
 * Phase PE-4 — additive profitability schema plan.
 *
 * The cr664_LoanProfitability entity already exists (interestincome, ...,
 * contributionmargin, roe, borrowerid, dealid, ...). PE-4 adds only two
 * additive columns so boarded portfolio loans — not just originated deals —
 * carry profitability, and so the risk-adjusted return is persisted:
 *   1. cr664_portfolioboardedloanid — link to the boarded loan (borrowerid /
 *      dealid are kept).
 *   2. cr664_raroc — the computed risk-adjusted return on capital (percent).
 *
 * CONSTANTS ONLY — no IO, no writes, nothing created. Additive + optional:
 * reads must fail closed when a column is not yet provisioned (see PE-0A).
 */

import type { TargetColumnPlan } from '../../portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan';

export const PROFITABILITY_SCHEMA_VERSION = 'PE-4.1';

export const LOAN_PROFITABILITY_TABLE = 'cr664_loanprofitability';

/** Additive link column tying a profitability row to a boarded portfolio loan. */
export const PROFITABILITY_BOARDED_LOAN_COLUMN = 'cr664_portfolioboardedloanid';

/** Additive computed column: risk-adjusted return on capital (percent). */
export const PROFITABILITY_RAROC_COLUMN = 'cr664_raroc';

function col(
  shortName: string,
  displayName: string,
  dataType: TargetColumnPlan['dataType'],
  extra: Partial<TargetColumnPlan> = {},
): TargetColumnPlan {
  return {
    tableLogicalName: LOAN_PROFITABILITY_TABLE,
    logicalName: `cr664_${shortName}`,
    schemaName: `cr664_${shortName.charAt(0).toUpperCase()}${shortName.slice(1)}`,
    displayName,
    dataType,
    requiredLevel: 'None',
    description: displayName,
    sourceModelPath: '',
    requiredForCreate: false,
    requiredForFDIC: false,
    requiredForBoard: false,
    requiredForPortfolioMonitoring: false,
    ...extra,
  };
}

export const PROFITABILITY_ADDITIVE_COLUMNS: readonly TargetColumnPlan[] = Object.freeze([
  col('portfolioboardedloanid', 'Portfolio boarded loan id', 'String', {
    maxLength: 100,
    description:
      'Additive link to the boarded portfolio loan this profitability row is computed for (borrowerid / dealid kept).',
    sourceModelPath: 'loanId',
  }),
  col('raroc', 'RAROC', 'Decimal', {
    precision: 4,
    description: 'Risk-adjusted return on capital, percent (computed, read-only; explainable via calc metadata).',
    sourceModelPath: 'raroc',
  }),
]);

export const PROFITABILITY_ADDITIVE_COLUMN_NAMES: readonly string[] = Object.freeze(
  PROFITABILITY_ADDITIVE_COLUMNS.map((c) => c.logicalName),
);
