/**
 * Phase 141M — Annual Review borrower request workflow types.
 *
 * The governed, human-approved annual-review borrower request model: who the
 * authorized recipient is, what documents to request, the human-reviewable draft
 * preview, and the workflow state. Everything here is PREVIEW-ONLY.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - TYPES only. No IO, no fake data, no sample emails / phone numbers.
 *   - There is NO sent state and no `safeForSend: true`. This phase prepares;
 *     it never sends.
 *   - Contact values are carried only in masked form.
 */

import type { AnnualReviewDocumentType } from '../shared/annualReview/annualReviewTypes';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** The recipient resolution outcome. Note: none of these is a "sent" state. */
export type AnnualReviewRecipientDecisionStatus =
  | 'ready_for_human_approval'
  | 'blocked_no_recipient'
  | 'blocked_no_authorized_contact'
  | 'blocked_do_not_contact'
  | 'blocked_restricted_use'
  | 'blocked_missing_contact_point'
  | 'blocked_conflicting_recipients'
  | 'needs_human_selection'
  | 'disabled_not_configured';

/** Approval lifecycle. There is deliberately NO `sent`/`approved_and_sent`. */
export type AnnualReviewBorrowerRequestApprovalState =
  | 'draft_only'
  | 'pending_human_approval'
  | 'approved_not_sent'
  | 'rejected'
  | 'cancelled';

/** Delivery is preview-only in this phase. */
export type AnnualReviewBorrowerRequestDeliveryMode = 'draft_preview';

export type AnnualReviewBorrowerRequestStatus =
  | 'disabled_not_configured'
  | 'blocked'
  | 'needs_human_selection'
  | 'draft_only'
  | 'pending_human_approval';

export type AnnualReviewRecipientConfidence = 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Blocker + audit summary
// ---------------------------------------------------------------------------

export interface AnnualReviewBorrowerRequestBlocker {
  code: string;
  message: string;
  /** A banker/ops-facing correction hint. */
  remediation?: string;
}

export interface AnnualReviewBorrowerRequestAuditSummary {
  /** Masked recipient contact — never the raw value. */
  recipientContactMasked?: string;
  recipientDisplayName?: string;
  itemCount: number;
  generatedAt?: string;
  /** Structural guarantee: a contact value is never carried here. */
  containsContactValue: false;
  redactedFields: readonly string[];
}

// ---------------------------------------------------------------------------
// Request items + package
// ---------------------------------------------------------------------------

export interface AnnualReviewBorrowerRequestItem {
  itemId: string;
  documentType: AnnualReviewDocumentType;
  displayLabel: string;
  reason: string;
  required: boolean;
  dueDate?: string;
  /** Upload methods that WOULD be allowed — generation stays disabled here. */
  allowedUploadMethods: readonly string[];
  source: string;
  status: string;
}

export interface AnnualReviewBorrowerRequestPackage {
  packageId: string;
  annualReviewId: string;
  boardedLoanId?: string;
  originatedLoanDealId?: string;
  borrowerOrganizationId?: string;
  borrowerName?: string;
  fiscalYear?: number;
  reviewDueDate?: string;
  requestedBy?: string;
  requestedAt?: string;
  requestItems: readonly AnnualReviewBorrowerRequestItem[];
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  approvalState: AnnualReviewBorrowerRequestApprovalState;
  deliveryMode: AnnualReviewBorrowerRequestDeliveryMode;
  status: AnnualReviewBorrowerRequestStatus;
  blockers: readonly AnnualReviewBorrowerRequestBlocker[];
  auditSummary: AnnualReviewBorrowerRequestAuditSummary;
}

// ---------------------------------------------------------------------------
// Recipient candidates + decision
// ---------------------------------------------------------------------------

export interface AnnualReviewRecipientContactPointView {
  contactPointId: string;
  channel: string;
  /** Masked value only — never the raw email/phone. */
  masked: string;
  verified?: boolean;
  preferred?: boolean;
  usable: boolean;
}

export interface AnnualReviewRecipientAuthorizationFlags {
  financialRequests: boolean;
  uploadLinks: boolean;
  loanNotices: boolean;
}

export interface AnnualReviewRecipientCommunicationPreferences {
  doNotContact: boolean;
  restrictedUse: boolean;
  prohibitedMethods: readonly string[];
  preferredChannel?: string;
}

export interface AnnualReviewBorrowerRecipientCandidate {
  candidateId: string;
  personId?: string;
  organizationId?: string;
  displayName?: string;
  roleTypes: readonly string[];
  contactPoints: readonly AnnualReviewRecipientContactPointView[];
  authorizationFlags: AnnualReviewRecipientAuthorizationFlags;
  communicationPreferences: AnnualReviewRecipientCommunicationPreferences;
  source: string;
  confidence: AnnualReviewRecipientConfidence;
  blockers: readonly AnnualReviewBorrowerRequestBlocker[];
  warnings: readonly string[];
}

export interface AnnualReviewBorrowerRequestRecipientDecision {
  selectedRecipientId?: string;
  selectedDisplayName?: string;
  selectedContactPointId?: string;
  /** Masked contact value only — never the raw value. */
  selectedContactValueMasked?: string;
  decision: AnnualReviewRecipientDecisionStatus;
  confidence: AnnualReviewRecipientConfidence;
  blockers: readonly AnnualReviewBorrowerRequestBlocker[];
  warnings: readonly string[];
  requiresHumanSelection: boolean;
  safeForDraft: boolean;
  /** STRUCTURAL: always false in this phase. */
  safeForSend: false;
  candidates: readonly AnnualReviewBorrowerRecipientCandidate[];
}

// ---------------------------------------------------------------------------
// Draft + workflow state
// ---------------------------------------------------------------------------

export interface AnnualReviewBorrowerRequestDraft {
  draftId: string;
  recipientDisplayName?: string;
  recipientContactMasked?: string;
  subject: string;
  bodyPreview: string;
  requestItemSummary: readonly string[];
  approvalRequired: true;
  /** Why sending is disabled — always populated in this phase. */
  sendDisabledReason: string;
  warnings: readonly string[];
  blockers: readonly AnnualReviewBorrowerRequestBlocker[];
  auditSummary: AnnualReviewBorrowerRequestAuditSummary;
}

export interface AnnualReviewBorrowerRequestNextAction {
  code: string;
  label: string;
}

export interface AnnualReviewBorrowerRequestWorkflowState {
  status: AnnualReviewBorrowerRequestStatus;
  approvalState: AnnualReviewBorrowerRequestApprovalState;
  enabled: boolean;
  /** STRUCTURAL: always false in this phase. */
  sendEnabled: false;
  /** STRUCTURAL: always false in this phase. */
  uploadLinkEnabled: false;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  package?: AnnualReviewBorrowerRequestPackage;
  draft?: AnnualReviewBorrowerRequestDraft;
  nextBestAction: AnnualReviewBorrowerRequestNextAction;
  blockers: readonly AnnualReviewBorrowerRequestBlocker[];
  warnings: readonly string[];
}
