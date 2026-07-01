import { describe, it, expect } from 'vitest';
import {
  LOAN_PROFITABILITY_TABLE,
  PROFITABILITY_BOARDED_LOAN_COLUMN,
  PROFITABILITY_RAROC_COLUMN,
  PROFITABILITY_ADDITIVE_COLUMNS,
  PROFITABILITY_ADDITIVE_COLUMN_NAMES,
  PROFITABILITY_SCHEMA_VERSION,
} from './profitabilityLinkSchemaPlan';

describe('PE-4 — additive profitability schema plan', () => {
  it('declares the boarded-loan link + RAROC additive columns on cr664_loanprofitability', () => {
    expect(PROFITABILITY_SCHEMA_VERSION).toMatch(/^PE-4/);
    expect(PROFITABILITY_ADDITIVE_COLUMN_NAMES).toContain(PROFITABILITY_BOARDED_LOAN_COLUMN);
    expect(PROFITABILITY_ADDITIVE_COLUMN_NAMES).toContain(PROFITABILITY_RAROC_COLUMN);
    for (const c of PROFITABILITY_ADDITIVE_COLUMNS) {
      expect(c.tableLogicalName).toBe(LOAN_PROFITABILITY_TABLE);
      expect(c.logicalName.startsWith('cr664_')).toBe(true);
      // Additive/optional — never required for create (fail-closed on read).
      expect(c.requiredForCreate).toBe(false);
    }
  });

  it('carries no dollar-amount literals', () => {
    expect(/\$\s*\d/.test(JSON.stringify(PROFITABILITY_ADDITIVE_COLUMNS))).toBe(false);
  });
});
