/**
 * Phase 142G — Admin configuration review queue deriver.
 *
 * PURE, READ-ONLY. Builds a permission-scoped review queue from proposals + their
 * validation results. Blocked / prohibited / high-risk proposals sort first.
 * Proposals the reviewer cannot see are COUNTED but REDACTED. No proposal is
 * applied; `approved_not_applied` stays not applied; the queue emits review-only
 * reviewer actions and never an apply / execute action.
 */

import type {
  AdminConfigurationBlocker,
  AdminConfigurationProposal,
  AdminConfigurationReviewContext,
  AdminConfigurationReviewQueue,
  AdminConfigurationReviewQueueEntry,
  AdminConfigurationValidationResult,
  AdminConfigurationWarning,
} from './adminConfigurationTypes';
import {
  ADMIN_CONFIGURATION_ALLOWED_REVIEWER_ACTIONS,
  ADMIN_CONFIGURATION_HIGH_RISK_CLASSES,
} from './adminConfigurationTypes';

export interface DeriveAdminConfigurationReviewQueueInput {
  proposals: readonly AdminConfigurationProposal[];
  validations?: readonly AdminConfigurationValidationResult[];
  reviewContext?: AdminConfigurationReviewContext;
  queueId: string;
  /** Injected clock (ISO timestamp). */
  generatedAt: string;
}

const REVIEW_PERMISSION = 'admin.config.review';

function isHighRisk(proposal: AdminConfigurationProposal): boolean {
  return ADMIN_CONFIGURATION_HIGH_RISK_CLASSES.includes(proposal.riskClass);
}

function severityRank(proposal: AdminConfigurationProposal): number {
  let rank = 0;
  if (proposal.status === 'blocked_unsafe') rank += 100;
  if (proposal.riskClass === 'prohibited_in_this_phase') rank += 60;
  if (isHighRisk(proposal)) rank += 40;
  if (proposal.status === 'pending_review') rank += 5;
  return rank;
}

function redact(proposal: AdminConfigurationProposal): AdminConfigurationProposal {
  return {
    ...proposal,
    title: '[hidden]',
    summary: '[hidden]',
    proposedChangeSummary: '[hidden]',
    targetKey: undefined,
    beforeSnapshot: undefined,
    afterSnapshot: undefined,
    reviewerNotes: undefined,
  };
}

export function deriveAdminConfigurationReviewQueue(
  input: DeriveAdminConfigurationReviewQueueInput,
): AdminConfigurationReviewQueue {
  const granted = new Set(input.reviewContext?.grantedPermissions ?? []);
  const canReview = granted.has(REVIEW_PERMISSION);
  const validationByeId = new Map((input.validations ?? []).map((v) => [v.proposalId, v]));

  const ordered = [...input.proposals].sort((a, b) => severityRank(b) - severityRank(a));

  const entries: AdminConfigurationReviewQueueEntry[] = ordered.map((proposal) => {
    const visible = canReview;
    return {
      proposal: visible ? proposal : redact(proposal),
      validation: visible ? validationByeId.get(proposal.proposalId) : undefined,
      visible,
    };
  });

  const all = input.proposals;
  const pendingCount = all.filter((p) => p.status === 'pending_review').length;
  const blockedCount = all.filter((p) => p.status === 'blocked_unsafe').length;
  const rejectedCount = all.filter((p) => p.status === 'rejected').length;
  const approvedNotAppliedCount = all.filter((p) => p.status === 'approved_not_applied').length;
  const highRiskCount = all.filter(isHighRisk).length;
  const visibleProposalCount = entries.filter((e) => e.visible).length;
  const hiddenProposalCount = entries.length - visibleProposalCount;

  const blockers: AdminConfigurationBlocker[] = [];
  const warnings: AdminConfigurationWarning[] = [];
  if (!canReview && all.length > 0) {
    warnings.push({ code: 'reviewer_lacks_permission', message: 'Reviewer lacks admin.config.review permission; proposal details are redacted.' });
  }

  return {
    queueId: input.queueId,
    generatedAt: input.generatedAt,
    proposals: entries,
    pendingCount,
    blockedCount,
    rejectedCount,
    approvedNotAppliedCount,
    highRiskCount,
    visibleProposalCount,
    hiddenProposalCount,
    reviewerActions: ADMIN_CONFIGURATION_ALLOWED_REVIEWER_ACTIONS,
    blockers,
    warnings,
    auditSummary: {
      queueId: input.queueId,
      proposalCount: all.length,
      appliedAny: false,
      wroteToDataverse: false,
      readOnly: true,
    },
  };
}
