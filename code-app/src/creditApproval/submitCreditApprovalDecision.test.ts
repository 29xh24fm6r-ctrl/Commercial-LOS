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

import { submitCreditApprovalDecision, type SubmitCreditApprovalDecisionInput } from './submitCreditApprovalDecision';
import { createInMemoryCreditApprovalDecisionStore } from './creditApprovalDecisionStore';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

/**
 * Final LOS Completion arc — Workstream C tests. Covers the arc spec's explicit requirements for
 * this durable record: self-approval denial, authority-tier enforcement, blank-rationale denial,
 * fail-closed on malformed input, plus reload/readback proof and the standard
 * valid/missing/malformed/wrong-actor/governance-partial matrix this codebase's other governed
 * writes are held to.
 */

const resolvedActor: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(22222222-2222-2222-2222-222222222222)',
});

const COMMITTEE_BANKER = { approvalLimit: 1_000_000, creditCommitteeMember: true, approvalOverrideAuthority: false };

function baseInput(overrides: Partial<SubmitCreditApprovalDecisionInput> = {}): SubmitCreditApprovalDecisionInput {
  return {
    dealId: 'deal-1',
    decisionStatus: 'APPROVED',
    approvedAmount: 500_000,
    approvedProduct: 'SBA 7(a)',
    approvedTermMonths: 84,
    approvedPricing: 'Prime + 2.00%',
    collateralSummary: 'UCC-1 on all business assets.',
    conditions: ['Executed loan agreement'],
    rationale: 'DSCR and collateral coverage support approval.',
    requestedByActorEmail: 'banker@bank.test',
    actorEmail: 'committee-member@bank.test',
    systemUserId: 'sys-1',
    actorResolved: true,
    banker: COMMITTEE_BANKER,
    dealAmount: 500_000,
    requestProfileAmount: undefined,
    advancingActorBankerId: 'banker-committee-1',
    originatingBankerId: 'banker-originator-1',
    ...overrides,
  };
}

beforeEach(() => {
  auditCreateMock.mockReset();
  timelineCreateMock.mockReset();
  auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } });
  timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } });
});

describe('submitCreditApprovalDecision — happy path', () => {
  it('persists a durable record and it survives reload/readback via the store', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.status).toBe('APPROVED');
    expect(outcome.record.authorityTier).toBe('committee');
    expect(outcome.record.rationale).toBe('DSCR and collateral coverage support approval.');

    // Reload/readback: a fresh read of the store for this deal returns the persisted record.
    const readback = await store.listDecisionsForDeal('deal-1');
    expect(readback.success).toBe(true);
    expect(readback.decisions).toHaveLength(1);
    expect(readback.decisions?.[0]!.decisionId).toBe(outcome.record.decisionId);
    expect(readback.decisions?.[0]!.approvedAmount).toBe(500_000);
  });

  it('emits audit + timeline with the shared correlation id', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    await submitCreditApprovalDecision(baseInput(), store, resolvedActor);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const auditPayload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    const timelinePayload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(timelinePayload.cr664_eventsubtype).toBe(`correlation:${auditPayload.cr664_correlationid}`);
    expect(timelinePayload.cr664_eventtype).toBe(788190013); // ApprovalDecision
  });
});

describe('submitCreditApprovalDecision — blank-rationale denial', () => {
  it('denies (no write attempted) when the rationale is blank', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(baseInput({ rationale: '   ' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });
});

describe('submitCreditApprovalDecision — invalid decision status', () => {
  it('refuses a non-decision status (e.g. DRAFT) rather than writing an ambiguous record', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(baseInput({ decisionStatus: 'DRAFT' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });
});

describe('submitCreditApprovalDecision — self-approval denial', () => {
  it('denies when the deciding actor is this deal\'s own assigned banker', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(
      baseInput({ advancingActorBankerId: 'same-banker', originatingBankerId: 'same-banker' }),
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('authority-denied');
    if (outcome.kind === 'authority-denied') {
      expect(outcome.reasonCode).toBe('self_approval_not_permitted');
    }
    expect(store.all()).toHaveLength(0);
  });
});

describe('submitCreditApprovalDecision — authority-tier enforcement', () => {
  it('denies when the actor is not a credit committee member', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(
      baseInput({ banker: { approvalLimit: 1_000_000, creditCommitteeMember: false, approvalOverrideAuthority: false } }),
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('authority-denied');
    if (outcome.kind === 'authority-denied') {
      expect(outcome.reasonCode).toBe('committee_authority_required');
    }
    expect(store.all()).toHaveLength(0);
  });

  it('denies when the amount exceeds the actor\'s individual approval limit', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(
      baseInput({
        dealAmount: 2_000_000,
        approvedAmount: 2_000_000,
        banker: { approvalLimit: 500_000, creditCommitteeMember: true, approvalOverrideAuthority: false },
      }),
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('authority-denied');
    if (outcome.kind === 'authority-denied') {
      expect(outcome.reasonCode).toBe('amount_exceeds_individual_authority');
    }
    expect(store.all()).toHaveLength(0);
  });

  it('records "override" as the authority tier when override authority is used', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(
      baseInput({ banker: { approvalLimit: 1, creditCommitteeMember: false, approvalOverrideAuthority: true } }),
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') expect(outcome.record.authorityTier).toBe('override');
  });

  it('fails closed (denies) when no banker credit-authority record exists', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(baseInput({ banker: undefined }), store, resolvedActor);
    expect(outcome.kind).toBe('authority-denied');
    if (outcome.kind === 'authority-denied') expect(outcome.reasonCode).toBe('no_banker_record');
  });
});

describe('submitCreditApprovalDecision — write failure and governance-partial', () => {
  it('maps a raw store write failure to the shared safe message', async () => {
    const failingStore = {
      createDecisionRecord: async () => ({ success: false, error: 'Row lock timeout on cr664_creditapprovaldecision.' }),
      listDecisionsForDeal: async () => ({ success: true, decisions: [] }),
    };
    const outcome = await submitCreditApprovalDecision(baseInput(), failingStore, resolvedActor);
    expect(outcome.kind).toBe('write-failed');
    if (outcome.kind === 'write-failed') {
      expect(outcome.error).not.toContain('Row lock timeout');
      expect(outcome.error).toContain("We couldn't save that action");
    }
  });

  it('reports governance-partial (record IS persisted) when the audit write fails', async () => {
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: 'audit boom' } });
    const store = createInMemoryCreditApprovalDecisionStore();
    const outcome = await submitCreditApprovalDecision(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain('audit boom');
      expect(outcome.auditError).toContain("We couldn't save that action");
    }
    expect(store.all()).toHaveLength(1);
  });
});
