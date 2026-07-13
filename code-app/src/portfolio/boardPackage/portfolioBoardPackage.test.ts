import { describe, it, expect } from 'vitest';
import {
  buildPortfolioBoardPackage,
  buildPortfolioBoardPackageCsv,
  type PortfolioBoardPackageInput,
} from './portfolioBoardPackage';
import type { PortfolioRiskSnapshot } from '../portfolioRiskEngine';
import type { RegulatoryClassificationSnapshot } from '../regulatoryClassification/regulatoryClassification';
import type { WatchlistBoard } from '../watchlist/watchlist';
import type { PortfolioStressTestSnapshot } from '../stressTesting/stressTesting';

/**
 * Phase 264 (P3) — portfolio board/regulator package export.
 *
 * Pins: every section derives only from its source snapshot; the stress-test
 * section is OMITTED (not zeroed) when no scenario is supplied; the CSV
 * export never truncates a section's lines; no raw GUID ever appears in a
 * rendered line.
 */

function riskSnapshot(over: Partial<PortfolioRiskSnapshot> = {}): PortfolioRiskSnapshot {
  return {
    exposure: {
      totalExposure: 10_000_000,
      averageExposure: 2_000_000,
      medianExposure: 2_000_000,
      largestExposure: 4_000_000,
      largestDealId: 'deal-guid-1',
      largestDealName: 'Alpha Deal',
      exposureDealCount: 5,
      dealsAboveThresholdCount: 1,
      threshold: 5_000_000,
    },
    concentration: {
      singleNamePct: 40,
      singleNameClient: 'Alpha LLC',
      singleNameBand: 'elevated',
      top5Pct: 90,
      top5Band: 'high',
      topProductPct: 30,
      topProductLabel: 'SBA 7(a)',
      topProductBand: 'watch',
      topBankerPct: 25,
      topBankerLabel: 'Jane Banker',
      topBankerBand: 'low',
      byClient: [],
    },
    maturityLadder: [],
    operational: {
      staleDealCount: 0,
      missingDataCount: 0,
      blockedDealCount: 0,
      atRiskDealCount: 0,
      documentBottleneckDealCount: 0,
      taskBottleneckDealCount: 0,
      outstandingDocumentCount: 0,
      openTaskCount: 0,
      operationalBand: 'low',
      dataQualityBand: 'low',
      closingPressureBand: 'low',
    },
    findings: [
      {
        id: 'top-borrower-concentration',
        kind: 'top-borrower-concentration',
        label: 'Top borrower concentration: Alpha LLC (40% of exposure)',
        severity: 'elevated',
        supportingNames: ['Alpha LLC'],
        sourceMetric: 'Single-name concentration 40%',
        nextAction: 'Review the borrower relationship.',
        exposure: 4_000_000,
      },
    ],
    isEmpty: false,
    ...over,
  };
}

function classificationSnapshot(over: Partial<RegulatoryClassificationSnapshot> = {}): RegulatoryClassificationSnapshot {
  return {
    pools: [
      { classification: 'Pass', loanCount: 3, totalExposure: 8_000_000, sharePctOfPortfolio: 80, weightedAveragePd: 0.02, weightedAverageLgd: 0.3, estimatedAllowance: 48_000 },
      { classification: 'Special Mention', loanCount: 1, totalExposure: 1_000_000, sharePctOfPortfolio: 10, weightedAveragePd: 0.06, weightedAverageLgd: 0.3, estimatedAllowance: 18_000 },
      { classification: 'Substandard', loanCount: 1, totalExposure: 1_000_000, sharePctOfPortfolio: 10, weightedAveragePd: 0.15, weightedAverageLgd: 0.3, estimatedAllowance: 45_000 },
      { classification: 'Doubtful', loanCount: 0, totalExposure: 0, sharePctOfPortfolio: 0, weightedAveragePd: 0, weightedAverageLgd: 0, estimatedAllowance: 0 },
      { classification: 'Loss', loanCount: 0, totalExposure: 0, sharePctOfPortfolio: 0, weightedAveragePd: 0, weightedAverageLgd: 0, estimatedAllowance: 0 },
    ],
    totalExposure: 10_000_000,
    totalEstimatedAllowance: 111_000,
    allowanceCoverageRatio: 1.11,
    criticizedExposure: 2_000_000,
    criticizedSharePct: 20,
    classifiedExposure: 1_000_000,
    classifiedSharePct: 10,
    excludedLoanCount: 0,
    isEmpty: false,
    ...over,
  };
}

function watchlistBoard(over: Partial<WatchlistBoard> = {}): WatchlistBoard {
  return {
    entries: [],
    totalExposure: 2_000_000,
    criticizedCount: 2,
    classifiedCount: 1,
    actionPlansOverdue: 1,
    groups: [
      { classification: 'Special Mention', count: 1, exposure: 1_000_000 },
      { classification: 'Substandard', count: 1, exposure: 1_000_000 },
    ],
    ...over,
  };
}

