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
    expect(snapshot.byPortfolioManager.find((row) => row.label === 'Unassigned')?.loanCount).toBe(1);
    expect(snapshot.topExposures[0]).toMatchObject({
      loanId: 'a',
      outstanding: 8_000_000,
      sharePct: 80,
    });
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
