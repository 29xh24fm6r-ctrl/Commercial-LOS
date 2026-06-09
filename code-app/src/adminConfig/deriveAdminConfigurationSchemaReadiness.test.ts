import { describe, it, expect } from 'vitest';
import {
  deriveAdminConfigurationSchemaReadiness,
  type AdminConfigInspectedTable,
} from './deriveAdminConfigurationSchemaReadiness';
import {
  ADMIN_CONFIG_TARGET_TABLES,
  ADMIN_CONFIG_TARGET_RELATIONSHIPS,
  adminConfigTargetColumnsForTable,
} from './adminConfigurationDataverseSchemaPlan';

function allPresentInspection(): AdminConfigInspectedTable[] {
  return ADMIN_CONFIG_TARGET_TABLES.map((t) => ({
    logicalName: t.logicalName,
    exists: true,
    presentColumns: adminConfigTargetColumnsForTable(t.logicalName).map((c) => c.logicalName),
  }));
}

describe('Phase 142J — admin configuration schema readiness', () => {
  it('is not ready when tables are missing', () => {
    const r = deriveAdminConfigurationSchemaReadiness({ publisherPrefixConfirmed: true });
    expect(r.schemaReady).toBe(false);
    expect(r.tablesMissing.length).toBe(3);
  });

  it('is not ready on a conflicting table', () => {
    const inspected = allPresentInspection();
    inspected[0] = { ...inspected[0], conflicting: true };
    const r = deriveAdminConfigurationSchemaReadiness({ publisherPrefixConfirmed: true, inspectedTables: inspected });
    expect(r.schemaReady).toBe(false);
    expect(r.conflictingTables).toContain('cr664_adminconfigurationproposal');
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('is not ready when the publisher prefix is unconfirmed', () => {
    const r = deriveAdminConfigurationSchemaReadiness({ inspectedTables: allPresentInspection() });
    expect(r.schemaReady).toBe(false);
    expect(r.blockers.some((b) => b.includes('Publisher prefix'))).toBe(true);
  });

  it('is ready when all tables, columns, relationships, and prefix are present', () => {
    const r = deriveAdminConfigurationSchemaReadiness({
      publisherPrefixConfirmed: true,
      inspectedTables: allPresentInspection(),
      relationshipsPresent: ADMIN_CONFIG_TARGET_RELATIONSHIPS.map((rel) => rel.relationshipSchemaName),
    });
    expect(r.schemaReady).toBe(true);
    expect(r.tablesMissing).toEqual([]);
    expect(r.columnsMissing).toEqual([]);
  });

  it('treats a missing optional relationship as a warning, not a blocker', () => {
    const r = deriveAdminConfigurationSchemaReadiness({
      publisherPrefixConfirmed: true,
      inspectedTables: allPresentInspection(),
      relationshipsPresent: [],
    });
    expect(r.schemaReady).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.relationshipsMissing.length).toBe(ADMIN_CONFIG_TARGET_RELATIONSHIPS.length);
  });
});
