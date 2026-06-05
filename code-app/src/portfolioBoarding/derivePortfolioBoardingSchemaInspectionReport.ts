/**
 * Phase 140I — Portfolio Boarding schema inspection REPORT deriver.
 *
 * A PURE function that compares the target schema plan against the result of
 * a read-only live Dataverse inspection and returns a fail-closed report:
 * what was found, what is missing, what conflicts, and whether it is safe to
 * proceed to a (future) guarded seed.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - PURE. No IO, no fetch, no Dataverse calls. Deterministic given inputs.
 *   - FAIL-CLOSED. `safeToSeed` is false unless every gate passes:
 *       * no BLOCKED_BY_CONFLICT tables,
 *       * publisher prefix confirmed,
 *       * no required lookup target missing,
 *       * no ambiguous table match.
 *   - Missing target tables alone do NOT block — they are seed candidates.
 *   - Existing reusable tables are allowed.
 */

import {
  PORTFOLIO_BOARDING_TARGET_TABLES,
  PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
  PORTFOLIO_BOARDING_PUBLISHER_PREFIX,
  targetColumnsForTable,
  type TargetTablePlan,
} from './portfolioLoanBoardingDataverseSchemaPlan';

export type TableClassification =
  | 'EXISTS_REUSABLE'
  | 'EXISTS_NEEDS_REVIEW'
  | 'MISSING_CAN_SEED'
  | 'BLOCKED_BY_CONFLICT'
  | 'UNKNOWN';

export interface InspectedTable {
  logicalName: string;
  exists: boolean;
  classification: TableClassification;
  /** Logical names of columns present on the live table (if it exists). */
  presentColumns?: readonly string[];
  /** Columns whose live shape conflicts with the plan (wrong type, etc.). */
  conflictingColumns?: readonly string[];
  /** True when more than one live table ambiguously matches this target. */
  ambiguousMatch?: boolean;
}

export interface InspectedLookupTarget {
  logicalName: string;
  exists: boolean;
  /** Whether this table is safe to use as a lookup target. */
  safeAsTarget: boolean;
  /** Whether a target table is required by the plan (vs optional link). */
  required: boolean;
}

export interface SchemaInspectionInput {
  publisherPrefixConfirmed: boolean;
  /** The confirmed prefix, when known (used only for a warning message). */
  confirmedPrefix?: string;
  inspectedTables: readonly InspectedTable[];
  lookupTargets: readonly InspectedLookupTarget[];
}

export interface ColumnGap {
  tableLogicalName: string;
  columnLogicalName: string;
}

export interface RelationshipGap {
  relationshipSchemaName: string;
  fromTable: string;
  toTable: string;
}

export type RecommendedNextAction =
  | 'resolve-blockers-then-reinspect'
  | 'plan-portfolio-boarding-schema'
  | 'reuse-existing-no-seed-needed';

export interface SchemaInspectionReport {
  tablesFound: readonly string[];
  tablesMissing: readonly string[];
  reusableTables: readonly string[];
  conflictingTables: readonly string[];
  columnsFound: number;
  columnsMissing: readonly ColumnGap[];
  relationshipsFound: readonly string[];
  relationshipsMissing: readonly RelationshipGap[];
  blockers: readonly string[];
  warnings: readonly string[];
  recommendedNextAction: RecommendedNextAction;
  safeToSeed: boolean;
}

function tableDisplay(plan: TargetTablePlan): string {
  return `${plan.displayName} (${plan.logicalName})`;
}

