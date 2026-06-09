/**
 * Phase 142F — Integration adapter registry: types.
 *
 * Governed contracts/metadata for external banking/credit/servicing integrations
 * (AML/KYC, sanctions, credit bureau, scoring, core banking, servicing, payment,
 * document/e-sign, collateral/insurance/appraisal/environmental/title/flood/UCC,
 * tax, fraud/identity, accounting, reporting). EVERY provider is disabled by
 * default. This phase makes NO external call, NO fetch, transmits NO PII, pulls
 * NO credit, runs NO AML, scores NO credit decision, posts NO payment, performs
 * NO write. Disabled capabilities are named as literal-false structural fields
 * (`containsLiveCall: false`, `writeCapable: false`, `live: false`) — governance
 * scans target EXECUTION patterns, not these fields.
 */

// ── Categories ──────────────────────────────────────────────────────────────
export type IntegrationCategory =
  | 'aml_kyc'
  | 'sanctions_screening'
  | 'credit_bureau'
  | 'credit_scoring'
  | 'core_banking'
  | 'servicing_system'
  | 'payment_system'
  | 'document_provider'
  | 'e_signature'
  | 'collateral_verification'
  | 'insurance_verification'
  | 'appraisal'
  | 'environmental'
  | 'title'
  | 'flood'
  | 'ucc'
  | 'tax_transcript'
  | 'fraud_identity'
  | 'accounting'
  | 'reporting_analytics';

export const INTEGRATION_CATEGORIES: readonly IntegrationCategory[] = Object.freeze([
  'aml_kyc', 'sanctions_screening', 'credit_bureau', 'credit_scoring', 'core_banking',
  'servicing_system', 'payment_system', 'document_provider', 'e_signature',
  'collateral_verification', 'insurance_verification', 'appraisal', 'environmental',
  'title', 'flood', 'ucc', 'tax_transcript', 'fraud_identity', 'accounting', 'reporting_analytics',
]);

// ── Provider keys (allowlist) ───────────────────────────────────────────────
export type IntegrationProviderKey =
  | 'aml_kyc_provider'
  | 'sanctions_screening_provider'
  | 'credit_bureau_provider'
  | 'credit_scoring_provider'
  | 'core_banking_provider'
  | 'servicing_system_provider'
  | 'payment_system_provider'
  | 'document_provider'
  | 'e_signature_provider'
  | 'collateral_verification_provider'
  | 'insurance_verification_provider'
  | 'appraisal_provider'
  | 'environmental_provider'
  | 'title_provider'
  | 'flood_provider'
  | 'ucc_provider'
  | 'tax_transcript_provider'
  | 'fraud_identity_provider'
  | 'accounting_provider'
  | 'reporting_analytics_provider';

// ── Adapter modes ───────────────────────────────────────────────────────────
export type IntegrationAdapterMode =
  | 'disabled'
  | 'mock_disabled'
  | 'dry_run'
  | 'live_read_only'
  | 'live_write_disabled'
  | 'live_write_enabled_future';

/** No adapter may default to anything other than `disabled`. */
export const DEFAULT_INTEGRATION_ADAPTER_MODE: IntegrationAdapterMode = 'disabled';

export const INTEGRATION_ADAPTER_MODES: readonly IntegrationAdapterMode[] = Object.freeze([
  'disabled', 'mock_disabled', 'dry_run', 'live_read_only', 'live_write_disabled', 'live_write_enabled_future',
]);

// ── Risk classes ────────────────────────────────────────────────────────────
export type IntegrationRiskClass =
  | 'low_metadata_only'
  | 'medium_read_only_external'
  | 'high_pii_external'
  | 'high_credit_report_external'
  | 'high_core_banking_write'
  | 'prohibited_without_policy';

// ── Data sensitivity ────────────────────────────────────────────────────────
export type IntegrationDataSensitivity =
  | 'public_metadata'
  | 'internal_bank_data'
  | 'borrower_pii'
  | 'business_financials'
  | 'credit_report_data'
  | 'tax_data'
  | 'account_balance_data'
  | 'payment_data'
  | 'collateral_data'
  | 'insurance_data';

/** Sensitivities that must never leave the platform in this phase. */
export const EXTERNAL_RESTRICTED_SENSITIVITIES: readonly IntegrationDataSensitivity[] = Object.freeze([
  'borrower_pii', 'credit_report_data', 'tax_data', 'account_balance_data', 'payment_data',
]);

