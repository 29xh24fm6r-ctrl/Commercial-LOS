import { describe, it, expect } from 'vitest';
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
 * Phase 141J-K — CRM schema inspection report pins.
 *
 * The deriver is fail-closed: unconfirmed prefix, conflicts, ambiguity, or a
 * missing required lookup target all block the seed. Missing CRM tables are
 * seed candidates; missing optional external targets are warnings only.
 */

function allMissing(): CrmInspectedTable[] {
  return CRM_TARGET_TABLES.map((t) => ({
    logicalName: t.logicalName,
    exists: false,
    classification: 'MISSING_CAN_SEED',
  }));
}

function allReusable(): CrmInspectedTable[] {
  return CRM_TARGET_TABLES.map((t) => ({
    logicalName: t.logicalName,
    exists: true,
    classification: 'EXISTS_REUSABLE',
    presentColumns: crmTargetColumnsForTable(t.logicalName).map((c) => c.logicalName),
  }));
}

function input(
  over: Partial<CrmSchemaInspectionInput> = {},
): CrmSchemaInspectionInput {
  return {
    publisherPrefixConfirmed: true,
    confirmedPrefix: 'cr664',
    inspectedTables: allMissing(),
    lookupTargets: [],
    ...over,
  };
}

describe('Phase 141J-K — CRM inspection report fail-closed gates', () => {
  it('safeToSeed false when the publisher prefix is not confirmed', () => {
    const r = deriveCrmSchemaInspectionReport(
      input({ publisherPrefixConfirmed: false, confirmedPrefix: undefined }),
    );
    expect(r.safeToSeed).toBe(false);
    expect(r.blockers.some((b) => /prefix/i.test(b))).toBe(true);
    expect(r.recommendedNextAction).toBe('resolve-blockers-then-reinspect');
  });

  it('safeToSeed false on a conflicting table', () => {
    const tables = allMissing();
    tables[0] = {
      logicalName: tables[0].logicalName,
      exists: true,
      classification: 'BLOCKED_BY_CONFLICT',
    };
    const r = deriveCrmSchemaInspectionReport(input({ inspectedTables: tables }));
    expect(r.safeToSeed).toBe(false);
    expect(r.conflictingTables).toContain('cr664_crmorganization');
  });

  it('safeToSeed false on an ambiguous live match', () => {
    const tables = allMissing();
    tables[1] = {
      logicalName: tables[1].logicalName,
      exists: true,
      classification: 'EXISTS_NEEDS_REVIEW',
      ambiguousMatch: true,
    };
    const r = deriveCrmSchemaInspectionReport(input({ inspectedTables: tables }));
    expect(r.safeToSeed).toBe(false);
  });

  it('safeToSeed false when a required lookup target is missing', () => {
    const lookupTargets: CrmInspectedLookupTarget[] = [
      { logicalName: 'cr664_someRequiredTarget', exists: false, safeAsTarget: false, required: true },
    ];
    const r = deriveCrmSchemaInspectionReport(input({ lookupTargets }));
    expect(r.safeToSeed).toBe(false);
    expect(r.blockers.some((b) => /required lookup target/i.test(b))).toBe(true);
  });
});

describe('Phase 141J-K — CRM inspection report seed candidates + warnings', () => {
  it('missing CRM tables become seed candidates, not blockers', () => {
    const r = deriveCrmSchemaInspectionReport(input());
    expect(r.tablesMissing).toHaveLength(10);
    expect(r.safeToSeed).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.columnsMissing.length).toBeGreaterThan(0);
  });

  it('missing optional external targets become warnings (core seed unaffected)', () => {
    const lookupTargets: CrmInspectedLookupTarget[] = [
      { logicalName: 'cr664_portfolioboardedloan', exists: false, safeAsTarget: false, required: false },
      { logicalName: 'cr664_loandeal', exists: false, safeAsTarget: false, required: false },
    ];
    const r = deriveCrmSchemaInspectionReport(input({ lookupTargets }));
    expect(r.safeToSeed).toBe(true);
    expect(r.warnings.some((w) => /cr664_portfolioboardedloan/.test(w))).toBe(true);
    expect(r.optionalRelationshipsMissing.some((g) => g.toTable === 'cr664_portfolioboardedloan')).toBe(true);
  });

  it('existing compatible tables are reusable', () => {
    const r = deriveCrmSchemaInspectionReport(input({ inspectedTables: allReusable() }));
    expect(r.reusableTables).toHaveLength(10);
    expect(r.tablesMissing).toHaveLength(0);
    expect(r.columnsFound).toBeGreaterThan(0);
    expect(r.recommendedNextAction).toBe('reuse-existing-no-seed-needed');
  });

  it('recommended next action points to the plan/seed flow when tables are missing', () => {
    const r = deriveCrmSchemaInspectionReport(input());
    expect(['plan-crm-schema', 'seed-crm-schema']).toContain(r.recommendedNextAction);
  });
});
