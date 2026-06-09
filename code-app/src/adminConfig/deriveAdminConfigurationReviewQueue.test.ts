import { describe, it, expect } from 'vitest';
import { deriveAdminConfigurationReviewQueue } from './deriveAdminConfigurationReviewQueue';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import type { AdminConfigurationProposal } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function p(id: string, type: Parameters<typeof buildAdminConfigurationProposal>[0]['proposalType'], over: Record<string, unknown> = {}): AdminConfigurationProposal {
  return buildAdminConfigurationProposal({
    proposalId: id, proposalType: type,
    title: `Proposal ${id}`, summary: 'A governed metadata change.', proposedChangeSummary: 'Reorder columns.',
    requestedBy: 'admin-1', clock: CLOCK, submitForReview: true, ...over,
  });
}

const proposals = [
  p('P1', 'platform_object_change'),
  p('P2', 'dataverse_schema_change'),
  p('P3', 'integration_provider_change'),
];

const reviewer = { grantedPermissions: ['admin.config.review'], reviewer: { reviewerId: 'r1' } };

describe('Phase 142G — admin configuration review queue', () => {
  it('derives queue counts', () => {
    const q = deriveAdminConfigurationReviewQueue({ proposals, reviewContext: reviewer, queueId: 'Q1', generatedAt: CLOCK });
    expect(q.blockedCount).toBe(1);
    expect(q.highRiskCount).toBe(2); // schema + integration
    expect(q.auditSummary.proposalCount).toBe(3);
  });

  it('sorts blocked / high-risk first', () => {
    const q = deriveAdminConfigurationReviewQueue({ proposals, reviewContext: reviewer, queueId: 'Q1', generatedAt: CLOCK });
    expect(q.proposals[0].proposal.proposalId).toBe('P2'); // blocked_unsafe schema sorts first
  });

  it('hides and redacts proposals without permission', () => {
    const q = deriveAdminConfigurationReviewQueue({ proposals, reviewContext: { grantedPermissions: [] }, queueId: 'Q1', generatedAt: CLOCK });
    expect(q.visibleProposalCount).toBe(0);
    expect(q.hiddenProposalCount).toBe(3);
    expect(q.proposals.every((e) => e.proposal.title === '[hidden]')).toBe(true);
  });

  it('keeps approved_not_applied not applied', () => {
    const approved = p('P4', 'platform_object_change');
    const q = deriveAdminConfigurationReviewQueue({ proposals: [{ ...approved, status: 'approved_not_applied' }], reviewContext: reviewer, queueId: 'Q1', generatedAt: CLOCK });
    expect(q.approvedNotAppliedCount).toBe(1);
    expect(q.auditSummary.appliedAny).toBe(false);
  });

  it('emits only review-only reviewer actions (no apply / execute)', () => {
    const q = deriveAdminConfigurationReviewQueue({ proposals, reviewContext: reviewer, queueId: 'Q1', generatedAt: CLOCK });
    expect(q.reviewerActions).not.toContain('apply');
    expect(q.reviewerActions).not.toContain('execute_workflow');
    expect(q.reviewerActions).toContain('approve_for_future_implementation');
  });
});
