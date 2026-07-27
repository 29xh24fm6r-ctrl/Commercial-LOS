import { describe, it, expect, vi } from 'vitest';
import { requestFunding } from './fundingRequestAdapter';
import { createInMemoryFundingAuthorizationStore } from './fundingAuthorizationStorage';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });

function emitAuditMock() {
  const calls: unknown[] = [];
  const emitAudit = vi.fn(async (event: unknown) => {
    calls.push(event);
    return { success: true, id: 'audit-1' };
  });
  return { emitAudit, calls };
}

describe('requestFunding', () => {
  it('rejects an empty deal id or requester without touching storage', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const { emitAudit } = emitAuditMock();
    const a = await requestFunding(
      { dealId: '', requestedAmount: 100, requestedBy: 'x@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(a.kind).toBe('invalid_input');
    const b = await requestFunding(
      { dealId: 'deal-1', requestedAmount: 100, requestedBy: '' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(b.kind).toBe('invalid_input');
    expect(store.all()).toHaveLength(0);
  });

  it('rejects a non-positive requested amount', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const { emitAudit } = emitAuditMock();
    const outcome = await requestFunding(
      { dealId: 'deal-1', requestedAmount: 0, requestedBy: 'x@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('invalid_input');
  });

  it('creates a PENDING record with full provenance and records the audit', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const { emitAudit, calls } = emitAuditMock();
    const outcome = await requestFunding(
      { dealId: 'deal-1', requestedAmount: 500_000, requestedBy: 'requester@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('requested');
    if (outcome.kind !== 'requested') return;
    expect(outcome.record.authorizationStatus).toBe('PENDING');
    expect(outcome.record.dealId).toBe('deal-1');
    expect(outcome.record.requestedAmount).toBe(500_000);
    expect(outcome.record.requestedBy).toBe('requester@bank.test');
    expect(outcome.record.destinationVerificationStatus).toBe('unverified');
    expect(outcome.record.conditionsSatisfied).toBe(false);
    expect(outcome.record.exceptions).toEqual([]);
    expect(outcome.auditRecorded).toBe(true);
    expect(calls).toHaveLength(1);
    expect(store.all()).toHaveLength(1);
  });

  it('reports write_failed honestly when storage fails, and never invokes audit', async () => {
    const failingStore = {
      createRecord: vi.fn(async () => ({ success: false, error: 'Dataverse rejected' })),
      updateRecord: vi.fn(async () => ({ success: true })),
      getCurrentRecordForDeal: vi.fn(async () => ({ success: true })),
    };
    const { emitAudit } = emitAuditMock();
    const outcome = await requestFunding(
      { dealId: 'deal-1', requestedAmount: 100, requestedBy: 'x@bank.test' },
      { storage: failingStore, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('write_failed');
    expect(emitAudit).not.toHaveBeenCalled();
  });
});

describe('requestFunding — Workstream K: timeline emission', () => {
  it('emits a timeline event on the happy path when emitTimeline is supplied', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const { emitAudit } = emitAuditMock();
    const emitTimeline = vi.fn(async (_event: { action: string }) => ({ success: true }));
    const outcome = await requestFunding(
      { dealId: 'deal-1', requestedAmount: 100, requestedBy: 'x@bank.test' },
      { storage: store, emitAudit, emitTimeline, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('requested');
    expect(emitTimeline).toHaveBeenCalledTimes(1);
    const event = emitTimeline.mock.calls[0]![0] as { action: string };
    expect(event.action).toBe('requested');
  });

  it('does not fail the request when emitTimeline is entirely absent (backward compatible)', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const { emitAudit } = emitAuditMock();
    const outcome = await requestFunding(
      { dealId: 'deal-1', requestedAmount: 100, requestedBy: 'x@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('requested');
  });

  it('does not fail the request when emitTimeline rejects (best-effort, never blocks the outcome)', async () => {
    const store = createInMemoryFundingAuthorizationStore();
    const { emitAudit } = emitAuditMock();
    const emitTimeline = vi.fn(async () => {
      throw new Error('timeline down');
    });
    const outcome = await requestFunding(
      { dealId: 'deal-1', requestedAmount: 100, requestedBy: 'x@bank.test' },
      { storage: store, emitAudit, emitTimeline, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('requested');
  });
});
