import { describe, it, expect } from 'vitest';
import {
  deriveMigrationReconciliation,
  type MigrationControl,
  type ReconciliationLoan,
} from './bookReconciliation';

/**
 * PE-2 — book tie-out goldens. Reconciliation must be exact ("not done until it
 * ties"): count, aggregate outstanding, per-segment subtotals, and the two
 * orphan lists all have to reconcile for an overall `tied`.
 */

const BATCH = 'BATCH-2026-Q3';

function loan(loanNumber: string, outstanding: number, extra: Partial<ReconciliationLoan> = {}): ReconciliationLoan {
  return { loanNumber, outstanding, migrationBatchId: BATCH, ...extra };
}

function control(over: Partial<MigrationControl> = {}): MigrationControl {
  return { batchId: BATCH, enteredLoanCount: 3, enteredAggregateOutstanding: 6_000_000, ...over };
}

describe('deriveMigrationReconciliation — count & dollar tie-out', () => {
  it('exact tie: matching count and dollars → tied, zero deltas', () => {
    const rows = [loan('L-1', 1_000_000), loan('L-2', 2_000_000), loan('L-3', 3_000_000)];
    const r = deriveMigrationReconciliation(control(), rows);
    expect(r.status).toBe('tied');
    expect(r.count).toEqual({ boarded: 3, control: 3, delta: 0 });
    expect(r.outstanding).toEqual({ boarded: 6_000_000, control: 6_000_000, delta: 0 });
  });

  it('over-count: more boarded than the control → out_of_balance, positive delta', () => {
    const rows = [loan('L-1', 1_000_000), loan('L-2', 2_000_000), loan('L-3', 3_000_000), loan('L-4', 0)];
    const r = deriveMigrationReconciliation(control(), rows);
    expect(r.status).toBe('out_of_balance');
    expect(r.count.delta).toBe(1);
  });

  it('under-count: fewer boarded than the control → out_of_balance, negative delta', () => {
    const rows = [loan('L-1', 1_000_000), loan('L-2', 2_000_000)];
    const r = deriveMigrationReconciliation(control({ enteredAggregateOutstanding: 3_000_000 }), rows);
    expect(r.status).toBe('out_of_balance');
    expect(r.count.delta).toBe(-1);
    expect(r.outstanding.delta).toBe(0);
  });

  it('over-dollars: count ties but boarded principal exceeds control → out_of_balance', () => {
    const rows = [loan('L-1', 1_000_000), loan('L-2', 2_000_000), loan('L-3', 3_250_000)];
    const r = deriveMigrationReconciliation(control(), rows);
    expect(r.status).toBe('out_of_balance');
    expect(r.count.delta).toBe(0);
    expect(r.outstanding.delta).toBe(250_000);
  });

  it('under-dollars: signed negative dollar delta', () => {
    const rows = [loan('L-1', 1_000_000), loan('L-2', 2_000_000), loan('L-3', 2_500_000)];
    const r = deriveMigrationReconciliation(control(), rows);
    expect(r.outstanding.delta).toBe(-500_000);
  });

  it('is float-safe at cent precision (0.1 + 0.2 style noise does not create a delta)', () => {
    const rows = [loan('L-1', 0.1), loan('L-2', 0.2)];
    const r = deriveMigrationReconciliation(
      control({ enteredLoanCount: 2, enteredAggregateOutstanding: 0.3 }),
      rows,
    );
    expect(r.outstanding.delta).toBe(0);
    expect(r.status).toBe('tied');
  });

  it('treats missing outstanding as zero, not a crash', () => {
    const rows = [loan('L-1', 1_000_000), { loanNumber: 'L-2', outstanding: undefined, migrationBatchId: BATCH }];
    const r = deriveMigrationReconciliation(control({ enteredLoanCount: 2, enteredAggregateOutstanding: 1_000_000 }), rows);
    expect(r.outstanding.boarded).toBe(1_000_000);
    expect(r.status).toBe('tied');
  });
});

