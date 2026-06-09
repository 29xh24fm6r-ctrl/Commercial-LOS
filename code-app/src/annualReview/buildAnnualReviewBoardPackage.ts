/**
 * Phase 141P — Annual review BOARD package builder (draft only).
 *
 * PURE. Builds the 6-section draft board package from the memo package +
 * readiness + evidence index + analysis. It is blocked when the memo/evidence
 * are not ready, uses no approval/ratification language, makes no final credit
 * recommendation, and shows covenant failures as findings.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No fabricated charts/metrics. Unknowns / caveats are visible.
 */

import type { AnnualReviewFinancialAnalysisSnapshot } from './annualReviewFinancialTypes';
import type {
  AnnualReviewMemoPackage,
  AnnualReviewBoardPackage,
  AnnualReviewBoardPackageSection,
  AnnualReviewEvidenceIndex,
  AnnualReviewPackageReadiness,
} from './annualReviewPackageTypes';

export interface BuildAnnualReviewBoardPackageInput {
  annualReviewId: string;
  memo: AnnualReviewMemoPackage;
  analysis: AnnualReviewFinancialAnalysisSnapshot;
  evidenceIndex: AnnualReviewEvidenceIndex;
  readiness: AnnualReviewPackageReadiness;
}

const DRAFT_NOTE = 'Draft only. No board approval / ratification and no final credit recommendation in this phase.';

function section(key: string, title: string, lines: readonly string[], factIds: readonly string[] = [], docIds: readonly string[] = []): AnnualReviewBoardPackageSection {
  return { key, title, draftOnly: true, lines: lines.length > 0 ? lines : ['Not available.'], evidenceFactIds: factIds, evidenceDocumentIds: docIds, caveats: [DRAFT_NOTE] };
}

function memoLines(memo: AnnualReviewMemoPackage, key: string): readonly string[] {
  return memo.sections.find((s) => s.key === key)?.lines ?? [];
}

export function buildAnnualReviewBoardPackage(
  input: BuildAnnualReviewBoardPackageInput,
): AnnualReviewBoardPackage {
  const { memo, analysis, evidenceIndex, readiness } = input;

  const covenantFindings = analysis.covenantResults.map((r) => `${r.label}: ${r.status} (finding for review)`);

  const sections: AnnualReviewBoardPackageSection[] = [
    section('board_summary', 'Board summary', [
      `Financial readiness: ${analysis.overallFinancialReadiness}; covenant status: ${analysis.covenantStatus}.`,
      'Draft board package for review; no approval is requested or recorded here.',
    ]),
    section('exposure_relationship_profile', 'Exposure and relationship profile', memoLines(memo, 'loan_exposure_summary')),
    section('financial_trend_highlights', 'Financial trend highlights', analysis.trendSummary.map((t) => `${t.label}: ${t.direction} (${t.status})`)),
    section('covenant_exception_summary', 'Covenant and exception summary', covenantFindings.length > 0 ? covenantFindings : ['No covenants resolved for testing.']),
    section('management_follow_up', 'Management follow-up items', readiness.nextBestActions.map((a) => a.label)),
    section('evidence_caveat_appendix', 'Evidence / caveat appendix', [
      `Evidence index status: ${evidenceIndex.status}. Missing: ${evidenceIndex.missingItems.length}. Review-required: ${evidenceIndex.reviewRequiredItems.length}.`,
    ], analysis.evidenceSummary.factIds, analysis.evidenceSummary.documentIds),
  ];

  return {
    annualReviewId: input.annualReviewId,
    packageType: 'annual_review_board_package',
    status: readiness.boardStatus,
    sections,
    blockers: readiness.blockers,
    caveats: readiness.caveats,
    finalCreditRecommendation: null,
    auditSummary: { evidenceFactIds: analysis.evidenceSummary.factIds, evidenceDocumentIds: analysis.evidenceSummary.documentIds, unresolvedItems: evidenceIndex.auditSummary.unresolvedItems, containsFinalDecision: false },
  };
}
