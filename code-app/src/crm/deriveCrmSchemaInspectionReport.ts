/**
 * Phase 141J-K — CRM schema inspection REPORT deriver.
 *
 * A PURE function that compares the CRM target schema plan against the result
 * of a read-only live Dataverse inspection and returns a fail-closed report:
 * what was found, what is missing, what conflicts, and whether it is safe to
 * proceed to the guarded seed.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - PURE. No IO, no fetch, no Dataverse calls. Deterministic given inputs.
 *   - FAIL-CLOSED. `safeToSeed` is false unless every gate passes:
 *       * no BLOCKED_BY_CONFLICT tables,
 *       * publisher prefix confirmed,
 *       * no required lookup target missing,
 *       * no ambiguous table match.
 *   - Missing CRM tables alone do NOT block — they are seed candidates.
 *   - A missing OPTIONAL external lookup target (portfolio boarded loan,
 *     originated loan deal, team, platform user, systemuser) is a warning, and
 *     the optional relationship is recorded as missing — never a blocker.
 *   - No fake data.
 */

import {
  CRM_TARGET_TABLES,
  CRM_TARGET_RELATIONSHIPS,
  CRM_PUBLISHER_PREFIX,
  CRM_OPTIONAL_EXTERNAL_TARGETS,
  ALL_CRM_TARGET_TABLE_LOGICAL_NAMES,
  crmTargetColumnsForTable,
  type CrmTargetTablePlan,
} from './crmDataverseSchemaPlan';

export type CrmTableClassification =
  | 'EXISTS_REUSABLE'
  | 'EXISTS_NEEDS_REVIEW'
  | 'MISSING_CAN_SEED'
  | 'BLOCKED_BY_CONFLICT'
  | 'UNKNOWN';

export interface CrmInspectedTable {
  logicalName: string;
  exists: boolean;
  classification: CrmTableClassification;
  /** Logical names of columns present on the live table (if it exists). */
  presentColumns?: readonly string[];
  /** Columns whose live shape conflicts with the plan (wrong type, etc.). */
  conflictingColumns?: readonly string[];
  /** True when more than one live table ambiguously matches this target. */
  ambiguousMatch?: boolean;
}

export interface CrmInspectedLookupTarget {
  logicalName: string;
  exists: boolean;
  /** Whether this table is safe to use as a lookup target. */
  safeAsTarget: boolean;
  /** Whether a target table is required by the plan (vs optional link). */
  required: boolean;
}

export interface CrmSchemaInspectionInput {
  publisherPrefixConfirmed: boolean;
  /** The confirmed prefix, when known (used only for a warning message). */
  confirmedPrefix?: string;
  inspectedTables: readonly CrmInspectedTable[];
  lookupTargets: readonly CrmInspectedLookupTarget[];
}

export interface CrmColumnGap {
  tableLogicalName: string;
  columnLogicalName: string;
}

export interface CrmRelationshipGap {
  relationshipSchemaName: string;
  fromTable: string;
  toTable: string;
}

export type CrmRecommendedNextAction =
  | 'resolve-blockers-then-reinspect'
  | 'plan-crm-schema'
  | 'seed-crm-schema'
  | 'reuse-existing-no-seed-needed';

export interface CrmSchemaInspectionReport {
  tablesFound: readonly string[];
  tablesMissing: readonly string[];
  reusableTables: readonly string[];
  conflictingTables: readonly string[];
  columnsFound: number;
  columnsMissing: readonly CrmColumnGap[];
  relationshipsFound: readonly string[];
  relationshipsMissing: readonly CrmRelationshipGap[];
  optionalRelationshipsMissing: readonly CrmRelationshipGap[];
  blockers: readonly string[];
  warnings: readonly string[];
  recommendedNextAction: CrmRecommendedNextAction;
  safeToSeed: boolean;
}

function tableDisplay(plan: CrmTargetTablePlan): string {
  return `${plan.displayName} (${plan.logicalName})`;
}

