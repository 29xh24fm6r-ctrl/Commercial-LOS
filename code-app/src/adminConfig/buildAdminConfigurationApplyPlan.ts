/**
 * Phase 142K — Admin configuration APPLY PLAN builder.
 *
 * PURE. Produces a preview-only (or blocked) apply plan. For safe metadata
 * proposals it emits preview steps with REDACTED before/after summaries; for
 * unsafe proposals it emits blocked steps. No step executes, mutates a registry,
 * writes to Dataverse, or carries executable code / SQL / OData / secrets / PII.
 * `applied` and `mutated` are pinned false.
 */

import type { AdminConfigurationProposal, AdminConfigurationProposalType } from './adminConfigurationTypes';
import type {
  AdminConfigurationApplyBlocker,
  AdminConfigurationApplyPlan,
  AdminConfigurationApplyPlanStep,
  AdminConfigurationApplyPlanStepType,
  AdminConfigurationApplyReadiness,
  AdminConfigurationApplyWarning,
} from './adminConfigurationApplyTypes';
import { redactIfUnsafe } from './adminConfigurationContentSafety';

export interface BuildAdminConfigurationApplyPlanInput {
  proposal: AdminConfigurationProposal;
  readiness: AdminConfigurationApplyReadiness;
  currentSnapshot?: string;
  proposedSnapshot?: string;
  clock?: string;
}

const PREVIEW_STEP_BY_TYPE: Partial<Record<AdminConfigurationProposalType, AdminConfigurationApplyPlanStepType>> = {
  platform_object_change: 'platform_object_metadata_change_preview',
  platform_view_change: 'platform_view_metadata_change_preview',
  product_process_template_change: 'product_template_change_preview',
  servicing_lifecycle_rule_change: 'servicing_lifecycle_rule_change_preview',
  annual_review_package_policy_change: 'product_template_change_preview',
};

const BLOCKED_STEP_BY_TYPE: Partial<Record<AdminConfigurationProposalType, { stepType: AdminConfigurationApplyPlanStepType; code: string; reason: string }>> = {
  dataverse_schema_change: { stepType: 'schema_mutation_blocked', code: 'schema_mutation_blocked', reason: 'Schema mutation is forbidden in this phase.' },
  custom_field_change: { stepType: 'schema_mutation_blocked', code: 'schema_mutation_blocked', reason: 'Custom field creation is forbidden in this phase.' },
  route_registration_change: { stepType: 'route_registration_blocked', code: 'route_registration_blocked', reason: 'Route registration is forbidden in this phase.' },
  integration_provider_change: { stepType: 'external_integration_enablement_blocked', code: 'integration_enablement_blocked', reason: 'Integration enablement is forbidden in this phase.' },
  integration_mode_change: { stepType: 'external_integration_enablement_blocked', code: 'integration_enablement_blocked', reason: 'Integration mode change is forbidden in this phase.' },
  delivery_adapter_change: { stepType: 'external_integration_enablement_blocked', code: 'integration_enablement_blocked', reason: 'Delivery adapter enablement is forbidden in this phase.' },
  permission_policy_change: { stepType: 'permission_policy_change_blocked', code: 'permission_widening_blocked', reason: 'Permission widening is forbidden in this phase.' },
  workflow_route_change: { stepType: 'workflow_execution_blocked', code: 'workflow_execution_blocked', reason: 'Workflow execution is forbidden in this phase.' },
  workflow_rule_change: { stepType: 'workflow_execution_blocked', code: 'workflow_execution_blocked', reason: 'Workflow execution is forbidden in this phase.' },
};

export function buildAdminConfigurationApplyPlan(
  input: BuildAdminConfigurationApplyPlanInput,
): AdminConfigurationApplyPlan {
  const { proposal, readiness } = input;
  const beforeRedacted = redactIfUnsafe(input.currentSnapshot);
  const afterRedacted = redactIfUnsafe(input.proposedSnapshot);
  const steps: AdminConfigurationApplyPlanStep[] = [];
  const blockers: AdminConfigurationApplyBlocker[] = [];
  const warnings: AdminConfigurationApplyWarning[] = [];

  const blockedStep = BLOCKED_STEP_BY_TYPE[proposal.proposalType];
  if (blockedStep) {
    steps.push({
      stepType: blockedStep.stepType,
      label: `${proposal.title} — blocked`,
      status: 'blocked',
      riskClass: proposal.riskClass,
      blockers: [{ code: blockedStep.code, message: blockedStep.reason }],
    });
    blockers.push({ code: blockedStep.code, message: blockedStep.reason });
  } else {
    steps.push({
      stepType: 'metadata_review',
      label: 'Review the proposed metadata change (preview only).',
      status: 'preview',
      riskClass: proposal.riskClass,
      beforeSummary: beforeRedacted,
      afterSummary: afterRedacted,
      blockers: [],
    });
    const previewStep = PREVIEW_STEP_BY_TYPE[proposal.proposalType] ?? 'metadata_review';
    steps.push({
      stepType: previewStep,
      label: `Preview ${proposal.targetDomain.replace(/_/g, ' ')} change (no apply).`,
      status: 'preview',
      riskClass: proposal.riskClass,
      beforeSummary: beforeRedacted,
      afterSummary: afterRedacted,
      blockers: [],
    });
    warnings.push({ code: 'dry_run_only', message: 'Dry-run preview only — no configuration is applied.' });
  }

  return {
    proposalId: proposal.proposalId,
    mode: readiness.mode,
    status: readiness.status,
    riskClass: proposal.riskClass,
    steps,
    beforeRedacted,
    afterRedacted,
    reviewerEvidence: `Risk class ${proposal.riskClass}; proposal status ${proposal.status}; apply readiness ${readiness.status}.`,
    blockers,
    warnings,
    auditSummary: {
      proposalId: proposal.proposalId,
      applied: false,
      mutated: false,
      wroteToDataverse: false,
      containsExecutable: false,
      readOnly: true,
    },
  };
}
