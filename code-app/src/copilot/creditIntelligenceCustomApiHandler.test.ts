import { describe, expect, it, vi } from 'vitest';
import { runCreditIntelligenceCustomApi, type CreditIntelligenceCustomApiCommand, type CreditIntelligenceCustomApiDependencies } from './creditIntelligenceCustomApiHandler';

const command: CreditIntelligenceCustomApiCommand = {
  correlationId: 'corr', requestedAt: '2026-07-31T00:00:00Z', authenticatedSystemUserId: 'system-user',
  tool: 'research_party', bankId: 'ogb', dealId: 'deal-1', partyIds: ['party-1'], requestedSourceIds: ['dataverse-los'],
};

function dependencies(): CreditIntelligenceCustomApiDependencies {
  let audit = 0;
  return {
    identity: { resolveAuthenticatedActor: async () => ({ kind: 'resolved' as const, actor: { systemUserId: 'system-user', upn: 'user@bank.com', permissions: ['copilot.research_party'] } }) },
    scope: { resolveAuthorizedScope: async () => ({ kind: 'resolved' as const, scope: { bankId: 'ogb', dealId: 'deal-1', partyIds: ['party-1'], authorizedRecordIds: ['deal-1'], authorizedSourceIds: ['dataverse-los'], purpose: 'commercial_credit_underwriting' as const } }) },
    intelligence: {
      authorization: { authorize: async () => ({ allowed: true }) },
      sources: { retrieve: async () => [] },
      audit: { append: async () => ({ kind: 'appended' as const, eventId: `a-${++audit}` }) },
      hash: { hashCanonical: async () => 'sha256:run' },
    },
  };
}

describe('credit intelligence Dataverse Custom API handler', () => {
  it('resolves actor and authorized scope on the server before retrieval', async () => {
    const deps = dependencies();
    const identity = vi.spyOn(deps.identity, 'resolveAuthenticatedActor');
    const scope = vi.spyOn(deps.scope, 'resolveAuthorizedScope');
    const result = await runCreditIntelligenceCustomApi(command, deps);
    expect(result.status).toBe('complete');
    expect(identity).toHaveBeenCalledWith('system-user');
    expect(scope).toHaveBeenCalledWith(expect.objectContaining({ dealId: 'deal-1', requestedSourceIds: ['dataverse-los'] }));
  });

  it('rejects duplicate identity chains before resolving data scope', async () => {
    const deps = dependencies();
    deps.identity.resolveAuthenticatedActor = async () => ({ kind: 'duplicate', userIds: ['a', 'b'] });
    const scope = vi.spyOn(deps.scope, 'resolveAuthorizedScope');
    const result = await runCreditIntelligenceCustomApi(command, deps);
    expect(result).toMatchObject({ status: 'blocked', code: 'UNAUTHORIZED' });
    expect(scope).not.toHaveBeenCalled();
  });

  it('does not trust requested source ids when the server denies scope', async () => {
    const deps = dependencies();
    deps.scope.resolveAuthorizedScope = async () => ({ kind: 'denied', safeReason: 'source not approved' });
    const retrieve = vi.spyOn(deps.intelligence.sources, 'retrieve');
    const result = await runCreditIntelligenceCustomApi({ ...command, requestedSourceIds: ['arbitrary-web'] }, deps);
    expect(result).toMatchObject({ status: 'blocked', code: 'UNAUTHORIZED' });
    expect(retrieve).not.toHaveBeenCalled();
  });
});