export function deriveCrmSchemaInspectionReport(
  input: CrmSchemaInspectionInput,
): CrmSchemaInspectionReport {
  const inspectedByName = new Map<string, CrmInspectedTable>();
  for (const t of input.inspectedTables) inspectedByName.set(t.logicalName, t);

  const tablesFound: string[] = [];
  const tablesMissing: string[] = [];
  const reusableTables: string[] = [];
  const conflictingTables: string[] = [];
  const columnsMissing: CrmColumnGap[] = [];
  const relationshipsFound: string[] = [];
  const relationshipsMissing: CrmRelationshipGap[] = [];
  const optionalRelationshipsMissing: CrmRelationshipGap[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  let columnsFound = 0;

  // --- Per-target-table classification ----------------------------------
  for (const plan of CRM_TARGET_TABLES) {
    const inspected = inspectedByName.get(plan.logicalName);

    if (!inspected) {
      // Not inspected at all → treat as a missing seed candidate.
      tablesMissing.push(plan.logicalName);
      for (const c of crmTargetColumnsForTable(plan.logicalName)) {
        columnsMissing.push({
          tableLogicalName: plan.logicalName,
          columnLogicalName: c.logicalName,
        });
      }
      continue;
    }

    if (inspected.classification === 'UNKNOWN') {
      warnings.push(`Inspection inconclusive for ${tableDisplay(plan)}.`);
      continue;
    }

    if (inspected.ambiguousMatch) {
      blockers.push(`Ambiguous live match for ${tableDisplay(plan)} — resolve manually before seeding.`);
      conflictingTables.push(plan.logicalName);
      continue;
    }

    switch (inspected.classification) {
      case 'BLOCKED_BY_CONFLICT': {
        conflictingTables.push(plan.logicalName);
        blockers.push(`Conflicting legacy artifact at ${tableDisplay(plan)} — resolve manually.`);
        if (inspected.conflictingColumns && inspected.conflictingColumns.length > 0) {
          blockers.push(`Conflicting columns on ${plan.logicalName}: ${inspected.conflictingColumns.join(', ')}.`);
        }
        break;
      }
      case 'EXISTS_REUSABLE': {
        tablesFound.push(plan.logicalName);
        reusableTables.push(plan.logicalName);
        accountForColumns(plan, inspected, () => (columnsFound += 1), columnsMissing);
        if (inspected.conflictingColumns && inspected.conflictingColumns.length > 0) {
          blockers.push(`Conflicting columns on reusable ${plan.logicalName}: ${inspected.conflictingColumns.join(', ')}.`);
          conflictingTables.push(plan.logicalName);
        }
        break;
      }
      case 'EXISTS_NEEDS_REVIEW': {
        tablesFound.push(plan.logicalName);
        warnings.push(`${tableDisplay(plan)} exists but needs manual review before reuse.`);
        accountForColumns(plan, inspected, () => (columnsFound += 1), columnsMissing);
        if (inspected.conflictingColumns && inspected.conflictingColumns.length > 0) {
          blockers.push(`Conflicting columns on ${plan.logicalName}: ${inspected.conflictingColumns.join(', ')}.`);
          conflictingTables.push(plan.logicalName);
        }
        break;
      }
      case 'MISSING_CAN_SEED': {
        tablesMissing.push(plan.logicalName);
        for (const c of crmTargetColumnsForTable(plan.logicalName)) {
          columnsMissing.push({
            tableLogicalName: plan.logicalName,
            columnLogicalName: c.logicalName,
          });
        }
        break;
      }
    }
  }

  // --- Lookup-target availability ---------------------------------------
  // A CRM-internal target is available if it exists OR is in the seed plan
  // (missing CRM tables are created in-plan). An external target's absence is
  // a warning only when the relationship is optional.
  const externalTargetUnavailable = new Set<string>();
  for (const lt of input.lookupTargets) {
    const available = lt.exists && lt.safeAsTarget;
    if (available) continue;
    if (lt.required) {
      blockers.push(`Required lookup target ${lt.logicalName} is missing or unsafe.`);
    } else {
      externalTargetUnavailable.add(lt.logicalName);
      if (CRM_OPTIONAL_EXTERNAL_TARGETS.includes(lt.logicalName)) {
        warnings.push(`Optional external lookup target ${lt.logicalName} is unavailable; that lookup will be skipped (core CRM seed is unaffected).`);
      } else {
        warnings.push(`Optional lookup target ${lt.logicalName} is unavailable; that lookup will be deferred.`);
      }
    }
  }

  // --- Relationships -----------------------------------------------------
  const tablesMissingSet = new Set(tablesMissing);
  for (const r of CRM_TARGET_RELATIONSHIPS) {
    const fromInspected = inspectedByName.get(r.fromTable);
    const present =
      fromInspected?.exists === true &&
      (fromInspected.presentColumns ?? []).some(
        (c) => c.toLowerCase() === r.fromColumn.toLowerCase(),
      );
    if (present) {
      relationshipsFound.push(r.relationshipSchemaName);
      continue;
    }
    const gap: CrmRelationshipGap = {
      relationshipSchemaName: r.relationshipSchemaName,
      fromTable: r.fromTable,
      toTable: r.toTable,
    };
    const isInternalTarget = ALL_CRM_TARGET_TABLE_LOGICAL_NAMES.includes(r.toTable);
    const internalTargetAvailable =
      isInternalTarget &&
      (tablesFound.includes(r.toTable) || tablesMissingSet.has(r.toTable));
    const externalTargetMissing =
      !isInternalTarget && externalTargetUnavailable.has(r.toTable);

    if (r.required) {
      relationshipsMissing.push(gap);
    } else if (externalTargetMissing || (!isInternalTarget && !internalTargetAvailable)) {
      // Optional link to an absent external target → optional-missing only.
      optionalRelationshipsMissing.push(gap);
    } else {
      optionalRelationshipsMissing.push(gap);
    }
  }

  // --- Publisher prefix gate --------------------------------------------
  if (!input.publisherPrefixConfirmed) {
    blockers.push(`Publisher prefix not confirmed (expected ${CRM_PUBLISHER_PREFIX}). Confirm before any seed.`);
  } else if (
    input.confirmedPrefix !== undefined &&
    input.confirmedPrefix !== CRM_PUBLISHER_PREFIX
  ) {
    blockers.push(`Confirmed prefix "${input.confirmedPrefix}" does not match expected "${CRM_PUBLISHER_PREFIX}".`);
  }

  const safeToSeed = blockers.length === 0;

  let recommendedNextAction: CrmRecommendedNextAction;
  if (!safeToSeed) {
    recommendedNextAction = 'resolve-blockers-then-reinspect';
  } else if (tablesMissing.length > 0 || columnsMissing.length > 0) {
    recommendedNextAction = 'plan-crm-schema';
  } else {
    recommendedNextAction = 'reuse-existing-no-seed-needed';
  }

  return {
    tablesFound,
    tablesMissing,
    reusableTables,
    conflictingTables,
    columnsFound,
    columnsMissing,
    relationshipsFound,
    relationshipsMissing,
    optionalRelationshipsMissing,
    blockers,
    warnings,
    recommendedNextAction,
    safeToSeed,
  };
}

function accountForColumns(
  plan: CrmTargetTablePlan,
  inspected: CrmInspectedTable,
  onFound: () => void,
  columnsMissing: CrmColumnGap[],
): void {
  const present = new Set(
    (inspected.presentColumns ?? []).map((c) => c.toLowerCase()),
  );
  for (const c of crmTargetColumnsForTable(plan.logicalName)) {
    if (present.has(c.logicalName.toLowerCase())) onFound();
    else
      columnsMissing.push({
        tableLogicalName: plan.logicalName,
        columnLogicalName: c.logicalName,
      });
  }
}
