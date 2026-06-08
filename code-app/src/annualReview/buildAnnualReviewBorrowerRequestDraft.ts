/**
 * Phase 141M — Annual review borrower request DRAFT builder (preview only).
 *
 * PURE. Produces human-reviewable PREVIEW text for a borrower document request.
 * It creates no email in Gmail/Outlook, no mailto link, no Send button, no SMS,
 * no upload link, and no live request. The contact value is masked, and a
 * blocked recipient yields a blocked draft (the reason replaces the body).
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Preview text only; no outreach primitive of any kind.
 *   - "Human approval required" language is always present.
 *   - No fabricated borrower data; masked contact only.
 */

import type {
  AnnualReviewBorrowerRequestPackage,
  AnnualReviewBorrowerRequestRecipientDecision,
  AnnualReviewBorrowerRequestDraft,
} from './annualReviewBorrowerRequestTypes';

export interface BuildAnnualReviewRequestDraftInput {
  package: AnnualReviewBorrowerRequestPackage;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  /** Operator-configured institution sender display name (never fabricated). */
  senderDisplayName?: string;
}

const SEND_DISABLED_REASON =
  'Sending is disabled in this phase. This is a human-approval preview only — nothing is delivered to the borrower automatically.';

const APPROVAL_NOTICE =
  'Human approval is required before any future delivery. No email, SMS, or upload link is generated.';

export function buildAnnualReviewBorrowerRequestDraft(
  input: BuildAnnualReviewRequestDraftInput,
): AnnualReviewBorrowerRequestDraft {
  const pkg = input.package;
  const decision: AnnualReviewBorrowerRequestRecipientDecision = input.recipientDecision;

  const requestItemSummary = pkg.requestItems.map((i) =>
    i.dueDate ? `${i.displayLabel} (due ${i.dueDate})` : i.displayLabel,
  );

  const borrower = pkg.borrowerName ?? 'the borrower';
  const fyLabel = pkg.fiscalYear !== undefined ? ` FY ${pkg.fiscalYear}` : '';
  const subject = `Annual review document request — ${borrower}${fyLabel}`;

  const blocked = decision.safeForDraft !== true;

  let bodyPreview: string;
  if (blocked) {
    const reasons = (pkg.blockers.length > 0 ? pkg.blockers : decision.blockers)
      .map((b) => b.message)
      .join(' ');
    bodyPreview = `Request blocked — not ready for human approval. ${reasons || 'Resolve the recipient blockers in CRM.'} ${APPROVAL_NOTICE}`;
  } else {
    const senderLine = input.senderDisplayName ? `On behalf of ${input.senderDisplayName}. ` : '';
    bodyPreview =
      `${senderLine}As part of the${fyLabel} annual review for ${borrower}, the following documents are requested: ` +
      `${requestItemSummary.join('; ')}. ${APPROVAL_NOTICE}`;
  }

  return {
    draftId: `ardraft-${pkg.annualReviewId}`,
    recipientDisplayName: decision.selectedDisplayName,
    recipientContactMasked: decision.selectedContactValueMasked,
    subject,
    bodyPreview,
    requestItemSummary,
    approvalRequired: true,
    sendDisabledReason: SEND_DISABLED_REASON,
    warnings: decision.warnings,
    blockers: pkg.blockers.length > 0 ? pkg.blockers : decision.blockers,
    auditSummary: pkg.auditSummary,
  };
}
