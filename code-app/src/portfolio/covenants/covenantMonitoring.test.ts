import { describe, it, expect } from 'vitest';
import {
  deriveCovenantTests,
  deriveReviewCadence,
  deriveReviewQueue,
  actualForCovenant,
  type CovenantDefinition,
  type SpreadFinancials,
} from './covenantMonitoring';

const NOW = '2026-06-30';

const FIN: SpreadFinancials = {
  ebitda: 1_200_000,
  totalDebtService: 1_000_000,
  totalDebt: 4_200_000,
  tangibleNetWorth: 2_000_000,
  currentAssets: 1_500_000,
  currentLiabilities: 1_000_000,
  liquidity: 500_000,
};

describe('covenant ratio calculations', () => {
  it('computes DSCR, leverage, and current ratio from spreads', () => {
    expect(actualForCovenant('dscr', FIN)).toBe(1.2); // 1.2M / 1.0M
    expect(actualForCovenant('leverage', FIN)).toBe(3.5); // 3.5M / 1.0M
    expect(actualForCovenant('current_ratio', FIN)).toBe(1.5); // 1.5M / 1.0M
  });

  it('returns undefined ratio (not a fabricated 0) when an input is missing', () => {
    expect(actualForCovenant('dscr', { ebitda: 1_000_000 })).toBeUndefined();
  });
});

describe('deriveCovenantTests — status', () => {
  it('flags a breach when leverage exceeds its max', () => {
    const covenants: CovenantDefinition[] = [{ type: 'leverage', threshold: 3.0, operator: 'max' }];
    const r = deriveCovenantTests(FIN, covenants, NOW);
    expect(r.results[0].status).toBe('breach'); // 3.5 > 3.0
    expect(r.breachCount).toBe(1);
    expect(r.worstStatus).toBe('breach');
  });

  it('marks a thin-headroom compliant covenant as trend-to-breach (at_risk)', () => {
    const covenants: CovenantDefinition[] = [{ type: 'dscr', threshold: 1.18, operator: 'min' }];
    const r = deriveCovenantTests(FIN, covenants, NOW); // 1.2 vs 1.18 → ~1.7% headroom
    expect(r.results[0].status).toBe('at_risk');
  });

  it('treats a comfortably compliant covenant as compliant', () => {
    const covenants: CovenantDefinition[] = [{ type: 'current_ratio', threshold: 1.0, operator: 'min' }];
    expect(deriveCovenantTests(FIN, covenants, NOW).results[0].status).toBe('compliant'); // 1.5 vs 1.0
  });

  it('honors an unexpired waiver over a breach', () => {
    const covenants: CovenantDefinition[] = [{ type: 'leverage', threshold: 3.0, operator: 'max', waived: true, waiverExpires: '2026-12-31' }];
    expect(deriveCovenantTests(FIN, covenants, NOW).results[0].status).toBe('waived');
  });

  it('reports in_cure while inside the cure period, breach after', () => {
    const inCure: CovenantDefinition[] = [{ type: 'leverage', threshold: 3.0, operator: 'max', breachDate: '2026-06-20', cureDays: 30 }];
    expect(deriveCovenantTests(FIN, inCure, NOW).results[0].status).toBe('in_cure'); // cureBy 2026-07-20 ≥ now

    const expired: CovenantDefinition[] = [{ type: 'leverage', threshold: 3.0, operator: 'max', breachDate: '2026-04-01', cureDays: 30 }];
    expect(deriveCovenantTests(FIN, expired, NOW).results[0].status).toBe('breach'); // cureBy 2026-05-01 < now
  });

  it('reports not_available when the financials cannot produce the ratio', () => {
    expect(deriveCovenantTests({ ebitda: 1 }, [{ type: 'current_ratio', threshold: 1, operator: 'min' }], NOW).results[0].status).toBe('not_available');
  });
});

describe('deriveReviewCadence + queue', () => {
  it('reviews worse grades more frequently', () => {
    expect(deriveReviewCadence(3)).toBe(12);
    expect(deriveReviewCadence(5)).toBe(6);
    expect(deriveReviewCadence(6)).toBe(3);
    expect(deriveReviewCadence(7)).toBe(1);
  });

  it('computes the next review date and flags overdue', () => {
    const q = deriveReviewQueue(
      [
        { loanId: 'A', grade: 6, lastReviewDate: '2026-01-01' }, // 3mo cadence → due 2026-04-01 → overdue
        { loanId: 'B', grade: 3, lastReviewDate: '2026-06-01' }, // 12mo cadence → 2027-06-01 → current
        { loanId: 'C', grade: 4 }, // no prior review → overdue
      ],
      NOW,
    );
    expect(q.overdue).toBe(2);
    expect(q.entries[0].status).toBe('overdue');
    const b = q.entries.find((e) => e.loanId === 'B')!;
    expect(b.status).toBe('current');
    expect(b.nextReviewDate).toBe('2027-06-01');
  });
});
