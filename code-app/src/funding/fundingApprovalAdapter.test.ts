import { describe, it, expect, vi } from 'vitest';
import { approveFunding, rejectFunding, revokeFunding } from './fundingApprovalAdapter';
import { createInMemoryFundingAuthorizationStore } from './fundingAuthorizationStorage';
import { DEFAULT_DUAL_CONTROL_THRESHOLD_USD } from './fundingAuthorizationPolicy';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });

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

async function seededStore(rec: FundingAuthorizationRecord) {
  const store = createInMemoryFundingAuthorizationStore();
  await store.createRecord(rec);
  return store;
}

function emitAuditMock() {
  return vi.fn(async () => ({ success: true, id: 'audit-1' }));
}

describe('approveFunding', () => {
  it('below threshold: a single approval fully approves and persists the update', async () => {
    const rec = record({ requestedAmount: 50_000 });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await approveFunding(
      { record: rec, approverEmail: 'approver@bank.test', approvedAmount: 50_000, authorizedFacilityAmount: 1_000_000 },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('fully_approved');
    if (outcome.kind !== 'fully_approved') return;
    expect(outcome.record.authorizationStatus).toBe('APPROVED');
    expect(outcome.record.authorizedBy).toBe('approver@bank.test');
    expect(outcome.record.approvedAmount).toBe(50_000);
    expect(outcome.record.authorizedAt).toBeTruthy();
    expect(store.all()[0]?.authorizationStatus).toBe('APPROVED');
  });

  it('at/above threshold: the first approval leaves status PENDING with authorizedBy set, not yet APPROVED', async () => {
    const rec = record({ requestedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await approveFunding(
      {
        record: rec,
        approverEmail: 'first@bank.test',
        approvedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD,
        authorizedFacilityAmount: 5_000_000,
      },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('first_approval_recorded');
    if (outcome.kind !== 'first_approval_recorded') return;
    expect(outcome.record.authorizationStatus).toBe('PENDING');
    expect(outcome.record.authorizedBy).toBe('first@bank.test');
    expect(outcome.record.secondApprovedBy).toBeUndefined();
  });

  it('the second, distinct approver completes dual-control approval, setting secondApprovedBy', async () => {
    const afterFirst = record({
      requestedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD,
      authorizedBy: 'first@bank.test',
    });
    const store = await seededStore(afterFirst);
    const emitAudit = emitAuditMock();
    const outcome = await approveFunding(
      {
        record: afterFirst,
        approverEmail: 'second@bank.test',
        approvedAmount: DEFAULT_DUAL_CONTROL_THRESHOLD_USD,
        authorizedFacilityAmount: 5_000_000,
      },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('fully_approved');
    if (outcome.kind !== 'fully_approved') return;
    expect(outcome.record.authorizationStatus).toBe('APPROVED');
    expect(outcome.record.authorizedBy).toBe('first@bank.test');
    expect(outcome.record.secondApprovedBy).toBe('second@bank.test');
  });

  it('denies and does not write when the policy check fails (e.g. self-approval)', async () => {
    const rec = record();
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await approveFunding(
      { record: rec, approverEmail: 'requester@bank.test', approvedAmount: 50_000, authorizedFacilityAmount: 1_000_000 },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome).toEqual({ kind: 'denied', reason: 'self_approval_not_permitted' });
    expect(emitAudit).not.toHaveBeenCalled();
    expect(store.all()[0]?.authorizationStatus).toBe('PENDING'); // untouched
  });
});

describe('rejectFunding', () => {
  it('rejects a pending record and persists REJECTED', async () => {
    const rec = record();
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await rejectFunding(rec, 'credit-officer@bank.test', {
      storage: store,
      emitAudit,
      resolveActorChangedBy: okResolver,
    });
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind !== 'rejected') return;
    expect(outcome.record.authorizationStatus).toBe('REJECTED');
  });

  it('denies rejecting an already-terminal record', async () => {
    const rec = record({ authorizationStatus: 'FUNDED' });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await rejectFunding(rec, 'x@bank.test', { storage: store, emitAudit, resolveActorChangedBy: okResolver });
    expect(outcome).toEqual({ kind: 'denied', reason: 'record_terminal' });
  });
});

describe('revokeFunding', () => {
  it('revokes an approved record before disbursement', async () => {
    const rec = record({ authorizationStatus: 'APPROVED', authorizedBy: 'approver@bank.test', approvedAmount: 50_000 });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await revokeFunding(rec, 'credit-officer@bank.test', {
      storage: store,
      emitAudit,
      resolveActorChangedBy: okResolver,
    });
    expect(outcome.kind).toBe('revoked');
    if (outcome.kind !== 'revoked') return;
    expect(outcome.record.authorizationStatus).toBe('REVOKED');
  });

  it('denies revocation once already funded', async () => {
    const rec = record({ authorizationStatus: 'FUNDED' });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await revokeFunding(rec, 'x@bank.test', { storage: store, emitAudit, resolveActorChangedBy: okResolver });
    expect(outcome).toEqual({ kind: 'denied', reason: 'already_funded' });
  });
});

describe('fundingApprovalAdapter — Workstream K: timeline emission', () => {
  it('approveFunding emits a timeline event when emitTimeline is supplied', async () => {
    const rec = record({ requestedAmount: 50_000 });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const emitTimeline = vi.fn(async (_event: { action: string }) => ({ success: true }));
    const outcome = await approveFunding(
      { record: rec, approverEmail: 'approver@bank.test', approvedAmount: 50_000, authorizedFacilityAmount: 1_000_000 },
      { storage: store, emitAudit, emitTimeline, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('fully_approved');
    expect(emitTimeline).toHaveBeenCalledTimes(1);
    const event = emitTimeline.mock.calls[0]![0] as { action: string };
    expect(event.action).toBe('fully_approved');
  });

  it('rejectFunding emits a timeline event when emitTimeline is supplied', async () => {
    const rec = record();
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const emitTimeline = vi.fn(async () => ({ success: true }));
    const outcome = await rejectFunding(rec, 'x@bank.test', { storage: store, emitAudit, emitTimeline, resolveActorChangedBy: okResolver });
    expect(outcome.kind).toBe('rejected');
    expect(emitTimeline).toHaveBeenCalledTimes(1);
  });

  it('does not fail the action when emitTimeline is entirely absent (backward compatible)', async () => {
    const rec = record({ requestedAmount: 50_000 });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await approveFunding(
      { record: rec, approverEmail: 'approver@bank.test', approvedAmount: 50_000, authorizedFacilityAmount: 1_000_000 },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('fully_approved');
  });

  it('does not fail the action when emitTimeline rejects (best-effort, never blocks the outcome)', async () => {
    const rec = record({ requestedAmount: 50_000 });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const emitTimeline = vi.fn(async () => {
      throw new Error('timeline down');
    });
    const outcome = await approveFunding(
      { record: rec, approverEmail: 'approver@bank.test', approvedAmount: 50_000, authorizedFacilityAmount: 1_000_000 },
      { storage: store, emitAudit, emitTimeline, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('fully_approved');
  });
});
