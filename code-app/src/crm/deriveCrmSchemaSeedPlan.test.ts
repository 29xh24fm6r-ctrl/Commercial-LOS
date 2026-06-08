import { describe, it, expect } from 'vitest';
import { deriveCrmSchemaSeedPlan } from './deriveCrmSchemaSeedPlan';
import {
  deriveCrmSchemaInspectionReport,
  type CrmInspectedTable,
  type CrmInspectedLookupTarget,
  type CrmSchemaInspectionInput,
} from './deriveCrmSchemaInspectionReport';
import {
  CRM_TARGET_TABLES,
  crmTargetColumnsForTable,
} from './crmDataverseSchemaPlan';

/**
 * Phase 141J-K — CRM schema seed plan pins.
 *
 * The seed plan turns a fail-closed inspection report into create/reuse/skip
 * lists. Missing tables/columns/relationships become create lists; conflicts or
 * an unconfirmed prefix block the commit; optional links to absent external
 * targets are skipped; commit instructions name the commit flag.
 */

function allMissing(): CrmInspectedTable[] {
  return CRM_TARGET_TABLES.map((t) => ({
    logicalName: t.logicalName,
    exists: false,
    classification: 'MISSING_CAN_SEED',
  }));
}

function input(over: Partial<CrmSchemaInspectionInput> = {}): CrmSchemaInspectionInput {
  return {
    publisherPrefixConfirmed: true,
    confirmedPrefix: 'cr664',
    inspectedTables: allMissing(),
    lookupTargets: [],
    ...over,
  };
}

describe('Phase 141J-K — CRM seed plan create / reuse lists', () => {
  it('lists missing CRM tables in seed order', () => {
    const report = deriveCrmSchemaInspectionReport(input());
    const plan = deriveCrmSchemaSeedPlan({ report });
    expect(plan.tablesToCreate).toHaveLength(10);
    expect(plan.seedOrderSummary[0]).toBe('cr664_crmorganization');
    expect(plan.seedOrderSummary).toHaveLength(10);
    expect(plan.safeToCommit).toBe(true);
  });

  it('reuses existing CRM tables', () => {
    const reusable: CrmInspectedTable[] = CRM_TARGET_TABLES.map((t) => ({
      logicalName: t.logicalName,
      exists: true,
      classification: 'EXISTS_REUSABLE',
      presentColumns: crmTargetColumnsForTable(t.logicalName).map((c) => c.logicalName),
    }));
    const report = deriveCrmSchemaInspectionReport(input({ inspectedTables: reusable }));
    const plan = deriveCrmSchemaSeedPlan({ report });
    expect(plan.tablesToReuse).toHaveLength(10);
    expect(plan.tablesToCreate).toHaveLength(0);
    expect(plan.columnsToReuse).toBeGreaterThan(0);
  });

  it('lists missing columns to create', () => {
    const report = deriveCrmSchemaInspectionReport(input());
    const plan = deriveCrmSchemaSeedPlan({ report });
    expect(plan.columnsToCreate.length).toBeGreaterThan(0);
  });

  it('lists missing relationships to create', () => {
    const report = deriveCrmSchemaInspectionReport(input());
    const plan = deriveCrmSchemaSeedPlan({ report });
    expect(plan.relationshipsToCreate.length).toBeGreaterThan(0);
    // CRM-internal lookups (person → organization, etc.) are always creatable.
    expect(plan.relationshipsToCreate).toContain('cr664_crmperson_employerorganization');
  });

  it('skips optional relationships when the optional external target is missing', () => {
    const lookupTargets: CrmInspectedLookupTarget[] = [
      { logicalName: 'cr664_portfolioboardedloan', exists: false, safeAsTarget: false, required: false },
      { logicalName: 'cr664_loandeal', exists: false, safeAsTarget: false, required: false },
    ];
    const report = deriveCrmSchemaInspectionReport(input({ lookupTargets }));
    const plan = deriveCrmSchemaSeedPlan({ report, lookupTargets });
    expect(plan.safeToCommit).toBe(true);
    expect(plan.skippedOptionalRelationships).toContain('cr664_crmrelationship_boardedloan');
    expect(plan.skippedOptionalRelationships).toContain('cr664_crmrelationship_originatedloandeal');
    expect(plan.relationshipsToCreate).not.toContain('cr664_crmrelationship_boardedloan');
  });
});

describe('Phase 141J-K — CRM seed plan fail-closed commit gates', () => {
  it('a conflict blocks the commit', () => {
    const tables = allMissing();
    tables[0] = {
      logicalName: tables[0].logicalName,
      exists: true,
      classification: 'BLOCKED_BY_CONFLICT',
    };
    const report = deriveCrmSchemaInspectionReport(input({ inspectedTables: tables }));
    const plan = deriveCrmSchemaSeedPlan({ report });
    expect(plan.safeToCommit).toBe(false);
    expect(plan.blockers.length).toBeGreaterThan(0);
  });

  it('an unconfirmed publisher prefix blocks the commit', () => {
    const report = deriveCrmSchemaInspectionReport(
      input({ publisherPrefixConfirmed: false, confirmedPrefix: undefined }),
    );
    const plan = deriveCrmSchemaSeedPlan({ report });
    expect(plan.safeToCommit).toBe(false);
  });

  it('commit instructions include --commit-seed-crm-schema', () => {
    const report = deriveCrmSchemaInspectionReport(input());
    const plan = deriveCrmSchemaSeedPlan({ report });
    expect(plan.commitInstructions).toContain('--commit-seed-crm-schema');
  });

  it('carries no fake data — only schema object names', () => {
    const report = deriveCrmSchemaInspectionReport(input());
    const plan = deriveCrmSchemaSeedPlan({ report });
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(serialized).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
    expect(serialized).not.toMatch(/\$\s*\d/);
  });
});