describe('deriveMigrationReconciliation — batch scoping', () => {
  it('excludes rows tagged to a different batch; untagged rows are in scope', () => {
    const rows = [
      loan('L-1', 1_000_000),
      { loanNumber: 'OTHER', outstanding: 9_000_000, migrationBatchId: 'SOME-OTHER-BATCH' },
      { loanNumber: 'L-2', outstanding: 2_000_000 }, // untagged → in scope
    ];
    const r = deriveMigrationReconciliation(
      control({ enteredLoanCount: 2, enteredAggregateOutstanding: 3_000_000 }),
      rows,
    );
    expect(r.count.boarded).toBe(2);
    expect(r.outstanding.boarded).toBe(3_000_000);
    expect(r.status).toBe('tied');
  });
});

describe('deriveMigrationReconciliation — per-segment tie-out', () => {
  it('no subtotals declared → no segment rows', () => {
    const r = deriveMigrationReconciliation(control(), [loan('L-1', 6_000_000, {})]);
    expect(r.segments).toEqual([]);
  });

  it('per-segment mismatch flips overall out_of_balance even when grand totals tie', () => {
    const ctrl = control({
      segmentSubtotals: [
        { segment: 'C&I', count: 2, outstanding: 3_000_000 },
        { segment: 'CRE', count: 1, outstanding: 3_000_000 },
      ],
    });
    // Grand totals tie (3 loans, $6M) but the segment split is wrong: 1 C&I / 2 CRE.
    const rows = [
      loan('L-1', 1_500_000, { segment: 'C&I' }),
      loan('L-2', 1_500_000, { segment: 'CRE' }),
      loan('L-3', 3_000_000, { segment: 'CRE' }),
    ];
    const r = deriveMigrationReconciliation(ctrl, rows);
    expect(r.count.delta).toBe(0);
    expect(r.outstanding.delta).toBe(0);
    expect(r.status).toBe('out_of_balance');
    const ci = r.segments.find((s) => s.segment === 'C&I')!;
    const cre = r.segments.find((s) => s.segment === 'CRE')!;
    expect(ci.count.delta).toBe(-1);
    expect(cre.count.delta).toBe(1);
    expect(ci.status).toBe('out_of_balance');
  });

  it('a boarded segment absent from the control surfaces as an over-boarded segment', () => {
    const ctrl = control({
      enteredLoanCount: 1,
      enteredAggregateOutstanding: 1_000_000,
      segmentSubtotals: [{ segment: 'C&I', count: 1, outstanding: 1_000_000 }],
    });
    const rows = [loan('L-1', 1_000_000, { segment: 'C&I' }), loan('L-2', 500_000, { segment: 'Ag' })];
    const r = deriveMigrationReconciliation(ctrl, rows);
    const ag = r.segments.find((s) => s.segment === 'Ag')!;
    expect(ag.count).toEqual({ boarded: 1, control: 0, delta: 1 });
    expect(ag.status).toBe('out_of_balance');
  });
});

describe('deriveMigrationReconciliation — orphan lists', () => {
  it('no roster → both orphan lists empty', () => {
    const r = deriveMigrationReconciliation(control(), [loan('L-1', 6_000_000)]);
    expect(r.boardedNotInControl).toEqual([]);
    expect(r.inControlNotBoarded).toEqual([]);
  });

  it('matches trimmed + case-insensitive so only genuine orphans surface', () => {
    const ctrl = control({
      enteredLoanCount: 3,
      enteredAggregateOutstanding: 3_000_000,
      expectedLoanNumbers: ['L-1', 'L-2', 'L-99'],
    });
    const rows = [loan(' l-1 ', 1_000_000), loan('L-2', 1_000_000), loan('L-500', 1_000_000)];
    const r = deriveMigrationReconciliation(ctrl, rows);
    // 'l-1' matches 'L-1'; 'L-500' is over-boarded; 'L-99' is still owed.
    expect(r.boardedNotInControl).toEqual(['L-500']);
    expect(r.inControlNotBoarded).toEqual(['L-99']);
    expect(r.status).toBe('out_of_balance');
  });
});
