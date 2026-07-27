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

import { submitConditionVerificationAction, type SubmitConditionVerificationInput } from './submitConditionVerificationAction';
import { createInMemoryConditionVerificationStore } from './conditionVerificationStore';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

/**
 * Final LOS Completion arc — Workstream E tests. Covers blank-notes denial, invalid
 * type/status denial, the re-verification chain (supersedesRecordId), and the standard
 * valid/missing/malformed/governance-partial matrix this codebase's other governed writes are
 * held to.
 */

const resolvedActor: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(22222222-2222-2222-2222-222222222222)',
});

function baseInput(overrides: Partial<SubmitConditionVerificationInput> = {}): SubmitConditionVerificationInput {
  return {
    dealId: 'deal-1',
    conditionType: 'CONDITIONS_PRECEDENT',
    status: 'CLEARED',
    notes: 'Executed loan agreement and UCC-1 filed.',
    actorEmail: 'closer@bank.test',
    systemUserId: 'sys-1',
    ...overrides,
  };
}

beforeEach(() => {
  auditCreateMock.mockReset();
  timelineCreateMock.mockReset();
  auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } });
  timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } });
});

describe('submitConditionVerificationAction — happy path', () => {
  it('persists a durable record and it survives reload/readback via the store', async () => {
    const store = createInMemoryConditionVerificationStore();
    const outcome = await submitConditionVerificationAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.status).toBe('CLEARED');
    expect(outcome.record.conditionType).toBe('CONDITIONS_PRECEDENT');

    const readback = await store.listVerificationsForDeal('deal-1');
    expect(readback.success).toBe(true);
    expect(readback.records).toHaveLength(1);
    expect(readback.records?.[0]!.recordId).toBe(outcome.record.recordId);
  });

  it('emits audit + timeline with the shared correlation id', async () => {
    const store = createInMemoryConditionVerificationStore();
    await submitConditionVerificationAction(baseInput(), store, resolvedActor);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const auditPayload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    const timelinePayload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(timelinePayload.cr664_eventsubtype).toBe(
      `condition:conditions_precedent:cleared|correlation:${auditPayload.cr664_correlationid}`,
    );
    expect(timelinePayload.cr664_eventtype).toBe(788190002); // NoteLogged
  });
});

describe('submitConditionVerificationAction — denials', () => {
  it('denies (no write attempted) when notes are blank', async () => {
    const store = createInMemoryConditionVerificationStore();
    const outcome = await submitConditionVerificationAction(baseInput({ notes: '   ' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('refuses an unrecognized condition type', async () => {
    const store = createInMemoryConditionVerificationStore();
    const outcome = await submitConditionVerificationAction(
      { ...baseInput(), conditionType: 'MADE_UP' as never },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });

  it('refuses an unrecognized status', async () => {
    const store = createInMemoryConditionVerificationStore();
    const outcome = await submitConditionVerificationAction(
      { ...baseInput(), status: 'MADE_UP' as never },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });
});

describe('submitConditionVerificationAction — re-verification chain', () => {
  it('chains supersedesRecordId to the current head when re-verifying the same condition type', async () => {
    const store = createInMemoryConditionVerificationStore();
    const failed = await submitConditionVerificationAction(
      baseInput({ conditionType: 'INSURANCE', status: 'FAILED', notes: 'Coverage insufficient.' }),
      store,
      resolvedActor,
    );
    expect(failed.kind).toBe('success');
    if (failed.kind !== 'success') return;

    const cleared = await submitConditionVerificationAction(
      baseInput({ conditionType: 'INSURANCE', status: 'CLEARED', notes: 'New certificate of insurance on file.' }),
      store,
      resolvedActor,
    );
    expect(cleared.kind).toBe('success');
    if (cleared.kind !== 'success') return;
    expect(cleared.record.supersedesRecordId).toBe(failed.record.recordId);
    expect(store.all()).toHaveLength(2);
  });

  it('does not chain across different condition types on the same deal', async () => {
    const store = createInMemoryConditionVerificationStore();
    await submitConditionVerificationAction(baseInput({ conditionType: 'COLLATERAL' }), store, resolvedActor);
    const outcome = await submitConditionVerificationAction(
      baseInput({ conditionType: 'INSURANCE' }),
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.supersedesRecordId).toBeUndefined();
  });
});

describe('submitConditionVerificationAction — write failure and governance-partial', () => {
  it('maps a raw store write failure to the shared safe message', async () => {
    const failingStore = {
      createVerificationRecord: async () => ({ success: false, error: 'Row lock timeout on cr664_conditionverification.' }),
      listVerificationsForDeal: async () => ({ success: true, records: [] }),
    };
    const outcome = await submitConditionVerificationAction(baseInput(), failingStore, resolvedActor);
    expect(outcome.kind).toBe('write-failed');
    if (outcome.kind === 'write-failed') {
      expect(outcome.error).not.toContain('Row lock timeout');
      expect(outcome.error).toContain("We couldn't save that action");
    }
  });

  it('reports governance-partial (record IS persisted) when the audit write fails', async () => {
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: 'audit boom' } });
    const store = createInMemoryConditionVerificationStore();
    const outcome = await submitConditionVerificationAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain('audit boom');
      expect(outcome.auditError).toContain("We couldn't save that action");
    }
    expect(store.all()).toHaveLength(1);
  });
});
