import { describe, expect, it } from 'vitest';
import type { BoardedLoanRow } from '../portfolioBoarding/boardedLoansList';
import type { DualRatingRecord } from './riskRating/dualRiskRating';
import { derivePortfolioBookSnapshot } from './portfolioBookSnapshot';

function loan(overrides: Partial<BoardedLoanRow>): BoardedLoanRow {
  return {
    id: 'loan',
    loanNumber: undefined,
    borrower: undefined,
    status: undefined,
    outstanding: undefined,
    riskRating: undefined,
    maturityDate: undefined,
    watchlist: false,
    manuallyBoarded: false,
    boardingSource: undefined,
    extended: null,
    ...overrides,
  };
}

function rating(overrides: Partial<DualRatingRecord>): DualRatingRecord {
  return {
    loanId: 'loan',
    effectiveDate: '2026-07-02',
    obligorGrade: 3,
    obligorLabel: 'Average risk',
    pd: 0.0075,
    facilityBand: 'unsecured',
    facilityLabel: 'Unsecured',
    lgd: 0.6,
    blendedGrade: 3,
    classification: 'Pass',
    criticized: false,
    classified: false,
    overridden: false,
    drivers: [],
    ...overrides,
  };
}

describe('derivePortfolioBookSnapshot', () => {
  it('returns an honest empty snapshot', () => {
    const snapshot = derivePortfolioBookSnapshot([]);

    expect(snapshot.isEmpty).toBe(true);
    expect(snapshot.commandRibbon.loanCount).toBe(0);
    expect(snapshot.commandRibbon.totalExposure).toBe(0);
    expect(snapshot.topExposures).toEqual([]);
  });

  it('preserves originating-deal traceability in the snapshot loan rows', () => {
    const source = loan({ id: 'linked-loan', originatedDealId: 'deal-42' });
    const snapshot = derivePortfolioBookSnapshot([source]);

    expect(snapshot.loans[0]).toBe(source);
    expect(snapshot.loans[0]?.originatedDealId).toBe('deal-42');
  });

  it('rolls boarded loans into book-scoped concentration and top exposure rows', () => {
    const snapshot = derivePortfolioBookSnapshot(
      [
        loan({
          id: 'a',
          loanNumber: 'L-1',
          borrower: 'Main Street Holdings',
          outstanding: 8_000_000,
          riskRating: 'Substandard',
          watchlist: true,
          portfolioManager: 'Jordan Banker',
          maturityDate: '2026-08-01',
          extended: { schemaVersion: 1, product: 'C&I Term Loan' },
        }),
        loan({
          id: 'b',
          outstanding: 2_000_000,
          riskRating: 'Pass',
          extended: null,
        }),
      ],
      [rating({ loanId: 'a', obligorGrade: 6, blendedGrade: 6, classification: 'Substandard', criticized: true, classified: true })],
      '2026-07-02T00:00:00.000Z',
    );

    expect(snapshot.isEmpty).toBe(false);
    expect(snapshot.commandRibbon).toMatchObject({
      loanCount: 2,
      totalExposure: 10_000_000,
      criticizedCount: 1,
      classifiedCount: 1,
      unmappedRatingCount: 1,
      watchlistCount: 1,
    });
    expect(snapshot.byBorrower[0]).toMatchObject({
      label: 'Main Street Holdings',
      totalExposure: 8_000_000,
      sharePct: 80,
    });
    expect(snapshot.byProduct.find((row) => row.label === 'Unknown product')?.loanCount).toBe(1);
    // WI-2: loan 'a' carries a manager name → buckets under it; loan 'b' has none → 'Unassigned'.
    expect(snapshot.byPortfolioManager.find((row) => row.label === 'Jordan Banker')).toMatchObject({
      loanCount: 1,
      totalExposure: 8_000_000,
    });
    expect(snapshot.byPortfolioManager.find((row) => row.label === 'Unassigned')?.loanCount).toBe(1);
    expect(snapshot.topExposures[0]).toMatchObject({
      loanId: 'a',
      outstanding: 8_000_000,
      sharePct: 80,
    });
    // P2-16 — the unmapped list reconciles with the count and points at the exact loan ('b': 'Pass'
    // carries a rating string the dual-rating map deliberately does not resolve).
    expect(snapshot.unmappedRatingLoans).toHaveLength(snapshot.commandRibbon.unmappedRatingCount);
    expect(snapshot.unmappedRatingLoans.map((r) => r.id)).toEqual(['b']);
  });

  it('P2-16: unmapped-rating count equals the drill-through list, and lists exactly the unmapped loans', () => {
    const snapshot = derivePortfolioBookSnapshot(
      [
        loan({ id: 'rated', riskRating: 'Substandard', outstanding: 1_000_000 }),
        loan({ id: 'unmapped-1', riskRating: 'Bank internal 4', outstanding: 500_000 }),
        loan({ id: 'unmapped-2', riskRating: 'Pass', outstanding: 250_000 }),
        loan({ id: 'no-rating-text', riskRating: undefined, outstanding: 100_000 }),
      ],
      [rating({ loanId: 'rated', obligorGrade: 6 })],
      '2026-07-02T00:00:00.000Z',
    );
    // Count is derived from the list, so they cannot diverge.
    expect(snapshot.commandRibbon.unmappedRatingCount).toBe(3);
    expect(snapshot.unmappedRatingLoans).toHaveLength(3);
    // Exactly the loans whose displayed rating state is not backed by a dual-rating record.
    expect(snapshot.unmappedRatingLoans.map((r) => r.id).sort()).toEqual(['no-rating-text', 'unmapped-1', 'unmapped-2']);
    // A loan WITHOUT rating text is included because the UI surfaces it as an unmapped/unknown rating condition.
    expect(snapshot.unmappedRatingLoans.map((r) => r.id)).toContain('no-rating-text');
    expect(snapshot.unmappedRatingLoans.map((r) => r.id)).not.toContain('rated');
  });

  it('builds maturity and exposure bands from boarded loan dates and balances', () => {
    const snapshot = derivePortfolioBookSnapshot(
      [
        loan({ id: 'past', outstanding: 100_000, maturityDate: '2026-07-01' }),
        loan({ id: 'near', outstanding: 750_000, maturityDate: '2026-07-20' }),
        loan({ id: 'later', outstanding: 6_000_000, maturityDate: '2027-08-01' }),
        loan({ id: 'unknown', outstanding: undefined, maturityDate: undefined }),
      ],
      [],
      '2026-07-02T00:00:00.000Z',
    );

    expect(snapshot.maturityLadder.find((row) => row.label === 'Past due/matured')?.loanCount).toBe(1);
    expect(snapshot.maturityLadder.find((row) => row.label === '0-30d')?.loanCount).toBe(1);
    expect(snapshot.maturityLadder.find((row) => row.label === '>365d')?.loanCount).toBe(1);
    expect(snapshot.maturityLadder.find((row) => row.label === 'Unknown maturity')?.loanCount).toBe(1);
    expect(snapshot.exposureBands.find((row) => row.label === '$500K-$1MM')?.loanCount).toBe(1);
    expect(snapshot.exposureBands.find((row) => row.label === '$5MM-$10MM')?.loanCount).toBe(1);
  });
});
