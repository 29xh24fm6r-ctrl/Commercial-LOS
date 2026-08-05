import { describe, expect, it } from 'vitest';
import { EntraClaimsActorResolver } from '../authorization/actorResolver.js';
import { InMemoryIdempotencyLedger } from '../idempotency/idempotencyLedger.js';

describe('server-side actor resolution', () => {
  it('normalizes immutable claims through an enabled system-user lookup', async () => {
    const resolver = new EntraClaimsActorResolver({ findEnabledByEntraObjectId: async (id) => id === 'object-1' ? { systemUserId: 'system-user-1', upn: 'banker@oldglorybank.com' } : undefined }, '11111111-1111-4111-8111-111111111111');
    const actor = await resolver.resolve({ claims: { tid: '11111111-1111-4111-8111-111111111111', oid: 'object-1' } });
    expect(actor).toMatchObject({ objectId: 'object-1', systemUserId: 'system-user-1' });
    expect(actor.identityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    [{ claims: {} }, 'missing claims'],
    [{ claims: { tid: '22222222-2222-4222-8222-222222222222', oid: 'object-1' } }, 'wrong tenant'],
    [{ claims: { tid: '11111111-1111-4111-8111-111111111111', oid: 'missing' } }, 'missing user'],
  ])('fails closed for %s', async (context, label) => {
    expect(label).toBeTruthy();
    const resolver = new EntraClaimsActorResolver({ findEnabledByEntraObjectId: async () => undefined }, '11111111-1111-4111-8111-111111111111');
    await expect(resolver.resolve(context)).rejects.toThrow('ACTOR_RESOLUTION_FAILED');
  });
});

describe('idempotency ledger invariants', () => {
  const key = { contractVersion: 'ogb-deal-sharepoint/v1', operation: 'upload' as const, dealId: 'deal-1', correlationId: 'corr-1' };
  it('does not overwrite pending or completed entries', async () => {
    const ledger = new InMemoryIdempotencyLedger();
    expect(await ledger.begin(key, 'payload-a')).toEqual({ state: 'new' });
    expect(await ledger.begin(key, 'payload-a')).toEqual({ state: 'in_progress' });
    expect(await ledger.begin(key, 'payload-b')).toEqual({ state: 'collision' });
    await ledger.complete(key, 'payload-a', { itemId: 'file-1' });
    expect(await ledger.begin(key, 'payload-a')).toEqual({ state: 'replay', result: { itemId: 'file-1' } });
    expect(await ledger.begin(key, 'payload-b')).toEqual({ state: 'collision' });
  });
});