// ── Capabilities ────────────────────────────────────────────────────────────
export type IntegrationCapability =
  | 'screen_business'
  | 'screen_person'
  | 'retrieve_screening_status'
  | 'attach_screening_evidence'
  | 'screen_against_sanctions'
  | 'retrieve_watchlist_result'
  | 'request_business_credit_report'
  | 'request_consumer_credit_report'
  | 'retrieve_credit_report_summary'
  | 'score_deal'
  | 'score_borrower'
  | 'retrieve_score_explanation'
  | 'lookup_customer'
  | 'lookup_account'
  | 'lookup_balance'
  | 'lookup_loan_account'
  | 'retrieve_payment_history'
  | 'lookup_servicing_status'
  | 'lookup_maturity'
  | 'lookup_ticklers'
  | 'payment_status_lookup'
  | 'retrieve_document_metadata'
  | 'retrieve_document_status'
  | 'prepare_signature_package_preview'
  | 'retrieve_signature_status'
  | 'retrieve_collateral_status'
  | 'retrieve_insurance_status'
  | 'retrieve_appraisal_status'
  | 'retrieve_environmental_status'
  | 'retrieve_title_status'
  | 'retrieve_flood_status'
  | 'retrieve_ucc_status'
  | 'retrieve_tax_transcript_status'
  | 'retrieve_identity_verification_status'
  | 'retrieve_accounting_sync_status'
  | 'retrieve_reporting_status';

export interface IntegrationCapabilityDefinition {
  capability: IntegrationCapability;
  label: string;
  dataSensitivity: IntegrationDataSensitivity;
  /** Whether this capability would transmit data to an external provider in a future, policy-gated mode. */
  externalTransmission: boolean;
  /** Pinned false in this phase — no capability may write to an external system. */
  writeCapable: false;
}

// ── Permission / approval requirements ──────────────────────────────────────
export interface IntegrationPermissionRequirement {
  permissionKey: string;
  label: string;
}

export interface IntegrationHumanApprovalRequirement {
  required: boolean;
  approvalKey?: string;
  label: string;
}

// ── Provider definition ─────────────────────────────────────────────────────
export interface IntegrationAdapterAuditSummary {
  providerKey: IntegrationProviderKey;
  category: IntegrationCategory;
  mode: IntegrationAdapterMode;
  capabilityCount: number;
  containsLiveCall: false;
  containsPiiTransmission: false;
  containsCreditPull: false;
  containsWrite: false;
  readOnly: true;
}

export interface IntegrationAdapterDefinition {
  providerKey: IntegrationProviderKey;
  displayName: string;
  category: IntegrationCategory;
  /** Always `disabled` in this phase. */
  mode: IntegrationAdapterMode;
  riskClass: IntegrationRiskClass;
  dataSensitivities: readonly IntegrationDataSensitivity[];
  capabilities: readonly IntegrationCapabilityDefinition[];
  permissionRequirements: readonly IntegrationPermissionRequirement[];
  humanApproval: IntegrationHumanApprovalRequirement;
  requiresPermissiblePurpose: boolean;
  /** Pinned false — scoring/lookup providers never produce a final credit decision. */
  canProduceCreditDecision: false;
  caveats: readonly string[];
  auditSummary: IntegrationAdapterAuditSummary;
}

// ── Findings ────────────────────────────────────────────────────────────────
export interface IntegrationAdapterBlocker {
  code: IntegrationErrorCode;
  message: string;
}

export interface IntegrationAdapterWarning {
  code: string;
  message: string;
}

export interface IntegrationAdapterNextAction {
  code: string;
  label: string;
}

// ── Error codes ─────────────────────────────────────────────────────────────
export type IntegrationErrorCode =
  | 'integration_disabled'
  | 'integration_not_configured'
  | 'integration_human_approval_required'
  | 'integration_permission_denied'
  | 'integration_policy_blocked'
  | 'integration_pii_blocked'
  | 'integration_permissible_purpose_required'
  | 'integration_external_transport_missing'
  | 'integration_live_calls_disabled'
  | 'integration_unsupported_capability'
  | 'integration_write_forbidden'
  | 'integration_credit_decision_forbidden';

