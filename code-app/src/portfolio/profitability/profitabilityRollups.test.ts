import { describe, it, expect } from 'vitest';
import { deriveLoanProfitability, type LoanProfitabilityInputs, type ProfitabilityAssumptions } from './loanProfitability';
import { deriveRelationshipProfitability, derivePortfolioProfitability } from './profitabilityRollups';

/**
 * PE-4 — relationship + portfolio rollup goldens. ROE is capital-weighted.
 */

function loan(id: string, over: Partial<LoanProfitabilityInputs>, assumptions: ProfitabilityAssumptions) {
  return deriveLoanProfitability(
    { loanId: id, avgEarningBalance: 1_000_000, avgLoanRate: 6.0, ...over },
    assumptions,
  );
}

describe('deriveRelationshipProfitability', () => {
  it('capital-weights ROE across a relationship, not a naive ratio average', () => {
    // Loan A: 10M @ big capital, ROE 12%. Loan B: 1M small capital, ROE 4%.
    // A: CM 120k on 1M capital → afterTax(no tax) 120k, ROE 12%.
    const a = deriveLoanProfitability(
      { loanId: 'A', avgEarningBalance: 10_000_000, avgLoanRate: 6.0 },
      { costOfFundsRate: 4.8, capitalAllocationPct: 10 }, // NII 120k → CM 120k; cap 1M → ROE 12%
    );
    const b = deriveLoanProfitability(
      { loanId: 'B', avgEarningBalance: 1_000_000, avgLoanRate: 6.0 },
      { costOfFundsRate: 5.6, capitalAllocationPct: 10 }, // NII 4k → CM 4k; cap 100k → ROE 4%
    );
    const rel = deriveRelationshipProfitability([a, b], { targetRoe: 12 });
    expect(a.roe).toBe(12);
    expect(b.roe).toBe(4);
    // Weighted: (120k + 4k) / (1M + 100k) = 124k / 1.1M = 11.27%, NOT (12+4)/2 = 8%.
    expect(rel.roe).toBe(11.27);
    expect(rel.allocatedCapital).toBe(1_100_000);
    expect(rel.loanCount).toBe(2);
    expect(rel.status).toBe('near_target'); // 11.27 ≥ 12×0.8, < 12
  });

  it('sums revenue/margin and reports zero-capital relationships as unrated', () => {
    const a = loan('A', {}, { costOfFundsRate: 2.0 }); // no capital allocation
    const rel = deriveRelationshipProfitability([a]);
    expect(rel.roe).toBeUndefined();
    expect(rel.status).toBe('unrated');
    expect(rel.grossRevenue).toBe(a.grossRevenue);
  });
});

describe('derivePortfolioProfitability', () => {
  const assumptions: ProfitabilityAssumptions = { costOfFundsRate: 2.0, capitalAllocationPct: 10 };

  it('buckets loans into the ROE distribution and counts them', () => {
    // Build loans landing in distinct bands via loan rate (NII drives ROE).
    const neg = deriveLoanProfitability({ loanId: 'neg', avgEarningBalance: 1_000_000, avgLoanRate: 1.0 }, assumptions); // CM -10k → Negative
    const low = deriveLoanProfitability({ loanId: 'low', avgEarningBalance: 1_000_000, avgLoanRate: 2.5 }, assumptions); // CM 5k / 100k = 5% → 0–8%
    const mid = deriveLoanProfitability({ loanId: 'mid', avgEarningBalance: 1_000_000, avgLoanRate: 3.0 }, assumptions); // 10% → 8–12%
    const high = deriveLoanProfitability({ loanId: 'high', avgEarningBalance: 1_000_000, avgLoanRate: 4.0 }, assumptions); // 20% → 15%+
    const p = derivePortfolioProfitability([neg, low, mid, high]);
    const byLabel = Object.fromEntries(p.distribution.map((b) => [b.label, b.count]));
    expect(byLabel['Negative']).toBe(1);
    expect(byLabel['0–8%']).toBe(1);
    expect(byLabel['8–12%']).toBe(1);
    expect(byLabel['15%+']).toBe(1);
    expect(p.negativeContributionCount).toBe(1);
  });

  it('surfaces low-ROE / negative-contribution outliers worst-first', () => {
    const neg = deriveLoanProfitability({ loanId: 'neg', avgEarningBalance: 1_000_000, avgLoanRate: 1.0 }, assumptions);
    const low = deriveLoanProfitability({ loanId: 'low', avgEarningBalance: 1_000_000, avgLoanRate: 2.5 }, assumptions); // 5%
    const good = deriveLoanProfitability({ loanId: 'good', avgEarningBalance: 1_000_000, avgLoanRate: 4.0 }, assumptions); // 20%
    const p = derivePortfolioProfitability([good, low, neg], { lowRoeThreshold: 10 });
    // good (20%) is not an outlier; neg (negative) sorts before low (5%).
    expect(p.lowRoeOutliers.map((o) => o.loanId)).toEqual(['neg', 'low']);
  });

  it('capital-weights the portfolio ROE and respects maxOutliers', () => {
    const a = deriveLoanProfitability({ loanId: 'a', avgEarningBalance: 1_000_000, avgLoanRate: 2.5 }, assumptions); // 5%
    const b = deriveLoanProfitability({ loanId: 'b', avgEarningBalance: 1_000_000, avgLoanRate: 2.6 }, assumptions); // 6%
    const c = deriveLoanProfitability({ loanId: 'c', avgEarningBalance: 1_000_000, avgLoanRate: 2.7 }, assumptions); // 7%
    const p = derivePortfolioProfitability([a, b, c], { lowRoeThreshold: 10, maxOutliers: 2 });
    expect(p.lowRoeOutliers).toHaveLength(2);
    expect(typeof p.weightedAvgRoe).toBe('number');
  });
});
