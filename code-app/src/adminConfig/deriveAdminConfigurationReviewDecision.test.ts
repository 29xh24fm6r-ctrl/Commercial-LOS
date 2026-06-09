import { describe, it, expect } from 'vitest';
import { deriveAdminConfigurationReviewDecision } from './deriveAdminConfigurationReviewDecision';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';

const CLOCK = '2026-06-09T00:00:00.000Z';

function p(type: Parameters<typeof buildAdminConfigurationProposal>[0]['proposalType'], over: Record<string, unknown> = {}) {
  return buildAdminConfigurationProposal({
    proposalId: 'P1', proposalType: type,
    title: 'Proposal', summary: 'A governed metadata change.', proposedChangeSummary: 'Reorder columns.',
    requestedBy: 'admin-1', clock: CLOCK, submitForReview: true, ...over,
  });
}

const ctx = { reviewer: { reviewerId: 'r1' } };

describe('Phase 142G — admin configuration review decision', () => {
  it('approve_for_future_implementation creates approved_not_applied', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('platform_object_change'), action: 'approve_for_future_implementation', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.accepted).toBe(true);
    expect(d.resultingStatus).toBe('approved_not_applied');
    expect(d.auditSummary.appliedConfig).toBe(false);
  });

  it('reject creates rejected', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('platform_object_change'), action: 'reject', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.resultingStatus).toBe('rejected');
  });

  it('acknowledge_blocked preserves blocked_unsafe', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('dataverse_schema_change'), action: 'acknowledge_blocked', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.resultingStatus).toBe('blocked_unsafe');
  });

  it('rejects an apply action with no state change', () => {
    const proposal = p('platform_object_change');
    const d = deriveAdminConfigurationReviewDecision({ proposal, action: 'apply', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.accepted).toBe(false);
    expect(d.resultingStatus).toBe(proposal.status);
    expect(d.blockers.some((b) => b.code === 'forbidden_reviewer_action')).toBe(true);
  });

  it('rejects an enable_integration action', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('integration_provider_change'), action: 'enable_integration', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.accepted).toBe(false);
  });

  it('rejects a mutate_schema action', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('dataverse_schema_change'), action: 'mutate_schema', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.accepted).toBe(false);
  });

  it('cannot approve a blocked_unsafe proposal', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('dataverse_schema_change'), action: 'approve_for_future_implementation', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.accepted).toBe(false);
    expect(d.resultingStatus).toBe('blocked_unsafe');
  });

  it('redacts reviewer notes containing secrets / PII', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('platform_object_change'), action: 'mark_reviewed', reviewerNotes: 'looks fine, ssn 123-45-6789', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.reviewerNotesRedacted).not.toContain('123-45-6789');
  });

  it('never applies, writes, or mutates', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: p('platform_object_change'), action: 'approve_for_future_implementation', reviewContext: ctx, decidedAt: CLOCK });
    expect(d.auditSummary.wroteToDataverse).toBe(false);
    expect(d.auditSummary.mutatedRegistry).toBe(false);
  });
});
