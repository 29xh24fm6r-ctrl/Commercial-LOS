import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { derivePortfolioCommandSnapshot } from './portfolioCommandSnapshot';
import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from '../manager/managerQueries';

/**
 * Phase 126A — derivePortfolioCommandSnapshot tests.
 *
 * Pins:
 *   - command ribbon counts (active / exposure / closing-30 / blocked
 *     / at-risk / missing / docs / tasks / stale / avg days);
 *   - top exposures sort by amount desc + carry share-of-total %;
 *   - concentration derivers (byProductType / byLoanStructure /
 *     byPricingType / byBanker / byStage) sum correctly, sort by
 *     exposure desc, route unknown rows to the bottom;
 *   - 'Unknown product' / 'Unknown loan structure' / 'Unknown pricing'
 *     / 'Unassigned' / 'Unset stage' buckets appear only when the
 *     source value is absent (no fake category coercion);
 *   - exceptions list contains only blocked + at-risk deals; sorted
 *     blocked first, then by exposure desc;
 *   - isEmpty=true for zero-deal portfolios; honest zero ribbon;
 *   - static-source: imports the manager VM projection (single source
 *     of truth); no banker write-surface imports; no fake-fallback
 *     strings.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-03T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-default',
    name: 'Default deal',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'banker-a',
    assignedBankerName: 'Banker A',
    collateralSummary: undefined,
    productType: 'SBA 7(a)',
    loanStructure: 'Term Loan',
    pricingType: 'Variable',
    ...over,
  };
}

function banker(over: Partial<TeamBanker> = {}): TeamBanker {
  return {
    id: 'banker-a',
    fullName: 'Banker A',
    email: 'a@oldglorybank.com',
    roleType: 'CommercialBanker',
    active: true,
    ...over,
  };
}

function snapshot(opts: {
  teamPipeline?: TeamDeal[];
  teamBankers?: TeamBanker[];
  teamTasks?: TeamScopedTask[];
  teamDocuments?: TeamScopedDocument[];
  topN?: number;
}) {
  return derivePortfolioCommandSnapshot({
    teamPipeline: opts.teamPipeline ?? [],
    teamBankers: opts.teamBankers ?? [],
    teamTasks: opts.teamTasks ?? [],
    teamDocuments: opts.teamDocuments ?? [],
    now: NOW,
    topN: opts.topN,
  });
}

// ---------------------------------------------------------------------------
// Empty / honest absence
// ---------------------------------------------------------------------------

describe('Phase 126A — empty state', () => {
  it('returns isEmpty=true and zeroed ribbon when no pipeline', () => {
    const s = snapshot({});
    expect(s.isEmpty).toBe(true);
    expect(s.commandRibbon.activeDealCount).toBe(0);
    expect(s.commandRibbon.totalExposure).toBe(0);
    expect(s.commandRibbon.closingNext30DayCount).toBe(0);
    expect(s.commandRibbon.blockedDealCount).toBe(0);
    expect(s.commandRibbon.atRiskDealCount).toBe(0);
    expect(s.topExposures).toHaveLength(0);
    expect(s.byProductType).toHaveLength(0);
    expect(s.exceptions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Command ribbon
// ---------------------------------------------------------------------------

describe('Phase 126A — command ribbon', () => {
  it('sums totalExposure from populated deal amounts (undefined contributes 0)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', amount: 1_000_000 }),
        deal({ id: 'd2', amount: 500_000 }),
        deal({ id: 'd3', amount: undefined }),
      ],
      teamBankers: [banker()],
    });
    expect(s.commandRibbon.totalExposure).toBe(1_500_000);
  });

  it('reuses the manager snapshot for blocked / at-risk / stale / closing counts (single source of truth)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd-blocked', targetCloseDate: isoDaysAgo(10) }), // past close > 7d → blocked
        deal({ id: 'd-atrisk', targetCloseDate: isoDaysAgo(2) }), // past close 2d → at-risk
        deal({ id: 'd-stale', modifiedOn: isoDaysAgo(20) }), // stale
        deal({ id: 'd-soon', targetCloseDate: isoDaysFromNow(10), amount: 250_000 }), // closing 30d
        deal({ id: 'd-clean' }),
      ],
      teamBankers: [banker()],
    });
    expect(s.commandRibbon.blockedDealCount).toBe(1);
    expect(s.commandRibbon.atRiskDealCount).toBe(1);
    expect(s.commandRibbon.staleDealCount).toBe(1);
    expect(s.commandRibbon.closingNext30DayCount).toBe(1);
    expect(s.commandRibbon.closingNext30DayAmount).toBe(250_000);
  });

  it('avgDaysInStage is undefined when no deal has a stageEntryDate (honest absence)', () => {
    const s = snapshot({
      teamPipeline: [deal({ stageEntryDate: undefined })],
      teamBankers: [banker()],
    });
    expect(s.commandRibbon.avgDaysInStage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Top exposures
// ---------------------------------------------------------------------------

describe('Phase 126A — top exposures', () => {
  it('sorts by amount desc and caps at topN (default 8)', () => {
    const pipeline = Array.from({ length: 10 }, (_, i) =>
      deal({ id: `d${i}`, name: `Deal ${i}`, amount: (i + 1) * 100_000 }),
    );
    const s = snapshot({ teamPipeline: pipeline, teamBankers: [banker()] });
    expect(s.topExposures).toHaveLength(8);
    expect(s.topExposures[0].amount).toBe(1_000_000);
    expect(s.topExposures[7].amount).toBe(300_000);
  });

  it('carries share-of-total exposure % rounded to int', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', amount: 750_000 }),
        deal({ id: 'd2', amount: 250_000 }),
      ],
      teamBankers: [banker()],
    });
    // Total = 1,000,000 → d1 share = 75%, d2 share = 25%.
    expect(s.topExposures[0].sharePct).toBe(75);
    expect(s.topExposures[1].sharePct).toBe(25);
  });

  it('surfaces hydrated product/loan/pricing on the top-exposure row', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-ref',
          amount: 500_000,
          productType: 'SBA 7(a)',
          loanStructure: 'Term Loan',
          pricingType: 'Variable',
        }),
      ],
      teamBankers: [banker()],
    });
    expect(s.topExposures[0].productType).toBe('SBA 7(a)');
    expect(s.topExposures[0].loanStructure).toBe('Term Loan');
    expect(s.topExposures[0].pricingType).toBe('Variable');
  });

  it('shares 0 when total exposure is 0 (no division-by-zero NaN)', () => {
    const s = snapshot({
      teamPipeline: [deal({ amount: undefined })],
      teamBankers: [banker()],
    });
    expect(s.topExposures[0].sharePct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Concentration derivers
// ---------------------------------------------------------------------------

describe('Phase 126A — concentration by product / loan / pricing', () => {
  it('byProductType sums exposure per product, sorts by amount desc', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', productType: 'SBA 7(a)', amount: 500_000 }),
        deal({ id: 'd2', productType: 'SBA 504', amount: 1_000_000 }),
        deal({ id: 'd3', productType: 'SBA 7(a)', amount: 300_000 }),
      ],
      teamBankers: [banker()],
    });
    // Sort: exposure desc → SBA 504 (1M, 1 deal) before SBA 7(a) (800K, 2 deals).
    expect(s.byProductType.map((r) => r.label)).toEqual([
      'SBA 504',
      'SBA 7(a)',
    ]);
    expect(s.byProductType[0].dealCount).toBe(1);
    expect(s.byProductType[0].totalExposure).toBe(1_000_000);
    expect(s.byProductType[1].dealCount).toBe(2);
    expect(s.byProductType[1].totalExposure).toBe(800_000);
  });

  it("routes undefined productType into 'Unknown product' bucket (honest absence)", () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', productType: 'SBA 7(a)', amount: 500_000 }),
        deal({ id: 'd2', productType: undefined, amount: 250_000 }),
      ],
      teamBankers: [banker()],
    });
    const unknown = s.byProductType.find((r) => r.label === 'Unknown product');
    expect(unknown).toBeDefined();
    expect(unknown?.dealCount).toBe(1);
    expect(unknown?.totalExposure).toBe(250_000);
    expect(unknown?.isUnknown).toBe(true);
  });

  it('Unknown buckets sort to the BOTTOM regardless of exposure', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd-known', productType: 'SBA 7(a)', amount: 1 }),
        deal({ id: 'd-unknown', productType: undefined, amount: 999_999 }),
      ],
      teamBankers: [banker()],
    });
    expect(s.byProductType[0].label).toBe('SBA 7(a)');
    expect(s.byProductType[s.byProductType.length - 1].label).toBe('Unknown product');
  });

  it('byLoanStructure / byPricingType apply the same rules', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd1',
          loanStructure: 'Term Loan',
          pricingType: 'Variable',
          amount: 500_000,
        }),
        deal({
          id: 'd2',
          loanStructure: undefined,
          pricingType: undefined,
          amount: 250_000,
        }),
      ],
      teamBankers: [banker()],
    });
    expect(s.byLoanStructure.find((r) => r.label === 'Term Loan')).toBeDefined();
    expect(
      s.byLoanStructure.find((r) => r.label === 'Unknown loan structure'),
    ).toBeDefined();
    expect(s.byPricingType.find((r) => r.label === 'Variable')).toBeDefined();
    expect(s.byPricingType.find((r) => r.label === 'Unknown pricing')).toBeDefined();
  });

  it('byBanker buckets unassigned deals into Unassigned', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-orphan',
          assignedBankerId: undefined,
          assignedBankerName: undefined,
          amount: 100_000,
        }),
      ],
      teamBankers: [],
    });
    const unassigned = s.byBanker.find((r) => r.label === 'Unassigned');
    expect(unassigned?.dealCount).toBe(1);
    expect(unassigned?.isUnknown).toBe(true);
  });

  it('byStage buckets undefined stage into Unset stage', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd-no-stage', stage: undefined, amount: 100 })],
      teamBankers: [banker()],
    });
    expect(s.byStage.find((r) => r.label === 'Unset stage')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

describe('Phase 126A — exceptions list', () => {
  it('contains only blocked + at-risk deals; sorts blocked first then by exposure desc', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-blocked-small',
          name: 'BlockedSmall',
          targetCloseDate: isoDaysAgo(10),
          amount: 100_000,
        }),
        deal({
          id: 'd-blocked-big',
          name: 'BlockedBig',
          targetCloseDate: isoDaysAgo(10),
          amount: 5_000_000,
        }),
        deal({
          id: 'd-atrisk',
          name: 'AtRisk',
          targetCloseDate: isoDaysAgo(2),
          amount: 9_000_000,
        }),
        deal({ id: 'd-clean', name: 'Clean' }),
      ],
      teamBankers: [banker()],
    });
    expect(s.exceptions.map((r) => r.dealName)).toEqual([
      'BlockedBig',
      'BlockedSmall',
      'AtRisk',
    ]);
    expect(s.exceptions.every((r) => r.severity !== 'clear' as never)).toBe(true);
  });

  it('reason copy comes from the underlying blocker signal label (no fake fallback)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-blocked',
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
      teamBankers: [banker()],
    });
    expect(s.exceptions[0].reason).toMatch(/Target close date passed 15 days ago/);
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

describe('Phase 126A — portfolioCommandSnapshot.ts static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'portfolioCommandSnapshot.ts'),
    'utf8',
  );
  const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports the manager VM projection (single source of truth pin)', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*deriveManagerPipelineSnapshot[^}]*\}\s+from\s+['"]\.\.\/manager\/managerPipelineSnapshot['"]/,
    );
  });

  it('imports the shared deal-intelligence VM type (no banker cockpit re-import)', () => {
    expect(source).toMatch(
      /from\s+['"]\.\.\/shared\/dealIntelligenceViewModel['"]/,
    );
  });

  it('does NOT import any banker write surface or send-email action', () => {
    expect(source).not.toMatch(/from\s+['"][^'"]*Office365/);
    expect(source).not.toMatch(/SendEmailV2/);
    expect(source).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*\/banker\//);
  });

  it('does NOT contain fake-fallback placeholders or sample data', () => {
    expect(sourceCode).not.toMatch(/['"]TBD['"]/);
    expect(sourceCode).not.toMatch(/['"]N\/A['"]/);
    expect(sourceCode).not.toMatch(/\bAcme\b/);
    expect(sourceCode).not.toMatch(/\bContoso\b/);
    expect(sourceCode).not.toMatch(/sample\s+deal/i);
    expect(sourceCode).not.toMatch(/mock\s+deal/i);
  });

  it('does NOT contain predictive / weighted vocabulary (no probability schema available)', () => {
    expect(sourceCode).not.toMatch(/weighted\s+exposure/i);
    expect(sourceCode).not.toMatch(/approval\s+(odds|probability)/i);
    expect(sourceCode).not.toMatch(/win\s+rate/i);
    expect(sourceCode).not.toMatch(/pull-through/i);
  });
});
