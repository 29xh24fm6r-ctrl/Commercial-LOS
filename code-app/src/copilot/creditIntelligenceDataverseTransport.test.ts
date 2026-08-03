import { describe, expect, it, vi } from 'vitest';
import { createCreditIntelligenceDataverseTransport } from './creditIntelligenceDataverseTransport';

const command = {
  correlationId: 'corr', requestedAt: '2026-07-31T00:00:00Z', authenticatedSystemUserId: 'must-not-cross-browser-boundary',
  tool: 'research_party' as const, bankId: 'ogb', dealId: 'd1', partyIds: ['p1'], requestedSourceIds: ['dataverse-los'],
};

describe('credit intelligence Dataverse transport', () => {
  it('uses the named Custom API without forwarding a client-asserted actor identity', async () => {
    const executeCustomApi = vi.fn(async () => ({ status: 'complete', correlationId: 'corr', tool: 'research_party', facts: [], evidence: [], contradictions: [], proposals: [], warnings: [], evaluationHash: 'sha256:x', auditEventIds: ['a1', 'a2'] }));
    const result = await createCreditIntelligenceDataverseTransport({ executeCustomApi }).invoke(command);
    expect(result.status).toBe('complete');
    expect(executeCustomApi).toHaveBeenCalledWith('cr664_RunCreditIntelligence', expect.not.objectContaining({ authenticatedSystemUserId: expect.anything() }));
  });

  it('fails closed on a mismatched or malformed response', async () => {
    const transport = createCreditIntelligenceDataverseTransport({ executeCustomApi: async () => ({ status: 'complete', correlationId: 'different' }) });
    await expect(transport.invoke(command)).resolves.toMatchObject({ status: 'blocked', code: 'UNSAFE_OUTPUT' });
  });

  it('does not leak transport exceptions', async () => {
    const transport = createCreditIntelligenceDataverseTransport({ executeCustomApi: async () => { throw new Error('secret server detail'); } });
    const result = await transport.invoke(command);
    expect(result).toMatchObject({ status: 'blocked', code: 'SOURCE_UNAVAILABLE' });
    if (result.status === 'blocked') expect(result.safeMessage).not.toContain('secret server detail');
  });
});
