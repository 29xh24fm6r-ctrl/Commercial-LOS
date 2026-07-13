import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveRegulatoryClassificationSnapshot,
  CLASSIFICATION_POOL_ORDER,
  type ClassificationPoolInput,
} from './regulatoryClassification';
import { deriveDualRiskRating, type DualRatingRecord } from '../riskRating/dualRiskRating';

/**
 * Phase 264 (P3) — regulatoryClassification pure derivation tests.
 */

function rate(over: Parameters<typeof deriveDualRiskRating>[0]): DualRatingRecord {
  const out = deriveDualRiskRating(over);
  if (out.kind !== 'rated') throw new Error('expected a rated outcome');
  return out.record;
}

function loan(over: Partial<ClassificationPoolInput> & { rating: DualRatingRecord }): ClassificationPoolInput {
  return {
    loanId: 'loan-default',
    borrowerName: 'Default Borrower',
    exposure: 1_000_000,
    ...over,
  };
}

describe('Phase 264 (P3) — empty input', () => {
  it('reports all 5 pools with zeros, undefined coverage ratio, and isEmpty true', () => {
    const s = deriveRegulatoryClassificationSnapshot([]);
    expect(s.isEmpty).toBe(true);
    expect(s.pools).toHaveLength(5);
    expect(s.pools.map((p) => p.classification)).toEqual(CLASSIFICATION_POOL_ORDER);
    for (const p of s.pools) {
      expect(p.loanCount).toBe(0);
      expect(p.totalExposure).toBe(0);
      expect(p.sharePctOfPortfolio).toBe(0);
      expect(p.weightedAveragePd).toBe(0);
      expect(p.weightedAverageLgd).toBe(0);
      expect(p.estimatedAllowance).toBe(0);
    }
    expect(s.totalExposure).toBe(0);
    expect(s.totalEstimatedAllowance).toBe(0);
    expect(s.allowanceCoverageRatio).toBeUndefined();
    expect(s.criticizedExposure).toBe(0);
    expect(s.criticizedSharePct).toBe(0);
    expect(s.classifiedExposure).toBe(0);
    expect(s.classifiedSharePct).toBe(0);
    expect(s.excludedLoanCount).toBe(0);
  });
});

describe('Phase 264 (P3) — a single loan still reports all 5 pools', () => {
  it('shows one populated pool and 4 honest zero pools', () => {
    const r = rate({ effectiveDate: '2026-01-01', obligorGrade: 2 }); // Pass, pd 0.0025, lgd (unsecured) 0.65
    const s = deriveRegulatoryClassificationSnapshot([loan({ exposure: 500_000, rating: r })]);
    expect(s.pools).toHaveLength(5);
    expect(s.isEmpty).toBe(false);

    const pass = s.pools.find((p) => p.classification === 'Pass')!;
    expect(pass.loanCount).toBe(1);
    expect(pass.totalExposure).toBe(500_000);
    expect(pass.sharePctOfPortfolio).toBe(100);

    for (const p of s.pools.filter((p) => p.classification !== 'Pass')) {
      expect(p.loanCount).toBe(0);
      expect(p.totalExposure).toBe(0);
      expect(p.weightedAveragePd).toBe(0);
      expect(p.weightedAverageLgd).toBe(0);
      expect(p.estimatedAllowance).toBe(0);
    }
  });
});

