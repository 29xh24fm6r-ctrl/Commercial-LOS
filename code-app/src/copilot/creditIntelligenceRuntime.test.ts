import { describe, expect, it, vi } from 'vitest';

vi.mock('./creditIntelligencePowerAppsClient', () => ({
  createPowerAppsCreditIntelligenceClient: () => ({ executeCustomApi: vi.fn() }),
}));

import { createDealCreditIntelligenceRuntime, DEAL_CREDIT_INTELLIGENCE_TOOLS } from './creditIntelligenceRuntime';

describe('deal credit intelligence runtime', () => {
  it('remains unavailable without an explicitly configured institution', () => {
    expect(createDealCreditIntelligenceRuntime({ dealId: 'deal-1', partyIds: [] })).toBeUndefined();
  });

  it('exposes only the deal-safe tool set when configured', () => {
    const runtime = createDealCreditIntelligenceRuntime({ dealId: 'deal-1', partyIds: ['party-1'], bankId: 'bank-1' });
    expect(runtime?.enabledTools).toEqual(DEAL_CREDIT_INTELLIGENCE_TOOLS);
    expect(runtime?.enabledTools).not.toContain('policy_intelligence');
    expect(runtime?.enabledTools).not.toContain('explain_governance_route');
  });
});
