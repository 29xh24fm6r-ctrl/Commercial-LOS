import { describe, it, expect } from 'vitest';
import {
  deriveLoanReviewScope,
  deriveRatingChallenge,
  assertReviewerIndependence,
  deriveReviewFindingSummary,
  type LoanReviewCandidate,
} from './loanReview';

describe('deriveLoanReviewScope — risk-based sampling', () => {
  it('always selects criticized, large-exposure, and exception-heavy loans', () => {
    const candidates: LoanReviewCandidate[] = [
      { loanId: 'crit', obligorGrade: 6, exposure: 100_000 },
      { loanId: 'big', obligorGrade: 3, exposure: 6_000_000 },
      { loanId: 'exc', obligorGrade: 3, exposure: 100_000, exceptionCount: 4 },
      { loanId: 'clean', obligorGrade: 2, exposure: 100_000 },
    ];
    const scope = deriveLoanReviewScope(candidates, { passSamplePct: 0 });
    const ids = scope.selected.map((s) => s.loanId).sort();
    expect(ids).toEqual(['big', 'crit', 'exc']);
    expect(scope.selected.find((s) => s.loanId === 'crit')!.reasons).toContain('criticized');
    expect(scope.selected.find((s) => s.loanId === 'big')!.reasons).toContain('large_exposure');
  });

  it('is deterministic — same input yields the same sample', () => {
    const pool: LoanReviewCandidate[] = Array.from({ length: 20 }, (_, i) => ({ loanId: `L${String(i).padStart(2, '0')}`, obligorGrade: 2, exposure: 100_000 }));
    const a = deriveLoanReviewScope(pool, { passSamplePct: 20 }).selected.map((s) => s.loanId);
    const b = deriveLoanReviewScope(pool, { passSamplePct: 20 }).selected.map((s) => s.loanId);
    expect(a).toEqual(b);
    // 20% stride over 20 pass loans → 4 sampled.
    expect(a).toHaveLength(4);
  });

  it('reports coverage analytics overall and by officer', () => {
    const candidates: LoanReviewCandidate[] = [
      { loanId: 'A', obligorGrade: 6, exposure: 1_000_000, originatingBanker: 'jane' },
      { loanId: 'B', obligorGrade: 2, exposure: 1_000_000, originatingBanker: 'jane' },
      { loanId: 'C', obligorGrade: 2, exposure: 1_000_000, originatingBanker: 'sam' },
    ];
    const scope = deriveLoanReviewScope(candidates, { passSamplePct: 0 });
    expect(scope.overall.total).toBe(3);
    expect(scope.overall.selected).toBe(1); // only the criticized A
    const jane = scope.byOfficer.find((o) => o.key === 'jane')!;
    expect(jane.total).toBe(2);
    expect(jane.selected).toBe(1);
    expect(jane.coveragePct).toBe(50);
  });
});

describe('deriveRatingChallenge', () => {
  it('agrees when the reviewer grade matches', () => {
    expect(deriveRatingChallenge({ loanId: 'A', originalGrade: 4, reviewerGrade: 4 }).kind).toBe('agree');
  });

  it('rejects a challenge with no rationale', () => {
    expect(deriveRatingChallenge({ loanId: 'A', originalGrade: 4, reviewerGrade: 6 }).kind).toBe('rejected');
  });

  it('records a downgrade challenge with rationale', () => {
    const out = deriveRatingChallenge({ loanId: 'A', originalGrade: 4, reviewerGrade: 6, rationale: 'DSCR deteriorated below 1.0x.' });
    expect(out.kind).toBe('challenge');
    if (out.kind !== 'challenge') return;
    expect(out.direction).toBe('downgrade');
    expect(out.from).toBe(4);
    expect(out.to).toBe(6);
  });
});

describe('assertReviewerIndependence', () => {
  it('blocks a reviewer from reviewing a loan they originated', () => {
    expect(assertReviewerIndependence('jane', 'jane').independent).toBe(false);
  });
  it('allows an independent reviewer', () => {
    expect(assertReviewerIndependence('sam', 'jane').independent).toBe(true);
  });
});

describe('deriveReviewFindingSummary', () => {
  it('counts open / cleared / open-high findings', () => {
    const s = deriveReviewFindingSummary([
      { id: '1', severity: 'high', status: 'open' },
      { id: '2', severity: 'low', status: 'open' },
      { id: '3', severity: 'high', status: 'cleared' },
    ]);
    expect(s.open).toBe(2);
    expect(s.cleared).toBe(1);
    expect(s.openHigh).toBe(1);
  });
});