describe('Phase 264 (P3) — pooling / allowance math (hand-computable fixture)', () => {
  // Loan A: obligorGrade 2 -> Pass, pd 0.0025; unsecured -> lgd 0.65; exposure 1,000,000
  //   allowance_A = 1,000,000 * 0.0025 * 0.65 = 1,625
  // Loan B: obligorGrade 2 -> Pass, pd 0.0025; strongly secured -> lgd 0.15; exposure 2,000,000
  //   allowance_B = 2,000,000 * 0.0025 * 0.15 = 750
  // Loan C: obligorGrade 6 -> Substandard, pd 0.15; unsecured -> lgd 0.65; exposure 500,000
  //   allowance_C = 500,000 * 0.15 * 0.65 = 48,750
  //
  // Pass pool: loanCount 2, totalExposure 3,000,000, estimatedAllowance 1,625 + 750 = 2,375
  //   weightedAveragePd = (0.0025*1,000,000 + 0.0025*2,000,000) / 3,000,000 = 0.0025
  //   weightedAverageLgd = (0.65*1,000,000 + 0.15*2,000,000) / 3,000,000
  //     = (650,000 + 300,000) / 3,000,000 = 950,000 / 3,000,000 = 0.3166666...
  // Substandard pool: loanCount 1, totalExposure 500,000, estimatedAllowance 48,750
  //   weightedAveragePd = 0.15, weightedAverageLgd = 0.65
  //
  // Portfolio totals: totalExposure = 3,500,000
  //   totalEstimatedAllowance = 2,375 + 48,750 = 51,125
  //   allowanceCoverageRatio = 51,125 / 3,500,000 * 100 = 1.46071...% -> rounds to 1.46
  //   Pass share = round(3,000,000/3,500,000*100) = round(85.71..) = 86
  //   Substandard share = round(500,000/3,500,000*100) = round(14.28..) = 14
  const a = rate({ effectiveDate: '2026-01-01', obligorGrade: 2 });
  const b = rate({
    effectiveDate: '2026-01-01',
    obligorGrade: 2,
    facility: { collateralValue: 3_000_000, exposure: 2_000_000 }, // coverage 1.5 -> strongly_secured
  });
  const c = rate({ effectiveDate: '2026-01-01', obligorGrade: 6 });

  const s = deriveRegulatoryClassificationSnapshot([
    loan({ loanId: 'A', exposure: 1_000_000, rating: a }),
    loan({ loanId: 'B', exposure: 2_000_000, rating: b }),
    loan({ loanId: 'C', exposure: 500_000, rating: c }),
  ]);

  it('pools Pass loans A + B correctly', () => {
    const pass = s.pools.find((p) => p.classification === 'Pass')!;
    expect(pass.loanCount).toBe(2);
    expect(pass.totalExposure).toBe(3_000_000);
    expect(pass.estimatedAllowance).toBeCloseTo(2_375, 6);
    expect(pass.weightedAveragePd).toBeCloseTo(0.0025, 8);
    expect(pass.weightedAverageLgd).toBeCloseTo(950_000 / 3_000_000, 8);
    expect(pass.sharePctOfPortfolio).toBe(86);
  });

  it('pools Substandard loan C correctly', () => {
    const sub = s.pools.find((p) => p.classification === 'Substandard')!;
    expect(sub.loanCount).toBe(1);
    expect(sub.totalExposure).toBe(500_000);
    expect(sub.estimatedAllowance).toBeCloseTo(48_750, 6);
    expect(sub.weightedAveragePd).toBeCloseTo(0.15, 8);
    expect(sub.weightedAverageLgd).toBeCloseTo(0.65, 8);
    expect(sub.sharePctOfPortfolio).toBe(14);
  });

  it('rolls up portfolio totals and the allowance coverage ratio', () => {
    expect(s.totalExposure).toBe(3_500_000);
    expect(s.totalEstimatedAllowance).toBeCloseTo(51_125, 6);
    expect(s.allowanceCoverageRatio).toBeCloseTo(1.46, 2);
  });

  it('leaves Special Mention / Doubtful / Loss pools honestly empty', () => {
    for (const classification of ['Special Mention', 'Doubtful', 'Loss'] as const) {
      const p = s.pools.find((pp) => pp.classification === classification)!;
      expect(p.loanCount).toBe(0);
      expect(p.totalExposure).toBe(0);
      expect(p.estimatedAllowance).toBe(0);
    }
  });
});

