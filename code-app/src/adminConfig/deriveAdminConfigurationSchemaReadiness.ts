/**
 * Phase 142J — Admin configuration schema READINESS deriver.
 *
 * PURE, READ-ONLY. Compares the target schema plan against a read-only inspection
 * of the live environment and returns a fail-closed readiness state. It creates
 * NO schema, seeds NOTHING, and writes NOTHING. `schemaReady` is true ONLY when
 * every planned table + column exists, there are no conflicts, and the publisher
 * prefix is confirmed. Missing tables/columns → schema_not_ready; conflicts →
 * blocker; missing OPTIONAL relationships → warning.
 */

import {
  ADMIN_CONFIG_TARGET_TABLES,
  ADMIN_CONFIG_TARGET_RELATIONSHIPS,
  ADMIN_CONFIG_PERSISTENCE_PUBLISHER_PREFIX,
  adminConfigTargetColumnsForTable,
} from './adminConfigurationDataverseSchemaPlan';
import type { AdminConfigurationPersistenceSchemaState } from './adminConfigurationPersistenceTypes';

export interface AdminConfigInspectedTable {
  logicalName: string;
  exists: boolean;
  /** Present column logical names on the live table. */
  presentColumns?: readonly string[];
  /** True when the live table conflicts with the plan. */
  conflicting?: boolean;
}

export interface DeriveAdminConfigSchemaReadinessInput {
  publisherPrefixConfirmed?: boolean;
  confirmedPrefix?: string;
  inspectedTables?: readonly AdminConfigInspectedTable[];
  /** Relationship schema names confirmed present in the live environment. */
  relationshipsPresent?: readonly string[];
}

export function deriveAdminConfigurationSchemaReadiness(
  input: DeriveAdminConfigSchemaReadinessInput = {},
): AdminConfigurationPersistenceSchemaState {
  const inspectedByName = new Map((input.inspectedTables ?? []).map((t) => [t.logicalName, t]));

  const tablesFound: string[] = [];
  const tablesMissing: string[] = [];
  const conflictingTables: string[] = [];
  const columnsMissing: { tableLogicalName: string; columnLogicalName: string }[] = [];
  const relationshipsMissing: { relationshipSchemaName: string; fromTable: string; toTable: string }[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const plan of ADMIN_CONFIG_TARGET_TABLES) {
    const inspected = inspectedByName.get(plan.logicalName);
    if (!inspected || inspected.exists !== true) {
      tablesMissing.push(plan.logicalName);
      for (const c of adminConfigTargetColumnsForTable(plan.logicalName)) {
        columnsMissing.push({ tableLogicalName: plan.logicalName, columnLogicalName: c.logicalName });
      }
      continue;
    }
    if (inspected.conflicting === true) {
      conflictingTables.push(plan.logicalName);
      blockers.push(`Conflicting live artifact at ${plan.displayName} (${plan.logicalName}) — resolve manually before any future seed.`);
      continue;
    }
    tablesFound.push(plan.logicalName);
    const present = new Set((inspected.presentColumns ?? []).map((c) => c.toLowerCase()));
    for (const c of adminConfigTargetColumnsForTable(plan.logicalName)) {
      if (!present.has(c.logicalName.toLowerCase())) {
        columnsMissing.push({ tableLogicalName: plan.logicalName, columnLogicalName: c.logicalName });
      }
    }
  }

  const presentRels = new Set(input.relationshipsPresent ?? []);
  for (const rel of ADMIN_CONFIG_TARGET_RELATIONSHIPS) {
    if (!presentRels.has(rel.relationshipSchemaName)) {
      relationshipsMissing.push({ relationshipSchemaName: rel.relationshipSchemaName, fromTable: rel.fromTable, toTable: rel.toTable });
      warnings.push(`Optional relationship ${rel.relationshipSchemaName} is not present; it will be deferred.`);
    }
  }

  if (input.publisherPrefixConfirmed !== true) {
    blockers.push(`Publisher prefix not confirmed (expected ${ADMIN_CONFIG_PERSISTENCE_PUBLISHER_PREFIX}).`);
  } else if (input.confirmedPrefix !== undefined && input.confirmedPrefix !== ADMIN_CONFIG_PERSISTENCE_PUBLISHER_PREFIX) {
    blockers.push(`Confirmed prefix "${input.confirmedPrefix}" does not match expected "${ADMIN_CONFIG_PERSISTENCE_PUBLISHER_PREFIX}".`);
  }

  const schemaReady =
    tablesMissing.length === 0 &&
    conflictingTables.length === 0 &&
    columnsMissing.length === 0 &&
    blockers.length === 0;

  return {
    schemaReady,
    tablesFound,
    tablesMissing,
    conflictingTables,
    columnsMissing,
    relationshipsMissing,
    blockers,
    warnings,
  };
}
