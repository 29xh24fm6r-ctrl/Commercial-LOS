/**
 * Phase 141P — Annual review CREDIT MEMO package builder (draft only).
 *
 * PURE. Builds the 10-section draft credit memo from the Phase 141O analysis
 * snapshot, the borrower-request workflow, and the evidence index. Unknown
 * metrics are explicitly labeled, covenant failures are findings (not decisions),
 * missing borrower-request status is shown honestly, and there is NO final
 * credit approval / decline / covenant waiver.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No fabricated financials. `finalCreditRecommendation` is null.
 *   - Evidence references included per section; caveats included.
 */

import type { AnnualReviewLoanSnapshot } from '../shared/annualReview/annualReviewTypes';
import type { AnnualReviewFinancialAnalysisSnapshot } from './annualReviewFinancialTypes';
import type { AnnualReviewBorrowerRequestWorkflowState } from './annualReviewBorrowerRequestTypes';
import { buildAnnualReviewFinancialMemoSections } from './buildAnnualReviewFinancialMemoSections';
import type {
  AnnualReviewMemoPackage,
  AnnualReviewMemoSection,
  AnnualReviewEvidenceIndex,
  AnnualReviewPackageReadiness,
  AnnualReviewPackageCaveat,
} from './annualReviewPackageTypes';

export interface BuildAnnualReviewMemoPackageInput {
  annualReviewId: string;
  loan: AnnualReviewLoanSnapshot;
  analysis: AnnualReviewFinancialAnalysisSnapshot;
  evidenceIndex: AnnualReviewEvidenceIndex;
  readiness: AnnualReviewPackageReadiness;
  borrowerRequest?: AnnualReviewBorrowerRequestWorkflowState;
}

const DRAFT_NOTE = 'Draft only. No final credit approval, decline, or covenant waiver is made in this phase.';

function section(
  key: string,
  title: string,
  lines: readonly string[],
  extra: { factIds?: readonly string[]; docIds?: readonly string[]; caveats?: readonly string[] } = {},
): AnnualReviewMemoSection {
  return {
    key, title, draftOnly: true,
    lines: lines.length > 0 ? lines : ['Not available.'],
    evidenceFactIds: extra.factIds ?? [], evidenceDocumentIds: extra.docIds ?? [],
    caveats: extra.caveats ?? [DRAFT_NOTE],
  };
}

export function buildAnnualReviewMemoPackage(
  input: BuildAnnualReviewMemoPackageInput,
): AnnualReviewMemoPackage {
  const { loan, analysis, evidenceIndex, readiness, borrowerRequest } = input;
  const fin = buildAnnualReviewFinancialMemoSections(analysis);

  const requestStatusLine = borrowerRequest
    ? `Borrower request status: ${borrowerRequest.status}. Recipient: ${borrowerRequest.recipientDecision.selectedDisplayName ?? 'not resolved'} (${borrowerRequest.recipientDecision.selectedContactValueMasked ?? 'no masked contact'}).`
    : 'Borrower request workflow not run.';

  const sections: AnnualReviewMemoSection[] = [
    section('executive_summary', 'Executive summary', [
      `Financial readiness: ${analysis.overallFinancialReadiness}.`,
      `Spread status: ${analysis.spreadStatus}. Covenant status: ${analysis.covenantStatus}.`,
      'This memo is a draft for review; no credit decision is made here.',
    ], { caveats: [DRAFT_NOTE] }),
    section('borrower_relationship_overview', 'Borrower / relationship overview', [
      `Borrower: ${loan.borrowerName ?? 'Not set'}.`,
      `Relationship: ${loan.relationshipName ?? 'Not set'}.`,
    ]),
    section('loan_exposure_summary', 'Loan exposure / facility summary', [
      `Loan number: ${loan.loanNumber ?? 'Not set'}.`,
      `Current balance: ${loan.currentBalance ?? 'unknown'}.`,
      `Maturity date: ${loan.maturityDate ?? 'Not set'}.`,
      `Risk rating: ${loan.riskRating ?? 'Not set'}.`,
    ]),
    section('financial_performance', 'Financial performance', fin.financialPerformance.lines, { factIds: fin.financialPerformance.evidenceFactIds, caveats: fin.financialPerformance.caveats }),
    section('covenant_compliance', 'Covenant compliance', fin.covenantCompliance.lines, { factIds: fin.covenantCompliance.evidenceFactIds, docIds: fin.covenantCompliance.evidenceDocumentIds, caveats: fin.covenantCompliance.caveats }),
    section('collateral_insurance_tickler', 'Collateral / insurance / tickler posture', [
      `Insurance status: ${loan.insuranceStatus ?? 'unknown'}.`,
      `Covenant operational status: ${loan.covenantStatus ?? 'unknown'}.`,
      `Open exceptions: ${loan.openExceptionCount ?? 'unknown'}.`,
    ]),
    section('borrower_request_collection_status', 'Borrower request / collection status', [requestStatusLine]),
    section('exceptions_missing_information', 'Exceptions and missing information', [
      ...fin.missingData.lines,
      `Evidence index status: ${evidenceIndex.status}. Missing items: ${evidenceIndex.missingItems.length}. Review-required: ${evidenceIndex.reviewRequiredItems.length}.`,
    ]),
    section('servicing_monitoring_recommendations', 'Servicing / monitoring recommendations', analysis.nextBestActions.map((a) => a.label), { caveats: ['Operational follow-up only — no credit decision.'] }),
    section('evidence_caveats', 'Evidence and caveats', [
      `Evidence facts: ${analysis.evidenceSummary.factIds.length}. Evidence documents: ${analysis.evidenceSummary.documentIds.length}.`,
    ], { factIds: analysis.evidenceSummary.factIds, docIds: analysis.evidenceSummary.documentIds }),
  ];

  const caveats: readonly AnnualReviewPackageCaveat[] = readiness.caveats;

  return {
    annualReviewId: input.annualReviewId,
    packageType: 'annual_review_credit_memo',
    status: readiness.memoStatus,
    sections,
    blockers: readiness.blockers,
    caveats,
    finalCreditRecommendation: null,
    auditSummary: {
      evidenceFactIds: analysis.evidenceSummary.factIds,
      evidenceDocumentIds: analysis.evidenceSummary.documentIds,
      unresolvedItems: evidenceIndex.auditSummary.unresolvedItems,
      containsFinalDecision: false,
    },
  };
}
