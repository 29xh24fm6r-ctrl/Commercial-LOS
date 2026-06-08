import { describe, it, expect } from 'vitest';
import { derivePortfolioBoardingSchemaVerificationReport } from './derivePortfolioBoardingSchemaVerificationReport';
import {
  PORTFOLIO_BOARDING_TARGET_TABLES,
  PORTFOLIO_BOARDING_ROOT_TABLE,
  targetColumnsForTable,
} from './portfolioLoanBoardingDataverseSchemaPlan';
import type {
  InspectedTable,
  TableClassification,
} from './derivePortfolioBoardingSchemaInspectionReport';

/**
 * Phase 140K — Portfolio Boarding schema VERIFICATION report pins.
 *
 * Required tables/columns/child→root relationships gate the candidate flag;
 * the optional evidence→document lookup is only a warning.
 */

const EVIDENCE_TABLE = 'cr664_portfolioboardedloanevidence';
const DOCUMENT_TABLE = 'cr664_portfolioboardedloandocument';
const EVIDENCE_DOC_LOOKUP = 'cr664_portfolioboardedloandocument'; // lookup column logical name

/** Every target table present with every target column (incl. lookups). */
function fullyPresentTables(): InspectedTable[] {
  return PORTFOLIO_BOARDING_TARGET_TABLES.map((plan) => ({
    logicalName: plan.logicalName,
    exists: true,
    classification: 'EXISTS_REUSABLE' as TableClassification,
    presentColumns: targetColumnsForTable(plan.logicalName).map((c) => c.logicalName),
  }));
}

function withTable(
  tables: InspectedTable[],
  logicalName: string,
  patch: Partial<InspectedTable>,
): InspectedTable[] {
  return tables.map((t) => (t.logicalName === logicalName ? { ...t, ...patch } : t));
}

describe('Phase 140K — a fully-present schema is a runtime-persistence candidate', () => {
  it('reports safeForRuntimePersistenceCandidate true with no blockers', () => {
    const r = derivePortfolioBoardingSchemaVerificationReport({
      inspectedTables: fullyPresentTables(),
    });
    expect(r.safeForRuntimePersistenceCandidate).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.missingTables).toEqual([]);
    expect(r.missingColumns).toEqual([]);
    expect(r.missingRequiredRelationships).toEqual([]);
    expect(r.foundTableCount).toBe(PORTFOLIO_BOARDING_TARGET_TABLES.length);
    expect(r.expectedTableCount).toBe(PORTFOLIO_BOARDING_TARGET_TABLES.length);
  });
});

describe('Phase 140K — optional evidence→document lookup is a warning, not a blocker', () => {
  it('missing optional lookup keeps the candidate flag true and only warns', () => {
    // Drop the evidence→document lookup column from the evidence table.
    const evidenceCols = targetColumnsForTable(EVIDENCE_TABLE)
      .map((c) => c.logicalName)
      .filter((c) => c.toLowerCase() !== EVIDENCE_DOC_LOOKUP.toLowerCase());
    const tables = withTable(fullyPresentTables(), EVIDENCE_TABLE, {
      presentColumns: evidenceCols,
    });
    const r = derivePortfolioBoardingSchemaVerificationReport({ inspectedTables: tables });

    expect(r.safeForRuntimePersistenceCandidate).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(
      r.missingOptionalRelationships.some(
        (rel) => rel.fromTable === EVIDENCE_TABLE && rel.toTable === DOCUMENT_TABLE,
      ),
    ).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('the document table satisfies the optional evidence→document target when the lookup exists', () => {
    const r = derivePortfolioBoardingSchemaVerificationReport({
      inspectedTables: fullyPresentTables(),
    });
    expect(r.foundOptionalRelationships).toContain(
      'cr664_portfolioboardedloandocument_evidence',
    );
    expect(r.missingOptionalRelationships).toEqual([]);
  });
});

describe('Phase 140K — required gaps are blockers', () => {
  it('a missing required child→root relationship is a blocker', () => {
    // Collateral exists but lacks its cr664_portfolioboardedloan lookup column.
    const collateralCols = targetColumnsForTable('cr664_portfolioboardedloancollateral')
      .map((c) => c.logicalName)
      .filter((c) => c.toLowerCase() !== 'cr664_portfolioboardedloan');
    const tables = withTable(fullyPresentTables(), 'cr664_portfolioboardedloancollateral', {
      presentColumns: collateralCols,
    });
    const r = derivePortfolioBoardingSchemaVerificationReport({ inspectedTables: tables });
    expect(r.safeForRuntimePersistenceCandidate).toBe(false);
    expect(
      r.missingRequiredRelationships.some((rel) => rel.toTable === PORTFOLIO_BOARDING_ROOT_TABLE),
    ).toBe(true);
  });

  it('a missing root table is a blocker', () => {
    const tables = withTable(fullyPresentTables(), PORTFOLIO_BOARDING_ROOT_TABLE, {
      exists: false,
      classification: 'MISSING_CAN_SEED',
      presentColumns: [],
    });
    const r = derivePortfolioBoardingSchemaVerificationReport({ inspectedTables: tables });
    expect(r.safeForRuntimePersistenceCandidate).toBe(false);
    expect(r.missingTables).toContain(PORTFOLIO_BOARDING_ROOT_TABLE);
  });

  it('a missing required column is a blocker', () => {
    const docCols = targetColumnsForTable(DOCUMENT_TABLE)
      .map((c) => c.logicalName)
      .filter((c) => c.toLowerCase() !== 'cr664_documenttype');
    const tables = withTable(fullyPresentTables(), DOCUMENT_TABLE, {
      presentColumns: docCols,
    });
    const r = derivePortfolioBoardingSchemaVerificationReport({ inspectedTables: tables });
    expect(r.safeForRuntimePersistenceCandidate).toBe(false);
    expect(
      r.missingColumns.some((c) => c.columnLogicalName === 'cr664_documenttype'),
    ).toBe(true);
  });

  it('a conflicting table is a blocker', () => {
    const tables = withTable(fullyPresentTables(), PORTFOLIO_BOARDING_ROOT_TABLE, {
      classification: 'BLOCKED_BY_CONFLICT',
    });
    const r = derivePortfolioBoardingSchemaVerificationReport({ inspectedTables: tables });
    expect(r.safeForRuntimePersistenceCandidate).toBe(false);
    expect(r.blockers.some((b) => /conflict/i.test(b))).toBe(true);
  });
});
