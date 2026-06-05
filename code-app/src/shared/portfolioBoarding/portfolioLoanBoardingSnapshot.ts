/**
 * Phase 140B — Portfolio Loan Boarding snapshot deriver.
 *
 * Turns a `PortfolioLoanBoardingPackage` into a compact, honest summary view
 * model for portfolio / manager / board surfaces. Built on the same pure
 * completeness deriver so the summary and the detail read from one source of
 * truth.
 *
 * Discipline:
 *   - PURE. No React, no Dataverse, no network. Deterministic given inputs.
 *   - Does NOT invent values. Missing scalars pass through as `undefined`;
 *     percentages are honest ratios (0 when there is nothing to measure).
 */

import type { PortfolioLoanBoardingPackage } from './portfolioLoanBoardingTypes';
import type { PortfolioLoanDocumentType } from './portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingCompleteness } from './derivePortfolioLoanBoardingCompleteness';

export interface BoardingExceptionSummary {
  openCount: number;
  highSeverityCount: number;
}

export interface BoardingStaleDocumentSummary {
  count: number;
  documentTypes: readonly PortfolioLoanDocumentType[];
}

export interface BoardingCovenantSummary {
  total: number;
  inBreach: number;
  waived: number;
}

export interface BoardingCollateralSummary {
  itemCount: number;
  hasRealEstate: boolean;
  types: readonly string[];
}

export interface BoardingGuarantorSummary {
  count: number;
  missingFinancialStatementCount: number;
}

export interface PortfolioLoanBoardingSnapshot {
  loanName?: string;
  borrowerName?: string;
  loanNumber?: string;
  status?: string;
  currentBalance?: number;
  maturityDate?: string;
  riskRating?: string;
  nextReviewDate?: string;
  documentCompletenessPct: number;
  fieldCompletenessPct: number;
  fdicReady: boolean;
  boardReady: boolean;
  portfolioMonitoringReady: boolean;
  topBlockers: readonly string[];
  exceptionSummary: BoardingExceptionSummary;
  staleDocumentSummary: BoardingStaleDocumentSummary;
  covenantSummary: BoardingCovenantSummary;
  collateralSummary: BoardingCollateralSummary;
  guarantorSummary: BoardingGuarantorSummary;
}

export interface BoardingSnapshotInput {
  package: PortfolioLoanBoardingPackage;
  now?: Date;
  /** How many blockers to surface in `topBlockers`. Defaults to 5. */
  topBlockerLimit?: number;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function derivePortfolioLoanBoardingSnapshot(
  input: BoardingSnapshotInput,
): PortfolioLoanBoardingSnapshot {
  const pkg = input.package;
  const limit = input.topBlockerLimit ?? 5;

  const completeness = derivePortfolioLoanBoardingCompleteness({
    package: pkg,
    now: input.now,
  });

  const covenants = pkg.covenants?.covenants ?? [];
  const collateralItems = pkg.collateral?.items ?? [];
  const guarantors = pkg.guarantors?.guarantors ?? [];

  const collateralTypes = [
    ...new Set(
      collateralItems
        .map((c) => c.collateralType)
        .filter((t): t is NonNullable<typeof t> => t !== undefined),
    ),
  ];

  return {
    // Identity passes through untouched — undefined stays undefined.
    loanName: pkg.identity?.dealName,
    borrowerName: pkg.identity?.borrowerLegalName,
    loanNumber: pkg.identity?.loanNumber,
    status: pkg.identity?.loanStatus,
    currentBalance: pkg.terms?.currentOutstandingPrincipal,
    maturityDate: pkg.identity?.maturityDate,
    riskRating: pkg.servicing?.currentRiskRating,
    nextReviewDate: pkg.servicing?.nextReviewDate,

    documentCompletenessPct: pct(
      completeness.receivedRequiredDocuments,
      completeness.totalRequiredDocuments,
    ),
    fieldCompletenessPct: pct(
      completeness.completedRequiredFields,
      completeness.totalRequiredFields,
    ),

    fdicReady: completeness.fdicReady,
    boardReady: completeness.boardReady,
    portfolioMonitoringReady: completeness.portfolioMonitoringReady,

    topBlockers: completeness.blockers.slice(0, limit),

    exceptionSummary: {
      openCount: completeness.exceptionCount,
      highSeverityCount: completeness.highSeverityExceptionCount,
    },
    staleDocumentSummary: {
      count: completeness.staleDocuments.length,
      documentTypes: completeness.staleDocuments,
    },
    covenantSummary: {
      total: covenants.length,
      inBreach: covenants.filter((c) => c.currentStatus === 'breach').length,
      waived: covenants.filter((c) => c.currentStatus === 'waived').length,
    },
    collateralSummary: {
      itemCount: collateralItems.length,
      hasRealEstate: collateralItems.some(
        (c) => c.collateralType === 'real_estate',
      ),
      types: collateralTypes,
    },
    guarantorSummary: {
      count: guarantors.length,
      missingFinancialStatementCount: guarantors.filter(
        (g) =>
          g.personalFinancialStatementDate === undefined ||
          g.personalFinancialStatementDate === '',
      ).length,
    },
  };
}
