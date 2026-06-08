/**
 * Phase 141A — Annual Review collection / due-date engine.
 *
 * A PURE projection: given the in-scope loans and the review cycle, it builds
 * each loan's document requirements (with real due dates, status, and
 * staleness) and buckets them into upcoming / due-now / past-due / missing /
 * received-not-reviewed / accepted / rejected / stale, plus escalations and
 * blockers.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO. Deterministic given (loans, cycle, asOfDate).
 *   - No fake completion, no fake due dates: due dates derive from the loan /
 *     cycle policy, and an absent required financial is a blocker.
 *   - Empty portfolio → honest empty result.
 */

import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewCycle,
  AnnualReviewDocumentRequirement,
  AnnualReviewBorrowerRequirement,
  AnnualReviewEscalation,
  AnnualReviewRequirementStatus,
  AnnualReviewSubmittedDocument,
} from './annualReviewTypes';
import {
  getAnnualReviewRequirementsForLoan,
  loanRequiresAnnualReview,
  type AnnualReviewRequirementDefinition,
} from './annualReviewRequirementCatalog';

const MS_PER_DAY = 86_400_000;
const DUE_SOON_DAYS = 30;

export interface AnnualReviewCollectionPlanInput {
  loans: readonly AnnualReviewLoanSnapshot[];
  cycle: AnnualReviewCycle;
  /** Overrides cycle.asOfDate when provided. */
  asOfDate?: string | Date;
}

export interface AnnualReviewRequirementInstance {
  loanId?: string;
  loanNumber?: string;
  borrowerName?: string;
  requirement: AnnualReviewDocumentRequirement;
}

export interface AnnualReviewCollectionPlanResult {
  totalLoansInScope: number;
  loansRequiringReview: number;
  loansNotRequiringReview: number;
  requirementsByLoan: readonly AnnualReviewBorrowerRequirement[];
  upcomingDue: readonly AnnualReviewRequirementInstance[];
  dueNow: readonly AnnualReviewRequirementInstance[];
  pastDue: readonly AnnualReviewRequirementInstance[];
  missing: readonly AnnualReviewRequirementInstance[];
  receivedNotReviewed: readonly AnnualReviewRequirementInstance[];
  reviewedAccepted: readonly AnnualReviewRequirementInstance[];
  rejectedNeedsFollowUp: readonly AnnualReviewRequirementInstance[];
  stale: readonly AnnualReviewRequirementInstance[];
  escalations: readonly AnnualReviewEscalation[];
  blockers: readonly string[];
}

function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function resolveNow(input: AnnualReviewCollectionPlanInput): number {
  const explicit =
    input.asOfDate instanceof Date
      ? input.asOfDate.getTime()
      : parseDate(input.asOfDate);
  return explicit ?? parseDate(input.cycle.asOfDate) ?? Date.now();
}

function resolveDueDate(
  def: AnnualReviewRequirementDefinition,
  loan: AnnualReviewLoanSnapshot,
  cycle: AnnualReviewCycle,
): string | undefined {
  if (def.dueDateRule === 'annual_review_due_date') {
    return loan.annualReviewDueDate ?? cycle.cycleEndDate ?? loan.nextReviewDate;
  }
  // cycle_end / fiscal_year_end both fall back to the cycle end date here.
  return cycle.cycleEndDate ?? loan.annualReviewDueDate ?? loan.nextReviewDate;
}

function findSubmitted(
  loan: AnnualReviewLoanSnapshot,
  def: AnnualReviewRequirementDefinition,
): AnnualReviewSubmittedDocument | undefined {
  return (loan.submittedDocuments ?? []).find((d) => d.documentType === def.documentType);
}

function deriveStatus(
  doc: AnnualReviewSubmittedDocument | undefined,
): AnnualReviewRequirementStatus {
  if (!doc) return 'missing';
  if (doc.accepted === true) return 'accepted';
  if (doc.status === 'rejected' || (doc.rejectedReason && doc.rejectedReason.length > 0))
    return 'rejected';
  if (doc.reviewedDate) return 'reviewed';
  if (doc.status === 'received' || doc.receivedDate) return 'received';
  return 'requested';
}

function isStale(
  def: AnnualReviewRequirementDefinition,
  doc: AnnualReviewSubmittedDocument | undefined,
  now: number,
): boolean {
  if (!doc || def.staleAfterDays === undefined) return false;
  // Only documents that are at least received can be "stale".
  const received = doc.accepted === true || doc.reviewedDate || doc.receivedDate || doc.status === 'received';
  if (!received) return false;
  const ref =
    parseDate(doc.effectiveDate) ?? parseDate(doc.periodEndDate) ?? parseDate(doc.receivedDate);
  if (ref === undefined) return true; // cannot prove freshness
  return (now - ref) / MS_PER_DAY > def.staleAfterDays;
}

