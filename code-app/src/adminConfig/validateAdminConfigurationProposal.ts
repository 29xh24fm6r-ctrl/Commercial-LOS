/**
 * Phase 142G — Admin configuration validation gate.
 *
 * PURE, READ-ONLY. Evaluates whether a proposal is REVIEWABLE and (always) NOT
 * apply-ready. `validForApply` is pinned false in this phase. Schema mutation,
 * custom fields, route registration, integration enablement, live transport,
 * workflow mutation, permission widening, credit decision automation, covenant
 * waiver, borrower outreach, and Dataverse writes all produce blockers and a
 * blocked-action explanation. Unsafe content (executable/SQL/secret/PII) makes
 * the proposal not even reviewable.
 */

import type {
  AdminConfigurationBlockedAction,
  AdminConfigurationBlocker,
  AdminConfigurationProposal,
  AdminConfigurationProposalType,
  AdminConfigurationReviewContext,
  AdminConfigurationValidationResult,
  AdminConfigurationWarning,
} from './adminConfigurationTypes';
import {
  ADMIN_CONFIGURATION_BLOCKED_UNSAFE_TYPES,
  ADMIN_CONFIGURATION_PROPOSAL_TYPES,
} from './adminConfigurationTypes';
import { requiredReviewerRolesForRisk, scanUnsafeContent } from './adminConfigurationContentSafety';

export interface ValidateAdminConfigurationProposalInput {
  proposal: AdminConfigurationProposal;
  reviewContext?: AdminConfigurationReviewContext;
}

/** Proposal types whose intent is a forbidden execution in this phase. */
const FORBIDDEN_EXECUTION_BY_TYPE: Partial<Record<AdminConfigurationProposalType, AdminConfigurationBlockedAction>> = {
  dataverse_schema_change: { action: 'mutate_schema', reason: 'Dataverse schema mutation is forbidden in this phase.' },
  custom_field_change: { action: 'create_field', reason: 'Custom field creation is forbidden in this phase.' },
  route_registration_change: { action: 'register_route', reason: 'Route registration is forbidden in this phase.' },
  integration_provider_change: { action: 'enable_integration', reason: 'Integration provider enablement is forbidden in this phase.' },
  integration_mode_change: { action: 'enable_integration', reason: 'Live external transport enablement is forbidden in this phase.' },
  delivery_adapter_change: { action: 'enable_integration', reason: 'Delivery adapter enablement is forbidden in this phase.' },
  permission_policy_change: { action: 'widen_permission', reason: 'Permission widening is forbidden in this phase.' },
  workflow_route_change: { action: 'execute_workflow', reason: 'Workflow route mutation / application is forbidden in this phase.' },
  workflow_rule_change: { action: 'execute_workflow', reason: 'Workflow rule mutation / application is forbidden in this phase.' },
};

export function validateAdminConfigurationProposal(
  input: ValidateAdminConfigurationProposalInput,
): AdminConfigurationValidationResult {
  const { proposal } = input;
  const blockers: AdminConfigurationBlocker[] = [];
  const warnings: AdminConfigurationWarning[] = [];
  const blockedActions: AdminConfigurationBlockedAction[] = [];

  // 1–2. Known type targeting a known governed domain.
  const knownType = ADMIN_CONFIGURATION_PROPOSAL_TYPES.includes(proposal.proposalType);
  if (!knownType) {
    blockers.push({ code: 'unknown_proposal_type', message: `Unknown proposal type: ${proposal.proposalType}.` });
  }

  // 3–7. Content safety — executable code / SQL / secrets / PII make it unreviewable.
  const scan = scanUnsafeContent(proposal.title, proposal.summary, proposal.proposedChangeSummary, proposal.beforeSnapshot, proposal.afterSnapshot, proposal.reviewerNotes);
  if (scan.unsafe) {
    blockers.push({ code: 'unsafe_content', message: `Proposal contains unsafe content (${scan.reasons.join(', ')}).` });
  }

  // 8–18. Forbidden execution intents become blockers + explanations.
  const forbidden = FORBIDDEN_EXECUTION_BY_TYPE[proposal.proposalType];
  if (forbidden) {
    blockedActions.push(forbidden);
    blockers.push({ code: `blocked_${forbidden.action}`, message: forbidden.reason });
  }
  if (ADMIN_CONFIGURATION_BLOCKED_UNSAFE_TYPES.includes(proposal.proposalType)) {
    if (!blockers.some((b) => b.code === 'unsafe_proposal_type')) {
      blockers.push({ code: 'unsafe_proposal_type', message: `${proposal.proposalType} is blocked_unsafe in this phase.` });
    }
  }

  // Reviewable when there is no content-safety violation and the type is known.
  // Unsafe TYPES are still reviewable as a blocked explanation; unsafe CONTENT is not.
  const validForReview = knownType && !scan.unsafe;

  return {
    proposalId: proposal.proposalId,
    validForReview,
    validForApply: false,
    riskClass: proposal.riskClass,
    blockers,
    warnings,
    blockedActions,
    requiredReviewerRoles: requiredReviewerRolesForRisk(proposal.riskClass),
    auditSummary: {
      proposalId: proposal.proposalId,
      validForApply: false,
      containsSchemaMutation: false,
      containsWrite: false,
      readOnly: true,
    },
  };
}
