/**
 * Phase 140M — Portfolio Boarding list rows + filtering (pure).
 *
 * Projects authorized boarded-loan packages into list rows and applies the
 * search/filter selection. Pure and honest: it never invents records, and an
 * empty input yields an empty list.
 */

import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import {
  derivePortfolioBoardedLoanCommandRows,
  type BoardedLoanCommandRow,
} from './portfolioBoardingCommandCenterAdapter';

export interface BoardingListRow extends BoardedLoanCommandRow {
  packageId: string | undefined;
  boardingStatus: string | undefined;
  updatedAt: string | undefined;
}

export function deriveBoardingListRows(
  packages: readonly PortfolioLoanBoardingPackage[],
): readonly BoardingListRow[] {
  const baseRows = derivePortfolioBoardedLoanCommandRows(packages);
  return baseRows.map((row, i) => {
    const pkg = packages[i]!;
    return {
      ...row,
      packageId: pkg.packageId,
      boardingStatus: pkg.audit?.boardingStatus,
      updatedAt: pkg.updatedAt ?? pkg.audit?.updatedAt,
    };
  });
}

export type ReadinessFilter = 'any' | 'fdic' | 'board' | 'portfolio';

export interface BoardingListFilter {
  borrowerQuery?: string;
  loanNumberQuery?: string;
  boardingStatus?: string;
  readiness?: ReadinessFilter;
  riskRating?: string;
  watchlistOnly?: boolean;
  exceptionsOnly?: boolean;
  staleDocumentsOnly?: boolean;
}

function matchesText(value: string | undefined, query: string | undefined): boolean {
  if (!query || query.trim().length === 0) return true;
  if (value === undefined) return false;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export function filterBoardingListRows(
  rows: readonly BoardingListRow[],
  filter: BoardingListFilter,
): readonly BoardingListRow[] {
  return rows.filter((row) => {
    if (!matchesText(row.borrowerName, filter.borrowerQuery)) return false;
    if (!matchesText(row.loanNumber, filter.loanNumberQuery)) return false;
    if (filter.boardingStatus && row.boardingStatus !== filter.boardingStatus) return false;
    if (filter.riskRating && row.riskRating !== filter.riskRating) return false;
    if (filter.readiness === 'fdic' && !row.fdicReady) return false;
    if (filter.readiness === 'board' && !row.boardReady) return false;
    if (filter.readiness === 'portfolio' && !row.portfolioMonitoringReady) return false;
    if (filter.exceptionsOnly && row.exceptionCount <= 0) return false;
    if (filter.staleDocumentsOnly && row.staleDocumentCount <= 0) return false;
    return true;
  });
}