export const INTEGRATION_ERROR_CODES: readonly IntegrationErrorCode[] = Object.freeze([
  'integration_disabled', 'integration_not_configured', 'integration_human_approval_required',
  'integration_permission_denied', 'integration_policy_blocked', 'integration_pii_blocked',
  'integration_permissible_purpose_required', 'integration_external_transport_missing',
  'integration_live_calls_disabled', 'integration_unsupported_capability',
  'integration_write_forbidden', 'integration_credit_decision_forbidden',
]);

// ── Status / health / readiness ─────────────────────────────────────────────
export type IntegrationAdapterStatusValue =
  | 'disabled'
  | 'not_configured'
  | 'configured_blocked'
  | 'available_read_only';

export interface IntegrationAdapterStatus {
  providerKey: IntegrationProviderKey;
  category: IntegrationCategory;
  mode: IntegrationAdapterMode;
  status: IntegrationAdapterStatusValue;
  enabled: boolean;
  /** Pinned false — no live external transport is active in this phase. */
  live: false;
  message: string;
}

export type IntegrationAdapterHealthValue =
  | 'disabled_not_configured'
  | 'configured_blocked'
  | 'degraded'
  | 'healthy_read_only';

export interface IntegrationAdapterHealth {
  providerKey: IntegrationProviderKey;
  status: IntegrationAdapterHealthValue;
  blockers: readonly IntegrationAdapterBlocker[];
  warnings: readonly IntegrationAdapterWarning[];
}

export type IntegrationAdapterReadinessValue =
  | 'disabled_not_configured'
  | 'blocked_permission'
  | 'blocked_human_approval'
  | 'blocked_policy'
  | 'blocked_permissible_purpose'
  | 'blocked_pii'
  | 'blocked_transport'
  | 'blocked_live_calls_disabled'
  | 'blocked_unsupported_capability'
  | 'ready_read_only_future';

export interface IntegrationAdapterReadiness {
  providerKey: IntegrationProviderKey;
  category: IntegrationCategory;
  status: IntegrationAdapterReadinessValue;
  allowed: boolean;
  blockers: readonly IntegrationAdapterBlocker[];
  warnings: readonly IntegrationAdapterWarning[];
  nextBestAction: IntegrationAdapterNextAction;
}

// ── Request / result ────────────────────────────────────────────────────────
export interface IntegrationAdapterRequest {
  providerKey: IntegrationProviderKey;
  capability: IntegrationCapability;
  /** Opaque internal reference (deal/loan id) — never raw PII. */
  subjectRef?: string;
  /** Stated business purpose (e.g. permissible-purpose label) — never PII. */
  purpose?: string;
}

export interface IntegrationAdapterResult {
  providerKey: IntegrationProviderKey;
  capability: IntegrationCapability;
  /** Disabled adapters never execute; the outcome is a block or a safe preview. */
  outcome: 'blocked' | 'preview_only';
  allowed: false;
  errorCode?: IntegrationErrorCode;
  blockers: readonly IntegrationAdapterBlocker[];
  warnings: readonly IntegrationAdapterWarning[];
  /** Safe, redacted preview of what a future request would carry (no PII). */
  safeRequestSummary?: IntegrationSafeRequestSummary;
  auditSummary: IntegrationResultAuditSummary;
  readOnly: true;
}

export interface IntegrationSafeRequestSummary {
  providerKey: IntegrationProviderKey;
  capability: IntegrationCapability;
  dataSensitivity?: IntegrationDataSensitivity;
  subjectRefPresent: boolean;
  purposePresent: boolean;
  /** Pinned false — the preview never carries PII. */
  containsPii: false;
}

export interface IntegrationResultAuditSummary {
  providerKey: IntegrationProviderKey;
  capability: IntegrationCapability;
  outcome: 'blocked' | 'preview_only';
  containsLiveCall: false;
  containsPiiTransmission: false;
  containsCreditPull: false;
  containsWrite: false;
  readOnly: true;
}

// ── Permission / policy / approval context ──────────────────────────────────
export interface IntegrationPermissionContext {
  grantedPermissions?: readonly string[];
  workspace?: string;
}

export interface IntegrationHumanApprovalState {
  approvals?: readonly string[];
}

export interface IntegrationPolicyState {
  /** Future policy flags — all default off in this phase. */
  externalCallsAllowed?: boolean;
  piiTransmissionAllowed?: boolean;
  creditReportDataAllowed?: boolean;
  permissiblePurposes?: readonly string[];
}
