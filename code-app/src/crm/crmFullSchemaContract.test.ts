// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CRM_FULL_SCHEMA_CONTRACT,
  isCrmFullSchemaComplete,
} from './crmFullSchemaContract';
import { EXPECTED_CRM_SCHEMA } from './crmRuntimeSchemaGate';
import {
  CRM_TARGET_TABLES,
  CRM_TARGET_RELATIONSHIPS,
  crmTargetColumnsForTable,
} from './crmDataverseSchemaPlan';

const ROOT = resolve(__dirname, '..', '..');
const crmFull = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/dataverse/schema/crm-full.schema.json'), 'utf8').replace(/^﻿/, ''),
);

const FULL = { tablesFound: 10, columnsFound: 147, relationshipsFound: 28, conflicts: 0 };

describe('Phase 253 — full CRM runtime schema contract', () => {
  it('pins the CRM contract at 10 tables / 147 columns / 28 relationships', () => {
    expect(CRM_FULL_SCHEMA_CONTRACT).toEqual({ tables: 10, columns: 147, relationships: 28 });
    expect(EXPECTED_CRM_SCHEMA.tables).toBe(10);
    expect(EXPECTED_CRM_SCHEMA.columns).toBe(147);
    expect(EXPECTED_CRM_SCHEMA.relationships).toBe(28);
  });

  it('a full measurement is complete; missing table / column / relationship each fails closed', () => {
    expect(isCrmFullSchemaComplete(FULL).complete).toBe(true);
    expect(isCrmFullSchemaComplete({ ...FULL, tablesFound: 9 }).complete).toBe(false);
    expect(isCrmFullSchemaComplete({ ...FULL, columnsFound: 146 }).complete).toBe(false);
    expect(isCrmFullSchemaComplete({ ...FULL, relationshipsFound: 27 }).complete).toBe(false);
    expect(isCrmFullSchemaComplete({ ...FULL, conflicts: 1 }).complete).toBe(false);
    // The Phase 252 live spine (5 tables / 40 cols / 0 rels) is incomplete.
    expect(isCrmFullSchemaComplete({ tablesFound: 5, columnsFound: 40, relationshipsFound: 0, conflicts: 0 }).complete).toBe(false);
  });

  it('crm-full.schema.json is consistent with the plan (references every table, column, relationship)', () => {
    expect(crmFull.expected).toEqual({ tables: 10, columns: 147, relationships: 28 });
    expect(crmFull.tables).toHaveLength(CRM_TARGET_TABLES.length);
    expect(crmFull.relationships).toHaveLength(CRM_TARGET_RELATIONSHIPS.length);

    // Every plan table is present with exactly its non-name columns.
    for (const t of CRM_TARGET_TABLES) {
      const jt = crmFull.tables.find((x: { logicalName: string }) => x.logicalName === t.logicalName);
      expect(jt, t.logicalName).toBeTruthy();
      const planCols = crmTargetColumnsForTable(t.logicalName)
        .filter((c) => c.logicalName !== t.primaryNameColumn)
        .map((c) => c.logicalName)
        .sort();
      const jsonCols = jt.requiredColumns.map((c: { logicalName: string }) => c.logicalName).sort();
      expect(jsonCols, t.logicalName).toEqual(planCols);
    }

    // Every plan relationship is present with the correct target.
    for (const r of CRM_TARGET_RELATIONSHIPS) {
      const jr = crmFull.relationships.find((x: { schemaName: string }) => x.schemaName === r.relationshipSchemaName);
      expect(jr, r.relationshipSchemaName).toBeTruthy();
      expect(jr.toTable, r.relationshipSchemaName).toBe(r.toTable);
      expect(jr.fromTable, r.relationshipSchemaName).toBe(r.fromTable);
    }

    const totalCols = crmFull.tables.reduce((a: number, t: { requiredColumns: unknown[] }) => a + t.requiredColumns.length, 0);
    expect(totalCols).toBe(147);
  });
});
