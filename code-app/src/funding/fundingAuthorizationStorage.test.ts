import { describe, it, expect } from 'vitest';
import { createInMemoryFundingAuthorizationStore } from './fundingAuthorizationStorage';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

function record(over: Partial<FundingAuthorizationRecord> = {}): FundingAuthorizationRecord {
  return {
    recordId: 'rec-1',
    dealId: 'deal-1',
    authorizationStatus: 'PENDING',
    requestedAmount: 100_000,
    destinationVerificationStatus: 'unverified',
    conditionsSatisfied: false,
    exceptions: [],
    requestedBy: 'requester@bank.test',
    requestedAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'corr-1',
    supportingDocumentIds: [],
    auditEventIds: [],
    ...over,
  };
}

describe('createInMemoryFundingAuthorizationStore', () => {
  it('creates and updates a record in place', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    await store.createRecord(record());
    await store.updateRecord(record({ authorizationStatus: 'APPROVED' }));
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0]?.authorizationStatus).toBe('APPROVED');
  });

  it('refuses to update a record that was never created', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const result = await store.updateRecord(record());
    expect(result.success).toBe(false);
  });

  it('getCurrentRecordForDeal returns the latest non-superseded record for that deal only', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    await store.createRecord(record({ recordId: 'r1', dealId: 'deal-1', requestedAt: '2026-07-01T00:00:00.000Z' }));
    await store.createRecord(
      record({
        recordId: 'r2',
        dealId: 'deal-1',
        requestedAt: '2026-07-02T00:00:00.000Z',
        supersedesRecordId: 'r1',
      }),
    );
    await store.createRecord(record({ recordId: 'r3', dealId: 'deal-OTHER' }));

    const result = await store.getCurrentRecordForDeal('deal-1');
    expect(result.record?.recordId).toBe('r2');
  });

  it('returns undefined record honestly when no record exists for the deal', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const result = await store.getCurrentRecordForDeal('deal-none');
    expect(result.success).toBe(true);
    expect(result.record).toBeUndefined();
  });
});
