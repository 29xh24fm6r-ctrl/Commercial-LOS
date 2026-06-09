import { describe, it, expect } from 'vitest';
import {
  mapProposalToRecord,
  mapReviewDecisionToRecord,
  mapAuditSummaryToRecord,
  stableStringify,
} from './adminConfigurationPersistenceMapper';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { deriveAdminConfigurationReviewDecision } from './deriveAdminConfigurationReviewDecision';
import type { AdminConfigurationProposal } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function proposal(type: Parameters<typeof buildAdminConfigurationProposal>[0]['proposalType'], over: Record<string, unknown> = {}) {
  return buildAdminConfigurationProposal({
    proposalId: 'P1', proposalType: type, title: 'Adjust loan object view', summary: 'Metadata change.',
    proposedChangeSummary: 'Reorder columns.', requestedBy: 'admin-1', clock: CLOCK, submitForReview: true, ...over,
  });
}

describe('Phase 142J — admin configuration persistence mapper', () => {
  it('maps a safe proposal preserving its id and status', () => {
    const r = mapProposalToRecord(proposal('platform_object_change'));
    expect(r.cr664_proposalidtext).toBe('P1');
    expect(r.cr664_status).toBe('pending_review');
    expect(r.cr664_proposaltype).toBe('platform_object_change');
  });

  it('maps a blocked schema proposal preserving blocked_unsafe', () => {
    const r = mapProposalToRecord(proposal('dataverse_schema_change'));
    expect(r.cr664_status).toBe('blocked_unsafe');
    expect(r.cr664_validationstatus).toBe('blocked');
  });

  it('maps approved_not_applied without any applied state', () => {
    const r = mapProposalToRecord({ ...proposal('platform_object_change'), status: 'approved_not_applied' });
    expect(r.cr664_status).toBe('approved_not_applied');
    expect(JSON.stringify(r)).not.toMatch(/\bapplied\b(?!_not_applied)|deployed|published|activated/i);
  });

  it('redacts PII / secrets in mapped text', () => {
    const raw: AdminConfigurationProposal = { ...proposal('platform_object_change'), summary: 'borrower ssn 123-45-6789' };
    const r = mapProposalToRecord(raw);
    expect(r.cr664_summary).not.toContain('123-45-6789');
  });

  it('rejects an executable payload', () => {
    const raw: AdminConfigurationProposal = { ...proposal('platform_object_change'), proposedChangeSummary: 'function(){ doThing() } => run' };
    expect(() => mapProposalToRecord(raw)).toThrow(/executable/i);
  });

  it('rejects an applied / deployed / published / activated status', () => {
    const raw = { ...proposal('platform_object_change'), status: 'applied' } as unknown as AdminConfigurationProposal;
    expect(() => mapProposalToRecord(raw)).toThrow(/apply_forbidden/i);
  });

  it('preserves nulls for an absent target key', () => {
    const r = mapProposalToRecord(proposal('platform_object_change'));
    expect(r.cr664_targetkey).toBeNull();
  });

  it('maps a review decision and serializes JSON deterministically', () => {
    const decision = deriveAdminConfigurationReviewDecision({ proposal: proposal('platform_object_change'), action: 'approve_for_future_implementation', decidedAt: CLOCK });
    const r = mapReviewDecisionToRecord(decision);
    expect(r.cr664_decisionstatus).toBe('approved_not_applied');
    expect(r.cr664_blockersjson).toBe(stableStringify(decision.blockers));
  });

  it('maps an audit summary to a record', () => {
    const p = proposal('platform_object_change');
    const r = mapAuditSummaryToRecord(p.proposalId, p.auditSummary, { auditId: 'A1', action: 'proposed', actor: 'admin-1', timestamp: CLOCK });
    expect(r.cr664_auditidtext).toBe('A1');
    expect(r.cr664_proposalidtext).toBe('P1');
  });
});
