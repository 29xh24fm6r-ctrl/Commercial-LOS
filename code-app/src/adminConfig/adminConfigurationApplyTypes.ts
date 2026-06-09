/**
 * Phase 142K — Admin configuration controlled-apply: types.
 *
 * Models how a FUTURE admin-approved configuration change would move through
 * review → validation → approval → apply-readiness → controlled apply plan →
 * dry-run preview. NOTHING is applied. `applied` and `mutated` are pinned false
 * everywhere; there is deliberately NO applied / deployed / published / activated
 * / executed / live status. No plan step carries executable code, SQL/OData,
 * fetch config, secrets, or PII — unsafe actions become blocked steps. Disabled
 * capabilities are named as literal-false structural fields — governance scans
 * target EXECUTION patterns, not these fields. Generate apply plans; do not apply.
 */

import type { AdminConfigurationProposalRisk } from './adminConfigurationTypes';

// ── Modes ───────────────────────────────────────────────────────────────────
export type AdminConfigurationApplyMode =
  | 'disabled'
  | 'dry_run_only'
  | 'preview_only'
  | 'future_controlled_apply';

export const DEFAULT_ADMIN_CONFIG_APPLY_MODE: AdminConfigurationApplyMode = 'disabled';

export const ADMIN_CONFIG_APPLY_MODES: readonly AdminConfigurationApplyMode[] = Object.freeze([
  'disabled', 'dry_run_only', 'preview_only', 'future_controlled_apply',
]);

// ── Statuses (NO applied/deployed/published/activated/executed/live) ─────────
export type AdminConfigurationApplyStatus =
  | 'apply_disabled'
  | 'dry_run_ready'
  | 'blocked_not_approved'
  | 'blocked_validation_failed'
  | 'blocked_schema_mutation'
  | 'blocked_permission_widening'
  | 'blocked_integration_enablement'
  | 'blocked_route_registration'
  | 'blocked_workflow_execution'
  | 'blocked_policy'
  | 'blocked_missing_reviewer'
  | 'blocked_missing_persistence'
  | 'disabled_not_configured';

export const ADMIN_CONFIG_APPLY_STATUSES: readonly AdminConfigurationApplyStatus[] = Object.freeze([
  'apply_disabled', 'dry_run_ready', 'blocked_not_approved', 'blocked_validation_failed',
  'blocked_schema_mutation', 'blocked_permission_widening', 'blocked_integration_enablement',
  'blocked_route_registration', 'blocked_workflow_execution', 'blocked_policy',
  'blocked_missing_reviewer', 'blocked_missing_persistence', 'disabled_not_configured',
]);

// ── Plan step types ─────────────────────────────────────────────────────────
export type AdminConfigurationApplyPlanStepType =
  | 'metadata_review'
  | 'platform_object_metadata_change_preview'
  | 'platform_view_metadata_change_preview'
  | 'workflow_route_change_preview'
  | 'product_template_change_preview'
  | 'servicing_lifecycle_rule_change_preview'
  | 'integration_provider_change_preview'
  | 'permission_policy_change_blocked'
  | 'schema_mutation_blocked'
  | 'route_registration_blocked'
  | 'external_integration_enablement_blocked'
  | 'workflow_execution_blocked';

// ── Error codes ─────────────────────────────────────────────────────────────
export type AdminConfigurationApplyErrorCode =
  | 'admin_config_apply_disabled'
  | 'admin_config_apply_dry_run_only'
  | 'admin_config_apply_forbidden'
  | 'admin_config_apply_validation_failed'
  | 'admin_config_apply_schema_mutation_blocked'
  | 'admin_config_apply_integration_enablement_blocked'
  | 'admin_config_apply_permission_widening_blocked'
  | 'admin_config_apply_route_registration_blocked'
  | 'admin_config_apply_workflow_execution_blocked';

export const ADMIN_CONFIG_APPLY_ERROR_CODES: readonly AdminConfigurationApplyErrorCode[] = Object.freeze([
  'admin_config_apply_disabled', 'admin_config_apply_dry_run_only', 'admin_config_apply_forbidden',
  'admin_config_apply_validation_failed', 'admin_config_apply_schema_mutation_blocked',
  'admin_config_apply_integration_enablement_blocked', 'admin_config_apply_permission_widening_blocked',
  'admin_config_apply_route_registration_blocked', 'admin_config_apply_workflow_execution_blocked',
]);

