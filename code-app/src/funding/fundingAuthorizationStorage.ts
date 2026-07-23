import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

/**
 * final-seven-workstreams Workstream 7 — the storage seam for funding-authorization records.
 *
 * NO LIVE DATAVERSE FACTORY EXISTS, and none is added by this pass. Per the spec's own instruction
 * ("determine whether an existing table can truthfully support funding authorization; if not,
 * prepare — but do not automatically execute — a schema proposal"): no existing table supports
 * dual-control approval chains, exceptions, or disbursement confirmation with real fields. A
 * proposed additive schema is documented in
 * docs/final-seven-workstreams/07_FUNDING_AUTHORIZATION_FRAMEWORK.md, NOT applied. Building a live
 * factory against a table that doesn't exist would be exactly the fabrication this initiative
 * exists to prevent.
 *
 * `createInMemoryFundingAuthorizationStore()` is a real, working reference implementation for tests
 * and for driving the UI panel in a durable-within-session way — it is NOT persistence.
 */
export interface FundingAuthorizationStorageResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface FundingAuthorizationStorageDeps {
  readonly createRecord: (record: FundingAuthorizationRecord) => Promise<FundingAuthorizationStorageResult>;
  readonly updateRecord: (record: FundingAuthorizationRecord) => Promise<FundingAuthorizationStorageResult>;
  readonly getCurrentRecordForDeal: (
    dealId: string,
  ) => Promise<{ success: boolean; record?: FundingAuthorizationRecord; error?: string }>;
}

export function createInMemoryFundingAuthorizationStore(): FundingAuthorizationStorageDeps & {
  readonly all: () => readonly FundingAuthorizationRecord[];
} {
  const records = new Map<string, FundingAuthorizationRecord>();

  return {
    createRecord: async (record) => {
      records.set(record.recordId, record);
      return { success: true };
    },
    updateRecord: async (record) => {
      if (!records.has(record.recordId)) return { success: false, error: 'No existing record to update.' };
      records.set(record.recordId, record);
      return { success: true };
    },
    getCurrentRecordForDeal: async (dealId) => {
      // "Current" = the most recently requested record for this deal that no other record
      // supersedes as its own successor chain root (the latest record not itself yet superseded).
      const forDeal = [...records.values()].filter((r) => r.dealId === dealId);
      const supersededIds = new Set(forDeal.map((r) => r.supersedesRecordId).filter((id): id is string => Boolean(id)));
      const current = forDeal.filter((r) => !supersededIds.has(r.recordId));
      const latest = current.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
      return { success: true, record: latest };
    },
    all: () => [...records.values()],
  };
}
