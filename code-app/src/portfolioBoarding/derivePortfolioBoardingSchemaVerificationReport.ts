/**
 * Phase 140K — Portfolio Boarding schema VERIFICATION report deriver.
 *
 * A PURE function that verifies a live inspection against the full target
 * schema plan and reports whether the schema is a candidate for (a future)
 * governed runtime persistence — distinguishing REQUIRED items (whose absence
 * is a blocker) from the OPTIONAL evidence→document lookup (whose absence is
 * only a warning).
 *
 * Discipline (HARD rules — pinned by tests):
 *   - PURE. No IO, no fetch, no Dataverse calls. Deterministic given inputs.
 *   - `safeForRuntimePersistenceCandidate` is a CANDIDATE signal only — it
 *     never enables persistence. It is false if any required table, required
 *     column, or required child→root relationship is missing, or any table
 *     conflicts.
 *   - A missing OPTIONAL relationship (evidence→document) is a warning.
 *   - All counts derive from the schema plan. No fake data.
 */

import {
  PORTFOLIO_BOARDING_TARGET_TABLES,
  PORTFOLIO_BOARDING_TARGET_COLUMNS,
  PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
  targetColumnsForTable,
} from './portfolioLoanBoardingDataverseSchemaPlan';
import type {
  InspectedTable,
  ColumnGap,
} from './derivePortfolioBoardingSchemaInspectionReport';

export interface VerificationInput {
  inspectedTables: readonly InspectedTable[];
}

export interface RelationshipGapRef {
  relationshipSchemaName: string;
  fromTable: string;
  toTable: string;
}

export interface SchemaVerificationReport {
  expectedTableCount: number;
  foundTableCount: number;
  missingTables: readonly string[];
  expectedColumnCount: number;
  missingColumns: readonly ColumnGap[];
  expectedRequiredRelationshipCount: number;
  foundRequiredRelationships: readonly string[];
  missingRequiredRelationships: readonly RelationshipGapRef[];
  expectedOptionalRelationshipCount: number;
  foundOptionalRelationships: readonly string[];
  missingOptionalRelationships: readonly RelationshipGapRef[];
  warnings: readonly string[];
  blockers: readonly string[];
  safeForRuntimePersistenceCandidate: boolean;
}

function isFoundClassification(t: InspectedTable | undefined): boolean {
  return (
    t !== undefined &&
    t.exists === true &&
    (t.classification === 'EXISTS_REUSABLE' ||
      t.classification === 'EXISTS_NEEDS_REVIEW')
  );
}

export function derivePortfolioBoardingSchemaVerificationReport(
  input: VerificationInput,
): SchemaVerificationReport {
  const byName = new Map<string, InspectedTable>();
  for (const t of input.inspectedTables) byName.set(t.logicalName, t);

  const blockers: string[] = [];
  const warnings: string[] = [];

  // --- Tables ------------------------------------------------------------
  const missingTables: string[] = [];
  let foundTableCount = 0;
  for (const plan of PORTFOLIO_BOARDING_TARGET_TABLES) {
    const inspected = byName.get(plan.logicalName);
    if (inspected?.classification === 'BLOCKED_BY_CONFLICT') {
      blockers.push(`Conflicting table ${plan.logicalName} blocks verification.`);
      missingTables.push(plan.logicalName);
      continue;
    }
    if (isFoundClassification(inspected)) {
      foundTableCount += 1;
    } else {
      missingTables.push(plan.logicalName);
      blockers.push(`Required table ${plan.logicalName} is missing.`);
    }
  }

  // Columns that BACK an optional relationship are themselves optional — their
  // absence is reported via the optional-relationship warning, never as a
  // required-column blocker. (e.g. the evidence→document lookup, and the root
  // external lookups.)
  const optionalLookupColumns = new Set(
    PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS.filter((r) => !r.required).map(
      (r) => `${r.fromTable}::${r.fromColumn.toLowerCase()}`,
    ),
  );

  // --- Columns -----------------------------------------------------------
  const missingColumns: ColumnGap[] = [];
  for (const plan of PORTFOLIO_BOARDING_TARGET_TABLES) {
    const inspected = byName.get(plan.logicalName);
    const present = new Set(
      (inspected?.presentColumns ?? []).map((c) => c.toLowerCase()),
    );
    const tableFound = isFoundClassification(inspected);
    for (const col of targetColumnsForTable(plan.logicalName)) {
      // Skip optional-relationship lookup columns — they are not required.
      if (
        optionalLookupColumns.has(
          `${plan.logicalName}::${col.logicalName.toLowerCase()}`,
        )
      ) {
        continue;
      }
      // A column is "missing" if its table is missing, or the table exists
      // but the column is absent.
      if (!tableFound || !present.has(col.logicalName.toLowerCase())) {
        missingColumns.push({
          tableLogicalName: plan.logicalName,
          columnLogicalName: col.logicalName,
        });
      }
    }
  }
  if (missingColumns.length > 0) {
    blockers.push(`${missingColumns.length} required column(s) are missing.`);
  }

  // --- Relationships -----------------------------------------------------
  const foundRequiredRelationships: string[] = [];
  const missingRequiredRelationships: RelationshipGapRef[] = [];
  const foundOptionalRelationships: string[] = [];
  const missingOptionalRelationships: RelationshipGapRef[] = [];

  let expectedRequiredRelationshipCount = 0;
  let expectedOptionalRelationshipCount = 0;

  for (const rel of PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS) {
    const from = byName.get(rel.fromTable);
    const present =
      from?.exists === true &&
      (from.presentColumns ?? []).some(
        (c) => c.toLowerCase() === rel.fromColumn.toLowerCase(),
      );
    const ref: RelationshipGapRef = {
      relationshipSchemaName: rel.relationshipSchemaName,
      fromTable: rel.fromTable,
      toTable: rel.toTable,
    };
    if (rel.required) {
      expectedRequiredRelationshipCount += 1;
      if (present) foundRequiredRelationships.push(rel.relationshipSchemaName);
      else {
        missingRequiredRelationships.push(ref);
        blockers.push(
          `Required child→root relationship ${rel.relationshipSchemaName} is missing.`,
        );
      }
    } else {
      expectedOptionalRelationshipCount += 1;
      if (present) foundOptionalRelationships.push(rel.relationshipSchemaName);
      else {
        missingOptionalRelationships.push(ref);
        warnings.push(
          `Optional relationship ${rel.relationshipSchemaName} is missing (warning, not a blocker).`,
        );
      }
    }
  }

  return {
    expectedTableCount: PORTFOLIO_BOARDING_TARGET_TABLES.length,
    foundTableCount,
    missingTables,
    expectedColumnCount: PORTFOLIO_BOARDING_TARGET_COLUMNS.length,
    missingColumns,
    expectedRequiredRelationshipCount,
    foundRequiredRelationships,
    missingRequiredRelationships,
    expectedOptionalRelationshipCount,
    foundOptionalRelationships,
    missingOptionalRelationships,
    warnings,
    blockers,
    safeForRuntimePersistenceCandidate: blockers.length === 0,
  };
}
