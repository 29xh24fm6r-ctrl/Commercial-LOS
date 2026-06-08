/**
 * Phase 141A — Annual Review readiness engine.
 *
 * PURE, fail-closed readiness for a single loan's annual review. Missing means
 * missing; stale means stale; readiness is false whenever any required
 * financial, covenant, insurance, risk, or exception gate is unmet.
 */

import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewCycle,
  AnnualReviewReadinessResult,
  AnnualReviewDocumentRequirement,
} from './annualReviewTypes';
import {
  getAnnualReviewRequirementsForLoan,
  loanRequiresAnnualReview,
} from './annualReviewRequirementCatalog';
import { deriveAnnualReviewCollectionPlan } from './deriveAnnualReviewCollectionPlan';

export interface AnnualReviewReadinessInput {
  loan: AnnualReviewLoanSnapshot;
  cycle: AnnualReviewCycle;
  asOfDate?: string | Date;
}

export function deriveAnnualReviewReadiness(
  input: AnnualReviewReadinessInput,
): AnnualReviewReadinessResult {
  const { loan } = input;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!loanRequiresAnnualReview(loan)) {
    // Out of scope (e.g. paid off): not "ready", but no blockers either.
    return {
      annualReviewReady: false,
      financialsComplete: false,
      covenantsComplete: true,
      insuranceComplete: true,
      riskReviewComplete: loan.riskRating !== undefined,
      exceptionsResolved: (loan.highSeverityExceptionCount ?? 0) === 0,
      fdicReviewReady: false,
      boardReviewReady: false,
      blockers: ['Loan is not in scope for annual review.'],
      warnings,
    };
  }

  const plan = deriveAnnualReviewCollectionPlan({
    loans: [loan],
    cycle: input.cycle,
    asOfDate: input.asOfDate,
  });
  const requirements = plan.requirementsByLoan[0]?.requirements ?? [];
  const byKey = new Map<string, AnnualReviewDocumentRequirement>();
  for (const r of requirements) byKey.set(r.requirementKey, r);

  const defs = getAnnualReviewRequirementsForLoan(loan);

  // Financials complete: every required-for-annual-review document is accepted
  // and not stale.
  let financialsComplete = true;
  for (const def of defs) {
    if (!def.requiredForAnnualReview) continue;
    const r = byKey.get(def.requirementKey);
    if (!r || r.status !== 'accepted' || r.stale) {
      financialsComplete = false;
    }
  }
  // Also fold in watchlist-required documents when the loan is watchlist/criticized.
  const isWatch =
    loan.watchlistFlag === true ||
    (loan.criticizedClassifiedStatus ?? '').trim().length > 0;
  if (isWatch) {
    for (const def of defs) {
      if (!def.requiredForWatchlistReview) continue;
      const r = byKey.get(def.requirementKey);
      if (!r || r.status !== 'accepted' || r.stale) financialsComplete = false;
    }
  }
  if (!financialsComplete) blockers.push('Required financials are not complete.');

  const covenantsComplete =
    loan.hasCovenants !== true ||
    loan.covenantStatus === 'in_compliance' ||
    loan.covenantStatus === 'waived';
  if (!covenantsComplete) blockers.push('Covenant testing is incomplete or in breach.');

  const insuranceComplete =
    loan.collateralRequiresInsurance !== true || loan.insuranceStatus === 'current';
  if (!insuranceComplete) blockers.push('Insurance is not current.');

  const riskReviewComplete = loan.riskRating !== undefined && loan.riskRating.trim().length > 0;
  if (!riskReviewComplete) blockers.push('Risk rating review is incomplete.');

  const exceptionsResolved = (loan.highSeverityExceptionCount ?? 0) === 0;
  if (!exceptionsResolved) blockers.push('High-severity exceptions are unresolved.');

  if (isWatch) warnings.push('Watchlist/criticized loan remains visible until reviewed.');
  if (plan.dueNow.length > 0) warnings.push(`${plan.dueNow.length} requirement(s) due soon.`);

  // FDIC-required docs accepted + fresh.
  let fdicDocsReady = true;
  for (const def of defs) {
    if (!def.requiredForFDICReview) continue;
    const r = byKey.get(def.requirementKey);
    if (!r || r.status !== 'accepted' || r.stale) fdicDocsReady = false;
  }

  const annualReviewReady =
    financialsComplete &&
    covenantsComplete &&
    insuranceComplete &&
    riskReviewComplete &&
    exceptionsResolved &&
    blockers.length === 0;

  const fdicReviewReady = financialsComplete && fdicDocsReady && exceptionsResolved;
  const boardReviewReady = financialsComplete && riskReviewComplete && covenantsComplete;

  return {
    annualReviewReady,
    financialsComplete,
    covenantsComplete,
    insuranceComplete,
    riskReviewComplete,
    exceptionsResolved,
    fdicReviewReady,
    boardReviewReady,
    blockers,
    warnings,
  };
}