export function derivePortfolioBoardingSchemaInspectionReport(
  input: SchemaInspectionInput,
): SchemaInspectionReport {
  const inspectedByName = new Map<string, InspectedTable>();
  for (const t of input.inspectedTables) inspectedByName.set(t.logicalName, t);

  const tablesFound: string[] = [];
  const tablesMissing: string[] = [];
  const reusableTables: string[] = [];
  const conflictingTables: string[] = [];
  const columnsMissing: ColumnGap[] = [];
  const relationshipsFound: string[] = [];
  const relationshipsMissing: RelationshipGap[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  let columnsFound = 0;

  // --- Per-target-table classification ----------------------------------
  for (const plan of PORTFOLIO_BOARDING_TARGET_TABLES) {
    const inspected = inspectedByName.get(plan.logicalName);

    if (!inspected || inspected.classification === 'UNKNOWN') {
      // No information — treat as a blocker only via the ambiguous/conflict
      // paths below; a truly unknown table is a warning, not a hard block.
      if (inspected?.classification === 'UNKNOWN') {
        warnings.push(`Inspection inconclusive for ${tableDisplay(plan)}.`);
      } else {
        // Not inspected at all → treat as missing seed candidate.
        tablesMissing.push(plan.logicalName);
        for (const c of targetColumnsForTable(plan.logicalName)) {
          columnsMissing.push({
            tableLogicalName: plan.logicalName,
            columnLogicalName: c.logicalName,
          });
        }
      }
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
          blockers.push(
            `Conflicting columns on ${plan.logicalName}: ${inspected.conflictingColumns.join(', ')}.`,
          );
        }
        break;
      }
      case 'EXISTS_REUSABLE': {
        tablesFound.push(plan.logicalName);
        reusableTables.push(plan.logicalName);
        accountForColumns(plan, inspected, () => (columnsFound += 1), columnsMissing);
        if (inspected.conflictingColumns && inspected.conflictingColumns.length > 0) {
          blockers.push(
            `Conflicting columns on reusable ${plan.logicalName}: ${inspected.conflictingColumns.join(', ')}.`,
          );
          conflictingTables.push(plan.logicalName);
        }
        break;
      }
      case 'EXISTS_NEEDS_REVIEW': {
        tablesFound.push(plan.logicalName);
        warnings.push(`${tableDisplay(plan)} exists but needs manual review before reuse.`);
        accountForColumns(plan, inspected, () => (columnsFound += 1), columnsMissing);
        if (inspected.conflictingColumns && inspected.conflictingColumns.length > 0) {
          blockers.push(
            `Conflicting columns on ${plan.logicalName}: ${inspected.conflictingColumns.join(', ')}.`,
          );
          conflictingTables.push(plan.logicalName);
        }
        break;
      }
      case 'MISSING_CAN_SEED': {
        tablesMissing.push(plan.logicalName);
        for (const c of targetColumnsForTable(plan.logicalName)) {
          columnsMissing.push({
            tableLogicalName: plan.logicalName,
            columnLogicalName: c.logicalName,
          });
        }
        break;
      }
    }
  }

  // --- Relationships -----------------------------------------------------
  for (const rel of PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS) {
    const fromInspected = inspectedByName.get(rel.fromTable);
    const present =
      fromInspected?.exists === true &&
      (fromInspected.presentColumns ?? []).some(
        (c) => c.toLowerCase() === rel.fromColumn.toLowerCase(),
      );
    if (present) relationshipsFound.push(rel.relationshipSchemaName);
    else
      relationshipsMissing.push({
        relationshipSchemaName: rel.relationshipSchemaName,
        fromTable: rel.fromTable,
        toTable: rel.toTable,
      });
  }

  // --- Publisher prefix gate --------------------------------------------
  if (!input.publisherPrefixConfirmed) {
    blockers.push(
      `Publisher prefix not confirmed (expected ${PORTFOLIO_BOARDING_PUBLISHER_PREFIX}). Confirm before any seed.`,
    );
  } else if (
    input.confirmedPrefix !== undefined &&
    input.confirmedPrefix !== PORTFOLIO_BOARDING_PUBLISHER_PREFIX
  ) {
    blockers.push(
      `Confirmed prefix "${input.confirmedPrefix}" does not match expected "${PORTFOLIO_BOARDING_PUBLISHER_PREFIX}".`,
    );
  }

  // --- Required lookup targets ------------------------------------------
  for (const lt of input.lookupTargets) {
    if (lt.required && (!lt.exists || !lt.safeAsTarget)) {
      blockers.push(`Required lookup target ${lt.logicalName} is missing or unsafe.`);
    } else if (!lt.required && (!lt.exists || !lt.safeAsTarget)) {
      warnings.push(`Optional lookup target ${lt.logicalName} is unavailable; that lookup will be deferred.`);
    }
  }

  const safeToSeed = blockers.length === 0;

  let recommendedNextAction: RecommendedNextAction;
  if (!safeToSeed) {
    recommendedNextAction = 'resolve-blockers-then-reinspect';
  } else if (tablesMissing.length > 0) {
    recommendedNextAction = 'plan-portfolio-boarding-schema';
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
    blockers,
    warnings,
    recommendedNextAction,
    safeToSeed,
  };
}

function accountForColumns(
  plan: TargetTablePlan,
  inspected: InspectedTable,
  onFound: () => void,
  columnsMissing: ColumnGap[],
): void {
  const present = new Set(
    (inspected.presentColumns ?? []).map((c) => c.toLowerCase()),
  );
  for (const c of targetColumnsForTable(plan.logicalName)) {
    if (present.has(c.logicalName.toLowerCase())) onFound();
    else
      columnsMissing.push({
        tableLogicalName: plan.logicalName,
        columnLogicalName: c.logicalName,
      });
  }
}
