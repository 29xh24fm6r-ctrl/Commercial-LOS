import { describe, it, expect } from 'vitest';
import {
  derivePortfolioBoardingSchemaInspectionReport,
  type InspectedTable,
  type SchemaInspectionInput,
  type TableClassification,
} from './derivePortfolioBoardingSchemaInspectionReport';
import {
  ALL_TARGET_TABLE_LOGICAL_NAMES,
  PORTFOLIO_BOARDING_ROOT_TABLE,
} from './portfolioLoanBoardingDataverseSchemaPlan';

/**
 * Phase 140I — Portfolio boarding schema inspection REPORT pins.
 *
 * The deriver is fail-closed: safeToSeed is true only when the prefix is
 * confirmed, there are no conflicts, no ambiguous matches, and no required
 * lookup target is missing. Missing target tables alone are allowed.
 */

function allTables(classification: TableClassification, exists: boolean): InspectedTable[] {
  return ALL_TARGET_TABLE_LOGICAL_NAMES.map((logicalName) => ({
    logicalName,
    exists,
    classification,
  }));
}

function input(overrides: Partial<SchemaInspectionInput>): SchemaInspectionInput {
  return {
    publisherPrefixConfirmed: true,
    confirmedPrefix: 'cr664',
    inspectedTables: allTables('MISSING_CAN_SEED', false),
    lookupTargets: [],
    ...overrides,
  };
}

describe('Phase 140I — missing tables are allowed seed candidates', () => {
  it('all-missing + confirmed prefix + no conflicts → safeToSeed true', () => {
    const r = derivePortfolioBoardingSchemaInspectionReport(input({}));
    expect(r.safeToSeed).toBe(true);
    expect(r.tablesMissing.length).toBe(ALL_TARGET_TABLE_LOGICAL_NAMES.length);
    expect(r.conflictingTables).toEqual([]);
    expect(r.recommendedNextAction).toBe('plan-portfolio-boarding-schema');
  });

  it('always recommends an inspect/plan action — never a direct seed', () => {
    const r = derivePortfolioBoardingSchemaInspectionReport(input({}));
    expect(r.recommendedNextAction).toMatch(/plan|inspect|reuse/);
    expect(r.recommendedNextAction).not.toMatch(/^seed/);
  });
});

describe('Phase 140I — fail-closed gates', () => {
  it('safeToSeed false when the publisher prefix is unknown', () => {
    const r = derivePortfolioBoardingSchemaInspectionReport(
      input({ publisherPrefixConfirmed: false, confirmedPrefix: undefined }),
    );
    expect(r.safeToSeed).toBe(false);
    expect(r.blockers.some((b) => /prefix/i.test(b))).toBe(true);
    expect(r.recommendedNextAction).toBe('resolve-blockers-then-reinspect');
  });

  it('safeToSeed false when a conflicting table exists', () => {
    const tables = allTables('MISSING_CAN_SEED', false);
    tables[0] = {
      logicalName: PORTFOLIO_BOARDING_ROOT_TABLE,
      exists: true,
      classification: 'BLOCKED_BY_CONFLICT',
    };
    const r = derivePortfolioBoardingSchemaInspectionReport(input({ inspectedTables: tables }));
    expect(r.safeToSeed).toBe(false);
    expect(r.conflictingTables).toContain(PORTFOLIO_BOARDING_ROOT_TABLE);
  });

  it('safeToSeed false when a required lookup target is missing', () => {
    const r = derivePortfolioBoardingSchemaInspectionReport(
      input({
        lookupTargets: [
          { logicalName: 'systemuser', exists: false, safeAsTarget: false, required: true },
        ],
      }),
    );
    expect(r.safeToSeed).toBe(false);
    expect(r.blockers.some((b) => /systemuser/i.test(b))).toBe(true);
  });

  it('safeToSeed false when an ambiguous table match exists', () => {
    const tables = allTables('MISSING_CAN_SEED', false);
    tables[1] = {
      logicalName: tables[1]!.logicalName,
      exists: true,
      classification: 'EXISTS_NEEDS_REVIEW',
      ambiguousMatch: true,
    };
    const r = derivePortfolioBoardingSchemaInspectionReport(input({ inspectedTables: tables }));
    expect(r.safeToSeed).toBe(false);
    expect(r.blockers.some((b) => /ambiguous/i.test(b))).toBe(true);
  });

  it('an optional missing lookup target is a warning, not a blocker', () => {
    const r = derivePortfolioBoardingSchemaInspectionReport(
      input({
        lookupTargets: [
          { logicalName: 'cr664_team', exists: false, safeAsTarget: false, required: false },
        ],
      }),
    );
    expect(r.safeToSeed).toBe(true);
    expect(r.warnings.some((w) => /cr664_team/i.test(w))).toBe(true);
  });
});

describe('Phase 140K — internal evidence→document relationship recognition', () => {
  it('reports the evidence→document relationship as found when its lookup column is present', () => {
    const tables = ALL_TARGET_TABLE_LOGICAL_NAMES.map((logicalName) => {
      const present = ['cr664_name', 'cr664_portfolioboardedloan'];
      if (logicalName === 'cr664_portfolioboardedloanevidence') {
        present.push('cr664_portfolioboardedloandocument');
      }
      return {
        logicalName,
        exists: true,
        classification: 'EXISTS_REUSABLE' as TableClassification,
        presentColumns: present,
      };
    });
    const r = derivePortfolioBoardingSchemaInspectionReport(input({ inspectedTables: tables }));
    expect(r.relationshipsFound).toContain('cr664_portfolioboardedloandocument_evidence');
  });
});

describe('Phase 140I — reusable tables are allowed', () => {
  it('all-reusable + clean gates → safeToSeed true, recommends reuse', () => {
    const tables = ALL_TARGET_TABLE_LOGICAL_NAMES.map((logicalName) => ({
      logicalName,
      exists: true,
      classification: 'EXISTS_REUSABLE' as TableClassification,
      presentColumns: ['cr664_name', 'cr664_portfolioboardedloan'],
    }));
    const r = derivePortfolioBoardingSchemaInspectionReport(input({ inspectedTables: tables }));
    expect(r.safeToSeed).toBe(true);
    expect(r.reusableTables.length).toBe(ALL_TARGET_TABLE_LOGICAL_NAMES.length);
    expect(r.recommendedNextAction).toBe('reuse-existing-no-seed-needed');
    expect(r.columnsFound).toBeGreaterThan(0);
  });
});
