/**
 * Phase 142J — Admin configuration persistence: types.
 *
 * Governed types for a FUTURE audit-backed persistence path for the Phase 142G
 * review-only proposals / decisions / audit entries. Persistence is DISABLED by
 * default. This phase creates NO Dataverse schema, writes NOTHING by default,
 * applies NO configuration, and mutates NO platform metadata. There is
 * deliberately NO applied / deployed / published / activated status and NO apply
 * operation. Disabled capabilities are named as literal-false structural fields
 * (`wroteToDataverse: false`, `appliedConfig: false`) — governance scans target
 * EXECUTION patterns, not these fields.
 */

// ── Modes ───────────────────────────────────────────────────────────────────
export type AdminConfigurationPersistenceMode =
  | 'disabled'
  | 'dry_run'
  | 'live_read_only'
  | 'live_write_disabled'
  | 'live_write_enabled_future';

export const DEFAULT_ADMIN_CONFIG_PERSISTENCE_MODE: AdminConfigurationPersistenceMode = 'disabled';

export const ADMIN_CONFIG_PERSISTENCE_MODES: readonly AdminConfigurationPersistenceMode[] = Object.freeze([
  'disabled', 'dry_run', 'live_read_only', 'live_write_disabled', 'live_write_enabled_future',
]);

// ── Statuses ────────────────────────────────────────────────────────────────
export type AdminConfigurationPersistenceStatus =
  | 'disabled_not_configured'
  | 'schema_not_ready'
  | 'adapter_not_configured'
  | 'ready_for_future_persistence'
  | 'blocked_by_policy'
  | 'blocked_by_permission'
  | 'blocked_by_schema'
  | 'blocked_by_missing_transport';

// ── Error codes ─────────────────────────────────────────────────────────────
export type AdminConfigurationPersistenceErrorCode =
  | 'admin_config_persistence_disabled'
  | 'admin_config_persistence_not_configured'
  | 'admin_config_schema_not_ready'
  | 'admin_config_permission_denied'
  | 'admin_config_policy_blocked'
  | 'admin_config_transport_missing'
  | 'admin_config_validation_failed'
  | 'admin_config_write_forbidden'
  | 'admin_config_apply_forbidden'
  | 'admin_config_sensitive_value_blocked'
  | 'admin_config_unsupported_operation';

export const ADMIN_CONFIG_PERSISTENCE_ERROR_CODES: readonly AdminConfigurationPersistenceErrorCode[] = Object.freeze([
  'admin_config_persistence_disabled', 'admin_config_persistence_not_configured', 'admin_config_schema_not_ready',
  'admin_config_permission_denied', 'admin_config_policy_blocked', 'admin_config_transport_missing',
  'admin_config_validation_failed', 'admin_config_write_forbidden', 'admin_config_apply_forbidden',
  'admin_config_sensitive_value_blocked', 'admin_config_unsupported_operation',
]);

// ── Findings ────────────────────────────────────────────────────────────────
export interface AdminConfigurationPersistenceBlocker {
  code: AdminConfigurationPersistenceErrorCode;
  message: string;
}

export interface AdminConfigurationPersistenceWarning {
  code: string;
  message: string;
}

export interface AdminConfigurationPersistenceNextAction {
  code: string;
  label: string;
}

// ── Audit summary ───────────────────────────────────────────────────────────
export interface AdminConfigurationPersistenceAuditSummary {
  operation: string;
  /** Pinned false — no write / apply / sensitive value persistence in this phase. */
  wroteToDataverse: false;
  appliedConfig: false;
  containsSensitiveValue: false;
  readOnly: true;
}

// ── Records (Dataverse payload shapes) ──────────────────────────────────────
export interface AdminConfigurationProposalRecord {
  cr664_name: string;
  cr664_proposalidtext: string;
  cr664_proposaltype: string;
  cr664_title: string;
  cr664_summary: string;
  cr664_requestedby: string;
  cr664_requestedat: string;
  cr664_targetdomain: string;
  cr664_targetkey: string | null;
  cr664_riskclass: string;
  cr664_status: string;
  cr664_validationstatus: string;
  cr664_blockersjson: string;
  cr664_warningsjson: string;
  cr664_impactsnapshotjson: string;
  cr664_redactedauditsummaryjson: string;
  cr664_createdat: string;
  cr664_updatedat: string;
}

