/**
 * Phase 142G — Admin configuration review queue: types.
 *
 * Governed models for PROPOSED configuration changes across platform objects /
 * views, workflow routes / rules, product/process templates, servicing lifecycle
 * rules, integration adapters, permission policy, and (blocked) schema / custom
 * field / route registration. This phase is REVIEW-ONLY: a proposal NEVER applies
 * itself, mutates config, edits templates, changes routes, enables integrations,
 * adds custom fields, changes Dataverse schema, or writes to Dataverse. There is
 * deliberately NO applied / deployed / published / activated / executed status.
 * Disabled capabilities are named as literal-false structural fields
 * (`validForApply: false`, `appliedInThisPhase: false`) — governance scans target
 * EXECUTION patterns, not these fields.
 */

// ── Proposal types ──────────────────────────────────────────────────────────
export type AdminConfigurationProposalType =
  | 'platform_object_change'
  | 'platform_view_change'
  | 'workflow_route_change'
  | 'workflow_rule_change'
  | 'product_process_template_change'
  | 'servicing_lifecycle_rule_change'
  | 'integration_provider_change'
  | 'integration_mode_change'
  | 'delivery_adapter_change'
  | 'annual_review_package_policy_change'
  | 'permission_policy_change'
  | 'dataverse_schema_change'
  | 'custom_field_change'
  | 'route_registration_change';

export const ADMIN_CONFIGURATION_PROPOSAL_TYPES: readonly AdminConfigurationProposalType[] = Object.freeze([
  'platform_object_change', 'platform_view_change', 'workflow_route_change', 'workflow_rule_change',
  'product_process_template_change', 'servicing_lifecycle_rule_change', 'integration_provider_change',
  'integration_mode_change', 'delivery_adapter_change', 'annual_review_package_policy_change',
  'permission_policy_change', 'dataverse_schema_change', 'custom_field_change', 'route_registration_change',
]);

/** Proposal types that are immediately blocked_unsafe at build time. */
export const ADMIN_CONFIGURATION_BLOCKED_UNSAFE_TYPES: readonly AdminConfigurationProposalType[] = Object.freeze([
  'dataverse_schema_change', 'custom_field_change', 'route_registration_change',
]);

// ── Proposal statuses (NO applied/deployed/published/activated) ──────────────
export type AdminConfigurationProposalStatus =
  | 'draft_proposal'
  | 'pending_review'
  | 'approved_not_applied'
  | 'rejected'
  | 'cancelled'
  | 'blocked_unsafe'
  | 'disabled_not_configured';

export const ADMIN_CONFIGURATION_PROPOSAL_STATUSES: readonly AdminConfigurationProposalStatus[] = Object.freeze([
  'draft_proposal', 'pending_review', 'approved_not_applied', 'rejected', 'cancelled', 'blocked_unsafe', 'disabled_not_configured',
]);

// ── Risk classes ────────────────────────────────────────────────────────────
export type AdminConfigurationProposalRisk =
  | 'low_metadata_review'
  | 'medium_workflow_guidance'
  | 'high_runtime_write_risk'
  | 'high_external_integration_risk'
  | 'high_permission_risk'
  | 'high_schema_mutation_risk'
  | 'prohibited_in_this_phase';

export const ADMIN_CONFIGURATION_HIGH_RISK_CLASSES: readonly AdminConfigurationProposalRisk[] = Object.freeze([
  'high_runtime_write_risk', 'high_external_integration_risk', 'high_permission_risk', 'high_schema_mutation_risk', 'prohibited_in_this_phase',
]);

// ── Scope / domain ──────────────────────────────────────────────────────────
export type AdminConfigurationProposalScope =
  | 'platform_metadata'
  | 'workflow_routing'
  | 'product_process_template'
  | 'servicing_lifecycle'
  | 'integration_registry'
  | 'permission_policy'
  | 'schema'
  | 'route_registration';

// ── Findings ────────────────────────────────────────────────────────────────
export interface AdminConfigurationBlocker {
  code: string;
  message: string;
}

export interface AdminConfigurationWarning {
  code: string;
  message: string;
}

export interface AdminConfigurationNextAction {
  code: string;
  label: string;
}

/** A forbidden action, surfaced as an explanation (never executed). */
export interface AdminConfigurationBlockedAction {
  action: string;
  reason: string;
}

// ── Impact / audit summaries ────────────────────────────────────────────────
export interface AdminConfigurationImpactSummary {
  targetDomain: AdminConfigurationProposalScope;
  riskClass: AdminConfigurationProposalRisk;
  reversible: boolean;
  requiresFutureImplementation: true;
  /** Pinned false — nothing is applied in this phase. */
  appliedInThisPhase: false;
}

