/**
 * Phase 140B-H — Command center adapter.
 * Pure functions. No data loading. No query scope widening. No fake rows.
 */
import type { PortfolioLoanBoardingPackage, PortfolioLoanBoardingSource } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingSnapshot } from '../shared/portfolioBoarding/portfolioLoanBoardingSnapshot';

export interface BoardedLoanCommandRow {
  loanName: string | undefined;
  borrowerName: string | undefined;
  loanNumber: string | undefined;
  currentBalance: number | undefined;
  maturityDate: string | undefined;
  riskRating: string | undefined;
  nextReviewDate: string | undefined;
  fdicReady: boolean;
  boardReady: boolean;
  portfolioMonitoringReady: boolean;
  exceptionCount: number;
  staleDocumentCount: number;
  source: PortfolioLoanBoardingSource | undefined;
}

export function derivePortfolioBoardedLoanCommandRows(
  packages: readonly PortfolioLoanBoardingPackage[],
): readonly BoardedLoanCommandRow[] {
  return packages.map((pkg) => {
    const snapshot = derivePortfolioLoanBoardingSnapshot({ package: pkg });
    return {
      loanName: snapshot.loanName,
      borrowerName: snapshot.borrowerName,
      loanNumber: snapshot.loanNumber,
      currentBalance: snapshot.currentBalance,
      maturityDate: snapshot.maturityDate,
      riskRating: snapshot.riskRating,
      nextReviewDate: snapshot.nextReviewDate,
      fdicReady: snapshot.fdicReady,
      boardReady: snapshot.boardReady,
      portfolioMonitoringReady: snapshot.portfolioMonitoringReady,
      exceptionCount: snapshot.exceptionSummary?.openCount ?? 0,
      staleDocumentCount: snapshot.staleDocumentSummary?.count ?? 0,
      source: pkg.source,
    };
  });
}

export function mergeBoardedLoansIntoPortfolioSnapshotInput<T extends { boardedLoans?: readonly BoardedLoanCommandRow[] }>(
  existing: T,
  boardedRows: readonly BoardedLoanCommandRow[],
): T {
  return { ...existing, boardedLoans: boardedRows };
}

export function mergeBoardedLoansIntoManagerSnapshotInput<T extends { boardedLoans?: readonly BoardedLoanCommandRow[] }>(
  existing: T,
  boardedRows: readonly BoardedLoanCommandRow[],
): T {
  return { ...existing, boardedLoans: boardedRows };
}

export function mergeBoardedLoansIntoExecutiveSnapshotInput<T extends { boardedLoans?: readonly BoardedLoanCommandRow[] }>(
  existing: T,
  boardedRows: readonly BoardedLoanCommandRow[],
): T {
  return { ...existing, boardedLoans: boardedRows };
}
