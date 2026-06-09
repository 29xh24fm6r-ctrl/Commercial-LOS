/**
 * Phase 142G — Admin configuration proposal builder.
 *
 * PURE. Builds a configuration PROPOSAL (metadata/domain model only). It carries
 * no executable code, no apply callback, and no mutation. Schema / custom-field /
 * route-registration proposals are immediately `blocked_unsafe`; integration and
 * permission proposals are high-risk and not apply-ready. Unsafe content
 * (executable code, SQL, secrets, PII) is detected and redacted, never stored raw.
 */

import type {
  AdminConfigurationBlocker,
  AdminConfigurationProposal,
  AdminConfigurationProposalStatus,
  AdminConfigurationProposalType,
  AdminConfigurationWarning,
} from './adminConfigurationTypes';
import { ADMIN_CONFIGURATION_BLOCKED_UNSAFE_TYPES } from './adminConfigurationTypes';
import {
  redactIfUnsafe,
  riskClassForProposalType,
  scanUnsafeContent,
  scopeForProposalType,
} from './adminConfigurationContentSafety';

export interface BuildAdminConfigurationProposalInput {
  proposalId: string;
  proposalType: AdminConfigurationProposalType;
  title: string;
  summary: string;
  proposedChangeSummary: string;
  requestedBy: string;
  /** Injected clock (ISO timestamp) — no ambient Date is read. */
  clock: string;
  targetKey?: string;
  beforeSnapshot?: string;
  afterSnapshot?: string;
  /** When true the proposal opens as pending_review instead of draft_proposal. */
  submitForReview?: boolean;
}

export function buildAdminConfigurationProposal(
  input: BuildAdminConfigurationProposalInput,
): AdminConfigurationProposal {
  const riskClass = riskClassForProposalType(input.proposalType);
  const targetDomain = scopeForProposalType(input.proposalType);
  const blockers: AdminConfigurationBlocker[] = [];
  const warnings: AdminConfigurationWarning[] = [];

  // Detect unsafe payloads across the descriptive text fields only.
  const scan = scanUnsafeContent(input.title, input.summary, input.proposedChangeSummary, input.beforeSnapshot, input.afterSnapshot);

  const isBlockedType = ADMIN_CONFIGURATION_BLOCKED_UNSAFE_TYPES.includes(input.proposalType);

  let status: AdminConfigurationProposalStatus;
  if (scan.unsafe) {
    status = 'blocked_unsafe';
    blockers.push({ code: 'unsafe_content', message: `Proposal text contains unsafe content (${scan.reasons.join(', ')}); it was redacted and cannot be reviewed for apply.` });
  } else if (isBlockedType) {
    status = 'blocked_unsafe';
    blockers.push({ code: 'unsafe_proposal_type', message: `${input.proposalType} cannot be applied in this phase (schema / custom field / route registration are forbidden).` });
  } else {
    status = input.submitForReview ? 'pending_review' : 'draft_proposal';
  }

  if (riskClass === 'high_external_integration_risk') {
    warnings.push({ code: 'integration_change_not_applicable', message: 'Integration changes are review-only; no provider is enabled and no transport is activated.' });
  }
  if (riskClass === 'high_permission_risk') {
    warnings.push({ code: 'permission_change_not_applicable', message: 'Permission policy changes are review-only; no permission is widened in this phase.' });
  }

  return {
    proposalId: input.proposalId,
    proposalType: input.proposalType,
    title: redactIfUnsafe(input.title) ?? input.title,
    summary: redactIfUnsafe(input.summary) ?? input.summary,
    requestedBy: input.requestedBy,
    requestedAt: input.clock,
    targetDomain,
    targetKey: input.targetKey,
    proposedChangeSummary: redactIfUnsafe(input.proposedChangeSummary) ?? input.proposedChangeSummary,
    beforeSnapshot: redactIfUnsafe(input.beforeSnapshot),
    afterSnapshot: redactIfUnsafe(input.afterSnapshot),
    riskClass,
    status,
    impactSummary: {
      targetDomain,
      riskClass,
      reversible: status !== 'blocked_unsafe',
      requiresFutureImplementation: true,
      appliedInThisPhase: false,
    },
    blockers,
    warnings,
    auditSummary: {
      proposalId: input.proposalId,
      proposalType: input.proposalType,
      riskClass,
      appliedConfig: false,
      wroteToDataverse: false,
      mutatedRegistry: false,
      containsExecutableCode: false,
      readOnly: true,
    },
  };
}
