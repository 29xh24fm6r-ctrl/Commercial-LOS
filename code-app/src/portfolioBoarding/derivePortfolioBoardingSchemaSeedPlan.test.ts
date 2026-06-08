import { describe, it, expect } from 'vitest';
import { derivePortfolioBoardingSchemaSeedPlan } from './derivePortfolioBoardingSchemaSeedPlan';
import {
  derivePortfolioBoardingSchemaInspectionReport,
  type InspectedTable,
  type SchemaInspectionInput,
  type TableClassification,
} from './derivePortfolioBoardingSchemaInspectionReport';
import { ALL_TARGET_TABLE_LOGICAL_NAMES } from './portfolioLoanBoardingDataverseSchemaPlan';

/**
 * Phase 140J — Portfolio Boarding schema SEED PLAN pins.
 *
 * The seed plan is fail-closed: safeToCommit only when the inspection report
 * is safe to seed. Missing tables/columns/relationships become create lists;
 * existing compatible items become reuse; optional links to absent targets
 * are skipped.
 */

function allTables(classification: TableClassification, exists: boolean): InspectedTable[] {
  return ALL_TARGET_TABLE_LOGICAL_NAMES.map((logicalName) => ({
    logicalName,
    exists,
    classification,
  }));
}

function inspectionInput(overrides: Partial<SchemaInspectionInput>): SchemaInspectionInput {
  return {
    publisherPrefixConfirmed: true,
    confirmedPrefix: 'cr664',
    inspectedTables: allTables('MISSING_CAN_SEED', false),
    lookupTargets: [],
    ...overrides,
  };
}

function seedPlanFrom(
  inspectionOverrides: Partial<SchemaInspectionInput>,
) {
  const report = derivePortfolioBoardingSchemaInspectionReport(
    inspectionInput(inspectionOverrides),
  );
  return derivePortfolioBoardingSchemaSeedPlan({
    report,
    lookupTargets: inspectionOverrides.lookupTargets,
  });
}

describe('Phase 140J — create lists from a fully-missing environment', () => {
  it('lists every missing root + child table in seed order', () => {
    const plan = seedPlanFrom({});
    expect(plan.tablesToCreate.length).toBe(ALL_TARGET_TABLE_LOGICAL_NAMES.length);
    expect(plan.seedOrderSummary[0]).toBe('cr664_portfolioboardedloan');
    expect(plan.seedOrderSummary).toEqual([...ALL_TARGET_TABLE_LOGICAL_NAMES]);
  });

  it('lists missing required columns for creation', () => {
    const plan = seedPlanFrom({});
    expect(plan.columnsToCreate.length).toBeGreaterThan(0);
    expect(
      plan.columnsToCreate.some((c) => c.columnLogicalName === 'cr664_loannumber'),
    ).toBe(true);
  });

  it('lists missing child→root lookup relationships for creation', () => {
    const plan = seedPlanFrom({});
    expect(plan.relationshipsToCreate).toContain('cr664_portfolioboardedloan_collateral');
    expect(plan.relationshipsToCreate).toContain('cr664_portfolioboardedloan_document');
  });

  it('is safe to run dry-run and safe to commit when there are no blockers', () => {
    const plan = seedPlanFrom({});
    expect(plan.safeToRunDryRun).toBe(true);
    expect(plan.safeToCommit).toBe(true);
  });
});

describe('Phase 140J — reuse and skip behavior', () => {
  it('does not recreate existing reusable tables and reuses compatible columns', () => {
    const tables = ALL_TARGET_TABLE_LOGICAL_NAMES.map((logicalName) => ({
      logicalName,
      exists: true,
      classification: 'EXISTS_REUSABLE' as TableClassification,
      presentColumns: ['cr664_name', 'cr664_portfolioboardedloan'],
    }));
    const plan = seedPlanFrom({ inspectedTables: tables });
    expect(plan.tablesToCreate).toEqual([]);
    expect(plan.tablesToReuse.length).toBe(ALL_TARGET_TABLE_LOGICAL_NAMES.length);
    expect(plan.columnsToReuse).toBeGreaterThan(0);
  });

  it('skips optional related lookups when the optional target is absent', () => {
    const plan = seedPlanFrom({
      lookupTargets: [
        { logicalName: 'cr664_loandeal', exists: false, safeAsTarget: false, required: false },
      ],
    });
    expect(plan.skippedOptionalRelationships).toContain(
      'cr664_portfolioboardedloan_originatedloandeal',
    );
    // Skipping an optional link is not a blocker.
    expect(plan.safeToCommit).toBe(true);
  });
});

describe('Phase 140K — the internal evidence→document target is created, not skipped', () => {
  it('treats cr664_portfolioboardedloandocument as an internal target (relationship to create, not skipped)', () => {
    // Every table exists and is reusable, but the evidence table is missing its
    // evidence→document lookup column. Because the document table is itself a
    // portfolio boarding target, the missing lookup must be queued for creation
    // — never skipped as an "absent optional target".
    const tables = ALL_TARGET_TABLE_LOGICAL_NAMES.map((logicalName) => ({
      logicalName,
      exists: true,
      classification: 'EXISTS_REUSABLE' as TableClassification,
      presentColumns: ['cr664_name', 'cr664_portfolioboardedloan'],
    }));
    const plan = seedPlanFrom({ inspectedTables: tables });
    expect(plan.relationshipsToCreate).toContain(
      'cr664_portfolioboardedloandocument_evidence',
    );
    expect(plan.skippedOptionalRelationships).not.toContain(
      'cr664_portfolioboardedloandocument_evidence',
    );
  });
});

describe('Phase 140J — fail-closed commit gates', () => {
  it('a required lookup target absence blocks commit', () => {
    const plan = seedPlanFrom({
      lookupTargets: [
        { logicalName: 'systemuser', exists: false, safeAsTarget: false, required: true },
      ],
    });
    expect(plan.safeToCommit).toBe(false);
    expect(plan.blockers.length).toBeGreaterThan(0);
  });

  it('a conflicting table blocks commit', () => {
    const tables = allTables('MISSING_CAN_SEED', false);
    tables[0] = {
      logicalName: 'cr664_portfolioboardedloan',
      exists: true,
      classification: 'BLOCKED_BY_CONFLICT',
    };
    const plan = seedPlanFrom({ inspectedTables: tables });
    expect(plan.safeToCommit).toBe(false);
  });

  it('an unconfirmed publisher prefix blocks commit', () => {
    const plan = seedPlanFrom({ publisherPrefixConfirmed: false, confirmedPrefix: undefined });
    expect(plan.safeToCommit).toBe(false);
    expect(plan.blockers.some((b) => /prefix/i.test(b))).toBe(true);
  });
});

describe('Phase 140J — commit instructions + no fake data', () => {
  it('commit instructions name the commit flag', () => {
    const plan = seedPlanFrom({});
    expect(plan.commitInstructions).toMatch(/--commit-seed-portfolio-boarding-schema/);
  });

  it('the serialized seed plan contains no fake borrower names or dollar values', () => {
    const serialized = JSON.stringify(seedPlanFrom({}));
    expect(/\$\s*\d/.test(serialized)).toBe(false);
    for (const re of [
      /\bAcme\b/i,
      /\bJohn Doe\b/i,
      /\bJohn\s+Smith\b/i,
      /\bTest\s+Borrower\b/i,
      /\bSample\s+Loan\b/i,
    ]) {
      expect(re.test(serialized), `${re}`).toBe(false);
    }
  });
});
