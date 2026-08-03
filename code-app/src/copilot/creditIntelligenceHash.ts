import type { CreditIntelligenceHashPort } from './creditIntelligence';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

export function canonicalCreditIntelligenceJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function createSha256CreditIntelligenceHashPort(
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): CreditIntelligenceHashPort {
  return {
    async hashCanonical(value: unknown): Promise<string> {
      const bytes = new TextEncoder().encode(canonicalCreditIntelligenceJson(value));
      const digest = await subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
    },
  };
}

/** Stable idempotency key for retries of the same authenticated request. */
export async function creditIntelligenceCorrelationHash(
  hash: CreditIntelligenceHashPort,
  input: { actorSystemUserId: string; tool: string; dealId?: string; requestedAt: string; question?: string },
): Promise<string> {
  return hash.hashCanonical(input);
}