export interface AdminConfigurationReviewDecisionRecord {
  cr664_name: string;
  cr664_decisionidtext: string;
  cr664_proposalidtext: string;
  cr664_decisiontype: string;
  cr664_decisionstatus: string;
  cr664_reviewer: string;
  cr664_reviewedat: string;
  cr664_reviewernotesredacted: string | null;
  cr664_blockersjson: string;
  cr664_warningsjson: string;
  cr664_redactedauditsummaryjson: string;
}

export interface AdminConfigurationAuditRecord {
  cr664_name: string;
  cr664_auditidtext: string;
  cr664_proposalidtext: string;
  cr664_action: string;
  cr664_actor: string;
  cr664_timestamp: string;
  cr664_redactedsnapshotjson: string;
  cr664_reason: string | null;
  cr664_blockersjson: string;
  cr664_warningsjson: string;
}

// ── Result ──────────────────────────────────────────────────────────────────
export interface AdminConfigurationPersistenceResult<T = unknown> {
  ok: boolean;
  operation: string;
  recordId?: string;
  data?: T;
  errorCode?: AdminConfigurationPersistenceErrorCode;
  message?: string;
  blockers: readonly AdminConfigurationPersistenceBlocker[];
  warnings: readonly AdminConfigurationPersistenceWarning[];
  auditSummary: AdminConfigurationPersistenceAuditSummary;
}

// ── Schema state + readiness ────────────────────────────────────────────────
export interface AdminConfigurationPersistenceSchemaState {
  schemaReady: boolean;
  tablesFound: readonly string[];
  tablesMissing: readonly string[];
  conflictingTables: readonly string[];
  columnsMissing: readonly { tableLogicalName: string; columnLogicalName: string }[];
  relationshipsMissing: readonly { relationshipSchemaName: string; fromTable: string; toTable: string }[];
  blockers: readonly string[];
  warnings: readonly string[];
}

export interface AdminConfigurationPersistenceReadiness {
  mode: AdminConfigurationPersistenceMode;
  status: AdminConfigurationPersistenceStatus;
  schemaReady: boolean;
  readEnabled: boolean;
  writeEnabled: boolean;
  applyEnabled: false;
  blockers: readonly AdminConfigurationPersistenceBlocker[];
  warnings: readonly AdminConfigurationPersistenceWarning[];
  nextBestAction: AdminConfigurationPersistenceNextAction;
}

// ── Adapter contract ────────────────────────────────────────────────────────
export interface AdminConfigurationPersistenceListResult<T = unknown> {
  ok: boolean;
  operation: string;
  data: readonly T[];
  errorCode?: AdminConfigurationPersistenceErrorCode;
  message?: string;
}

/**
 * The persistence adapter seam. Models READ + (future, disabled) SAVE of
 * proposal / review-decision / audit records only. There is NO applyProposal,
 * deployProposal, publishProposal, activateProposal, mutateSchema, createField,
 * registerRoute, enableIntegration, widenPermission, executeWorkflow,
 * approveCredit, waiveCovenant, or delete method.
 */
export interface AdminConfigurationPersistenceAdapter {
  readonly mode: AdminConfigurationPersistenceMode;
  getStatus(): AdminConfigurationPersistenceStatus;
  getReadiness(): AdminConfigurationPersistenceReadiness;
  listProposals(): AdminConfigurationPersistenceListResult<AdminConfigurationProposalRecord>;
  readProposal(proposalId: string): AdminConfigurationPersistenceResult<AdminConfigurationProposalRecord>;
  saveProposal(record: AdminConfigurationProposalRecord): AdminConfigurationPersistenceResult;
  listReviewDecisions(proposalId?: string): AdminConfigurationPersistenceListResult<AdminConfigurationReviewDecisionRecord>;
  saveReviewDecision(record: AdminConfigurationReviewDecisionRecord): AdminConfigurationPersistenceResult;
  listAuditEntries(proposalId?: string): AdminConfigurationPersistenceListResult<AdminConfigurationAuditRecord>;
  saveAuditEntry(record: AdminConfigurationAuditRecord): AdminConfigurationPersistenceResult;
}
