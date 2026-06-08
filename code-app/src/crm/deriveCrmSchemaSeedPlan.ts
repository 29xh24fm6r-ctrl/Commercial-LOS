/**
 * Phase 141J-K — CRM schema SEED PLAN deriver.
 *
 * A PURE function that turns the read-only CRM inspection report into an
 * actionable, fail-closed seed plan: what to create, what to reuse, which
 * optional links to skip, and whether a live commit is even allowed.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - PURE. No IO, no fetch, no Dataverse calls. Deterministic given inputs.
 *   - FAIL-CLOSED. `safeToCommit` is false whenever the inspection report is
 *     not safe to seed (any conflict, unconfirmed prefix, missing required
 *     lookup target, or ambiguous match).
 *   - Missing tables/columns/relationships become create lists; existing
 *     compatible items become reuse lists; optional links to absent external
 *     targets are skipped (not blockers).
 *   - No fake data. This deriver only names schema objects.
 */

import {
  CRM_TARGET_TABLES,
  CRM_TARGET_RELATIONSHIPS,
  CRM_PUBLISHER_PREFIX,
  ALL_CRM_TARGET_TABLE_LOGICAL_NAMES,
} from './crmDataverseSchemaPlan';
import type {
  CrmSchemaInspectionReport,
  CrmColumnGap,
  CrmInspectedLookupTarget,
} from './deriveCrmSchemaInspectionReport';

export interface CrmSeedPlanInput {
  report: CrmSchemaInspectionReport;
  /** External lookup-target availability (used to skip optional links). */
  lookupTargets?: readonly CrmInspectedLookupTarget[];
}

export const CRM_SEED_MODE_FLAG = '--seed-crm-schema';
export const CRM_SEED_COMMIT_FLAG = '--commit-seed-crm-schema';

export interface CrmSchemaSeedPlan {
  safeToRunDryRun: boolean;
  safeToCommit: boolean;
  tablesToCreate: readonly string[];
  tablesToReuse: readonly string[];
  columnsToCreate: readonly CrmColumnGap[];
  columnsToReuse: number;
  relationshipsToCreate: readonly string[];
  relationshipsToReuse: readonly string[];
  skippedOptionalRelationships: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  seedOrderSummary: readonly string[];
  commitInstructions: string;
}

export function deriveCrmSchemaSeedPlan(
  input: CrmSeedPlanInput,
): CrmSchemaSeedPlan {
  const { report } = input;

  const tablesMissingSet = new Set(report.tablesMissing);
  const tablesFoundSet = new Set(report.tablesFound);

  const unavailableExternalTargets = new Set(
    (input.lookupTargets ?? [])
      .filter((t) => !t.exists || !t.safeAsTarget)
      .map((t) => t.logicalName),
  );

  const relationshipsToCreate: string[] = [];
  const skippedOptionalRelationships: string[] = [];

  // All missing relationships (required + optional) are candidates to create,
  // except optional links whose external target is absent — those are skipped.
  const allMissing = [
    ...report.relationshipsMissing,
    ...report.optionalRelationshipsMissing,
  ];
  for (const gap of allMissing) {
    const plan = CRM_TARGET_RELATIONSHIPS.find(
      (r) => r.relationshipSchemaName === gap.relationshipSchemaName,
    );
    if (!plan) continue;

    const isInternalTarget = ALL_CRM_TARGET_TABLE_LOGICAL_NAMES.includes(plan.toTable);
    const internalTargetAvailable =
      isInternalTarget &&
      (tablesFoundSet.has(plan.toTable) || tablesMissingSet.has(plan.toTable));
    const externalTargetAbsent =
      !isInternalTarget && unavailableExternalTargets.has(plan.toTable);

    if (!plan.required && externalTargetAbsent) {
      skippedOptionalRelationships.push(plan.relationshipSchemaName);
    } else if (isInternalTarget && !internalTargetAvailable) {
      // Internal target neither present nor planned — defer (should not occur
      // for CRM-internal targets, which are always in the seed plan).
      skippedOptionalRelationships.push(plan.relationshipSchemaName);
    } else {
      relationshipsToCreate.push(plan.relationshipSchemaName);
    }
  }

  const seedOrderSummary = [...CRM_TARGET_TABLES]
    .sort((a, b) => a.seedOrder - b.seedOrder)
    .map((t) => t.logicalName);

  // safeToCommit mirrors the inspection report's fail-closed safeToSeed: a
  // commit is only allowed when there are zero blockers (which already encodes
  // prefix confirmation, conflicts, ambiguity, and required-target presence).
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
    commitInstructions: `Review this dry-run, then re-run with ${CRM_SEED_MODE_FLAG} ${CRM_SEED_COMMIT_FLAG} to create the missing CRM schema. Expected publisher prefix: ${CRM_PUBLISHER_PREFIX}.`,
  };
}
