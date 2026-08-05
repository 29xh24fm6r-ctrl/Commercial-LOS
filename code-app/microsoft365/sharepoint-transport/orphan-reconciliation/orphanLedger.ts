import type { NormalizedActorIdentity } from '../contract/types.js';

export type OrphanFailureClassification = 'UPLOAD_RESPONSE_LOST' | 'UPLOAD_READBACK_FAILED' | 'UPLOAD_RESPONSE_INVALID' | 'DOWNSTREAM_METADATA_FAILED';
export type OrphanReconciliationStatus = 'UNRECONCILED' | 'VERIFIED_ORPHAN' | 'LINKED_BY_GOVERNED_ACTION' | 'REMOVED_BY_GOVERNED_ACTION';

export interface OrphanCandidate {
  readonly correlationId: string;
  readonly dealId: string;
  readonly documentId: string;
  readonly requirementIds: readonly string[];
  readonly driveItemId?: string;
  readonly expectedFolderId: string;
  readonly expectedFolderPath: string;
  readonly expectedFilename: string;
  readonly actor: NormalizedActorIdentity;
  readonly failureClassification: OrphanFailureClassification;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: OrphanReconciliationStatus;
}

export interface OrphanReconciliationLedger {
  record(candidate: Omit<OrphanCandidate, 'createdAt' | 'updatedAt' | 'status'>): Promise<OrphanCandidate>;
  find(correlationId: string, dealId: string, documentId: string): Promise<OrphanCandidate | undefined>;
}

export class InMemoryOrphanReconciliationLedger implements OrphanReconciliationLedger {
  private readonly entries = new Map<string, OrphanCandidate>();
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async record(candidate: Omit<OrphanCandidate, 'createdAt' | 'updatedAt' | 'status'>): Promise<OrphanCandidate> {
    const key = `${candidate.correlationId}|${candidate.dealId}|${candidate.documentId}`;
    const existing = this.entries.get(key);
    const now = this.clock().toISOString();
    const value: OrphanCandidate = Object.freeze({
      ...candidate,
      requirementIds: Object.freeze([...candidate.requirementIds]),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      status: existing?.status ?? 'UNRECONCILED',
    });
    this.entries.set(key, value);
    return value;
  }

  async find(correlationId: string, dealId: string, documentId: string): Promise<OrphanCandidate | undefined> {
    const value = this.entries.get(`${correlationId}|${dealId}|${documentId}`);
    return value ? structuredClone(value) : undefined;
  }
}
