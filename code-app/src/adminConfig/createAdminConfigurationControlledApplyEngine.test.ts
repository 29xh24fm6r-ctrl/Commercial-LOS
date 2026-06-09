import { describe, it, expect } from 'vitest';
import { createAdminConfigurationControlledApplyEngine } from './createAdminConfigurationControlledApplyEngine';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import { resolveAdminConfigApplyFeatureFlags } from './adminConfigurationApplyFeatureFlags';
import type { AdminConfigurationProposal, AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function proposal(type: AdminConfigurationProposalType): AdminConfigurationProposal {
  const base = buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: type, title: 'Adjust view', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
  return { ...base, status: 'approved_not_applied' };
}

describe('Phase 142K — controlled apply engine', () => {
  it('is disabled by default', () => {
    const engine = createAdminConfigurationControlledApplyEngine();
    expect(engine.getStatus()).toBe('apply_disabled');
  });

  it('reports dry-run-ready status when preview flags are enabled', () => {
    const engine = createAdminConfigurationControlledApplyEngine({ flags: resolveAdminConfigApplyFeatureFlags() });
    expect(engine.getStatus()).toBe('dry_run_ready');
  });

  it('previewApply returns a safe plan for an approved metadata proposal', () => {
    const engine = createAdminConfigurationControlledApplyEngine({ flags: resolveAdminConfigApplyFeatureFlags() });
    const preview = engine.previewApply(proposal('platform_object_change'));
    expect(preview.status).toBe('dry_run_ready');
    expect(preview.plan?.steps.length).toBeGreaterThan(0);
  });

  it('validateApply blocks an unsafe proposal', () => {
    const engine = createAdminConfigurationControlledApplyEngine({ flags: resolveAdminConfigApplyFeatureFlags() });
    const v = engine.validateApply(proposal('dataverse_schema_change'));
    expect(v.valid).toBe(false);
    expect(v.validForApply).toBe(false);
    expect(v.status).toBe('blocked_schema_mutation');
  });

  it('attemptApply is always blocked with applied=false and mutated=false', () => {
    const engine = createAdminConfigurationControlledApplyEngine({ flags: resolveAdminConfigApplyFeatureFlags() });
    const r = engine.attemptApply(proposal('platform_object_change'));
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.mutated).toBe(false);
    expect(r.errorCode).toBe('admin_config_apply_forbidden');
  });

  it('attemptApply does not mutate the input proposal and makes no write', () => {
    const engine = createAdminConfigurationControlledApplyEngine({ flags: resolveAdminConfigApplyFeatureFlags() });
    const p = proposal('platform_object_change');
    const snapshot = JSON.stringify(p);
    const r = engine.attemptApply(p);
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(r.auditSummary.wroteToDataverse).toBe(false);
  });
});