// ── Findings ────────────────────────────────────────────────────────────────
export interface AdminConfigurationApplyBlocker {
  code: string;
  message: string;
}

export interface AdminConfigurationApplyWarning {
  code: string;
  message: string;
}

export interface AdminConfigurationApplyNextAction {
  code: string;
  label: string;
}

// ── Audit summary ───────────────────────────────────────────────────────────
export interface AdminConfigurationApplyAuditSummary {
  proposalId: string;
  /** Pinned false — nothing is applied or mutated in this phase. */
  applied: false;
  mutated: false;
  wroteToDataverse: false;
  containsExecutable: false;
  readOnly: true;
}

// ── Plan + steps ────────────────────────────────────────────────────────────
export interface AdminConfigurationApplyPlanStep {
  stepType: AdminConfigurationApplyPlanStepType;
  label: string;
  status: 'preview' | 'blocked';
  riskClass: AdminConfigurationProposalRisk;
  beforeSummary?: string;
  afterSummary?: string;
  blockers: readonly AdminConfigurationApplyBlocker[];
}

export interface AdminConfigurationApplyPlan {
  proposalId: string;
  mode: AdminConfigurationApplyMode;
  status: AdminConfigurationApplyStatus;
  riskClass: AdminConfigurationProposalRisk;
  steps: readonly AdminConfigurationApplyPlanStep[];
  beforeRedacted?: string;
  afterRedacted?: string;
  reviewerEvidence: string;
  blockers: readonly AdminConfigurationApplyBlocker[];
  warnings: readonly AdminConfigurationApplyWarning[];
  auditSummary: AdminConfigurationApplyAuditSummary;
}

// ── Readiness + validation ──────────────────────────────────────────────────
export interface AdminConfigurationApplyReadiness {
  proposalId: string;
  mode: AdminConfigurationApplyMode;
  status: AdminConfigurationApplyStatus;
  applyReadyForFutureImplementation: boolean;
  dryRunPreviewAvailable: boolean;
  /** Always false in this phase. */
  validForApply: false;
  riskClass: AdminConfigurationProposalRisk;
  blockers: readonly AdminConfigurationApplyBlocker[];
  warnings: readonly AdminConfigurationApplyWarning[];
  nextBestAction: AdminConfigurationApplyNextAction;
}

export interface AdminConfigurationApplyValidationResult {
  proposalId: string;
  valid: boolean;
  validForApply: false;
  status: AdminConfigurationApplyStatus;
  blockers: readonly AdminConfigurationApplyBlocker[];
  warnings: readonly AdminConfigurationApplyWarning[];
}

// ── Preview + result ────────────────────────────────────────────────────────
export interface AdminConfigurationApplyPreview {
  proposalId: string;
  mode: AdminConfigurationApplyMode;
  status: AdminConfigurationApplyStatus;
  plan?: AdminConfigurationApplyPlan;
  blockers: readonly AdminConfigurationApplyBlocker[];
  warnings: readonly AdminConfigurationApplyWarning[];
}

export interface AdminConfigurationApplyResult {
  ok: boolean;
  status: AdminConfigurationApplyStatus;
  /** Pinned false — attemptApply never applies or mutates. */
  applied: false;
  mutated: false;
  steps: readonly AdminConfigurationApplyPlanStep[];
  errorCode?: AdminConfigurationApplyErrorCode;
  blockers: readonly AdminConfigurationApplyBlocker[];
  warnings: readonly AdminConfigurationApplyWarning[];
  auditSummary: AdminConfigurationApplyAuditSummary;
}

// ── Workflow summary ────────────────────────────────────────────────────────
export interface AdminConfigurationApplyWorkflowAuditSummary {
  appliedAny: false;
  mutatedAny: false;
  wroteToDataverse: false;
  readOnly: true;
}

export interface AdminConfigurationApplyWorkflowResult {
  workflowStatus: AdminConfigurationApplyMode;
  previewReadyCount: number;
  blockedCount: number;
  unsafeBlockedCount: number;
  pendingApprovalCount: number;
  applyPlans: readonly AdminConfigurationApplyPlan[];
  blockers: readonly AdminConfigurationApplyBlocker[];
  warnings: readonly AdminConfigurationApplyWarning[];
  nextBestActions: readonly AdminConfigurationApplyNextAction[];
  auditSummary: AdminConfigurationApplyWorkflowAuditSummary;
}
