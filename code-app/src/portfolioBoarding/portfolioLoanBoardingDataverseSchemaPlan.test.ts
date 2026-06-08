import { describe, it, expect } from 'vitest';
import {
  PORTFOLIO_BOARDING_TARGET_TABLES,
  PORTFOLIO_BOARDING_TARGET_COLUMNS,
  PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
  PORTFOLIO_BOARDING_TARGET_OPTION_SETS,
  PORTFOLIO_BOARDING_SCHEMA_VERSION,
  PORTFOLIO_BOARDING_ROOT_TABLE,
  ALL_TARGET_TABLE_LOGICAL_NAMES,
  childTableRelationships,
  targetColumnsForTable,
} from './portfolioLoanBoardingDataverseSchemaPlan';

/**
 * Phase 140I — Portfolio boarding Dataverse schema PLAN pins.
 */

describe('Phase 140I — target tables', () => {
  it('includes all 13 portfolio boarded loan tables', () => {
    expect(PORTFOLIO_BOARDING_TARGET_TABLES.length).toBe(13);
  });

  it('includes the root table cr664_portfolioboardedloan', () => {
    expect(ALL_TARGET_TABLE_LOGICAL_NAMES).toContain('cr664_portfolioboardedloan');
    expect(PORTFOLIO_BOARDING_ROOT_TABLE).toBe('cr664_portfolioboardedloan');
  });

  it('includes the document, evidence, and examiner note tables', () => {
    expect(ALL_TARGET_TABLE_LOGICAL_NAMES).toContain('cr664_portfolioboardedloandocument');
    expect(ALL_TARGET_TABLE_LOGICAL_NAMES).toContain('cr664_portfolioboardedloanevidence');
    expect(ALL_TARGET_TABLE_LOGICAL_NAMES).toContain('cr664_portfolioboardedloanexaminernote');
  });

  it('every table logical name uses the cr664 prefix and a primary name column', () => {
    for (const t of PORTFOLIO_BOARDING_TARGET_TABLES) {
      expect(t.logicalName.startsWith('cr664_')).toBe(true);
      expect(t.primaryNameColumn).toBe('cr664_name');
      expect(t.seedOrder).toBeGreaterThan(0);
    }
  });

  it('declares a schema version', () => {
    expect(PORTFOLIO_BOARDING_SCHEMA_VERSION).toMatch(/^140I/);
  });
});

describe('Phase 140I — child lookup relationships back to the root table', () => {
  it('every non-root table has a child→root lookup relationship', () => {
    const childRels = childTableRelationships();
    // 12 child tables (all except the root) point back to the root.
    expect(childRels.length).toBeGreaterThanOrEqual(12);
    for (const r of childRels) {
      expect(r.toTable).toBe(PORTFOLIO_BOARDING_ROOT_TABLE);
      expect(r.fromColumn).toBe('cr664_PortfolioBoardedLoan');
      expect(r.required).toBe(true);
    }
  });

  it('every relationship references a real from/to table or known external target', () => {
    const known = new Set([
      ...ALL_TARGET_TABLE_LOGICAL_NAMES,
      'cr664_loandeal',
      'cr664_clientrelationship',
      'systemuser',
      'cr664_team',
    ]);
    for (const r of PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS) {
      expect(ALL_TARGET_TABLE_LOGICAL_NAMES).toContain(r.fromTable);
      expect(known.has(r.toTable), r.toTable).toBe(true);
    }
  });
});

describe('Phase 140I — required FDIC / board / portfolio readiness fields', () => {
  const rootCols = targetColumnsForTable(PORTFOLIO_BOARDING_ROOT_TABLE);
  const rootNames = rootCols.map((c) => c.logicalName);

  it('the root table carries the three readiness booleans', () => {
    expect(rootNames).toContain('cr664_fdicready');
    expect(rootNames).toContain('cr664_boardready');
    expect(rootNames).toContain('cr664_portfoliomonitoringready');
  });

  it('has columns flagged for FDIC, board, and portfolio monitoring', () => {
    expect(PORTFOLIO_BOARDING_TARGET_COLUMNS.some((c) => c.requiredForFDIC)).toBe(true);
    expect(PORTFOLIO_BOARDING_TARGET_COLUMNS.some((c) => c.requiredForBoard)).toBe(true);
    expect(
      PORTFOLIO_BOARDING_TARGET_COLUMNS.some((c) => c.requiredForPortfolioMonitoring),
    ).toBe(true);
  });

  it('preserves the manual boarding source distinction on the root table', () => {
    expect(rootNames).toContain('cr664_boardingsource');
    expect(rootNames).toContain('cr664_boardingstatus');
  });

  it('the root table carries the core economics + risk columns', () => {
    expect(rootNames).toContain('cr664_loannumber');
    expect(rootNames).toContain('cr664_currentoutstandingprincipal');
    expect(rootNames).toContain('cr664_currentriskrating');
  });
});

describe('Phase 140I — option set plan', () => {
  it('plans the canonical option sets as metadata-only', () => {
    const keys = PORTFOLIO_BOARDING_TARGET_OPTION_SETS.map((o) => o.key);
    for (const k of [
      'boardingStatus',
      'boardingSource',
      'loanStatus',
      'documentType',
      'exceptionSeverity',
      'covenantStatus',
    ]) {
      expect(keys).toContain(k);
    }
  });
});

describe('Phase 140I — no fake borrower / loan / dollar data in the plan', () => {
  const serialized = JSON.stringify({
    PORTFOLIO_BOARDING_TARGET_TABLES,
    PORTFOLIO_BOARDING_TARGET_COLUMNS,
    PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
    PORTFOLIO_BOARDING_TARGET_OPTION_SETS,
  });

  it('contains no dollar-amount literals', () => {
    expect(/\$\s*\d/.test(serialized)).toBe(false);
  });

  it('contains no common fake borrower / company placeholder names', () => {
    for (const re of [
      /\bAcme\b/i,
      /\bJohn Doe\b/i,
      /\bJane Doe\b/i,
      /\bContoso\b/i,
      /\bFabrikam\b/i,
      /\bJohn\s+Smith\b/i,
      /\bTest\s+Borrower\b/i,
      /\bSample\s+Loan\b/i,
    ]) {
      expect(re.test(serialized), `${re}`).toBe(false);
    }
  });
});
