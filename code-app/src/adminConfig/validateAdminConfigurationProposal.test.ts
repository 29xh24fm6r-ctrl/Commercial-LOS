import { describe, it, expect } from 'vitest';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import type { AdminConfigurationProposal, AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function proposal(proposalType: AdminConfigurationProposalType, over: Record<string, unknown> = {}) {
  return buildAdminConfigurationProposal({
    proposalId: 'P1', proposalType,
    title: 'Adjust the loan object summary view',
    summary: 'Metadata-only change to platform object view ordering.',
    proposedChangeSummary: 'Reorder columns and relabel one field.',
    requestedBy: 'admin-1', clock: CLOCK, ...over,
  });
}

describe('Phase 142G — admin configuration validation gate', () => {
  it('marks a safe metadata proposal valid for review', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('platform_object_change') });
    expect(r.validForReview).toBe(true);
  });

  it('keeps validForApply false always', () => {
    for (const t of ['platform_object_change', 'workflow_route_change', 'integration_provider_change'] as AdminConfigurationProposalType[]) {
      expect(validateAdminConfigurationProposal({ proposal: proposal(t) }).validForApply).toBe(false);
    }
  });

  it('blocks schema mutation', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('dataverse_schema_change') });
    expect(r.blockedActions.some((b) => b.action === 'mutate_schema')).toBe(true);
  });

  it('blocks custom field creation', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('custom_field_change') });
    expect(r.blockedActions.some((b) => b.action === 'create_field')).toBe(true);
  });

  it('blocks route registration', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('route_registration_change') });
    expect(r.blockedActions.some((b) => b.action === 'register_route')).toBe(true);
  });

  it('blocks integration enablement', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('integration_provider_change') });
    expect(r.blockedActions.some((b) => b.action === 'enable_integration')).toBe(true);
  });

  it('blocks permission widening', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('permission_policy_change') });
    expect(r.blockedActions.some((b) => b.action === 'widen_permission')).toBe(true);
  });

  it('blocks workflow mutation / execution', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('workflow_route_change') });
    expect(r.blockedActions.some((b) => b.action === 'execute_workflow')).toBe(true);
  });

  it('rejects executable / SQL / secret / PII content (not reviewable)', () => {
    // A raw proposal that bypassed the builder's redaction still fails validation.
    const raw: AdminConfigurationProposal = {
      ...proposal('platform_object_change'),
      summary: 'SELECT * FROM accounts WHERE id = 1',
      proposedChangeSummary: 'borrower ssn 123-45-6789',
    };
    const r = validateAdminConfigurationProposal({ proposal: raw });
    expect(r.validForReview).toBe(false);
    expect(r.blockers.some((b) => b.code === 'unsafe_content')).toBe(true);
  });
});
