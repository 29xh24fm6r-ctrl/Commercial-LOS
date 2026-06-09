/**
 * Phase 141O — Annual review financial ANALYSIS snapshot deriver.
 *
 * PURE. Combines readiness + spread + covenant testing (and optional workflow /
 * delivery context) into one analysis snapshot with caveats and missing data. It
 * emits NO final credit recommendation and NO approval language; board/FDIC
 * readiness is conservative.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No fabricated metrics. `finalCreditRecommendation` is always null.
 *   - Board/FDIC readiness is false when covenants are unknown/fail/review or
 *     evidence is missing.
 */

import type {
  AnnualReviewFinancialReadinessResult,
  AnnualReviewFinancialSpreadSnapshot,
  AnnualReviewCovenantTestingSnapshot,
  AnnualReviewFinancialAnalysisSnapshot,
  AnnualReviewFinancialBlocker,
  AnnualReviewFinancialMemoSectionRef,
} from './annualReviewFinancialTypes';

export interface DeriveAnnualReviewFinancialAnalysisInput {
  annualReviewId: string;
  readiness: AnnualReviewFinancialReadinessResult;
  spread: AnnualReviewFinancialSpreadSnapshot;
  covenants: AnnualReviewCovenantTestingSnapshot;
  /** Optional caveat policy: allow draft-only board package despite open items. */
  allowDraftBoardPackage?: boolean;
}

function covenantStatus(c: AnnualReviewCovenantTestingSnapshot): AnnualReviewFinancialAnalysisSnapshot['covenantStatus'] {
  if (c.results.length === 0) return 'no_covenants';
  if (c.failCount > 0) return 'has_failures';
  if (c.reviewCount > 0) return 'review_required';
  if (c.unknownCount > 0) return 'has_unknowns';
  return 'all_pass';
}

export function deriveAnnualReviewFinancialAnalysisSnapshot(
  input: DeriveAnnualReviewFinancialAnalysisInput,
): AnnualReviewFinancialAnalysisSnapshot {
  const { readiness, spread, covenants } = input;
  const covStatus = covenantStatus(covenants);

  const primaryBlockers: AnnualReviewFinancialBlocker[] = [
    ...readiness.blockers,
    ...spread.blockers,
    ...covenants.blockers,
  ];

  const keyMetrics = spread.metrics.filter((m) =>
    ['revenue', 'ebitda', 'net_income', 'tangible_net_worth', 'working_capital', 'debt_service', 'cash'].includes(m.metricKey),
  );

  const factIds = Array.from(new Set([...spread.auditSummary.evidenceFactIds, ...covenants.auditSummary.evidenceFactIds]));
  const documentIds = Array.from(new Set([...spread.auditSummary.evidenceDocumentIds, ...covenants.auditSummary.evidenceDocumentIds]));

  const spreadEvidenceBacked = spread.status === 'available' || spread.status === 'partial';
  const covenantsClean = covStatus === 'all_pass';

  // Board/FDIC readiness is conservative: clean covenants + evidence-backed spread.
  const boardPackageReady =
    readiness.readinessStatus === 'spread_ready' && spreadEvidenceBacked && covenantsClean
      ? true
      : input.allowDraftBoardPackage === true && spreadEvidenceBacked;
  const fdicPackageReady =
    readiness.readinessStatus === 'spread_ready' && documentIds.length > 0 && covenantsClean;

  const memoReadySections: AnnualReviewFinancialMemoSectionRef[] = [
    { key: 'financial_performance', title: 'Financial performance', draftReady: spreadEvidenceBacked },
    { key: 'covenant_compliance', title: 'Covenant compliance', draftReady: covenants.results.length > 0 },
    { key: 'evidence_caveats', title: 'Evidence & caveats', draftReady: true },
    { key: 'missing_data', title: 'Missing data', draftReady: true },
    { key: 'recommended_follow_up', title: 'Recommended follow-up', draftReady: true },
  ];

  const nextBestActions: { code: string; label: string }[] = [];
  if (readiness.readinessStatus !== 'spread_ready') nextBestActions.push(readiness.nextBestAction);
  if (covStatus === 'has_failures') nextBestActions.push({ code: 'review_covenant_findings', label: 'Review covenant failure findings (no decision is made here).' });
  if (covStatus === 'has_unknowns' || covStatus === 'review_required') nextBestActions.push({ code: 'resolve_covenant_unknowns', label: 'Resolve unknown / review covenant inputs.' });
  if (nextBestActions.length === 0) nextBestActions.push({ code: 'draft_memo', label: 'Draft the annual review memo from the evidence-backed analysis.' });

  return {
    annualReviewId: input.annualReviewId,
    overallFinancialReadiness: readiness.readinessStatus,
    spreadStatus: spread.status,
    covenantStatus: covStatus,
    primaryBlockers,
    keyMetrics,
    trendSummary: spread.trends,
    covenantResults: covenants.results,
    evidenceSummary: { factIds, documentIds },
    nextBestActions,
    memoReadySections,
    boardPackageReady,
    fdicPackageReady,
    finalCreditRecommendation: null,
    auditSummary: { evidenceFactIds: factIds, evidenceDocumentIds: documentIds, unknownMetrics: spread.auditSummary.unknownMetrics, containsFabricatedValue: false },
  };
}
