import { describe, expect, it } from 'vitest';
import type { BoardedLoanRow } from '../../portfolioBoarding/boardedLoansList';
import { deriveDualRiskRating } from '../riskRating/dualRiskRating';
import {
  mapRiskRatingToObligorGrade,
  toDualRatingInput,
  toEarlyWarningInput,
  toLoanProfitabilityInputs,
  toLoanReviewCandidate,
  toReviewQueueLoanInput,
  toWatchlistInput,
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
