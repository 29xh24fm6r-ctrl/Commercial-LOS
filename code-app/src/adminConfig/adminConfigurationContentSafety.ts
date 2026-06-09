/**
 * Phase 142G — Admin configuration content safety + classification helpers.
 *
 * PURE. Detects unsafe payloads (executable code, SQL/OData, secrets/tokens,
 * PII/SSN/TIN/account numbers) in proposal text, redacts them, and maps proposal
 * types to their governed scope and risk class. No execution, no eval, no write.
 */

import type {
  AdminConfigurationProposalRisk,
  AdminConfigurationProposalScope,
  AdminConfigurationProposalType,
} from './adminConfigurationTypes';

export interface UnsafeContentScan {
  executable: boolean;
  sqlOrQuery: boolean;
  secret: boolean;
  pii: boolean;
  unsafe: boolean;
  reasons: readonly string[];
}

const EXECUTABLE_RX = /\bfunction\s*\(|=>|\beval\s*\(|new\s+Function\b|\brequire\s*\(|\bimport\s*\(/;
const SQL_RX = /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\b/i;
const ODATA_RX = /\$(filter|select|expand|orderby)=/i;
const SECRET_RX = /\b(api[_-]?key|apikey|client[_-]?secret|bearer\s+[a-z0-9]{8,}|access[_-]?token\s*[:=]|password\s*[:=])/i;
const SSN_RX = /\b\d{3}-\d{2}-\d{4}\b/;
const TIN_RX = /\b\d{2}-\d{7}\b/;
const ACCOUNT_RX = /\baccount\s*(?:number|no|#)\s*[:=]?\s*\d{6,}\b/i;
const EMAIL_RX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export function scanUnsafeContent(...texts: ReadonlyArray<string | undefined>): UnsafeContentScan {
  const joined = texts.filter((t): t is string => typeof t === 'string').join('\n');
  const reasons: string[] = [];
  const executable = EXECUTABLE_RX.test(joined);
  if (executable) reasons.push('executable_code');
  const sqlOrQuery = SQL_RX.test(joined) || ODATA_RX.test(joined);
  if (sqlOrQuery) reasons.push('sql_or_query_string');
  const secret = SECRET_RX.test(joined);
  if (secret) reasons.push('secret_or_token');
  const pii = SSN_RX.test(joined) || TIN_RX.test(joined) || ACCOUNT_RX.test(joined) || EMAIL_RX.test(joined);
  if (pii) reasons.push('pii_or_identifier');
  return { executable, sqlOrQuery, secret, pii, unsafe: reasons.length > 0, reasons };
}

const REDACTION = '[redacted unsafe content]';

export function redactIfUnsafe(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return scanUnsafeContent(text).unsafe ? REDACTION : text;
}

const SCOPE_BY_TYPE: Record<AdminConfigurationProposalType, AdminConfigurationProposalScope> = {
  platform_object_change: 'platform_metadata',
  platform_view_change: 'platform_metadata',
  workflow_route_change: 'workflow_routing',
  workflow_rule_change: 'workflow_routing',
  product_process_template_change: 'product_process_template',
  servicing_lifecycle_rule_change: 'servicing_lifecycle',
  integration_provider_change: 'integration_registry',
  integration_mode_change: 'integration_registry',
  delivery_adapter_change: 'integration_registry',
  annual_review_package_policy_change: 'product_process_template',
  permission_policy_change: 'permission_policy',
  dataverse_schema_change: 'schema',
  custom_field_change: 'schema',
  route_registration_change: 'route_registration',
};

const RISK_BY_TYPE: Record<AdminConfigurationProposalType, AdminConfigurationProposalRisk> = {
  platform_object_change: 'low_metadata_review',
  platform_view_change: 'low_metadata_review',
  workflow_route_change: 'medium_workflow_guidance',
  workflow_rule_change: 'medium_workflow_guidance',
  product_process_template_change: 'medium_workflow_guidance',
  servicing_lifecycle_rule_change: 'medium_workflow_guidance',
  annual_review_package_policy_change: 'medium_workflow_guidance',
  integration_provider_change: 'high_external_integration_risk',
  integration_mode_change: 'high_external_integration_risk',
  delivery_adapter_change: 'high_external_integration_risk',
  permission_policy_change: 'high_permission_risk',
  dataverse_schema_change: 'high_schema_mutation_risk',
  custom_field_change: 'high_schema_mutation_risk',
  route_registration_change: 'high_runtime_write_risk',
};

export function scopeForProposalType(type: AdminConfigurationProposalType): AdminConfigurationProposalScope {
  return SCOPE_BY_TYPE[type];
}

export function riskClassForProposalType(type: AdminConfigurationProposalType): AdminConfigurationProposalRisk {
  return RISK_BY_TYPE[type];
}

export function requiredReviewerRolesForRisk(risk: AdminConfigurationProposalRisk): readonly string[] {
  switch (risk) {
    case 'low_metadata_review':
      return ['manager'];
    case 'medium_workflow_guidance':
      return ['manager', 'admin'];
    default:
      return ['admin', 'risk'];
  }
}
