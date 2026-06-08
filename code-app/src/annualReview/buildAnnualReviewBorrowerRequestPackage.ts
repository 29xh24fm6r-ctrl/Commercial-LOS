/**
 * Phase 141M — Annual review borrower request PACKAGE builder.
 *
 * PURE. Builds the document request package from the EXISTING annual-review
 * requirement logic (Phase 141A) plus the resolved CRM recipient decision. It
 * fabricates no obligations, generates no upload link, mutates no document or
 * task, and sends nothing.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Request items come only from derived annual-review requirements.
 *   - A blocked recipient blocks the package; items are never marked "requested".
 *   - No upload-link generation, no document/task mutation, no fake documents.
 *   - The audit summary carries only a masked contact value.
 */

import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewCycle,
} from '../shared/annualReview/annualReviewTypes';
import { deriveAnnualReviewCollectionPlan } from '../shared/annualReview/deriveAnnualReviewCollectionPlan';
import type {
  AnnualReviewBorrowerRequestPackage,
  AnnualReviewBorrowerRequestItem,
  AnnualReviewBorrowerRequestRecipientDecision,
  AnnualReviewBorrowerRequestBlocker,
  AnnualReviewBorrowerRequestStatus,
  AnnualReviewBorrowerRequestApprovalState,
  AnnualReviewBorrowerRequestAuditSummary,
} from './annualReviewBorrowerRequestTypes';

export interface BuildAnnualReviewRequestPackageInput {
  annualReviewId: string;
  loan: AnnualReviewLoanSnapshot;
  cycle: AnnualReviewCycle;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  borrowerOrganizationId?: string;
  requestedBy?: string;
  requestedAt?: string;
  asOfDate?: string | Date;
}

function statusForDecision(
  decision: AnnualReviewBorrowerRequestRecipientDecision,
): { status: AnnualReviewBorrowerRequestStatus; approvalState: AnnualReviewBorrowerRequestApprovalState } {
  switch (decision.decision) {
    case 'disabled_not_configured':
      return { status: 'disabled_not_configured', approvalState: 'draft_only' };
    case 'ready_for_human_approval':
      return { status: 'draft_only', approvalState: 'draft_only' };
    case 'needs_human_selection':
      return { status: 'needs_human_selection', approvalState: 'draft_only' };
    default:
      return { status: 'blocked', approvalState: 'draft_only' };
  }
}

export function buildAnnualReviewBorrowerRequestPackage(
  input: BuildAnnualReviewRequestPackageInput,
): AnnualReviewBorrowerRequestPackage {
  const { loan, cycle, recipientDecision } = input;

  // Derive request items from the EXISTING annual-review requirement logic —
  // never a hardcoded / fabricated obligation list.
  const plan = deriveAnnualReviewCollectionPlan({
    loans: [loan],
    cycle,
    asOfDate: input.asOfDate,
  });
  const requirements = plan.requirementsByLoan[0]?.requirements ?? [];

  const requestItems: readonly AnnualReviewBorrowerRequestItem[] = requirements.map((r) => ({
    itemId: r.requirementId,
    documentType: r.documentType,
    displayLabel: r.label,
    reason: r.requiredFor,
    required: true,
    dueDate: r.dueDate,
    // Upload methods that WOULD be allowed — generation stays disabled here.
    allowedUploadMethods: ['secure_upload (disabled in this phase)'],
    source: 'annual_review_requirement',
    status: r.status,
  }));

  const { status, approvalState } = statusForDecision(recipientDecision);

  const blockers: readonly AnnualReviewBorrowerRequestBlocker[] =
    status === 'draft_only' ? [] : recipientDecision.blockers;

  const auditSummary: AnnualReviewBorrowerRequestAuditSummary = {
    recipientContactMasked: recipientDecision.selectedContactValueMasked,
    recipientDisplayName: recipientDecision.selectedDisplayName,
    itemCount: requestItems.length,
    generatedAt: input.requestedAt,
    containsContactValue: false,
    redactedFields: ['recipientContactValue', 'borrowerContactValue'],
  };

  return {
    packageId: `arreq-${input.annualReviewId}`,
    annualReviewId: input.annualReviewId,
    boardedLoanId: loan.boardedLoanId,
    originatedLoanDealId: loan.originatedDealId,
    borrowerOrganizationId: input.borrowerOrganizationId,
    borrowerName: loan.borrowerName,
    fiscalYear: cycle.reviewYear,
    reviewDueDate: loan.annualReviewDueDate ?? loan.nextReviewDate,
    requestedBy: input.requestedBy,
    requestedAt: input.requestedAt,
    requestItems,
    recipientDecision,
    approvalState,
    deliveryMode: 'draft_preview',
    status,
    blockers,
    auditSummary,
  };
}
