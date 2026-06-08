/**
 * Phase 140P — Portfolio Boarding package EXPORT model.
 *
 * A PURE, deterministic export view-model that composes the existing FDIC /
 * board / portfolio-manager review derivers into one structure a UI can render
 * or an operator can copy. It produces JSON/view-model only — NO PDF, NO
 * external API — and it never hides missing / stale / exception items.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no PDF, no external call. Deterministic given (pkg, now).
 *   - Discloses missing / stale / exception items (never hidden).
 *   - Readiness is taken from the derivers (fail-closed); nothing is faked.
 */

import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import {
  deriveFdicExaminerPackage,
  deriveBoardLoanReviewPackage,
  derivePortfolioManagerReviewPackage,
  deriveFdicExaminerRequestChecklist,
} from '../shared/portfolioBoarding/fdicExaminerPackage';

export const PORTFOLIO_BOARDING_EXPORT_FORMAT = 'json-view-model';

export interface PortfolioBoardingExportModel {
  /** Always 'json-view-model' — this phase generates no PDF and calls no API. */
  format: typeof PORTFOLIO_BOARDING_EXPORT_FORMAT;
  loanName: string | undefined;
  borrowerName: string | undefined;
  loanNumber: string | undefined;
  riskRating: string | undefined;
  readiness: {
    fdicReady: boolean;
    boardReady: boolean;
    portfolioMonitoringReady: boolean;
  };
  fdic: ReturnType<typeof deriveFdicExaminerPackage>;
  board: ReturnType<typeof deriveBoardLoanReviewPackage>;
  portfolioManager: ReturnType<typeof derivePortfolioManagerReviewPackage>;
  examinerChecklist: ReturnType<typeof deriveFdicExaminerRequestChecklist>;
  disclosures: {
    missing: readonly string[];
    stale: readonly string[];
    exceptions: readonly string[];
    blockers: readonly string[];
  };
  /** Plain-language statement that nothing is hidden and no PDF was produced. */
  disclosureStatement: string;
}

export function derivePortfolioBoardingExportModel(
  pkg: PortfolioLoanBoardingPackage,
  now?: Date,
): PortfolioBoardingExportModel {
  const fdic = deriveFdicExaminerPackage(pkg, now);
  const board = deriveBoardLoanReviewPackage(pkg, now);
  const portfolioManager = derivePortfolioManagerReviewPackage(pkg, now);
  const examinerChecklist = deriveFdicExaminerRequestChecklist(pkg);

  return {
    format: PORTFOLIO_BOARDING_EXPORT_FORMAT,
    loanName: fdic.loanName,
    borrowerName: fdic.borrowerName,
    loanNumber: fdic.loanNumber,
    riskRating: fdic.riskRating,
    readiness: {
      fdicReady: fdic.fdicReady,
      boardReady: fdic.boardReady,
      portfolioMonitoringReady: fdic.portfolioMonitoringReady,
    },
    fdic,
    board,
    portfolioManager,
    examinerChecklist,
    disclosures: {
      missing: fdic.missingDisclosure,
      stale: fdic.staleDisclosure,
      exceptions: fdic.exceptionDisclosure,
      blockers: fdic.blockers,
    },
    disclosureStatement:
      'Export view-model only — no PDF was generated and no external service was called. Missing, stale, and exception items are disclosed, not hidden.',
  };
}
