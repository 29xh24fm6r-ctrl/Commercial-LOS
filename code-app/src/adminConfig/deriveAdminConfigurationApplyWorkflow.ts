/**
 * Phase 142K — Admin configuration APPLY WORKFLOW deriver.
 *
 * PURE, READ-ONLY. Rolls proposals up into an apply-workflow summary:
 * approved_not_applied safe proposals produce dry-run preview plans; pending
 * proposals wait for review; unsafe proposals are blocked. No proposal becomes
 * applied; no next best action says "apply now" or "deploy now". No mutation.
 */

import type { AdminConfigurationProposal, AdminConfigurationValidationResult } from './adminConfigurationTypes';
import { validateAdminConfigurationProposal } from './validateAdminConfigurationProposal';
import { deriveAdminConfigurationApplyReadiness } from './deriveAdminConfigurationApplyReadiness';
import { buildAdminConfigurationApplyPlan } from './buildAdminConfigurationApplyPlan';
import type {
  AdminConfigurationApplyMode,
  AdminConfigurationApplyNextAction,
  AdminConfigurationApplyPlan,
  AdminConfigurationApplyWarning,
  AdminConfigurationApplyWorkflowResult,
} from './adminConfigurationApplyTypes';
import {
  ADMIN_CONFIG_APPLY_FEATURE_FLAG_DEFAULTS,
  type AdminConfigApplyFeatureFlags,
} from './adminConfigurationApplyFeatureFlags';

export interface DeriveAdminConfigurationApplyWorkflowInput {
  proposals: readonly AdminConfigurationProposal[];
  validations?: readonly AdminConfigurationValidationResult[];
  flags?: AdminConfigApplyFeatureFlags;
  permissionContext?: { grantedPermissions?: readonly string[] };
  clock?: string;
}

const UNSAFE_BLOCK_STATUSES = new Set([
  'blocked_schema_mutation', 'blocked_route_registration', 'blocked_integration_enablement',
  'blocked_permission_widening', 'blocked_workflow_execution',
]);

export function deriveAdminConfigurationApplyWorkflow(
  input: DeriveAdminConfigurationApplyWorkflowInput,
): AdminConfigurationApplyWorkflowResult {
  const flags = input.flags ?? ADMIN_CONFIG_APPLY_FEATURE_FLAG_DEFAULTS;
  const workflowStatus: AdminConfigurationApplyMode = flags.ADMIN_CONFIG_APPLY_PREVIEW_ENABLED ? 'dry_run_only' : 'disabled';
  const validationById = new Map((input.validations ?? []).map((v) => [v.proposalId, v]));

  const applyPlans: AdminConfigurationApplyPlan[] = [];
  const warnings: AdminConfigurationApplyWarning[] = [];
  const nextBestActions: AdminConfigurationApplyNextAction[] = [];
  const seenActions = new Set<string>();
  let previewReadyCount = 0;
  let blockedCount = 0;
  let unsafeBlockedCount = 0;
  let pendingApprovalCount = 0;

  const pushAction = (a: AdminConfigurationApplyNextAction) => {
    if (!seenActions.has(a.code)) { seenActions.add(a.code); nextBestActions.push(a); }
  };

  for (const proposal of input.proposals) {
    const validation = validationById.get(proposal.proposalId) ?? validateAdminConfigurationProposal({ proposal });
    const readiness = deriveAdminConfigurationApplyReadiness({ proposal, validation, flags, permissionContext: input.permissionContext, clock: input.clock });

    if (readiness.dryRunPreviewAvailable) {
      previewReadyCount += 1;
      applyPlans.push(buildAdminConfigurationApplyPlan({ proposal, readiness }));
    } else if (readiness.status === 'blocked_not_approved' && (proposal.status === 'draft_proposal' || proposal.status === 'pending_review')) {
      pendingApprovalCount += 1;
    } else {
      blockedCount += 1;
      if (UNSAFE_BLOCK_STATUSES.has(readiness.status)) unsafeBlockedCount += 1;
    }
    pushAction(readiness.nextBestAction);
  }

  if (nextBestActions.length === 0) {
    pushAction({ code: 'review_proposal', label: 'Review proposals (no apply).' });
  }

  return {
    workflowStatus,
    previewReadyCount,
    blockedCount,
    unsafeBlockedCount,
    pendingApprovalCount,
    applyPlans,
    blockers: [],
    warnings,
    nextBestActions,
    auditSummary: { appliedAny: false, mutatedAny: false, wroteToDataverse: false, readOnly: true },
  };
}