function stressSnapshot(over: Partial<PortfolioStressTestSnapshot> = {}): PortfolioStressTestSnapshot {
  return {
    scenario: { scenarioName: 'Base rate + collateral shock', interestRateShockBps: 200, collateralValueShockPct: -20 },
    loanResults: [],
    totalExposure: 10_000_000,
    exposureBySensitivity: { low: 8_000_000, moderate: 1_000_000, high: 1_000_000 },
    loanCountBySensitivity: { low: 3, moderate: 1, high: 1 },
    excludedLoanCount: 0,
    isEmpty: false,
    ...over,
  };
}

function input(over: Partial<PortfolioBoardPackageInput> = {}): PortfolioBoardPackageInput {
  return {
    asOfDate: '2026-07-13',
    institutionName: 'Old Glory Bank',
    risk: riskSnapshot(),
    classification: classificationSnapshot(),
    watchlist: watchlistBoard(),
    ...over,
  };
}

describe('Phase 264 (P3) — buildPortfolioBoardPackage', () => {
  it('builds the 4 standing sections when no stress test is supplied', () => {
    const pkg = buildPortfolioBoardPackage(input());
    expect(pkg.stressTestIncluded).toBe(false);
    expect(pkg.sections.map((s) => s.key)).toEqual([
      'executive-summary',
      'concentration-risk',
      'regulatory-classification',
      'watchlist',
    ]);
  });

  it('adds the stress-test section only when a scenario snapshot is supplied — never zeroed/faked', () => {
    const pkg = buildPortfolioBoardPackage(input({ stressTest: stressSnapshot() }));
    expect(pkg.stressTestIncluded).toBe(true);
    expect(pkg.sections.map((s) => s.key)).toContain('stress-test');
    const stressSection = pkg.sections.find((s) => s.key === 'stress-test')!;
    expect(stressSection.lines.some((l) => l.includes('High sensitivity: 1 loan'))).toBe(true);
  });

  it('executive summary reflects the real classification + risk figures', () => {
    const pkg = buildPortfolioBoardPackage(input());
    const summary = pkg.sections.find((s) => s.key === 'executive-summary')!;
    expect(summary.lines.some((l) => l.includes('$10,000,000'))).toBe(true);
    expect(summary.lines.some((l) => l.includes('20% of portfolio'))).toBe(true);
    expect(summary.lines.some((l) => /NOT a certified CECL\/ALLL/.test(l))).toBe(true);
  });

  it('classification section lists all 5 pools, including the empty ones, honestly', () => {
    const pkg = buildPortfolioBoardPackage(input());
    const section = pkg.sections.find((s) => s.key === 'regulatory-classification')!;
    expect(section.lines).toHaveLength(5);
    expect(section.lines.some((l) => l.startsWith('Doubtful: 0 loan(s)'))).toBe(true);
    expect(section.lines.some((l) => l.startsWith('Loss: 0 loan(s)'))).toBe(true);
  });

  it('watchlist section reflects overdue action plans and group breakdown', () => {
    const pkg = buildPortfolioBoardPackage(input());
    const section = pkg.sections.find((s) => s.key === 'watchlist')!;
    expect(section.lines.some((l) => l.includes('Overdue action plans: 1'))).toBe(true);
    expect(section.lines.some((l) => l.startsWith('Special Mention: 1 loan(s)'))).toBe(true);
  });

  it('never renders a raw deal/loan GUID in any section line', () => {
    const pkg = buildPortfolioBoardPackage(input({ stressTest: stressSnapshot() }));
    const allText = pkg.sections.flatMap((s) => s.lines).join(' ');
    expect(allText).not.toContain('deal-guid-1');
  });

  it('reports "not available" honestly when the allowance coverage ratio is undefined (zero exposure)', () => {
    const pkg = buildPortfolioBoardPackage(
      input({ classification: classificationSnapshot({ allowanceCoverageRatio: undefined }) }),
    );
    const summary = pkg.sections.find((s) => s.key === 'executive-summary')!;
    expect(summary.lines.some((l) => l.includes('coverage ratio: not available'))).toBe(true);
  });
});

describe('Phase 264 (P3) — buildPortfolioBoardPackageCsv', () => {
  it('renders one row per line across every section, never truncated', () => {
    const pkg = buildPortfolioBoardPackage(input({ stressTest: stressSnapshot() }));
    const csv = buildPortfolioBoardPackageCsv(pkg);
    const lines = csv.trim().split('\n');
    const totalContentLines = pkg.sections.reduce((sum, s) => sum + s.lines.length, 0);
    // title line + header line + one row per content line
    expect(lines).toHaveLength(2 + totalContentLines);
    expect(lines[1]).toBe('Section,Line');
  });

  it('quotes a line containing a comma', () => {
    const pkg = buildPortfolioBoardPackage(input());
    const csv = buildPortfolioBoardPackageCsv(pkg);
    // The watchlist "Criticized loans: N · Classified loans: N" line has no comma,
    // but the executive summary's allowance line does (coverage ratio parenthetical).
    expect(csv).toMatch(/"[^"]*,[^"]*"/);
  });
});
