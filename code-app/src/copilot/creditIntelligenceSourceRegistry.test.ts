import { describe, expect, it } from 'vitest';
import {
  CREDIT_INTELLIGENCE_SOURCE_REGISTRY,
  resolveEnabledCreditIntelligenceSources,
} from './creditIntelligenceSourceRegistry';

describe('credit intelligence source registry', () => {
  it('contains no arbitrary public web source and defaults only authorized Dataverse on', () => {
    expect(CREDIT_INTELLIGENCE_SOURCE_REGISTRY.some((source) => source.sourceId.includes('web-search'))).toBe(false);
    expect(CREDIT_INTELLIGENCE_SOURCE_REGISTRY.filter((source) => source.enabledByDefault).map((source) => source.sourceId)).toEqual(['dataverse-los']);
  });

  it('requires explicit enablement for Microsoft Graph and external sources', () => {
    const blocked = resolveEnabledCreditIntelligenceSources(
      ['microsoft-graph-relationship-content'],
      [],
      'relationship_intelligence',
    );
    expect(blocked.sources).toEqual([]);
    expect(blocked.errors[0]).toMatch(/not explicitly enabled/i);
    const allowed = resolveEnabledCreditIntelligenceSources(
      ['microsoft-graph-relationship-content'],
      ['microsoft-graph-relationship-content'],
      'relationship_intelligence',
    );
    expect(allowed.errors).toEqual([]);
    expect(allowed.sources).toHaveLength(1);
  });

  it('prevents a source from being used outside its approved tool purpose', () => {
    const result = resolveEnabledCreditIntelligenceSources(
      ['azure-document-intelligence'],
      ['azure-document-intelligence'],
      'research_party',
    );
    expect(result.errors[0]).toMatch(/not approved/i);
  });
});
