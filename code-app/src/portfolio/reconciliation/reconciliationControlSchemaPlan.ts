/**
 * Phase PE-2 — Migration control / book tie-out Dataverse schema PLAN.
 *
 * Declarative target schema for the reconciliation control entity, kept
 * STANDALONE (not folded into the pinned 13-table boarded-loan family plan) so
 * it can be provisioned independently and does not disturb the boarding
 * schema-plan invariants. CONSTANTS ONLY — no IO, no writes, nothing created.
 *
 * Reuses the boarding plan's TargetTablePlan / TargetColumnPlan shapes so the
 * inspect/verify tooling can treat both plans uniformly.
 *
 * Discipline: pure data, `cr664_` prefix, no fabricated borrower/loan/$ values.
 */

import type { TargetColumnPlan, TargetTablePlan } from '../../portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan';

export const MIGRATION_CONTROL_SCHEMA_VERSION = 'PE-2.1';

/** The reconciliation control table (one row per migration batch). */
export const MIGRATION_CONTROL_TABLE = 'cr664_portfoliomigrationcontrol';

/** The boarded-loan root table this plan adds one additive column to. */
export const PORTFOLIO_BOARDED_LOAN_TABLE = 'cr664_portfolioboardedloan';

/**
 * The additive column stamped on each boarded loan to tie it to its migration
 * batch. Additive + optional — like `cr664_extendedloanattributes`, reads must
 * fail closed when it is not yet provisioned (see boardedLoansList PE-0A).
 */
export const MIGRATION_BATCH_ID_COLUMN = 'cr664_migrationbatchid';

export const MIGRATION_CONTROL_TARGET_TABLE: TargetTablePlan = Object.freeze({
  logicalName: MIGRATION_CONTROL_TABLE,
  schemaName: 'cr664_PortfolioMigrationControl',
  displayName: 'Portfolio Migration Control',
  pluralDisplayName: 'Portfolio Migration Controls',
  primaryNameColumn: 'cr664_name',
  ownershipType: 'UserOwned',
  description:
    'Operator-recorded control totals for one portfolio migration batch (count, aggregate outstanding, optional segment subtotals) used to tie out the boarded book.',
  requiredForPhase: 'PE-2',
  seedOrder: 1,
  sourceModelType: 'MigrationControl',
  safetyNotes:
    'Inspect live metadata before any seed. Never create if an ambiguous or legacy artifact already exists under this name.',
});

function col(
  shortName: string,
  displayName: string,
  dataType: TargetColumnPlan['dataType'],
  extra: Partial<TargetColumnPlan> = {},
): TargetColumnPlan {
  return {
    tableLogicalName: MIGRATION_CONTROL_TABLE,
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

export const MIGRATION_CONTROL_TARGET_COLUMNS: readonly TargetColumnPlan[] = Object.freeze([
  col('name', 'Name', 'String', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    maxLength: 200,
    description: 'Primary name — operator label for the migration batch control.',
    sourceModelPath: 'batchId',
  }),
  col('migrationbatchid', 'Migration batch id', 'String', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    maxLength: 100,
    description: 'Unique migration batch identifier this control reconciles.',
    sourceModelPath: 'batchId',
  }),
  col('operator', 'Operator', 'String', { sourceModelPath: 'operator' }),
  col('enteredloancount', 'Entered loan count', 'Integer', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    description: 'Loan count recorded from the source system for this batch.',
    sourceModelPath: 'enteredLoanCount',
  }),
  col('enteredaggregateoutstanding', 'Entered aggregate outstanding', 'Money', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    description: 'Aggregate outstanding principal recorded from the source system for this batch.',
    sourceModelPath: 'enteredAggregateOutstanding',
  }),
  col('segmentsubtotalsjson', 'Segment subtotals JSON', 'Memo', {
    description: 'Optional per-segment (officer / product / segment) subtotals: [{segment,count,outstanding}].',
    sourceModelPath: 'segmentSubtotals',
  }),
  col('expectedloannumbersjson', 'Expected loan numbers JSON', 'Memo', {
    description: 'Optional expected loan-number roster from the source extract, enabling orphan detection.',
    sourceModelPath: 'expectedLoanNumbers',
  }),
  col('sourcedescription', 'Source description', 'Memo', { sourceModelPath: 'sourceDescription' }),
  col('enteredat', 'Entered at', 'DateTime', { sourceModelPath: 'enteredAt' }),
]);

/**
 * Additive column on the boarded-loan root table linking each boarded loan to a
 * migration batch. Provisioned separately; optional/fail-closed on read.
 */
export const MIGRATION_BATCH_ID_LOAN_COLUMN: TargetColumnPlan = Object.freeze({
  tableLogicalName: PORTFOLIO_BOARDED_LOAN_TABLE,
  logicalName: MIGRATION_BATCH_ID_COLUMN,
  schemaName: 'cr664_MigrationBatchId',
  displayName: 'Migration batch id',
  dataType: 'String',
  requiredLevel: 'None',
  maxLength: 100,
  description: 'Migration batch this loan was boarded under (ties the loan to a cr664_portfoliomigrationcontrol row).',
  sourceModelPath: 'migrationBatchId',
  requiredForCreate: false,
  requiredForFDIC: false,
  requiredForBoard: false,
  requiredForPortfolioMonitoring: false,
});

export const MIGRATION_CONTROL_COLUMN_NAMES: readonly string[] = Object.freeze(
  MIGRATION_CONTROL_TARGET_COLUMNS.map((c) => c.logicalName),
);
