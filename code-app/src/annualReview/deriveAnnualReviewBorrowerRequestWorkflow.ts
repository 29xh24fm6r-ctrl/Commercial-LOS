/**
 * Phase 141M — Annual review borrower request WORKFLOW state deriver.
 *
 * PURE. Combines the CRM recipient decision, the request package, and the draft
 * preview into one human-approval workflow state. It never produces a `sent`
 * state, never mutates records, and always reports an honest next best action.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. CRM records + annual-review context are passed in.
 *   - Disabled flag → disabled_not_configured. No CRM records → blocked.
 *   - `sendEnabled` / `uploadLinkEnabled` are structurally false. No `sent`.
 */

import type { CrmMaster } from '../shared/crm/crmTypes';
import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewCycle,
} from '../shared/annualReview/annualReviewTypes';
import {
  resolveAnnualReviewBorrowerRequestRecipients,
  type AnnualReviewRequestPurpose,
} from './resolveAnnualReviewBorrowerRequestRecipients';
import { buildAnnualReviewBorrowerRequestPackage } from './buildAnnualReviewBorrowerRequestPackage';
import { buildAnnualReviewBorrowerRequestDraft } from './buildAnnualReviewBorrowerRequestDraft';
import {
  deriveAnnualReviewRequestFeatureFlagState,
  type AnnualReviewRequestFeatureFlagState,
} from './annualReviewRequestFeatureFlags';
import type {
  AnnualReviewBorrowerRequestWorkflowState,
  AnnualReviewBorrowerRequestStatus,
  AnnualReviewBorrowerRequestApprovalState,
  AnnualReviewBorrowerRequestNextAction,
  AnnualReviewBorrowerRequestRecipientDecision,
} from './annualReviewBorrowerRequestTypes';

export interface DeriveAnnualReviewWorkflowInput {
  annualReviewId: string;
  loan: AnnualReviewLoanSnapshot;
  cycle: AnnualReviewCycle;
  master: CrmMaster;
  loanId?: string;
  borrowerOrgId?: string;
  purpose?: AnnualReviewRequestPurpose;
  flags?: AnnualReviewRequestFeatureFlagState;
  senderDisplayName?: string;
  requestedBy?: string;
  requestedAt?: string;
  asOfDate?: string | Date;
}

function nextAction(
  decision: AnnualReviewBorrowerRequestRecipientDecision,
): AnnualReviewBorrowerRequestNextAction {
  switch (decision.decision) {
    case 'disabled_not_configured':
      return { code: 'enable_workflow', label: 'Enable the annual review request workflow preview.' };
    case 'ready_for_human_approval':
      return { code: 'review_draft', label: 'Review the human-approval draft preview (nothing is sent).' };
    case 'needs_human_selection':
      return { code: 'select_recipient', label: 'Select one authorized recipient among the candidates.' };
    case 'blocked_no_recipient':
      return { code: 'add_authorized_crm_recipient', label: 'Add an authorized borrower contact in CRM.' };
    case 'blocked_missing_contact_point':
      return { code: 'verify_contact_point', label: 'Verify a contact point for the recipient in CRM.' };
    case 'blocked_do_not_contact':
      return { code: 'choose_different_recipient', label: 'Clear do-not-contact or choose a different recipient.' };
    case 'blocked_restricted_use':
      return { code: 'choose_different_recipient', label: 'Choose a contact authorized for this purpose.' };
    case 'blocked_no_authorized_contact':
      return { code: 'confirm_authorization', label: 'Collect the required CRM authorization for this recipient.' };
    default:
      return { code: 'review_blockers', label: 'Resolve the recipient blockers in CRM.' };
  }
}

export function deriveAnnualReviewBorrowerRequestWorkflow(
  input: DeriveAnnualReviewWorkflowInput,
): AnnualReviewBorrowerRequestWorkflowState {
  const flags = input.flags ?? deriveAnnualReviewRequestFeatureFlagState();
  const enabled = flags.ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW_ENABLED === true;

  const loanId =
    input.loanId ?? input.loan.boardedLoanId ?? input.loan.originatedDealId;

  const recipientDecision = resolveAnnualReviewBorrowerRequestRecipients({
    master: input.master,
    loanId,
    borrowerOrgId: input.borrowerOrgId,
    purpose: input.purpose,
    enabled,
    asOfDate: input.asOfDate,
  });

  if (!enabled) {
    return {
      status: 'disabled_not_configured',
      approvalState: 'draft_only',
      enabled: false,
      sendEnabled: false,
      uploadLinkEnabled: false,
      recipientDecision,
      nextBestAction: nextAction(recipientDecision),
      blockers: recipientDecision.blockers,
      warnings: [],
    };
  }

  // The package is always built so banker/ops can see the requested documents,
  // even when the recipient is blocked.
  const pkg = buildAnnualReviewBorrowerRequestPackage({
    annualReviewId: input.annualReviewId,
    loan: input.loan,
    cycle: input.cycle,
    recipientDecision,
    borrowerOrganizationId: input.borrowerOrgId,
    requestedBy: input.requestedBy,
    requestedAt: input.requestedAt,
    asOfDate: input.asOfDate,
  });

  const draftPreviewEnabled =
    flags.ANNUAL_REVIEW_BORROWER_REQUEST_DRAFT_PREVIEW_ENABLED === true;
  const draft = draftPreviewEnabled
    ? buildAnnualReviewBorrowerRequestDraft({
        package: pkg,
        recipientDecision,
        senderDisplayName: input.senderDisplayName,
      })
    : undefined;

  let status: AnnualReviewBorrowerRequestStatus;
  let approvalState: AnnualReviewBorrowerRequestApprovalState;
  if (recipientDecision.decision === 'ready_for_human_approval') {
    status = draftPreviewEnabled ? 'pending_human_approval' : 'draft_only';
    approvalState = draftPreviewEnabled ? 'pending_human_approval' : 'draft_only';
  } else if (recipientDecision.decision === 'needs_human_selection') {
    status = 'needs_human_selection';
    approvalState = 'draft_only';
  } else {
    status = 'blocked';
    approvalState = 'draft_only';
  }

  return {
    status,
    approvalState,
    enabled: true,
    sendEnabled: false,
    uploadLinkEnabled: false,
    recipientDecision,
    package: pkg,
    draft,
    nextBestAction: nextAction(recipientDecision),
    blockers: pkg.blockers,
    warnings: recipientDecision.warnings,
  };
}
