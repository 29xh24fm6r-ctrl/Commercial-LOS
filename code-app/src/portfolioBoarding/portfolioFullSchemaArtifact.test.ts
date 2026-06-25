// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildPortfolioFullSchemaArtifact,
  type SpineTableMeta,
} from './portfolioFullSchemaArtifact';
import { EXPECTED_BOARDING_SCHEMA } from './portfolioBoardingRuntimeSchemaGate';

const ROOT = resolve(__dirname, '..', '..');
const SPINE_PATH = resolve(ROOT, 'scripts/dataverse/schema/portfolio-boarding.schema.json');
const FULL_PATH = resolve(ROOT, 'scripts/dataverse/schema/portfolio-boarding.full.schema.json');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

function buildFromSpine() {
  const spine = read(SPINE_PATH);
  const meta: SpineTableMeta[] = spine.tables.map((t: any) => ({
    logicalName: t.logicalName,
    schemaName: t.schemaName,
    entitySetName: t.entitySetName,
    displayCollectionName: t.displayCollectionName,
    auditEnabled: t.auditEnabled,
  }));
  return buildPortfolioFullSchemaArtifact(meta, spine.solutionUniqueName);
}

describe('Phase 253P — full portfolio schema artifact', () => {
  it('describes the full runtime contract: 13 tables / 219 columns / 12 required + 6 optional relationships', () => {
    const a = buildFromSpine();
    expect(a.expectedCounts.tables).toBe(EXPECTED_BOARDING_SCHEMA.tables);
    expect(a.expectedCounts.columns).toBe(EXPECTED_BOARDING_SCHEMA.columns);
    expect(a.expectedCounts.requiredRelationships).toBe(EXPECTED_BOARDING_SCHEMA.requiredRelationships);
    expect(a.expectedCounts.optionalRelationships).toBe(EXPECTED_BOARDING_SCHEMA.optionalRelationships);
    // Hard pin to the V1 contract numbers.
    expect(a.expectedCounts).toEqual({
      tables: 13,
      columns: 219,
      requiredRelationships: 12,
      optionalRelationships: 6,
    });
  });

  it('the committed full schema JSON is in sync with the plan (regenerate with WRITE_FULL_SCHEMA=1)', () => {
    const built = buildFromSpine();
    if (process.env.WRITE_FULL_SCHEMA) {
      writeFileSync(FULL_PATH, JSON.stringify(built, null, 2) + '\n');
    }
    const committed = read(FULL_PATH);
    expect(committed).toEqual(built);
  });

  it('every plan table carries its full column set and the table count is exact', () => {
    const a = buildFromSpine();
    expect(a.tables).toHaveLength(EXPECTED_BOARDING_SCHEMA.tables);
    const total = a.tables.reduce((n, t) => n + t.fullColumns.length, 0);
    expect(total).toBe(EXPECTED_BOARDING_SCHEMA.columns);
    // Each child group table binds back to the root via the shared lookup.
    for (const t of a.tables.filter((x) => !x.isRoot)) {
      expect(t.rootLookup).toBe(a.rootLookupColumn);
    }
  });

  it('entity-set names match the proven deployed spine exactly (no buildout mis-bind)', () => {
    const spine = read(SPINE_PATH);
    const spineSet = new Map(spine.tables.map((t: any) => [t.logicalName, t.entitySetName]));
    for (const t of buildFromSpine().tables) {
      expect(t.entitySetName, t.logicalName).toBe(spineSet.get(t.logicalName));
    }
  });

  it('exactly 12 required child→root relationships, all targeting the root, parental cascade', () => {
    const req = buildFromSpine().relationships.filter((r) => r.required);
    expect(req).toHaveLength(12);
    for (const r of req) {
      expect(r.toTable).toBe('cr664_portfolioboardedloan');
      expect(r.fromColumn).toBe('cr664_PortfolioBoardedLoan');
      expect(r.cascadeBehavior).toBe('Parental');
    }
  });
});