export function deriveAnnualReviewCollectionPlan(
  input: AnnualReviewCollectionPlanInput,
): AnnualReviewCollectionPlanResult {
  const now = resolveNow(input);

  const requirementsByLoan: AnnualReviewBorrowerRequirement[] = [];
  const upcomingDue: AnnualReviewRequirementInstance[] = [];
  const dueNow: AnnualReviewRequirementInstance[] = [];
  const pastDue: AnnualReviewRequirementInstance[] = [];
  const missing: AnnualReviewRequirementInstance[] = [];
  const receivedNotReviewed: AnnualReviewRequirementInstance[] = [];
  const reviewedAccepted: AnnualReviewRequirementInstance[] = [];
  const rejectedNeedsFollowUp: AnnualReviewRequirementInstance[] = [];
  const staleList: AnnualReviewRequirementInstance[] = [];
  const escalations: AnnualReviewEscalation[] = [];
  const blockers: string[] = [];

  let loansRequiringReview = 0;
  let loansNotRequiringReview = 0;

  for (const loan of input.loans) {
    if (!loanRequiresAnnualReview(loan)) {
      loansNotRequiringReview += 1;
      continue;
    }
    loansRequiringReview += 1;

    const defs = getAnnualReviewRequirementsForLoan(loan);
    const requirements: AnnualReviewDocumentRequirement[] = [];

    for (const def of defs) {
      const doc = findSubmitted(loan, def);
      const status = deriveStatus(doc);
      const stale = isStale(def, doc, now);
      const dueDate = resolveDueDate(def, loan, input.cycle);
      const requirement: AnnualReviewDocumentRequirement = {
        requirementId: `${loan.loanNumber ?? loan.boardedLoanId ?? 'loan'}::${def.requirementKey}`,
        requirementKey: def.requirementKey,
        documentType: def.documentType,
        label: def.label,
        requiredFor: def.requiredForWatchlistReview ? 'annual+watchlist' : 'annual',
        dueDate,
        gracePeriodDays: 0,
        owner: loan.servicingOwner ?? loan.portfolioManager,
        borrowerContact: loan.borrowerContactName,
        status,
        receivedDate: doc?.receivedDate,
        reviewedDate: doc?.reviewedDate,
        reviewer: doc?.reviewer,
        accepted: doc?.accepted,
        rejectedReason: doc?.rejectedReason,
        stale,
      };
      requirements.push(requirement);

      const instance: AnnualReviewRequirementInstance = {
        loanId: loan.boardedLoanId,
        loanNumber: loan.loanNumber,
        borrowerName: loan.borrowerName,
        requirement,
      };

      // Status buckets.
      if (status === 'missing') missing.push(instance);
      if (status === 'received' || status === 'reviewed') receivedNotReviewed.push(instance);
      if (status === 'accepted' && !stale) reviewedAccepted.push(instance);
      if (status === 'rejected') rejectedNeedsFollowUp.push(instance);
      if (stale) staleList.push(instance);

      // Timing buckets (only for not-yet-accepted requirements).
      const dueMs = parseDate(dueDate);
      if (status !== 'accepted' && dueMs !== undefined) {
        const ageDays = (now - dueMs) / MS_PER_DAY;
        if (ageDays > 0) pastDue.push(instance);
        else if (-ageDays <= DUE_SOON_DAYS) dueNow.push(instance);
        else upcomingDue.push(instance);
      }

      // Blockers + escalations for required financials.
      const requiredHere =
        def.requiredForAnnualReview ||
        (def.requiredForWatchlistReview &&
          (loan.watchlistFlag === true ||
            (loan.criticizedClassifiedStatus ?? '').trim().length > 0));
      if (requiredHere && status === 'missing') {
        blockers.push(`${loan.borrowerName ?? loan.loanNumber ?? 'Loan'}: missing ${def.label}.`);
      }
      if (requiredHere && stale) {
        blockers.push(`${loan.borrowerName ?? loan.loanNumber ?? 'Loan'}: stale ${def.label}.`);
      }
      if (requiredHere && status !== 'accepted' && dueMs !== undefined && now > dueMs) {
        const overdueDays = (now - dueMs) / MS_PER_DAY;
        escalations.push({
          loanId: loan.boardedLoanId,
          borrowerName: loan.borrowerName,
          reason: `Past-due ${def.label} (${Math.round(overdueDays)} day(s) overdue).`,
          level: overdueDays > 30 ? 'manager' : 'owner',
          severity: overdueDays > 30 ? 'high' : 'medium',
          relatedRequirementIds: [requirement.requirementId],
        });
      }
    }

    // Loan-level operational escalations.
    if (loan.covenantStatus === 'breach') {
      escalations.push({
        loanId: loan.boardedLoanId,
        borrowerName: loan.borrowerName,
        reason: 'Covenant breach.',
        level: 'manager',
        severity: 'high',
        relatedRequirementIds: [],
      });
    }
    if (loan.insuranceStatus === 'expired') {
      escalations.push({
        loanId: loan.boardedLoanId,
        borrowerName: loan.borrowerName,
        reason: 'Insurance lapse.',
        level: 'owner',
        severity: 'high',
        relatedRequirementIds: [],
      });
    }
    if ((loan.pastDueDays ?? 0) > 0) {
      escalations.push({
        loanId: loan.boardedLoanId,
        borrowerName: loan.borrowerName,
        reason: `Past due ${loan.pastDueDays} day(s).`,
        level: 'manager',
        severity: 'high',
        relatedRequirementIds: [],
      });
    }

    requirementsByLoan.push({
      borrowerName: loan.borrowerName,
      loanNumber: loan.loanNumber,
      requirements,
    });
  }

  return {
    totalLoansInScope: input.loans.length,
    loansRequiringReview,
    loansNotRequiringReview,
    requirementsByLoan,
    upcomingDue,
    dueNow,
    pastDue,
    missing,
    receivedNotReviewed,
    reviewedAccepted,
    rejectedNeedsFollowUp,
    stale: staleList,
    escalations,
    blockers,
  };
}
