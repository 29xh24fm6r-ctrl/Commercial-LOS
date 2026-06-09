/**
 * Phase 142G — Admin configuration review decision deriver.
 *
 * PURE, READ-ONLY. Maps a reviewer ACTION to a resulting proposal STATUS without
 * applying anything. `approve_for_future_implementation` yields
 * `approved_not_applied`; `acknowledge_blocked` preserves `blocked_unsafe`; any
 * forbidden action (apply / deploy / enable_integration / mutate_schema / …) is
 * rejected with no state change. No action writes to Dataverse or mutates a
 * registry. Reviewer notes are scanned and redacted for secrets / PII.
 */

import type {
  AdminConfigurationBlocker,
  AdminConfigurationProposal,
  AdminConfigurationReviewContext,
  AdminConfigurationReviewDecision,
  AdminConfigurationProposalStatus,
  AdminConfigurationValidationResult,
  AdminConfigurationWarning,
} from './adminConfigurationTypes';
import {
  ADMIN_CONFIGURATION_ALLOWED_REVIEWER_ACTIONS,
  ADMIN_CONFIGURATION_FORBIDDEN_REVIEWER_ACTIONS,
} from './adminConfigurationTypes';
import { redactIfUnsafe } from './adminConfigurationContentSafety';

export interface DeriveAdminConfigurationReviewDecisionInput {
  proposal: AdminConfigurationProposal;
  validation?: AdminConfigurationValidationResult;
  action: string;
  reviewerNotes?: string;
  reviewContext?: AdminConfigurationReviewContext;
  /** Injected clock (ISO timestamp). */
  decidedAt: string;
}

function isAllowed(action: string): boolean {
  return (ADMIN_CONFIGURATION_ALLOWED_REVIEWER_ACTIONS as readonly string[]).includes(action);
}

export function deriveAdminConfigurationReviewDecision(
  input: DeriveAdminConfigurationReviewDecisionInput,
): AdminConfigurationReviewDecision {
  const { proposal } = input;
  const blockers: AdminConfigurationBlocker[] = [];
  const warnings: AdminConfigurationWarning[] = [];
  const decidedBy = input.reviewContext?.reviewer?.reviewerId ?? 'unknown_reviewer';

  let accepted = false;
  let resultingStatus: AdminConfigurationProposalStatus = proposal.status;

  if (ADMIN_CONFIGURATION_FORBIDDEN_REVIEWER_ACTIONS.includes(input.action)) {
    blockers.push({ code: 'forbidden_reviewer_action', message: `Reviewer action "${input.action}" is forbidden in this phase; no configuration is applied.` });
  } else if (!isAllowed(input.action)) {
    blockers.push({ code: 'unknown_reviewer_action', message: `Unknown reviewer action "${input.action}".` });
  } else if (proposal.status === 'blocked_unsafe' && input.action !== 'acknowledge_blocked' && input.action !== 'reject') {
    blockers.push({ code: 'proposal_blocked_unsafe', message: 'Proposal is blocked_unsafe and cannot be approved; acknowledge or reject only.' });
    resultingStatus = 'blocked_unsafe';
  } else {
    accepted = true;
    switch (input.action) {
      case 'approve_for_future_implementation':
        resultingStatus = 'approved_not_applied';
        warnings.push({ code: 'not_applied', message: 'Approved for future implementation only — no configuration is applied in this phase.' });
        break;
      case 'reject':
        resultingStatus = 'rejected';
        break;
      case 'request_changes':
        resultingStatus = 'draft_proposal';
        break;
      case 'acknowledge_blocked':
        resultingStatus = 'blocked_unsafe';
        break;
      case 'mark_reviewed':
      default:
        resultingStatus = proposal.status === 'draft_proposal' ? 'pending_review' : proposal.status;
        break;
    }
  }

  return {
    proposalId: proposal.proposalId,
    action: input.action,
    accepted,
    resultingStatus,
    decidedBy,
    decidedAt: input.decidedAt,
    reviewerNotesRedacted: redactIfUnsafe(input.reviewerNotes),
    blockers,
    warnings,
    auditSummary: {
      proposalId: proposal.proposalId,
      appliedConfig: false,
      wroteToDataverse: false,
      mutatedRegistry: false,
      readOnly: true,
    },
  };
}
