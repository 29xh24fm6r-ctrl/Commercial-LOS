import { describe, it, expect, vi, beforeEach } from 'vitest';

const { auditCreateMock, timelineCreateMock } = vi.hoisted(() => ({
  auditCreateMock: vi.fn(),
  timelineCreateMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: auditCreateMock },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: timelineCreateMock },
}));

import { submitCommitmentAction, type SubmitCommitmentActionInput } from './submitCommitmentAction';
import { createInMemoryCommitmentStore } from './commitmentRecordStore';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';
import type { CreditApprovalDecisionRecord } from '../workflow/creditApprovalDecisionTypes';

/**
 * Final LOS Completion arc — Workstream D tests. Covers issuance gated on a prior credit approval
 * decision, borrower-response gated on an existing pending commitment, blank-field denials, and the
 * standard valid/missing/malformed/governance-partial matrix this codebase's other governed writes
 * are held to.
 */

const resolvedActor: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(22222222-2222-2222-2222-222222222222)',
});

const APPROVED_DECISION: CreditApprovalDecisionRecord = {
  decisionId: 'cad-1',
  dealId: 'deal-1',
  status: 'APPROVED',
  approvedAmount: 500_000,
  approvedProduct: 'SBA 7(a)',
  approvedTermMonths: 84,
  approvedPricing: 'Prime + 2.00%',
  collateralSummary: undefined,
  conditions: [],
  authorityTier: 'committee',
  rationale: 'Approved on DSCR and collateral coverage.',
  requestedByActorEmail: 'banker@bank.test',
  requestedAtIso: '2026-07-20T00:00:00.000Z',
  decidedByActorEmail: 'committee@bank.test',
  decidedAtIso: '2026-07-20T12:00:00.000Z',
  correlationId: 'ca-corr-1',
  supersedesDecisionId: undefined,
};

function baseIssueInput(overrides: Partial<SubmitCommitmentActionInput> = {}): SubmitCommitmentActionInput {
  return {
    dealId: 'deal-1',
    action: 'ISSUE',
    approvedAmount: 500_000,
    approvedProduct: 'SBA 7(a)',
    approvedTermMonths: 84,
    approvedPricing: 'Prime + 2.00%',
    keyTermsSummary: 'Term loan, monthly P&I, standard covenants.',
    expirationDateIso: '2026-08-24T00:00:00.000Z',
    declineReason: undefined,
    actorEmail: 'banker@bank.test',
    systemUserId: 'sys-1',
    creditApprovalDecisions: [APPROVED_DECISION],
    ...overrides,
  };
}

beforeEach(() => {
  auditCreateMock.mockReset();
  timelineCreateMock.mockReset();
  auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } });
  timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } });
});

describe('submitCommitmentAction — ISSUE happy path', () => {
  it('persists a durable ISSUED record and it survives reload/readback via the store', async () => {
    const store = createInMemoryCommitmentStore();
    const outcome = await submitCommitmentAction(baseIssueInput(), store, resolvedActor);
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.status).toBe('ISSUED');
    expect(outcome.record.keyTermsSummary).toBe('Term loan, monthly P&I, standard covenants.');

    const readback = await store.listCommitmentsForDeal('deal-1');
    expect(readback.success).toBe(true);
    expect(readback.commitments).toHaveLength(1);
    expect(readback.commitments?.[0]!.commitmentId).toBe(outcome.record.commitmentId);
  });

  it('emits audit + timeline with the shared correlation id', async () => {
    const store = createInMemoryCommitmentStore();
    await submitCommitmentAction(baseIssueInput(), store, resolvedActor);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const auditPayload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    const timelinePayload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(timelinePayload.cr664_eventsubtype).toBe(`commitment:issued|correlation:${auditPayload.cr664_correlationid}`);
    expect(timelinePayload.cr664_eventtype).toBe(788190002); // NoteLogged
  });
});

