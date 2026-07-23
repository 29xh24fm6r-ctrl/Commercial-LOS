import { describe, it, expect, vi } from 'vitest';
import { confirmFundingDisbursement } from './fundingDisbursementConfirmation';
import { createInMemoryFundingAuthorizationStore } from './fundingAuthorizationStorage';
import type { FundingAuthorizationRecord, FundingReadinessFacts } from './fundingAuthorizationTypes';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });

function record(over: Partial<FundingAuthorizationRecord> = {}): FundingAuthorizationRecord {
  return {
    recordId: 'rec-1',
    dealId: 'deal-1',
    authorizationStatus: 'APPROVED',
    requestedAmount: 100_000,
    approvedAmount: 100_000,
    authorizedBy: 'approver@bank.test',
    authorizedAt: '2026-07-02T00:00:00.000Z',
    destinationVerificationStatus: 'verified',
    conditionsSatisfied: true,
    exceptions: [],
    requestedBy: 'requester@bank.test',
    requestedAt: '2026-07-01T00:00:00.000Z',
    correlationId: 'corr-1',
    supportingDocumentIds: [],
    auditEventIds: [],
    ...over,
  };
}

const CLEAR_FACTS: FundingReadinessFacts = {
  requiredDocumentsComplete: true,
  conditionsPrecedentResolved: true,
  exceptionsAllResolved: true,
  destinationVerified: true,
  approvalExpired: false,
  dealTerminalStatus: 'OPEN',
};

async function seededStore(rec: FundingAuthorizationRecord) {
  const store = createInMemoryFundingAuthorizationStore();
  await store.createRecord(rec);
  return store;
}

function emitAuditMock() {
  return vi.fn(async () => ({ success: true, id: 'audit-1' }));
}

describe('confirmFundingDisbursement', () => {
  it('confirms and reaches FUNDED when approved and every readiness fact is clear', async () => {
    const rec = record();
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await confirmFundingDisbursement(
      { record: rec, readinessFacts: CLEAR_FACTS, fundingDate: '2026-07-03', confirmedByActorEmail: 'ops@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('confirmed');
    if (outcome.kind !== 'confirmed') return;
    expect(outcome.record.authorizationStatus).toBe('FUNDED');
    expect(outcome.record.fundingDate).toBe('2026-07-03');
    expect(outcome.auditRecorded).toBe(true);
  });

  it('blocks and reports every unresolved readiness blocker, without writing FUNDED', async () => {
    const rec = record();
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await confirmFundingDisbursement(
      {
        record: rec,
        readinessFacts: { ...CLEAR_FACTS, requiredDocumentsComplete: false, exceptionsAllResolved: false },
        fundingDate: '2026-07-03',
        confirmedByActorEmail: 'ops@bank.test',
      },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome).toEqual({
      kind: 'blocked',
      blockers: ['required_documents_incomplete', 'exceptions_unresolved'],
    });
    expect(store.all()[0]?.authorizationStatus).toBe('APPROVED'); // unchanged
    expect(emitAudit).not.toHaveBeenCalled();
  });

  it('denies confirmation on a record that was never approved', async () => {
    const rec = record({ authorizationStatus: 'PENDING' });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await confirmFundingDisbursement(
      { record: rec, readinessFacts: CLEAR_FACTS, fundingDate: '2026-07-03', confirmedByActorEmail: 'ops@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome).toEqual({ kind: 'denied', reason: 'not_approved' });
  });

  it('denies re-confirmation of an already-funded record', async () => {
    const rec = record({ authorizationStatus: 'FUNDED' });
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await confirmFundingDisbursement(
      { record: rec, readinessFacts: CLEAR_FACTS, fundingDate: '2026-07-03', confirmedByActorEmail: 'ops@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome).toEqual({ kind: 'denied', reason: 'already_funded' });
  });

  it('denies confirmation on a revoked/rejected/cancelled record', async () => {
    for (const status of ['REVOKED', 'REJECTED', 'CANCELLED'] as const) {
      const rec = record({ authorizationStatus: status });
      const store = await seededStore(rec);
      const emitAudit = emitAuditMock();
      const outcome = await confirmFundingDisbursement(
        { record: rec, readinessFacts: CLEAR_FACTS, fundingDate: '2026-07-03', confirmedByActorEmail: 'ops@bank.test' },
        { storage: store, emitAudit, resolveActorChangedBy: okResolver },
      );
      expect(outcome).toEqual({ kind: 'denied', reason: 'record_terminal' });
    }
  });

  it('re-verifies readiness at confirmation time even though the deal was OPEN at approval time', async () => {
    // Simulates the deal having been declined AFTER approval but before disbursement confirmation.
    const rec = record();
    const store = await seededStore(rec);
    const emitAudit = emitAuditMock();
    const outcome = await confirmFundingDisbursement(
      {
        record: rec,
        readinessFacts: { ...CLEAR_FACTS, dealTerminalStatus: 'DECLINED' },
        fundingDate: '2026-07-03',
        confirmedByActorEmail: 'ops@bank.test',
      },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome).toEqual({ kind: 'blocked', blockers: ['deal_declined'] });
  });
});
