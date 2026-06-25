import { EXPECTED_CRM_SCHEMA } from './crmRuntimeSchemaGate';

/**
 * Phase 253 — Full CRM runtime schema contract.
 *
 * The complete CRM Dataverse schema the runtime requires: 10 tables / 147 columns /
 * 28 relationships, derived from src/crm/crmDataverseSchemaPlan.ts (via EXPECTED_CRM_SCHEMA).
 * This is the bar the operator's full-CRM buildout (create-full-crm-runtime-schema.ps1)
 * and verifier (verify-full-crm-schema.ps1) must satisfy. Unlike the runtime hydration
 * bridge — which gates CRM on tables + columns and treats relationships as a warning —
 * the FULL contract additionally requires all 28 relationships, fail-closed.
 */
export const CRM_FULL_SCHEMA_CONTRACT = Object.freeze({
  tables: EXPECTED_CRM_SCHEMA.tables,
  columns: EXPECTED_CRM_SCHEMA.columns,
  relationships: EXPECTED_CRM_SCHEMA.relationships,
});

export interface CrmFullMeasuredSchema {
  readonly tablesFound: number;
  readonly columnsFound: number;
  readonly relationshipsFound: number;
  readonly conflicts: number;
}

export interface CrmFullSchemaCompleteness {
  readonly complete: boolean;
  readonly blockers: readonly string[];
}

/**
 * Fail-closed: the full CRM schema is complete only when tables, columns, AND
 * relationships all meet the contract with zero conflicts. A missing table, column, OR
 * relationship blocks completeness.
 */
export function isCrmFullSchemaComplete(m: CrmFullMeasuredSchema): CrmFullSchemaCompleteness {
  const blockers: string[] = [];
  if (m.conflicts > 0) blockers.push(`${m.conflicts} schema conflict(s)`);
  if (m.tablesFound < CRM_FULL_SCHEMA_CONTRACT.tables) blockers.push(`tables ${m.tablesFound}/${CRM_FULL_SCHEMA_CONTRACT.tables}`);
  if (m.columnsFound < CRM_FULL_SCHEMA_CONTRACT.columns) blockers.push(`columns ${m.columnsFound}/${CRM_FULL_SCHEMA_CONTRACT.columns}`);
  if (m.relationshipsFound < CRM_FULL_SCHEMA_CONTRACT.relationships) blockers.push(`relationships ${m.relationshipsFound}/${CRM_FULL_SCHEMA_CONTRACT.relationships}`);
  return { complete: blockers.length === 0, blockers };
}