describe('submitCommitmentAction — ISSUE denials', () => {
  it('denies (no write attempted) when no credit approval decision has been recorded for the deal', async () => {
    const store = createInMemoryCommitmentStore();
    const outcome = await submitCommitmentAction(
      baseIssueInput({ creditApprovalDecisions: [] }),
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('denies when the only decision on file is for a different deal', async () => {
    const store = createInMemoryCommitmentStore();
    const outcome = await submitCommitmentAction(
      baseIssueInput({ creditApprovalDecisions: [{ ...APPROVED_DECISION, dealId: 'other-deal' }] }),
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });

  it('denies (no write attempted) when the key terms summary is blank', async () => {
    const store = createInMemoryCommitmentStore();
    const outcome = await submitCommitmentAction(baseIssueInput({ keyTermsSummary: '   ' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });
});

describe('submitCommitmentAction — borrower response', () => {
  it('denies ACCEPT when nothing has been issued yet', async () => {
    const store = createInMemoryCommitmentStore();
    const outcome = await submitCommitmentAction(
      { ...baseIssueInput(), action: 'ACCEPT' },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });

  it('records ACCEPT once a commitment has been issued, chaining supersedesCommitmentId', async () => {
    const store = createInMemoryCommitmentStore();
    const issued = await submitCommitmentAction(baseIssueInput(), store, resolvedActor);
    expect(issued.kind).toBe('success');
    if (issued.kind !== 'success') return;

    const accepted = await submitCommitmentAction(
      { ...baseIssueInput(), action: 'ACCEPT' },
      store,
      resolvedActor,
    );
    expect(accepted.kind).toBe('success');
    if (accepted.kind !== 'success') return;
    expect(accepted.record.status).toBe('ACCEPTED');
    expect(accepted.record.supersedesCommitmentId).toBe(issued.record.commitmentId);
    expect(store.all()).toHaveLength(2);
  });

  it('denies DECLINE (no write attempted) when the decline reason is blank', async () => {
    const store = createInMemoryCommitmentStore();
    await submitCommitmentAction(baseIssueInput(), store, resolvedActor);
    const outcome = await submitCommitmentAction(
      { ...baseIssueInput(), action: 'DECLINE', declineReason: '   ' },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(1); // only the ISSUE write, no DECLINE write attempted
  });

  it('records DECLINE with the given reason once a commitment is pending', async () => {
    const store = createInMemoryCommitmentStore();
    await submitCommitmentAction(baseIssueInput(), store, resolvedActor);
    const outcome = await submitCommitmentAction(
      { ...baseIssueInput(), action: 'DECLINE', declineReason: 'Rate shopping elsewhere.' },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.status).toBe('DECLINED');
    expect(outcome.record.declineReason).toBe('Rate shopping elsewhere.');
  });

  it('denies a second response once the pending commitment has already been responded to', async () => {
    const store = createInMemoryCommitmentStore();
    await submitCommitmentAction(baseIssueInput(), store, resolvedActor);
    await submitCommitmentAction({ ...baseIssueInput(), action: 'ACCEPT' }, store, resolvedActor);
    const outcome = await submitCommitmentAction(
      { ...baseIssueInput(), action: 'DECLINE', declineReason: 'Too late.' },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(2);
  });
});

describe('submitCommitmentAction — write failure and governance-partial', () => {
  it('maps a raw store write failure to the shared safe message', async () => {
    const failingStore = {
      createCommitmentRecord: async () => ({ success: false, error: 'Row lock timeout on cr664_commitmentrecord.' }),
      listCommitmentsForDeal: async () => ({ success: true, commitments: [] }),
    };
    const outcome = await submitCommitmentAction(baseIssueInput(), failingStore, resolvedActor);
    expect(outcome.kind).toBe('write-failed');
    if (outcome.kind === 'write-failed') {
      expect(outcome.error).not.toContain('Row lock timeout');
      expect(outcome.error).toContain("We couldn't save that action");
    }
  });

  it('reports governance-partial (record IS persisted) when the audit write fails', async () => {
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: 'audit boom' } });
    const store = createInMemoryCommitmentStore();
    const outcome = await submitCommitmentAction(baseIssueInput(), store, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain('audit boom');
      expect(outcome.auditError).toContain("We couldn't save that action");
    }
    expect(store.all()).toHaveLength(1);
  });
});
