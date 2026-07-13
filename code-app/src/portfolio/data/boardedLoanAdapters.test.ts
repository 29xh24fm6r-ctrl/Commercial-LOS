import { describe, expect, it } from 'vitest';
import type { BoardedLoanRow } from '../../portfolioBoarding/boardedLoansList';
import { deriveDualRiskRating, type DualRatingRecord } from '../riskRating/dualRiskRating';
import { derivePortfolioBookSnapshot } from '../portfolioBookSnapshot';
import {
  mapRiskRatingToObligorGrade,
  toDualRatingInput,
  toEarlyWarningInput,
  toLoanProfitabilityInputs,
  toLoanReviewCandidate,
  toReviewQueueLoanInput,
  toWatchlistInput,
  toClassificationPoolInputs,
  toStressTestLoanInputs,
  toBoardPackageRiskInput,
  type PortfolioRatingMap,
} from './boardedLoanAdapters';

const ratingMap: PortfolioRatingMap = {
  pass: 3,
  substandard: 6,
};

function row(overrides: Partial<BoardedLoanRow> = {}): BoardedLoanRow {
  return {
    id: 'loan-1',
    loanNumber: 'L-100',
    borrower: 'Main Street Holdings',
    status: 'Active',
    outstanding: 6_000_000,
    riskRating: 'Substandard',
    maturityDate: '2026-09-15',
    watchlist: true,
    manuallyBoarded: false,
    boardingSource: 'originated_closed',
    portfolioManager: 'Jordan Banker',
    pastDueDays: 31,
    bookingDate: '2025-01-15',
    nextReviewDate: '2025-07-01',
    collateralType: 'CRE',
    lienPosition: 'first',
    guaranteeAmount: 12_000_000,
    extended: {
      schemaVersion: 1,
      product: 'C&I Term Loan',
      currentNoteRate: 6.75,
    },
    ...overrides,
  };
}

describe('boarded loan adapters', () => {
  it('defaults to the OBLIGOR_SCALE convention for unambiguous rating strings', () => {
    expect(mapRiskRatingToObligorGrade('Substandard')).toBe(6);
    expect(mapRiskRatingToObligorGrade('8')).toBe(8);
    expect(mapRiskRatingToObligorGrade(' Doubtful ')).toBe(7);
  });

  it('never maps a bare "Pass" — it spans grades 1-4 in this scale, so one grade would be fabricated precision', () => {
    expect(mapRiskRatingToObligorGrade('Pass')).toBeUndefined();
  });

  it('excludes any rating string outside the unambiguous default set (fail-closed, unchanged)', () => {
    expect(mapRiskRatingToObligorGrade('Bank internal 4')).toBeUndefined();
    expect(mapRiskRatingToObligorGrade('RR-9')).toBeUndefined();
  });

  it('maps ratified rating strings only when the caller supplies the approved map', () => {
    expect(mapRiskRatingToObligorGrade(' substandard ', ratingMap)).toBe(6);
    expect(mapRiskRatingToObligorGrade('unknown', ratingMap)).toBeUndefined();
  });

  it('builds profitability inputs only when outstanding and real note rate are present', () => {
    expect(toLoanProfitabilityInputs(row())?.avgLoanRate).toBe(6.75);
    expect(toLoanProfitabilityInputs(row({ extended: null }))).toBeUndefined();
    expect(toLoanProfitabilityInputs(row({ outstanding: undefined }))).toBeUndefined();
  });

  it('excludes unmapped risk ratings from dual-rating inputs', () => {
    expect(toDualRatingInput(row({ riskRating: 'Bank internal 4' }), ratingMap, '2026-07-02')).toBeUndefined();
  });

  it('does not let collateral upgrade the obligor-driven regulatory classification', () => {
    const input = toDualRatingInput(row(), ratingMap, '2026-07-02');
    expect(input?.obligorGrade).toBe(6);

    const outcome = input ? deriveDualRiskRating(input) : undefined;
    expect(outcome?.kind).toBe('rated');
    if (outcome?.kind === 'rated') {
      expect(outcome.record.obligorGrade).toBe(6);
      expect(outcome.record.classification).toBe('Substandard');
    }
  });

  it('maps boarded operational fields into the downstream pure derivers', () => {
    const boarded = row();

    expect(toEarlyWarningInput(boarded, '2026-07-02')).toMatchObject({
      loanId: 'loan-1',
      borrower: 'Main Street Holdings',
      owner: 'Jordan Banker',
      pastDueDays: 31,
    });
    expect(toWatchlistInput(boarded, 'Substandard')).toMatchObject({
      loanId: 'loan-1',
      watchFlag: true,
      classification: 'Substandard',
    });
    expect(toReviewQueueLoanInput(boarded, 6)).toMatchObject({
      loanId: 'loan-1',
      grade: 6,
      lastReviewDate: '2025-07-01',
    });
    expect(toLoanReviewCandidate(boarded, 6, 2)).toMatchObject({
      loanId: 'loan-1',
      exposure: 6_000_000,
      obligorGrade: 6,
      exceptionCount: 2,
      segment: 'C&I Term Loan',
      originatingBanker: 'Jordan Banker',
    });
  });
});

