import { describe, it, expect } from 'vitest';
import {
  resolveAdminConfigApplyFeatureFlags,
  ADMIN_CONFIG_APPLY_FEATURE_FLAG_DEFAULTS,
} from './adminConfigurationApplyFeatureFlags';
import { deriveAdminConfigurationApplyWorkflow } from './deriveAdminConfigurationApplyWorkflow';
import { buildAdminConfigurationProposal } from './buildAdminConfigurationProposal';
import type { AdminConfigurationProposal, AdminConfigurationProposalStatus, AdminConfigurationProposalType } from './adminConfigurationTypes';

const CLOCK = '2026-06-09T00:00:00.000Z';

function proposal(id: string, type: AdminConfigurationProposalType, status: AdminConfigurationProposalStatus): AdminConfigurationProposal {
  const base = buildAdminConfigurationProposal({ proposalId: id, proposalType: type, title: `Proposal ${id}`, summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
  return { ...base, status };
}

describe('Phase 142K — apply feature flags', () => {
  it('defaults workflow + preview on, execution + dangerous flags off, dry-run on', () => {
    const d = ADMIN_CONFIG_APPLY_FEATURE_FLAG_DEFAULTS;
    expect(d.ADMIN_CONFIG_APPLY_WORKFLOW_ENABLED).toBe(true);
    expect(d.ADMIN_CONFIG_APPLY_PREVIEW_ENABLED).toBe(true);
    expect(d.ADMIN_CONFIG_APPLY_EXECUTION_ENABLED).toBe(false);
    expect(d.ADMIN_CONFIG_APPLY_DRY_RUN_ONLY).toBe(true);
    expect(d.ADMIN_CONFIG_SCHEMA_MUTATION_ALLOWED).toBe(false);
    expect(d.ADMIN_CONFIG_INTEGRATION_ENABLE_ALLOWED).toBe(false);
    expect(d.ADMIN_CONFIG_PERMISSION_WIDENING_ALLOWED).toBe(false);
    expect(d.ADMIN_CONFIG_ROUTE_REGISTRATION_ALLOWED).toBe(false);
  });

  it('never enables execution or dangerous flags even when config asks', () => {
    const f = resolveAdminConfigApplyFeatureFlags({ applyExecutionEnabled: true, schemaMutationAllowed: true, integrationEnableAllowed: true, permissionWideningAllowed: true, routeRegistrationAllowed: true });
    expect(f.ADMIN_CONFIG_APPLY_EXECUTION_ENABLED).toBe(false);
    expect(f.ADMIN_CONFIG_SCHEMA_MUTATION_ALLOWED).toBe(false);
    expect(f.ADMIN_CONFIG_INTEGRATION_ENABLE_ALLOWED).toBe(false);
    expect(f.ADMIN_CONFIG_PERMISSION_WIDENING_ALLOWED).toBe(false);
    expect(f.ADMIN_CONFIG_ROUTE_REGISTRATION_ALLOWED).toBe(false);
  });
});

describe('Phase 142K — apply workflow deriver', () => {
  const proposals = [
    proposal('P1', 'platform_object_change', 'approved_not_applied'),
    proposal('P2', 'dataverse_schema_change', 'blocked_unsafe'),
    proposal('P3', 'platform_view_change', 'pending_review'),
  ];

  it('derives preview-ready, blocked, and pending counts', () => {
    const w = deriveAdminConfigurationApplyWorkflow({ proposals });
    expect(w.previewReadyCount).toBe(1);
    expect(w.unsafeBlockedCount).toBe(1);
    expect(w.pendingApprovalCount).toBe(1);
    expect(w.applyPlans.length).toBe(1);
  });

  it('keeps approved_not_applied not applied and pending pending', () => {
    const w = deriveAdminConfigurationApplyWorkflow({ proposals });
    expect(w.auditSummary.appliedAny).toBe(false);
    expect(w.auditSummary.mutatedAny).toBe(false);
  });

  it('emits no apply-now / deploy-now next best action', () => {
    const w = deriveAdminConfigurationApplyWorkflow({ proposals });
    const labels = w.nextBestActions.map((a) => a.label).join(' ').toLowerCase();
    expect(labels).not.toMatch(/apply now|deploy now/);
  });
});
