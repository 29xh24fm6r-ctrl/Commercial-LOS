import { describe, it, expect } from 'vitest';
import {
  MIGRATION_CONTROL_TABLE,
  MIGRATION_CONTROL_TARGET_TABLE,
  MIGRATION_CONTROL_TARGET_COLUMNS,
  MIGRATION_CONTROL_COLUMN_NAMES,
  MIGRATION_BATCH_ID_COLUMN,
  MIGRATION_BATCH_ID_LOAN_COLUMN,
  PORTFOLIO_BOARDED_LOAN_TABLE,
  MIGRATION_CONTROL_SCHEMA_VERSION,
} from './reconciliationControlSchemaPlan';
import { PORTFOLIO_BOARDING_TARGET_TABLES } from '../../portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan';

/**
 * PE-2 — migration control schema plan pins. The control entity is STANDALONE:
 * it must not perturb the pinned 13-table boarded-loan family plan.
 */

describe('PE-2 — migration control table plan', () => {
  it('declares the control table with a cr664 prefix + primary name column', () => {
    expect(MIGRATION_CONTROL_TABLE).toBe('cr664_portfoliomigrationcontrol');
    expect(MIGRATION_CONTROL_TARGET_TABLE.logicalName).toBe(MIGRATION_CONTROL_TABLE);
    expect(MIGRATION_CONTROL_TARGET_TABLE.primaryNameColumn).toBe('cr664_name');
    expect(MIGRATION_CONTROL_SCHEMA_VERSION).toMatch(/^PE-2/);
  });

  it('carries the control totals + optional subtotal / roster columns', () => {
    for (const name of [
      'cr664_migrationbatchid',
      'cr664_enteredloancount',
      'cr664_enteredaggregateoutstanding',
      'cr664_segmentsubtotalsjson',
      'cr664_expectedloannumbersjson',
    ]) {
      expect(MIGRATION_CONTROL_COLUMN_NAMES).toContain(name);
    }
  });

  it('every control column uses the cr664 prefix and belongs to the control table', () => {
    for (const c of MIGRATION_CONTROL_TARGET_COLUMNS) {
      expect(c.logicalName.startsWith('cr664_')).toBe(true);
      expect(c.tableLogicalName).toBe(MIGRATION_CONTROL_TABLE);
    }
  });

  it('adds the additive migration-batch-id column to the boarded-loan root table', () => {
    expect(MIGRATION_BATCH_ID_LOAN_COLUMN.tableLogicalName).toBe(PORTFOLIO_BOARDED_LOAN_TABLE);
    expect(MIGRATION_BATCH_ID_LOAN_COLUMN.logicalName).toBe(MIGRATION_BATCH_ID_COLUMN);
    // Additive/optional — never required for create (fail-closed on read).
    expect(MIGRATION_BATCH_ID_LOAN_COLUMN.requiredForCreate).toBe(false);
  });

  it('does NOT disturb the pinned 13-table boarded-loan family plan', () => {
    expect(PORTFOLIO_BOARDING_TARGET_TABLES.length).toBe(13);
    expect(PORTFOLIO_BOARDING_TARGET_TABLES.map((t) => t.logicalName)).not.toContain(MIGRATION_CONTROL_TABLE);
  });
});

describe('PE-2 — migration control plan carries no fabricated data', () => {
  const serialized = JSON.stringify({ MIGRATION_CONTROL_TARGET_TABLE, MIGRATION_CONTROL_TARGET_COLUMNS, MIGRATION_BATCH_ID_LOAN_COLUMN });

  it('contains no dollar-amount literals or placeholder borrower names', () => {
    expect(/\$\s*\d/.test(serialized)).toBe(false);
    for (const re of [/\bAcme\b/i, /\bContoso\b/i, /\bJohn Doe\b/i]) {
      expect(re.test(serialized)).toBe(false);
    }
  });
});
