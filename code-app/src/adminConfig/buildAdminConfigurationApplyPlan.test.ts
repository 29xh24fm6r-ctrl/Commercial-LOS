import { describe, it, expect } from 'vitest';
import { buildAdminConfigurationApplyPlan } from './buildAdminConfigurationApplyPlan';
import { deriveAdminConfigurationApplyReadiness } from './deriveAdminConfigurationApplyReadiness';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { resolveAdminConfigApplyFeatureFlags } from './adminConfigurationApplyFeatureFlags';
import type { AdminConfigurationProposal, AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';
const FLAGS = resolveAdminConfigApplyFeatureFlags();

function proposal(type: AdminConfigurationProposalType): AdminConfigurationProposal {
  const base = buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: type, title: 'Adjust view', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
  return { ...base, status: 'approved_not_applied' };
}

function plan(p: AdminConfigurationProposal, snapshots?: { currentSnapshot?: string; proposedSnapshot?: string }) {
  const readiness = deriveAdminConfigurationApplyReadiness({ proposal: p, validation: validateAdminConfigurationProposal({ proposal: p }), flags: FLAGS });
  return buildAdminConfigurationApplyPlan({ proposal: p, readiness, ...snapshots });
}

describe('Phase 142K — admin configuration apply plan builder', () => {
  it('builds a preview plan for a safe platform metadata proposal', () => {
    const p = plan(proposal('platform_object_change'));
    expect(p.steps.every((s) => s.status === 'preview')).toBe(true);
    expect(p.steps.some((s) => s.stepType === 'platform_object_metadata_change_preview')).toBe(true);
    expect(p.auditSummary.applied).toBe(false);
    expect(p.auditSummary.mutated).toBe(false);
  });

  it('builds a blocked plan for a schema mutation proposal', () => {
    const p = plan(proposal('dataverse_schema_change'));
    expect(p.steps.some((s) => s.stepType === 'schema_mutation_blocked' && s.status === 'blocked')).toBe(true);
  });

  it('builds a blocked plan for integration enablement', () => {
    expect(plan(proposal('integration_provider_change')).steps.some((s) => s.stepType === 'external_integration_enablement_blocked')).toBe(true);
  });

  it('builds a blocked plan for route registration', () => {
    expect(plan(proposal('route_registration_change')).steps.some((s) => s.stepType === 'route_registration_blocked')).toBe(true);
  });

  it('redacts sensitive before/after snapshots and carries no executable payload', () => {
    const p = plan(proposal('platform_object_change'), { currentSnapshot: 'ssn 123-45-6789', proposedSnapshot: 'function(){ run() } => x' });
    expect(JSON.stringify(p)).not.toContain('123-45-6789');
    expect(JSON.stringify(p)).not.toMatch(/function\s*\(/);
  });

  it('contains no Dataverse write payload', () => {
    const p = plan(proposal('platform_object_change'));
    expect(JSON.stringify(p)).not.toMatch(/createRecord|updateRecord|method"?:\s*"?(POST|PATCH)/i);
  });
});
