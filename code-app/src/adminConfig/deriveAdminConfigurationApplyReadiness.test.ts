import { describe, it, expect } from 'vitest';
import { deriveAdminConfigurationApplyReadiness } from './deriveAdminConfigurationApplyReadiness';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { resolveAdminConfigApplyFeatureFlags } from './adminConfigurationApplyFeatureFlags';
import type { AdminConfigurationProposal, AdminConfigurationProposalStatus, AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';
const PREVIEW_FLAGS = resolveAdminConfigApplyFeatureFlags();

function proposal(type: AdminConfigurationProposalType, status: AdminConfigurationProposalStatus = 'approved_not_applied'): AdminConfigurationProposal {
  const base = buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: type, title: 'Adjust view', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
  return { ...base, status };
}

function readiness(p: AdminConfigurationProposal, flags = PREVIEW_FLAGS) {
  return deriveAdminConfigurationApplyReadiness({ proposal: p, validation: validateAdminConfigurationProposal({ proposal: p }), flags });
}

describe('Phase 142K — admin configuration apply readiness', () => {
  it('makes an approved_not_applied metadata proposal dry-run preview ready', () => {
    const r = readiness(proposal('platform_object_change'));
    expect(r.status).toBe('dry_run_ready');
    expect(r.dryRunPreviewAvailable).toBe(true);
    expect(r.applyReadyForFutureImplementation).toBe(true);
  });

  it('blocks a draft proposal as not approved', () => {
    expect(readiness(proposal('platform_object_change', 'draft_proposal')).status).toBe('blocked_not_approved');
  });

  it('blocks a rejected proposal as not approved', () => {
    expect(readiness(proposal('platform_object_change', 'rejected')).status).toBe('blocked_not_approved');
  });

  it('blocks when validation is invalid', () => {
    const raw: AdminConfigurationProposal = { ...proposal('platform_object_change'), summary: 'ssn 123-45-6789' };
    const r = deriveAdminConfigurationApplyReadiness({ proposal: raw, validation: validateAdminConfigurationProposal({ proposal: raw }), flags: PREVIEW_FLAGS });
    expect(r.status).toBe('blocked_validation_failed');
  });

  it('blocks schema mutation, route registration, integration, permission, and workflow proposals', () => {
    expect(readiness(proposal('dataverse_schema_change')).status).toBe('blocked_schema_mutation');
    expect(readiness(proposal('custom_field_change')).status).toBe('blocked_schema_mutation');
    expect(readiness(proposal('route_registration_change')).status).toBe('blocked_route_registration');
    expect(readiness(proposal('integration_provider_change')).status).toBe('blocked_integration_enablement');
    expect(readiness(proposal('permission_policy_change')).status).toBe('blocked_permission_widening');
    expect(readiness(proposal('workflow_route_change')).status).toBe('blocked_workflow_execution');
  });

  it('keeps validForApply false always and apply mode disabled by default', () => {
    expect(readiness(proposal('platform_object_change')).validForApply).toBe(false);
    const noFlags = deriveAdminConfigurationApplyReadiness({ proposal: proposal('platform_object_change'), validation: validateAdminConfigurationProposal({ proposal: proposal('platform_object_change') }) });
    expect(noFlags.mode).toBe('disabled');
    expect(noFlags.validForApply).toBe(false);
  });

  it('uses no apply-now / deploy-now next best action', () => {
    const labels = [
      readiness(proposal('platform_object_change')).nextBestAction.label,
      readiness(proposal('dataverse_schema_change')).nextBestAction.label,
    ].join(' ').toLowerCase();
    expect(labels).not.toMatch(/apply now|deploy now/);
  });
});
