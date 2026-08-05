import type { IdempotencyBeginResult, IdempotencyKey, IdempotencyLedger } from '../idempotency/idempotencyLedger.js';
import type { OrphanCandidate, OrphanReconciliationLedger } from '../orphan-reconciliation/orphanLedger.js';

export interface DurableJsonStore {
  readonly storeId: string;
  healthCheck(): Promise<boolean>;
  createIfAbsent(partition: string, key: string, value: unknown): Promise<boolean>;
  read<T>(partition: string, key: string): Promise<T | undefined>;
  replace(partition: string, key: string, value: unknown, expectedVersion?: string): Promise<void>;
  delete(partition: string, key: string): Promise<void>;
}

const keyOf = (key: IdempotencyKey) => `${key.operation}|${key.dealId}|${key.correlationId}`;
interface DurableIdempotencyEntry<T> { readonly payloadHash: string; readonly state: 'pending' | 'complete'; readonly result?: T }

export class DurableIdempotencyLedger implements IdempotencyLedger {
  constructor(private readonly store: DurableJsonStore, private readonly partition = 'sharepoint-idempotency') {}
  async assertReady(): Promise<void> { if (!await this.store.healthCheck()) throw new Error('DURABLE_IDEMPOTENCY_UNAVAILABLE'); }
  async begin<T>(key: IdempotencyKey, payloadHash: string): Promise<IdempotencyBeginResult<T>> {
    const id = keyOf(key); const created = await this.store.createIfAbsent(this.partition, id, { payloadHash, state: 'pending' });
    if (created) return { state: 'new' };
    const entry = await this.store.read<DurableIdempotencyEntry<T>>(this.partition, id);
    if (!entry) throw new Error('DURABLE_IDEMPOTENCY_READ_FAILED');
    if (entry.payloadHash !== payloadHash) return { state: 'collision' };
    return entry.state === 'complete' ? { state: 'replay', result: structuredClone(entry.result as T) } : { state: 'in_progress' };
  }
  async complete<T>(key: IdempotencyKey, payloadHash: string, result: T): Promise<void> { await this.store.replace(this.partition, keyOf(key), { payloadHash, state: 'complete', result }); }
  async abandon(key: IdempotencyKey): Promise<void> { await this.store.delete(this.partition, keyOf(key)); }
}

export class DurableOrphanReconciliationLedger implements OrphanReconciliationLedger {
  constructor(private readonly store: DurableJsonStore, private readonly clock: () => Date = () => new Date(), private readonly partition = 'sharepoint-orphans') {}
  async assertReady(): Promise<void> { if (!await this.store.healthCheck()) throw new Error('DURABLE_ORPHAN_LEDGER_UNAVAILABLE'); }
  async record(candidate: Omit<OrphanCandidate, 'createdAt' | 'updatedAt' | 'status'>): Promise<OrphanCandidate> {
    const key = `${candidate.correlationId}|${candidate.dealId}|${candidate.documentId}`; const existing = await this.store.read<OrphanCandidate>(this.partition, key); const now = this.clock().toISOString();
    const value: OrphanCandidate = { ...candidate, requirementIds: [...candidate.requirementIds], createdAt: existing?.createdAt ?? now, updatedAt: now, status: existing?.status ?? 'UNRECONCILED' };
    if (existing) await this.store.replace(this.partition, key, value); else if (!await this.store.createIfAbsent(this.partition, key, value)) throw new Error('DURABLE_ORPHAN_CONCURRENCY_FAILURE');
    return value;
  }
  find(correlationId: string, dealId: string, documentId: string): Promise<OrphanCandidate | undefined> { return this.store.read(this.partition, `${correlationId}|${dealId}|${documentId}`); }
}
