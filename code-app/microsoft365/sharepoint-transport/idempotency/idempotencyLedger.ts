import type { SharePointTransportOperation } from '../contract/types.js';

export interface IdempotencyKey {
  readonly contractVersion: string;
  readonly operation: SharePointTransportOperation;
  readonly dealId: string;
  readonly correlationId: string;
}

export type IdempotencyBeginResult<T> =
  | { readonly state: 'new' }
  | { readonly state: 'replay'; readonly result: T }
  | { readonly state: 'collision' }
  | { readonly state: 'in_progress' };

export interface IdempotencyLedger {
  begin<T>(key: IdempotencyKey, payloadHash: string): Promise<IdempotencyBeginResult<T>>;
  complete<T>(key: IdempotencyKey, payloadHash: string, result: T): Promise<void>;
  abandon(key: IdempotencyKey, payloadHash: string): Promise<void>;
}

interface Entry { payloadHash: string; state: 'pending' | 'complete'; result?: unknown }
const keyOf = (key: IdempotencyKey) => `${key.contractVersion}|${key.operation}|${key.dealId}|${key.correlationId}`;
const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryIdempotencyLedger implements IdempotencyLedger {
  private readonly entries = new Map<string, Entry>();

  async begin<T>(key: IdempotencyKey, payloadHash: string): Promise<IdempotencyBeginResult<T>> {
    const id = keyOf(key);
    const entry = this.entries.get(id);
    if (!entry) { this.entries.set(id, { payloadHash, state: 'pending' }); return { state: 'new' }; }
    if (entry.payloadHash !== payloadHash) return { state: 'collision' };
    if (entry.state === 'pending') return { state: 'in_progress' };
    return { state: 'replay', result: clone(entry.result as T) };
  }

  async complete<T>(key: IdempotencyKey, payloadHash: string, result: T): Promise<void> {
    const id = keyOf(key);
    const entry = this.entries.get(id);
    if (!entry || entry.payloadHash !== payloadHash || entry.state !== 'pending') throw new Error('IDEMPOTENCY_COMPLETION_INVALID');
    this.entries.set(id, { payloadHash, state: 'complete', result: clone(result) });
  }

  async abandon(key: IdempotencyKey, payloadHash: string): Promise<void> {
    const id = keyOf(key);
    const entry = this.entries.get(id);
    if (entry?.state === 'pending' && entry.payloadHash === payloadHash) this.entries.delete(id);
  }
}
