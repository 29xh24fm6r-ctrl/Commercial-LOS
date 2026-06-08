/**
 * Phase 140J — Portfolio Boarding schema SEED PLAN deriver.
 *
 * A PURE function that turns the read-only inspection report (Phase 140I)
 * into an actionable, fail-closed seed plan: what to create, what to reuse,
 * what optional links to skip, and whether a live commit is even allowed.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - PURE. No IO, no fetch, no Dataverse calls. Deterministic given inputs.
 *   - FAIL-CLOSED. `safeToCommit` is false whenever the inspection report is
 *     not safe to seed (any conflict, unconfirmed prefix, missing required
 *     lookup target, or ambiguous match).
 *   - Missing tables/columns/relationships become create lists; existing
 *     compatible items become reuse lists; optional links to absent targets
 *     are skipped (not blockers).
 *   - No fake data. This deriver only names schema objects.
 */

import {
  PORTFOLIO_BOARDING_TARGET_TABLES,
  PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
  PORTFOLIO_BOARDING_PUBLISHER_PREFIX,
  ALL_TARGET_TABLE_LOGICAL_NAMES,
} from './portfolioLoanBoardingDataverseSchemaPlan';
import type {
  SchemaInspectionReport,
  ColumnGap,
  InspectedLookupTarget,
} from './derivePortfolioBoardingSchemaInspectionReport';

export interface SeedPlanInput {
  report: SchemaInspectionReport;
  /** External lookup-target availability (used to skip optional links). */
  lookupTargets?: readonly InspectedLookupTarget[];
}

export const SEED_COMMIT_FLAG = '--commit-seed-portfolio-boarding-schema';
export const SEED_MODE_FLAG = '--seed-portfolio-boarding-schema';

export interface SchemaSeedPlan {
  safeToRunDryRun: boolean;
  safeToCommit: boolean;
  tablesToCreate: readonly string[];
  tablesToReuse: readonly string[];
  columnsToCreate: readonly ColumnGap[];
  columnsToReuse: number;
  relationshipsToCreate: readonly string[];
  relationshipsToReuse: readonly string[];
  skippedOptionalRelationships: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  seedOrderSummary: readonly string[];
  commitInstructions: string;
}

export function derivePortfolioBoardingSchemaSeedPlan(
  input: SeedPlanInput,
): SchemaSeedPlan {
  const { report } = input;

  const unavailableExternalTargets = new Set(
    (input.lookupTargets ?? [])
      .filter((t) => !t.exists || !t.safeAsTarget)
      .map((t) => t.logicalName),
  );

  const relationshipsToCreate: string[] = [];
  const skippedOptionalRelationships: string[] = [];

  for (const gap of report.relationshipsMissing) {
    const plan = PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS.find(
      (r) => r.relationshipSchemaName === gap.relationshipSchemaName,
    );
    if (!plan) continue;
    const isExternalTarget = !ALL_TARGET_TABLE_LOGICAL_NAMES.includes(plan.toTable);
    if (
      !plan.required &&
      isExternalTarget &&
      unavailableExternalTargets.has(plan.toTable)
    ) {
      // Optional link to an absent external target → skip, not a blocker.
      skippedOptionalRelationships.push(plan.relationshipSchemaName);
    } else {
      relationshipsToCreate.push(plan.relationshipSchemaName);
    }
  }

  // Seed order summary: target tables ordered by their declared seedOrder.
  const seedOrderSummary = [...PORTFOLIO_BOARDING_TARGET_TABLES]
    .sort((a, b) => a.seedOrder - b.seedOrder)
    .map((t) => t.logicalName);

  // safeToCommit mirrors the inspection report's fail-closed safeToSeed: a
  // commit is only allowed when there are zero blockers (which already
  // encodes prefix confirmation, conflicts, ambiguity, and required-target
  // availability).
  const safeToCommit = report.safeToSeed && report.blockers.length === 0;

  return {
    safeToRunDryRun: true,
    safeToCommit,
    tablesToCreate: report.tablesMissing,
    tablesToReuse: report.reusableTables,
    columnsToCreate: report.columnsMissing,
    columnsToReuse: report.columnsFound,
    relationshipsToCreate,
    relationshipsToReuse: report.relationshipsFound,
    skippedOptionalRelationships,
    blockers: report.blockers,
    warnings: report.warnings,
    seedOrderSummary,
    commitInstructions: `Review this dry-run, then re-run with ${SEED_MODE_FLAG} ${SEED_COMMIT_FLAG} to create the missing schema. Expected publisher prefix: ${PORTFOLIO_BOARDING_PUBLISHER_PREFIX}.`,
  };
}