describe('Phase 264 (P3) — excluded loans (non-finite / non-positive exposure)', () => {
  const r = rate({ effectiveDate: '2026-01-01', obligorGrade: 3 });

  it('excludes exposure: 0 and bumps excludedLoanCount without polluting any pool', () => {
    const s = deriveRegulatoryClassificationSnapshot([loan({ exposure: 0, rating: r })]);
    expect(s.excludedLoanCount).toBe(1);
    expect(s.isEmpty).toBe(true);
    expect(s.totalExposure).toBe(0);
    for (const p of s.pools) expect(p.loanCount).toBe(0);
  });

  it('excludes exposure: -100 and bumps excludedLoanCount', () => {
    const s = deriveRegulatoryClassificationSnapshot([loan({ exposure: -100, rating: r })]);
    expect(s.excludedLoanCount).toBe(1);
    expect(s.isEmpty).toBe(true);
  });

  it('excludes exposure: NaN and bumps excludedLoanCount', () => {
    const s = deriveRegulatoryClassificationSnapshot([loan({ exposure: NaN, rating: r })]);
    expect(s.excludedLoanCount).toBe(1);
    expect(s.isEmpty).toBe(true);
  });

  it('excludes exposure: Infinity and bumps excludedLoanCount', () => {
    const s = deriveRegulatoryClassificationSnapshot([loan({ exposure: Infinity, rating: r })]);
    expect(s.excludedLoanCount).toBe(1);
    expect(s.isEmpty).toBe(true);
  });

  it('counts excluded loans alongside countable ones without mixing sums', () => {
    const good = rate({ effectiveDate: '2026-01-01', obligorGrade: 2 });
    const s = deriveRegulatoryClassificationSnapshot([
      loan({ loanId: 'good', exposure: 1_000_000, rating: good }),
      loan({ loanId: 'bad-zero', exposure: 0, rating: r }),
      loan({ loanId: 'bad-negative', exposure: -50, rating: r }),
      loan({ loanId: 'bad-nan', exposure: NaN, rating: r }),
    ]);
    expect(s.excludedLoanCount).toBe(3);
    expect(s.isEmpty).toBe(false);
    expect(s.totalExposure).toBe(1_000_000);
    const pass = s.pools.find((p) => p.classification === 'Pass')!;
    expect(pass.loanCount).toBe(1);
  });
});

describe('Phase 264 (P3) — criticized / classified exposure totals', () => {
  it('sums exposure only where the flag is true', () => {
    const passRating = rate({ effectiveDate: '2026-01-01', obligorGrade: 2 }); // criticized false, classified false
    const watchRating = rate({ effectiveDate: '2026-01-01', obligorGrade: 5 }); // criticized true, classified false
    const subRating = rate({ effectiveDate: '2026-01-01', obligorGrade: 6 }); // criticized true, classified true

    const s = deriveRegulatoryClassificationSnapshot([
      loan({ loanId: 'pass', exposure: 1_000_000, rating: passRating }),
      loan({ loanId: 'watch', exposure: 200_000, rating: watchRating }),
      loan({ loanId: 'sub', exposure: 300_000, rating: subRating }),
    ]);

    expect(s.criticizedExposure).toBe(500_000); // watch + sub
    expect(s.classifiedExposure).toBe(300_000); // sub only
    expect(s.totalExposure).toBe(1_500_000);
    expect(s.criticizedSharePct).toBe(33); // round(500,000/1,500,000*100) = round(33.33)
    expect(s.classifiedSharePct).toBe(20); // round(300,000/1,500,000*100) = 20
  });
});

describe('Phase 264 (P3) — module makes the non-regulatory disclaimer explicit', () => {
  const src = readFileSync(resolve(__dirname, 'regulatoryClassification.ts'), 'utf8');

  it('states plainly this is not a certified CECL/ALLL model', () => {
    expect(src).toMatch(/not a certified CECL\s*\/\s*ALLL model/i);
  });

  it('names the specific non-goals: no macro overlay, no vintage/cohort history, no Q-factors', () => {
    expect(src).toMatch(/macro/i);
    expect(src).toMatch(/vintage|cohort/i);
    expect(src).toMatch(/q-factor/i);
  });
});