export interface AdminConfigurationAuditSummary {
  proposalId: string;
  proposalType: AdminConfigurationProposalType;
  riskClass: AdminConfigurationProposalRisk;
  /** Pinned false — proposals never apply, write, or mutate. */
  appliedConfig: false;
  wroteToDataverse: false;
  mutatedRegistry: false;
  containsExecutableCode: false;
  readOnly: true;
}

// ── Proposal ────────────────────────────────────────────────────────────────
export interface AdminConfigurationProposal {
  proposalId: string;
  proposalType: AdminConfigurationProposalType;
  title: string;
  summary: string;
  requestedBy: string;
  requestedAt: string;
  targetDomain: AdminConfigurationProposalScope;
  targetKey?: string;
  proposedChangeSummary: string;
  beforeSnapshot?: string;
  afterSnapshot?: string;
  riskClass: AdminConfigurationProposalRisk;
  status: AdminConfigurationProposalStatus;
  impactSummary: AdminConfigurationImpactSummary;
  blockers: readonly AdminConfigurationBlocker[];
  warnings: readonly AdminConfigurationWarning[];
  reviewerNotes?: string;
  auditSummary: AdminConfigurationAuditSummary;
}

// ── Validation result ───────────────────────────────────────────────────────
export interface AdminConfigurationValidationAuditSummary {
  proposalId: string;
  /** Pinned false — no proposal is apply-ready in this phase. */
  validForApply: false;
  containsSchemaMutation: false;
  containsWrite: false;
  readOnly: true;
}

export interface AdminConfigurationValidationResult {
  proposalId: string;
  validForReview: boolean;
  /** Always false in this phase. */
  validForApply: false;
  riskClass: AdminConfigurationProposalRisk;
  blockers: readonly AdminConfigurationBlocker[];
  warnings: readonly AdminConfigurationWarning[];
  blockedActions: readonly AdminConfigurationBlockedAction[];
  requiredReviewerRoles: readonly string[];
  auditSummary: AdminConfigurationValidationAuditSummary;
}

// ── Review context / reviewer ───────────────────────────────────────────────
export interface AdminConfigurationReviewer {
  reviewerId: string;
  roles?: readonly string[];
}

export interface AdminConfigurationReviewContext {
  reviewer?: AdminConfigurationReviewer;
  grantedPermissions?: readonly string[];
  workspace?: string;
}

// ── Review decision ─────────────────────────────────────────────────────────
export type AdminConfigurationReviewerAction =
  | 'mark_reviewed'
  | 'approve_for_future_implementation'
  | 'reject'
  | 'request_changes'
  | 'acknowledge_blocked';

export const ADMIN_CONFIGURATION_ALLOWED_REVIEWER_ACTIONS: readonly AdminConfigurationReviewerAction[] = Object.freeze([
  'mark_reviewed', 'approve_for_future_implementation', 'reject', 'request_changes', 'acknowledge_blocked',
]);

/** Reviewer actions that are explicitly forbidden in this phase. */
export const ADMIN_CONFIGURATION_FORBIDDEN_REVIEWER_ACTIONS: readonly string[] = Object.freeze([
  'apply', 'deploy', 'publish', 'activate', 'mutate_schema', 'create_field', 'enable_integration',
  'widen_permission', 'register_route', 'execute_workflow', 'approve_credit', 'waive_covenant',
]);

export interface AdminConfigurationReviewDecisionAuditSummary {
  proposalId: string;
  appliedConfig: false;
  wroteToDataverse: false;
  mutatedRegistry: false;
  readOnly: true;
}

export interface AdminConfigurationReviewDecision {
  proposalId: string;
  action: string;
  accepted: boolean;
  resultingStatus: AdminConfigurationProposalStatus;
  decidedBy: string;
  decidedAt: string;
  reviewerNotesRedacted?: string;
  blockers: readonly AdminConfigurationBlocker[];
  warnings: readonly AdminConfigurationWarning[];
  auditSummary: AdminConfigurationReviewDecisionAuditSummary;
}

// ── Review queue ────────────────────────────────────────────────────────────
export interface AdminConfigurationReviewQueueAuditSummary {
  queueId: string;
  proposalCount: number;
  appliedAny: false;
  wroteToDataverse: false;
  readOnly: true;
}

export interface AdminConfigurationReviewQueueEntry {
  proposal: AdminConfigurationProposal;
  validation?: AdminConfigurationValidationResult;
  visible: boolean;
}

export interface AdminConfigurationReviewQueue {
  queueId: string;
  generatedAt: string;
  proposals: readonly AdminConfigurationReviewQueueEntry[];
  pendingCount: number;
  blockedCount: number;
  rejectedCount: number;
  approvedNotAppliedCount: number;
  highRiskCount: number;
  visibleProposalCount: number;
  hiddenProposalCount: number;
  reviewerActions: readonly AdminConfigurationReviewerAction[];
  blockers: readonly AdminConfigurationBlocker[];
  warnings: readonly AdminConfigurationWarning[];
  auditSummary: AdminConfigurationReviewQueueAuditSummary;
}
