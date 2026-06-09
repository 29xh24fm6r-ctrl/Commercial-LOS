/**
 * Phase 141P — Annual review PACKAGE READINESS deriver.
 *
 * PURE, fail-closed. Decides whether the memo / board / FDIC packages can be
 * drafted, draft-ready-with-caveats, or review-ready, from the Phase 141O
 * analysis snapshot + evidence index (+ optional borrower-request / delivery
 * context). It never produces a final approval / submission state, never writes,
 * and never enables borrower outreach.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. Missing financials / unknown covenants / missing evidence block.
 *   - Board readiness depends on memo readiness; FDIC readiness on the evidence
 *     index. No approved / submitted / sent state.
 */

import type { AnnualReviewFinancialAnalysisSnapshot } from './annualReviewFinancialTypes';
import type { AnnualReviewBorrowerRequestWorkflowState } from './annualReviewBorrowerRequestTypes';
import type {
  AnnualReviewEvidenceIndex,
  AnnualReviewPackageReadiness,
  AnnualReviewPackageStatus,
  AnnualReviewPackageBlocker,
  AnnualReviewPackageCaveat,
} from './annualReviewPackageTypes';

export interface DeriveAnnualReviewPackageReadinessInput {
  annualReviewId: string;
  analysis: AnnualReviewFinancialAnalysisSnapshot;
  evidenceIndex: AnnualReviewEvidenceIndex;
  borrowerRequest?: AnnualReviewBorrowerRequestWorkflowState;
  policy?: { allowDraftBoardPackage?: boolean };
}

export function deriveAnnualReviewPackageReadiness(
  input: DeriveAnnualReviewPackageReadinessInput,
): AnnualReviewPackageReadiness {
  const { analysis, evidenceIndex } = input;

  const financialsComplete =
    analysis.overallFinancialReadiness === 'spread_ready' &&
    (analysis.spreadStatus === 'available' || analysis.spreadStatus === 'partial');
  const covenantsComplete =
    analysis.covenantStatus !== 'has_unknowns' && analysis.covenantStatus !== 'review_required';
  const evidenceComplete = evidenceIndex.status === 'complete';

  const blockers: AnnualReviewPackageBlocker[] = [];
  const caveats: AnnualReviewPackageCaveat[] = [];

  if (!financialsComplete) blockers.push({ code: 'missing_financials', message: 'Required financial data is missing or not ready.', severity: 'high' });
  if (!covenantsComplete) blockers.push({ code: 'unknown_covenants', message: 'One or more covenants are unknown or require review.', severity: 'high' });
  if (!evidenceComplete) blockers.push({ code: 'missing_evidence', message: 'Evidence index has missing or review-required items.', severity: 'high' });

  // Caveats (non-blocking, but downgrade review-ready to draft-with-caveats).
  if (analysis.spreadStatus === 'partial') caveats.push({ code: 'partial_spread', message: 'Some financial metrics are unavailable.' });
  if (analysis.covenantStatus === 'has_failures') caveats.push({ code: 'covenant_findings', message: 'One or more covenant findings require review.' });
  if (analysis.covenantStatus === 'no_covenants') caveats.push({ code: 'no_covenants', message: 'No covenants were resolved for testing.' });
  if (input.borrowerRequest && input.borrowerRequest.status !== 'pending_human_approval') {
    caveats.push({ code: 'borrower_request_open', message: 'Borrower request is not yet ready for human approval.' });
  }

  // Memo status precedence.
  let memoStatus: AnnualReviewPackageStatus;
  if (!financialsComplete) memoStatus = 'blocked_missing_financials';
  else if (!covenantsComplete) memoStatus = 'blocked_unknown_covenants';
  else if (!evidenceComplete) memoStatus = 'blocked_missing_evidence';
  else if (caveats.length > 0) memoStatus = 'draft_ready_with_caveats';
  else memoStatus = 'review_ready';

  const reviewReady = memoStatus === 'review_ready';
  const memoDraftable = memoStatus === 'review_ready' || memoStatus === 'draft_ready_with_caveats';

  // Board readiness depends on memo readiness (review-ready, or caveated by policy).
  const boardReady = reviewReady || (input.policy?.allowDraftBoardPackage === true && memoStatus === 'draft_ready_with_caveats');
  const boardStatus: AnnualReviewPackageStatus = memoDraftable
    ? boardReady
      ? reviewReady
        ? 'review_ready'
        : 'draft_ready_with_caveats'
      : 'draft_not_ready'
    : memoStatus;

  // FDIC readiness depends on the evidence index being complete.
  const fdicReady = evidenceComplete && financialsComplete;
  const fdicStatus: AnnualReviewPackageStatus = !financialsComplete
    ? 'blocked_missing_financials'
    : !evidenceComplete
      ? 'blocked_missing_evidence'
      : caveats.length > 0
        ? 'draft_ready_with_caveats'
        : 'review_ready';

  const nextBestActions: { code: string; label: string }[] = [];
  if (!financialsComplete) nextBestActions.push({ code: 'complete_financials', label: 'Complete the financial spread (missing/ambiguous inputs).' });
  if (!covenantsComplete) nextBestActions.push({ code: 'resolve_covenants', label: 'Resolve unknown / review covenant results.' });
  if (!evidenceComplete) nextBestActions.push({ code: 'complete_evidence', label: 'Collect or trace the missing evidence items.' });
  if (nextBestActions.length === 0) nextBestActions.push({ code: 'review_draft_packages', label: 'Review the draft memo / board / FDIC packages.' });

  return {
    annualReviewId: input.annualReviewId,
    memoStatus,
    boardStatus,
    fdicStatus,
    financialsComplete,
    covenantsComplete,
    evidenceComplete,
    reviewReady,
    boardReady,
    fdicReady,
    blockers,
    caveats,
    nextBestActions,
    auditSummary: {
      evidenceFactIds: evidenceIndex.auditSummary.evidenceFactIds,
      evidenceDocumentIds: evidenceIndex.auditSummary.evidenceDocumentIds,
      unresolvedItems: evidenceIndex.auditSummary.unresolvedItems,
      containsFinalDecision: false,
    },
  };
}
