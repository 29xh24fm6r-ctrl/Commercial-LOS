/**
 * Phase 141P — Annual review FDIC / examiner package builder (draft only).
 *
 * PURE. Builds the 9-section examiner-prep package from the memo + board package
 * + evidence index + analysis + document readiness. Every claim has evidence or
 * a caveat; missing evidence is explicitly listed. There is NO "filed with FDIC"
 * state and no final export/submission.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No fake examiner notes / evidence refs. Missing items are listed.
 */

import type { AnnualReviewFinancialAnalysisSnapshot } from './annualReviewFinancialTypes';
import type {
  AnnualReviewMemoPackage,
  AnnualReviewBoardPackage,
  AnnualReviewFdicPackage,
  AnnualReviewFdicPackageSection,
  AnnualReviewEvidenceIndex,
  AnnualReviewPackageReadiness,
} from './annualReviewPackageTypes';

export interface BuildAnnualReviewFdicPackageInput {
  annualReviewId: string;
  memo: AnnualReviewMemoPackage;
  board: AnnualReviewBoardPackage;
  analysis: AnnualReviewFinancialAnalysisSnapshot;
  evidenceIndex: AnnualReviewEvidenceIndex;
  readiness: AnnualReviewPackageReadiness;
  reviewScope?: string;
  asOfDate?: string;
}

const DRAFT_NOTE = 'Examiner-prep draft only — not for filing, submission, or export.';

function section(key: string, title: string, lines: readonly string[], factIds: readonly string[] = [], docIds: readonly string[] = []): AnnualReviewFdicPackageSection {
  return { key, title, draftOnly: true, lines: lines.length > 0 ? lines : ['Not available.'], evidenceFactIds: factIds, evidenceDocumentIds: docIds, caveats: [DRAFT_NOTE] };
}

function memoLines(memo: AnnualReviewMemoPackage, key: string): readonly string[] {
  return memo.sections.find((s) => s.key === key)?.lines ?? [];
}

export function buildAnnualReviewFdicPackage(
  input: BuildAnnualReviewFdicPackageInput,
): AnnualReviewFdicPackage {
  const { memo, analysis, evidenceIndex, readiness } = input;

  const evidenceInventory = evidenceIndex.items.map(
    (i) => `${i.label} [${i.evidenceType}] — ${i.status}${i.sourceDocumentId ? ` (doc ${i.sourceDocumentId})` : ''}`,
  );
  const missingItems = evidenceIndex.missingItems.map((i) => `${i.label}: ${i.missingReason ?? 'missing'}`);

  const sections: AnnualReviewFdicPackageSection[] = [
    section('examiner_summary', 'Examiner summary', [
      `Annual review readiness: ${analysis.overallFinancialReadiness}. Evidence index: ${evidenceIndex.status}.`,
      'Draft examiner-prep package; not for filing or submission.',
    ]),
    section('review_scope_date', 'Review scope and date', [
      `Scope: ${input.reviewScope ?? 'Annual review of borrower financials, covenants, and collateral/insurance posture.'}`,
      `As-of date: ${input.asOfDate ?? 'Not set'}.`,
    ]),
    section('evidence_inventory', 'Evidence inventory', evidenceInventory, analysis.evidenceSummary.factIds, analysis.evidenceSummary.documentIds),
    section('financial_statement_support', 'Financial statement support', memoLines(memo, 'financial_performance'), analysis.evidenceSummary.factIds),
    section('covenant_testing_support', 'Covenant testing support', memoLines(memo, 'covenant_compliance')),
    section('insurance_collateral_tickler_support', 'Insurance / collateral / tickler support', memoLines(memo, 'collateral_insurance_tickler')),
    section('exceptions_missing_items', 'Exceptions / missing items', missingItems.length > 0 ? missingItems : ['No missing evidence items identified.']),
    section('audit_trail_summary', 'Audit trail summary', [
      `Evidence facts: ${analysis.evidenceSummary.factIds.length}. Evidence documents: ${analysis.evidenceSummary.documentIds.length}. Unresolved: ${evidenceIndex.auditSummary.unresolvedItems.length}.`,
    ]),
    section('caveats_unresolved', 'Caveats and unresolved items', [
      ...readiness.caveats.map((c) => c.message),
      ...readiness.blockers.map((b) => b.message),
    ]),
  ];

  return {
    annualReviewId: input.annualReviewId,
    packageType: 'annual_review_fdic_package',
    status: readiness.fdicStatus,
    sections,
    blockers: readiness.blockers,
    caveats: readiness.caveats,
    auditSummary: { evidenceFactIds: analysis.evidenceSummary.factIds, evidenceDocumentIds: analysis.evidenceSummary.documentIds, unresolvedItems: evidenceIndex.auditSummary.unresolvedItems, containsFinalDecision: false },
  };
}
