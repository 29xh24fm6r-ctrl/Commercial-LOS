/**
 * Phase 142K — Admin configuration APPLY READINESS deriver.
 *
 * PURE, READ-ONLY. Decides whether a proposal could be DRY-RUN previewed (never
 * applied). Apply is disabled by default; `validForApply` is always false. Only
 * an `approved_not_applied`, validation-clean, SAFE-metadata proposal becomes
 * `dry_run_ready`. Schema/custom-field, route-registration, integration, permission,
 * and workflow proposals are blocked. Next best actions never say "apply now".
 */

import type { AdminConfigurationProposal, AdminConfigurationProposalType } from './adminConfigurationTypes';
import type { AdminConfigurationValidationResult } from './adminConfigurationTypes';
import type { AdminConfigurationPersistenceReadiness } from './adminConfigurationPersistenceTypes';
import type {
  AdminConfigurationApplyBlocker,
  AdminConfigurationApplyMode,
  AdminConfigurationApplyNextAction,
  AdminConfigurationApplyReadiness,
  AdminConfigurationApplyStatus,
  AdminConfigurationApplyWarning,
} from './adminConfigurationApplyTypes';
import {
  ADMIN_CONFIG_APPLY_FEATURE_FLAGS_DISABLED,
  type AdminConfigApplyFeatureFlags,
} from './adminConfigurationApplyFeatureFlags';

export interface DeriveAdminConfigurationApplyReadinessInput {
  proposal: AdminConfigurationProposal;
  validation?: AdminConfigurationValidationResult;
  persistenceReadiness?: AdminConfigurationPersistenceReadiness;
  requirePersistence?: boolean;
  flags?: AdminConfigApplyFeatureFlags;
  permissionContext?: { grantedPermissions?: readonly string[] };
  policyContext?: { applyPolicyApproved?: boolean };
  clock?: string;
}

const BLOCKED_STATUS_BY_TYPE: Partial<Record<AdminConfigurationProposalType, AdminConfigurationApplyStatus>> = {
  dataverse_schema_change: 'blocked_schema_mutation',
  custom_field_change: 'blocked_schema_mutation',
  route_registration_change: 'blocked_route_registration',
  integration_provider_change: 'blocked_integration_enablement',
  integration_mode_change: 'blocked_integration_enablement',
  delivery_adapter_change: 'blocked_integration_enablement',
  permission_policy_change: 'blocked_permission_widening',
  workflow_route_change: 'blocked_workflow_execution',
  workflow_rule_change: 'blocked_workflow_execution',
};

function nextAction(status: AdminConfigurationApplyStatus): AdminConfigurationApplyNextAction {
  switch (status) {
    case 'dry_run_ready':
      return { code: 'prepare_operator_spec', label: 'Prepare an operator implementation spec for a future, governed change (no apply).' };
    case 'blocked_not_approved':
      return { code: 'review_proposal', label: 'Review the proposal and approve it for future implementation (no apply).' };
    case 'blocked_validation_failed':
      return { code: 'request_changes', label: 'Request changes to resolve the validation findings.' };
    case 'blocked_missing_persistence':
      return { code: 'configure_persistence_later', label: 'Configure persistence later (disabled in this phase).' };
    case 'blocked_policy':
      return { code: 'complete_policy_review', label: 'Complete the policy review before any future change.' };
    default:
      return { code: 'keep_blocked', label: 'Keep blocked — this change is forbidden in this phase.' };
  }
}

export function deriveAdminConfigurationApplyReadiness(
  input: DeriveAdminConfigurationApplyReadinessInput,
): AdminConfigurationApplyReadiness {
  const { proposal } = input;
  const flags = input.flags ?? ADMIN_CONFIG_APPLY_FEATURE_FLAGS_DISABLED;
  const mode: AdminConfigurationApplyMode = flags.ADMIN_CONFIG_APPLY_PREVIEW_ENABLED ? 'dry_run_only' : 'disabled';
  const warnings: AdminConfigurationApplyWarning[] = [];
  const blockers: AdminConfigurationApplyBlocker[] = [];

  const blockedByType = BLOCKED_STATUS_BY_TYPE[proposal.proposalType];
  const validationInvalid = input.validation?.validForReview === false;

  let status: AdminConfigurationApplyStatus;
  let dryRunPreviewAvailable = false;
  if (blockedByType) {
    status = blockedByType;
  } else if (validationInvalid) {
    status = 'blocked_validation_failed';
  } else if (proposal.status !== 'approved_not_applied') {
    status = 'blocked_not_approved';
  } else if (input.policyContext && input.policyContext.applyPolicyApproved === false) {
    status = 'blocked_policy';
  } else if (input.requirePersistence && input.persistenceReadiness?.schemaReady !== true) {
    status = 'blocked_missing_persistence';
  } else if (!flags.ADMIN_CONFIG_APPLY_PREVIEW_ENABLED) {
    status = 'apply_disabled';
  } else {
    status = 'dry_run_ready';
    dryRunPreviewAvailable = true;
    warnings.push({ code: 'dry_run_only', message: 'Dry-run preview only — no configuration is applied.' });
  }

  if (status !== 'dry_run_ready') {
    blockers.push({ code: status, message: `Apply blocked: ${status.replace(/_/g, ' ')}.` });
  }

  const applyReadyForFutureImplementation =
    proposal.status === 'approved_not_applied' && !blockedByType && !validationInvalid;

  return {
    proposalId: proposal.proposalId,
    mode,
    status,
    applyReadyForFutureImplementation,
    dryRunPreviewAvailable,
    validForApply: false,
    riskClass: proposal.riskClass,
    blockers,
    warnings,
    nextBestAction: nextAction(status),
  };
}
