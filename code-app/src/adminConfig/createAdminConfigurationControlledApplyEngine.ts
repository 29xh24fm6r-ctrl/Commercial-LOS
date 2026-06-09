/**
 * Phase 142K — Admin configuration controlled apply ENGINE (disabled).
 *
 * PURE. Models preview / validate / attempt for a future controlled apply.
 * `attemptApply` is ALWAYS blocked — it never applies, mutates, writes to
 * Dataverse, calls externally, or produces side effects. `applied` and `mutated`
 * are pinned false. Preview/validate are dry-run only.
 */

import type { AdminConfigurationProposal } from './adminConfigurationTypes';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { deriveAdminConfigurationApplyReadiness } from './deriveAdminConfigurationApplyReadiness';
import { buildAdminConfigurationApplyPlan } from './buildAdminConfigurationApplyPlan';
import type {
  AdminConfigurationApplyPreview,
  AdminConfigurationApplyResult,
  AdminConfigurationApplyStatus,
  AdminConfigurationApplyValidationResult,
} from './adminConfigurationApplyTypes';
import {
  ADMIN_CONFIG_APPLY_FEATURE_FLAGS_DISABLED,
  type AdminConfigApplyFeatureFlags,
} from './adminConfigurationApplyFeatureFlags';

export interface CreateControlledApplyEngineInput {
  flags?: AdminConfigApplyFeatureFlags;
  permissionContext?: { grantedPermissions?: readonly string[] };
  policyContext?: { applyPolicyApproved?: boolean };
  clock?: string;
}

export interface AdminConfigurationControlledApplyEngine {
  getStatus(): AdminConfigurationApplyStatus;
  previewApply(proposal: AdminConfigurationProposal, snapshots?: { currentSnapshot?: string; proposedSnapshot?: string }): AdminConfigurationApplyPreview;
  validateApply(proposal: AdminConfigurationProposal): AdminConfigurationApplyValidationResult;
  attemptApply(proposal: AdminConfigurationProposal): AdminConfigurationApplyResult;
}

export function createAdminConfigurationControlledApplyEngine(
  input: CreateControlledApplyEngineInput = {},
): AdminConfigurationControlledApplyEngine {
  const flags = input.flags ?? ADMIN_CONFIG_APPLY_FEATURE_FLAGS_DISABLED;
  const previewable = flags.ADMIN_CONFIG_APPLY_WORKFLOW_ENABLED && flags.ADMIN_CONFIG_APPLY_PREVIEW_ENABLED;

  function readinessFor(proposal: AdminConfigurationProposal) {
    const validation = validateAdminConfigurationProposal({ proposal });
    return deriveAdminConfigurationApplyReadiness({
      proposal,
      validation,
      flags,
      permissionContext: input.permissionContext,
      policyContext: input.policyContext,
      clock: input.clock,
    });
  }

  return {
    getStatus: () => (previewable ? 'dry_run_ready' : 'apply_disabled'),

    previewApply: (proposal, snapshots) => {
      const readiness = readinessFor(proposal);
      if (readiness.dryRunPreviewAvailable) {
        const plan = buildAdminConfigurationApplyPlan({
          proposal, readiness,
          currentSnapshot: snapshots?.currentSnapshot,
          proposedSnapshot: snapshots?.proposedSnapshot,
          clock: input.clock,
        });
        return { proposalId: proposal.proposalId, mode: readiness.mode, status: readiness.status, plan, blockers: [], warnings: readiness.warnings };
      }
      return { proposalId: proposal.proposalId, mode: readiness.mode, status: readiness.status, blockers: readiness.blockers, warnings: readiness.warnings };
    },

    validateApply: (proposal) => {
      const readiness = readinessFor(proposal);
      return {
        proposalId: proposal.proposalId,
        valid: readiness.status === 'dry_run_ready',
        validForApply: false,
        status: readiness.status,
        blockers: readiness.blockers,
        warnings: readiness.warnings,
      };
    },

    attemptApply: (proposal) => ({
      ok: false,
      status: 'apply_disabled',
      applied: false,
      mutated: false,
      steps: [],
      errorCode: 'admin_config_apply_forbidden',
      blockers: [{ code: 'admin_config_apply_forbidden', message: 'Apply execution is disabled in this phase — generate plans, do not apply them.' }],
      warnings: [],
      auditSummary: { proposalId: proposal.proposalId, applied: false, mutated: false, wroteToDataverse: false, containsExecutable: false, readOnly: true },
    }),
  };
}