describe('Phase 264 (P3) — toClassificationPoolInputs', () => {
  function rating(over: Partial<DualRatingRecord> = {}): DualRatingRecord {
    return {
      loanId: 'loan-1',
      effectiveDate: '2026-07-02',
      obligorGrade: 6,
      obligorLabel: 'Substandard',
      pd: 0.15,
      facilityBand: 'well_secured',
      facilityLabel: 'Well secured',
      lgd: 0.3,
      blendedGrade: 6,
      classification: 'Substandard',
      criticized: true,
      classified: true,
      overridden: false,
      drivers: [],
      ...over,
    };
  }

  it('pairs a rating with its matching loan\'s exposure and borrower', () => {
    const inputs = toClassificationPoolInputs([row()], [rating()]);
    expect(inputs).toEqual([
      { loanId: 'loan-1', borrowerName: 'Main Street Holdings', exposure: 6_000_000, rating: rating() },
    ]);
  });

  it('drops a rating with no loanId (never fabricates one)', () => {
    const inputs = toClassificationPoolInputs([row()], [rating({ loanId: undefined })]);
    expect(inputs).toHaveLength(0);
  });

  it('pairs exposure 0 / undefined borrower when no matching loan is found, rather than dropping the rating', () => {
    const inputs = toClassificationPoolInputs([], [rating({ loanId: 'unmatched' })]);
    expect(inputs).toEqual([{ loanId: 'unmatched', borrowerName: undefined, exposure: 0, rating: rating({ loanId: 'unmatched' }) }]);
  });
});

describe('Phase 264 (P3) — toStressTestLoanInputs', () => {
  it('maps rate structure and leaves collateralValue undefined (WI-6, deferred — never fabricated)', () => {
    const inputs = toStressTestLoanInputs([row({ interestRateType: 'Variable', spread: 2.5 })]);
    expect(inputs).toEqual([
      { loanId: 'loan-1', borrowerName: 'Main Street Holdings', exposure: 6_000_000, interestRateType: 'Variable', currentSpreadPct: 2.5, collateralValue: undefined },
    ]);
  });

  it('defaults missing exposure to 0, never NaN/undefined', () => {
    const inputs = toStressTestLoanInputs([row({ outstanding: undefined })]);
    expect(inputs[0].exposure).toBe(0);
  });
});

describe('Phase 264 (P3) — toBoardPackageRiskInput', () => {
  it('excludes "Unknown borrower"/"Unknown product"/"Unassigned" from concentration figures, never treats an absence bucket as a real finding', () => {
    const loans = [
      row({ id: 'a', borrower: undefined, outstanding: 9_000_000, extended: undefined, portfolioManager: undefined }),
      row({ id: 'b', borrower: 'Acme LLC', outstanding: 1_000_000, extended: { schemaVersion: 1, product: 'SBA 7(a)' }, portfolioManager: 'Jane Manager' }),
    ];
    const snapshot = derivePortfolioBookSnapshot(loans, []);
    const risk = toBoardPackageRiskInput(snapshot);

    // Unknown borrower is 90% of exposure but must NOT be reported as the single name.
    expect(risk.concentration.singleNameClient).toBe('Acme LLC');
    expect(risk.concentration.singleNamePct).toBe(10);
    expect(risk.concentration.topProductLabel).toBe('SBA 7(a)');
    expect(risk.concentration.topBankerLabel).toBe('Jane Manager');
    expect(risk.findings).toEqual([]);
  });

  it('reports honest zeros when every loan is unknown/unassigned — never fabricates a concentration finding', () => {
    const loans = [row({ id: 'a', borrower: undefined, extended: undefined, portfolioManager: undefined })];
    const snapshot = derivePortfolioBookSnapshot(loans, []);
    const risk = toBoardPackageRiskInput(snapshot);

    expect(risk.concentration.singleNameClient).toBeUndefined();
    expect(risk.concentration.singleNamePct).toBe(0);
    expect(risk.concentration.singleNameBand).toBe('low');
  });

  it('counts deals at/above the internal large-exposure threshold from real outstanding amounts', () => {
    const loans = [row({ id: 'a', outstanding: 6_000_000 }), row({ id: 'b', outstanding: 1_000_000 })];
    const snapshot = derivePortfolioBookSnapshot(loans, []);
    const risk = toBoardPackageRiskInput(snapshot);

    expect(risk.exposure.dealsAboveThresholdCount).toBe(1);
    expect(risk.exposure.largestExposure).toBe(6_000_000);
  });
});
