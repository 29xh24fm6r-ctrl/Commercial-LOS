/**
 * Phase 253P — FULL portfolio runtime schema artifact builder.
 *
 * A PURE, deterministic transform from the canonical plan
 * (portfolioLoanBoardingDataverseSchemaPlan.ts — the single source of truth) into the
 * operator-facing JSON contract consumed by the Dataverse buildout + verification
 * scripts (scripts/dataverse/schema/portfolio-boarding.full.schema.json).
 *
 * Why this exists: the live portfolio environment is only the minimal boarding spine
 * (13 tables, ~15 columns, 0 required relationships). The full runtime contract is 219
 * columns / 12 required relationships. The PowerShell buildout/verify scripts cannot
 * import the TypeScript plan, so this builder emits the plan as JSON that those scripts
 * read. A drift test pins the committed JSON to this builder, so the JSON can NEVER
 * silently diverge from the plan.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no fetch, no Dataverse calls. Table-level metadata (schemaName /
 *     entitySetName / displayCollectionName) is INJECTED from the already-proven spine
 *     schema, not invented.
 *   - Additive only. This describes the TARGET; it never describes a delete/rename.
 *   - Lookup columns are listed (so verification counts all 219) but the buildout script
 *     materializes them via relationship creation, never as standalone attributes.
 */

import {
  PORTFOLIO_BOARDING_TARGET_TABLES,
  PORTFOLIO_BOARDING_TARGET_COLUMNS,
  PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
  PORTFOLIO_BOARDING_ROOT_TABLE,
  PORTFOLIO_BOARDING_ROOT_LOOKUP_COLUMN,
} from './portfolioLoanBoardingDataverseSchemaPlan';

/** Table-level metadata injected from the proven spine schema (portfolio-boarding.schema.json). */
export interface SpineTableMeta {
  logicalName: string;
  schemaName: string;
  entitySetName: string;
  displayCollectionName?: string;
  auditEnabled?: boolean;
}

export interface FullSchemaColumn {
  logicalName: string;
  schemaName: string;
  displayName: string;
  type: string;
  requiredLevel: string;
  maxLength?: number;
  precision?: number;
  optionSetKey?: string;
  targets?: readonly string[];
}

export interface FullSchemaTable {
  logicalName: string;
  schemaName: string;
  entitySetName: string;
  displayName: string;
  displayCollectionName: string;
  primaryNameColumn: string;
  ownershipType: string;
  auditEnabled: boolean;
  isRoot: boolean;
  rootLookup?: string;
  fullColumns: FullSchemaColumn[];
}

export interface FullSchemaRelationship {
  schemaName: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  type: 'ManyToOne';
  required: boolean;
  cascadeBehavior: 'Parental' | 'Referential';
}

export interface PortfolioFullSchemaArtifact {
  $comment: string;
  domain: 'portfolio-boarding-full';
  publisherPrefix: string;
  solutionUniqueName: string;
  generatedFromSourceOfTruth: string;
  rootTable: string;
  rootLookupColumn: string;
  expectedCounts: {
    tables: number;
    columns: number;
    requiredRelationships: number;
    optionalRelationships: number;
  };
  tables: FullSchemaTable[];
  relationships: FullSchemaRelationship[];
}

const ARTIFACT_COMMENT =
  'Phase 253P — FULL portfolio boarding runtime schema. GENERATED from ' +
  'src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts via ' +
  'src/portfolioBoarding/portfolioFullSchemaArtifact.ts ' +
  '(regenerate: WRITE_FULL_SCHEMA=1 npx vitest run src/portfolioBoarding/portfolioFullSchemaArtifact.test.ts). ' +
  'Do not hand-edit. Internal OGB names only (cr664_*).';

/** Dataverse entity-set pluralization fallback (used only if the spine meta lacks one). */
function pluralizeEntitySet(logicalName: string): string {
  return logicalName.endsWith('y') ? `${logicalName.slice(0, -1)}ies` : `${logicalName}s`;
}

/**
 * Builds the full schema artifact. `spineMeta` supplies the proven table-level schema
 * names / entity-set names from portfolio-boarding.schema.json so the buildout script
 * binds to the already-deployed tables exactly.
 */
export function buildPortfolioFullSchemaArtifact(
  spineMeta: readonly SpineTableMeta[],
  solutionUniqueName: string,
): PortfolioFullSchemaArtifact {
  const metaByLogical = new Map(spineMeta.map((m) => [m.logicalName, m]));

  const tables: FullSchemaTable[] = PORTFOLIO_BOARDING_TARGET_TABLES.map((t) => {
    const meta = metaByLogical.get(t.logicalName);
    const fullColumns: FullSchemaColumn[] = PORTFOLIO_BOARDING_TARGET_COLUMNS.filter(
      (c) => c.tableLogicalName === t.logicalName,
    ).map((c) => ({
      logicalName: c.logicalName,
      schemaName: c.schemaName,
      displayName: c.displayName,
      type: c.dataType,
      requiredLevel: c.requiredLevel,
      ...(c.maxLength ? { maxLength: c.maxLength } : {}),
      ...(c.precision ? { precision: c.precision } : {}),
      ...(c.optionSetKey ? { optionSetKey: c.optionSetKey } : {}),
      ...(c.targets ? { targets: [...c.targets] } : {}),
    }));
    return {
      logicalName: t.logicalName,
      schemaName: meta?.schemaName ?? t.schemaName,
      entitySetName: meta?.entitySetName ?? pluralizeEntitySet(t.logicalName),
      displayName: t.displayName,
      displayCollectionName: meta?.displayCollectionName ?? t.pluralDisplayName,
      primaryNameColumn: t.primaryNameColumn,
      ownershipType: t.ownershipType,
      auditEnabled: meta?.auditEnabled ?? true,
      isRoot: t.logicalName === PORTFOLIO_BOARDING_ROOT_TABLE,
      ...(t.parentTableLogicalName ? { rootLookup: PORTFOLIO_BOARDING_ROOT_LOOKUP_COLUMN } : {}),
      fullColumns,
    };
  });

  const relationships: FullSchemaRelationship[] = PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS.map((r) => ({
    schemaName: r.relationshipSchemaName,
    fromTable: r.fromTable,
    fromColumn: r.fromColumn,
    toTable: r.toTable,
    type: r.cardinality,
    required: r.required,
    cascadeBehavior: r.cascadeBehavior,
  }));

  return {
    $comment: ARTIFACT_COMMENT,
    domain: 'portfolio-boarding-full',
    publisherPrefix: 'cr664',
    solutionUniqueName,
    generatedFromSourceOfTruth:
      'src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts#PORTFOLIO_BOARDING_TARGET_COLUMNS',
    rootTable: PORTFOLIO_BOARDING_ROOT_TABLE,
    rootLookupColumn: PORTFOLIO_BOARDING_ROOT_LOOKUP_COLUMN,
    expectedCounts: {
      tables: tables.length,
      columns: tables.reduce((n, t) => n + t.fullColumns.length, 0),
      requiredRelationships: relationships.filter((r) => r.required).length,
      optionalRelationships: relationships.filter((r) => !r.required).length,
    },
    tables,
    relationships,
  };
}
