import { describe, expect, it } from 'vitest';
import { canonicalCreditIntelligenceJson, createSha256CreditIntelligenceHashPort, creditIntelligenceCorrelationHash } from './creditIntelligenceHash';

describe('credit intelligence immutable hashing', () => {
  it('canonicalizes object key order and omits undefined', () => {
    expect(canonicalCreditIntelligenceJson({ z: 1, a: { y: undefined, b: 2 } })).toBe('{"a":{"b":2},"z":1}');
  });

  it('produces the same SHA-256 for semantically identical evaluation inputs', async () => {
    const hash = createSha256CreditIntelligenceHashPort();
    await expect(hash.hashCanonical({ b: 2, a: 1 })).resolves.toBe(await hash.hashCanonical({ a: 1, b: 2 }));
  });

  it('binds idempotency to actor, tool, deal, time, and question', async () => {
    const hash = createSha256CreditIntelligenceHashPort();
    const base = { actorSystemUserId: 'u1', tool: 'research_party', dealId: 'd1', requestedAt: '2026-07-31T00:00:00Z', question: 'ownership' };
    const first = await creditIntelligenceCorrelationHash(hash, base);
    expect(first).toHaveLength(64);
    await expect(creditIntelligenceCorrelationHash(hash, { ...base, actorSystemUserId: 'u2' })).resolves.not.toBe(first);
  });
});
