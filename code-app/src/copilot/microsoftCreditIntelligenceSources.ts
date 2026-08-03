import type {
  CreditIntelligenceRequest,
  CreditIntelligenceSourcePort,
  CreditSourceArtifact,
} from './creditIntelligence';
import { resolveEnabledCreditIntelligenceSources } from './creditIntelligenceSourceRegistry';

export interface MicrosoftCreditSourceConnector {
  readonly sourceId: string;
  /**
   * Implemented server-side using Dataverse, SharePoint/Graph, Azure AI
   * Search, Document Intelligence, or an approved external service client.
   */
  retrieve(request: CreditIntelligenceRequest): Promise<readonly CreditSourceArtifact[]>;
}

export interface MicrosoftCreditIntelligenceSourceOptions {
  readonly connectors: readonly MicrosoftCreditSourceConnector[];
  readonly explicitlyEnabledSourceIds: readonly string[];
}

/**
 * Composes Microsoft and approved external connectors behind the single
 * governed source port. Unknown, duplicate, disabled, or wrong-purpose
 * connectors fail before any connector invocation.
 */
export function createMicrosoftCreditIntelligenceSourcePort(
  options: MicrosoftCreditIntelligenceSourceOptions,
): CreditIntelligenceSourcePort {
  const connectors = new Map<string, MicrosoftCreditSourceConnector>();
  const duplicateIds = new Set<string>();
  for (const connector of options.connectors) {
    if (connectors.has(connector.sourceId)) duplicateIds.add(connector.sourceId);
    connectors.set(connector.sourceId, connector);
  }
  return {
    async retrieve(request) {
      if (duplicateIds.size) throw new Error('Duplicate source connector registration.');
      const resolution = resolveEnabledCreditIntelligenceSources(
        request.scope.authorizedSourceIds,
        options.explicitlyEnabledSourceIds,
        request.tool,
      );
      if (resolution.errors.length) throw new Error('An intelligence source is not enabled for this purpose.');
      const selected = resolution.sources.map((source) => connectors.get(source.sourceId));
      if (selected.some((connector) => !connector)) throw new Error('An enabled source connector is unavailable.');
      const results = await Promise.all(selected.map((connector) => connector!.retrieve(request)));
      return results.flat();
    },
  };
}

export const MICROSOFT_CREDIT_CONNECTOR_RESPONSIBILITIES = {
  'dataverse-los': 'Dataverse Web API/service context with row-level authorization and concurrency tokens.',
  'sharepoint-approved-credit-content': 'Microsoft Graph/SharePoint search with signed-in ACL trimming and sensitivity labels.',
  'microsoft-graph-relationship-content': 'Microsoft Graph Outlook, Teams, calendar, and meeting retrieval with least-privilege scopes.',
  'azure-document-intelligence': 'Azure Document Intelligence extraction retaining page, polygon, model id/version, confidence, and document hash.',
  'azure-ai-search-credit-evidence': 'Azure AI Search retrieval with bank, deal, party, and user security filters plus citations.',
  'approved-government-business-records': 'Allowlisted government API clients with entity-match evidence and retrieval timestamps.',
  'licensed-commercial-risk-data': 'Contract-approved commercial company/adverse-news APIs with permissible-purpose enforcement.',
} as const;
