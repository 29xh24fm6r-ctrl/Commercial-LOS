import { describe, it, expect } from 'vitest';
import { buildAdminConfigurationProposal, type BuildAdminConfigurationProposalInput } from './buildAdminConfigurationProposal';
import type { AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function input(proposalType: AdminConfigurationProposalType, over: Partial<BuildAdminConfigurationProposalInput> = {}): BuildAdminConfigurationProposalInput {
  return {
    proposalId: 'P1',
    proposalType,
    title: 'Adjust the loan object summary view',
    summary: 'Propose a metadata-only change to the platform object view ordering.',
    proposedChangeSummary: 'Reorder the columns and relabel one field for clarity.',
    requestedBy: 'admin-1',
    clock: CLOCK,
    ...over,
  };
}

describe('Phase 142G — admin configuration proposal builder', () => {
  it('builds a platform object metadata proposal', () => {
    const p = buildAdminConfigurationProposal(input('platform_object_change'));
    expect(p.status).toBe('draft_proposal');
    expect(p.riskClass).toBe('low_metadata_review');
    expect(p.targetDomain).toBe('platform_metadata');
    expect(p.impactSummary.appliedInThisPhase).toBe(false);
  });

  it('opens as pending_review when submitted for review', () => {
    const p = buildAdminConfigurationProposal(input('workflow_route_change', { submitForReview: true }));
    expect(p.status).toBe('pending_review');
    expect(p.riskClass).toBe('medium_workflow_guidance');
  });

  it('blocks a schema mutation proposal', () => {
    expect(buildAdminConfigurationProposal(input('dataverse_schema_change')).status).toBe('blocked_unsafe');
  });

  it('blocks a custom field proposal', () => {
    expect(buildAdminConfigurationProposal(input('custom_field_change')).status).toBe('blocked_unsafe');
  });

  it('blocks a route registration proposal', () => {
    expect(buildAdminConfigurationProposal(input('route_registration_change')).status).toBe('blocked_unsafe');
  });

  it('classifies an integration enable proposal as high external integration risk', () => {
    const p = buildAdminConfigurationProposal(input('integration_provider_change'));
    expect(p.riskClass).toBe('high_external_integration_risk');
    expect(p.warnings.some((w) => w.code === 'integration_change_not_applicable')).toBe(true);
  });

  it('stores no executable payload (redacts it and blocks)', () => {
    const p = buildAdminConfigurationProposal(input('platform_object_change', { proposedChangeSummary: 'apply via function(){ return doThing(); } => run' }));
    expect(p.status).toBe('blocked_unsafe');
    expect(p.proposedChangeSummary).not.toContain('function(');
    expect(p.auditSummary.containsExecutableCode).toBe(false);
  });

  it('accepts no secrets / PII (redacts and blocks)', () => {
    const p = buildAdminConfigurationProposal(input('platform_object_change', { summary: 'borrower SSN 123-45-6789 should map here' }));
    expect(p.status).toBe('blocked_unsafe');
    expect(p.summary).not.toContain('123-45-6789');
  });
});
