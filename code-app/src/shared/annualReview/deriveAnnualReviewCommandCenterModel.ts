/**
 * Phase 141A — Annual Review command-center model (pure).
 *
 * Projects the in-scope loans + cycle into the KPI ribbon, the per-loan rows,
 * and the escalation tape the command center renders. Pure and honest: empty
 * input → empty model; no fake rows; no fake completion.
 */

import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewCycle,
  AnnualReviewEscalation,
  AnnualReviewSoundnessStatus,
  AnnualReviewEscalationLevel,
} from './annualReviewTypes';
import { deriveAnnualReviewCollectionPlan } from './deriveAnnualReviewCollectionPlan';
import { deriveAnnualReviewReadiness } from './deriveAnnualReviewReadiness';
import { deriveBorrowerSoundnessAssessment } from './deriveBorrowerSoundnessAssessment';
import { loanRequiresAnnualReview } from './annualReviewRequirementCatalog';

export interface AnnualReviewKpis {
  totalLoansInScope: number;
  financialsRequested: number;
  financialsReceived: number;
  financialsMissing: number;
  pastDuePackages: number;
  receivedNotReviewed: number;
  reviewsReadyToComplete: number;
  reviewsBlocked: number;
  highRiskWatchlist: number;
  upcomingDueCount: number;
  escalationCount: number;
}

export type AnnualReviewRowStatus =
  | 'not_started'
  | 'financials_requested'
  | 'in_review'
  | 'ready_to_complete'
  | 'blocked';

export interface AnnualReviewCommandRow {
  loanId?: string;
  loanNumber?: string;
  borrowerName?: string;
  relationshipName?: string;
  owner?: string;
  reviewDueDate?: string;
  riskRating?: string;
  watchlist: boolean;
  requiredDocsCount: number;
  receivedDocsCount: number;
  missingDocsCount: number;
  pastDueDocsCount: number;
  reviewStatus: AnnualReviewRowStatus;
  soundnessStatus: AnnualReviewSoundnessStatus;
  escalationLevel: AnnualReviewEscalationLevel | 'none';
}

export interface AnnualReviewCommandCenterModel {
  kpis: AnnualReviewKpis;
  rows: readonly AnnualReviewCommandRow[];
  escalations: readonly AnnualReviewEscalation[];
}

export interface CommandCenterInput {
  loans: readonly AnnualReviewLoanSnapshot[];
  cycle: AnnualReviewCycle;
  asOfDate?: string | Date;
}

const ESCALATION_ORDER: readonly AnnualReviewEscalationLevel[] = [
  'owner',
  'manager',
  'portfolio_manager',
  'executive',
  'board',
  'fdic',
];

function highestEscalation(
  escalations: readonly AnnualReviewEscalation[],
): AnnualReviewEscalationLevel | 'none' {
  let best = -1;
  for (const e of escalations) {
    const idx = ESCALATION_ORDER.indexOf(e.level);
    if (idx > best) best = idx;
  }
  return best === -1 ? 'none' : ESCALATION_ORDER[best]!;
}

export function deriveAnnualReviewCommandCenterModel(
  input: CommandCenterInput,
): AnnualReviewCommandCenterModel {
  const rows: AnnualReviewCommandRow[] = [];
  const allEscalations: AnnualReviewEscalation[] = [];

  let financialsRequested = 0;
  let financialsReceived = 0;
  let financialsMissing = 0;
  let pastDuePackages = 0;
  let receivedNotReviewed = 0;
  let reviewsReadyToComplete = 0;
  let reviewsBlocked = 0;
  let highRiskWatchlist = 0;
  let upcomingDueCount = 0;

  for (const loan of input.loans) {
    if (!loanRequiresAnnualReview(loan)) continue;

    const plan = deriveAnnualReviewCollectionPlan({
      loans: [loan],
      cycle: input.cycle,
      asOfDate: input.asOfDate,
    });
    const requirements = plan.requirementsByLoan[0]?.requirements ?? [];
    const readiness = deriveAnnualReviewReadiness({ loan, cycle: input.cycle, asOfDate: input.asOfDate });
    const soundness = deriveBorrowerSoundnessAssessment({ loan });

    const requiredDocsCount = requirements.length;
    const receivedDocsCount = requirements.filter(
      (r) => r.status === 'received' || r.status === 'reviewed' || r.status === 'accepted',
    ).length;
    const missingDocsCount = requirements.filter((r) => r.status === 'missing').length;
    const pastDueDocsCount = plan.pastDue.length;
    const watchlist =
      loan.watchlistFlag === true || (loan.criticizedClassifiedStatus ?? '').trim().length > 0;
    const escalationLevel = highestEscalation(plan.escalations);

    let reviewStatus: AnnualReviewRowStatus;
    if (readiness.blockers.length > 0 && pastDueDocsCount > 0) reviewStatus = 'blocked';
    else if (readiness.annualReviewReady) reviewStatus = 'ready_to_complete';
    else if (receivedDocsCount > 0) reviewStatus = 'in_review';
    else if (requiredDocsCount > 0) reviewStatus = 'financials_requested';
    else reviewStatus = 'not_started';

    rows.push({
      loanId: loan.boardedLoanId,
      loanNumber: loan.loanNumber,
      borrowerName: loan.borrowerName,
      relationshipName: loan.relationshipName,
      owner: loan.servicingOwner ?? loan.portfolioManager,
      reviewDueDate: loan.annualReviewDueDate ?? input.cycle.cycleEndDate,
      riskRating: loan.riskRating,
      watchlist,
      requiredDocsCount,
      receivedDocsCount,
      missingDocsCount,
      pastDueDocsCount,
      reviewStatus,
      soundnessStatus: soundness.status,
      escalationLevel,
    });

    allEscalations.push(...plan.escalations);
    financialsRequested += 1;
    if (receivedDocsCount > 0) financialsReceived += 1;
    if (missingDocsCount > 0) financialsMissing += 1;
    if (pastDueDocsCount > 0) pastDuePackages += 1;
    if (receivedDocsCount > 0 && readiness.financialsComplete === false) receivedNotReviewed += 1;
    if (readiness.annualReviewReady) reviewsReadyToComplete += 1;
    if (readiness.blockers.length > 0) reviewsBlocked += 1;
    if (watchlist) highRiskWatchlist += 1;
    upcomingDueCount += plan.upcomingDue.length + plan.dueNow.length;
  }

  return {
    kpis: {
      totalLoansInScope: financialsRequested,
      financialsRequested,
      financialsReceived,
      financialsMissing,
      pastDuePackages,
      receivedNotReviewed,
      reviewsReadyToComplete,
      reviewsBlocked,
      highRiskWatchlist,
      upcomingDueCount,
      escalationCount: allEscalations.length,
    },
    rows,
    escalations: allEscalations,
  };
}
