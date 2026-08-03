import type { CreditIntelligenceSourceKind, CreditIntelligenceTool } from './creditIntelligence';

export interface CreditIntelligenceSourceDefinition {
  readonly sourceId: string;
  readonly label: string;
  readonly kind: CreditIntelligenceSourceKind;
  readonly tools: readonly CreditIntelligenceTool[];
  readonly permissionModel: 'dataverse_row_security' | 'microsoft_graph_acl' | 'service_authorization';
  readonly dataUse: 'internal' | 'public_business_record' | 'licensed_business_data';
  readonly requiresTenantConfiguration: boolean;
  readonly enabledByDefault: boolean;
  readonly maximumAgeHours?: number;
}

/**
 * Closed registry. A connector is unusable until its id is present here and
 * it is explicitly enabled in the server environment. No arbitrary-web tool
 * or open-ended person search is included.
 */
export const CREDIT_INTELLIGENCE_SOURCE_REGISTRY: readonly CreditIntelligenceSourceDefinition[] = [
  {
    sourceId: 'dataverse-los',
    label: 'Authorized LOS and CRM records',
    kind: 'dataverse',
    tools: ['research_party', 'build_credit_evidence_packet', 'explain_governance_route', 'relationship_intelligence', 'portfolio_monitoring', 'policy_intelligence'],
    permissionModel: 'dataverse_row_security',
    dataUse: 'internal',
    requiresTenantConfiguration: false,
    enabledByDefault: true,
    maximumAgeHours: 1,
  },
  {
    sourceId: 'sharepoint-approved-credit-content',
    label: 'Approved policies, procedures, templates, and loan documents',
    kind: 'sharepoint',
    tools: ['build_credit_evidence_packet', 'relationship_intelligence', 'policy_intelligence'],
    permissionModel: 'microsoft_graph_acl',
    dataUse: 'internal',
    requiresTenantConfiguration: true,
    enabledByDefault: false,
    maximumAgeHours: 24,
  },
  {
    sourceId: 'microsoft-graph-relationship-content',
    label: 'Permission-scoped Outlook, Teams, and meeting content',
    kind: 'microsoft_graph',
    tools: ['relationship_intelligence'],
    permissionModel: 'microsoft_graph_acl',
    dataUse: 'internal',
    requiresTenantConfiguration: true,
    enabledByDefault: false,
    maximumAgeHours: 1,
  },
  {
    sourceId: 'azure-document-intelligence',
    label: 'Page-level loan document extraction',
    kind: 'document_intelligence',
    tools: ['build_credit_evidence_packet'],
    permissionModel: 'service_authorization',
    dataUse: 'internal',
    requiresTenantConfiguration: true,
    enabledByDefault: false,
  },
  {
    sourceId: 'azure-ai-search-credit-evidence',
    label: 'Permission-filtered credit evidence index',
    kind: 'azure_ai_search',
    tools: ['research_party', 'build_credit_evidence_packet', 'relationship_intelligence', 'portfolio_monitoring', 'policy_intelligence'],
    permissionModel: 'service_authorization',
    dataUse: 'internal',
    requiresTenantConfiguration: true,
    enabledByDefault: false,
    maximumAgeHours: 24,
  },
  {
    sourceId: 'approved-government-business-records',
    label: 'Approved government business, registration, sanctions, and program sources',
    kind: 'government_api',
    tools: ['research_party', 'portfolio_monitoring'],
    permissionModel: 'service_authorization',
    dataUse: 'public_business_record',
    requiresTenantConfiguration: true,
    enabledByDefault: false,
    maximumAgeHours: 24,
  },
  {
    sourceId: 'licensed-commercial-risk-data',
    label: 'Contractually approved commercial risk and adverse-news sources',
    kind: 'licensed_external_api',
    tools: ['research_party', 'portfolio_monitoring'],
    permissionModel: 'service_authorization',
    dataUse: 'licensed_business_data',
    requiresTenantConfiguration: true,
    enabledByDefault: false,
    maximumAgeHours: 24,
  },
];

export function resolveEnabledCreditIntelligenceSources(
  requestedIds: readonly string[],
  explicitlyEnabledIds: readonly string[],
  tool: CreditIntelligenceTool,
): { sources: readonly CreditIntelligenceSourceDefinition[]; errors: readonly string[] } {
  const registry = new Map(CREDIT_INTELLIGENCE_SOURCE_REGISTRY.map((source) => [source.sourceId, source]));
  const enabled = new Set(explicitlyEnabledIds);
  const sources: CreditIntelligenceSourceDefinition[] = [];
  const errors: string[] = [];
  for (const id of requestedIds) {
    const source = registry.get(id);
    if (!source) {
      errors.push(`Unknown intelligence source ${id}.`);
      continue;
    }
    if (!source.enabledByDefault && !enabled.has(id)) {
      errors.push(`Intelligence source ${id} is not explicitly enabled.`);
      continue;
    }
    if (!source.tools.includes(tool)) {
      errors.push(`Intelligence source ${id} is not approved for ${tool}.`);
      continue;
    }
    sources.push(source);
  }
  return { sources, errors };
}
