import { describe, expect, it, vi } from 'vitest';
import { CREDIT_INTELLIGENCE_CONTRACT_VERSION, type CreditIntelligenceRequest } from './creditIntelligence';
import { createMicrosoftCreditIntelligenceSourcePort, MICROSOFT_CREDIT_CONNECTOR_RESPONSIBILITIES } from './microsoftCreditIntelligenceSources';

function request(sourceIds: string[], tool: CreditIntelligenceRequest['tool'] = 'research_party'): CreditIntelligenceRequest {
  return {
    contractVersion: CREDIT_INTELLIGENCE_CONTRACT_VERSION, correlationId: 'c', requestedAt: '2026-07-31T00:00:00Z', tool,
    actor: { systemUserId: 'u', upn: 'u@bank.com', permissions: [] },
    scope: { bankId: 'b', partyIds: [], authorizedRecordIds: [], authorizedSourceIds: sourceIds, purpose: 'commercial_credit_underwriting' },
  };
}

describe('Microsoft credit intelligence source composition', () => {
  it('invokes only connectors authorized and enabled for the requested purpose', async () => {
    const dataverse = vi.fn(async () => []);
    const government = vi.fn(async () => []);
    const port = createMicrosoftCreditIntelligenceSourcePort({
      explicitlyEnabledSourceIds: ['approved-government-business-records'],
      connectors: [
        { sourceId: 'dataverse-los', retrieve: dataverse },
        { sourceId: 'approved-government-business-records', retrieve: government },
      ],
    });
    await port.retrieve(request(['dataverse-los', 'approved-government-business-records']));
    expect(dataverse).toHaveBeenCalledOnce();
    expect(government).toHaveBeenCalledOnce();
  });

  it('does not invoke a configured connector until explicitly enabled', async () => {
    const graph = vi.fn(async () => []);
    const port = createMicrosoftCreditIntelligenceSourcePort({
      explicitlyEnabledSourceIds: [],
      connectors: [{ sourceId: 'microsoft-graph-relationship-content', retrieve: graph }],
    });
    await expect(port.retrieve(request(['microsoft-graph-relationship-content'], 'relationship_intelligence'))).rejects.toThrow(/not enabled/i);
    expect(graph).not.toHaveBeenCalled();
  });

  it('fails on duplicate connector registration to prevent ambiguous data lineage', async () => {
    const connector = { sourceId: 'dataverse-los', retrieve: async () => [] };
    const port = createMicrosoftCreditIntelligenceSourcePort({ explicitlyEnabledSourceIds: [], connectors: [connector, connector] });
    await expect(port.retrieve(request(['dataverse-los']))).rejects.toThrow(/duplicate/i);
  });

  it('defines implementation duties for all seven approved source classes', () => {
    expect(Object.keys(MICROSOFT_CREDIT_CONNECTOR_RESPONSIBILITIES)).toHaveLength(7);
    expect(MICROSOFT_CREDIT_CONNECTOR_RESPONSIBILITIES['microsoft-graph-relationship-content']).toMatch(/least-privilege/i);
    expect(MICROSOFT_CREDIT_CONNECTOR_RESPONSIBILITIES['azure-document-intelligence']).toMatch(/model id\/version/i);
  });
});
