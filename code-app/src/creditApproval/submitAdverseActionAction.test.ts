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

import { submitAdverseActionAction, type SubmitAdverseActionInput } from './submitAdverseActionAction';
import { createInMemoryAdverseActionRecordStore } from './adverseActionRecordStore';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

/**
 * Final LOS Completion arc — Workstream J tests. Covers blank-notes denial, invalid status denial,
 * the correction chain (supersedesRecordId), and the standard valid/missing/malformed/
 * governance-partial matrix this codebase's other governed writes are held to.
 */

const resolvedActor: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(22222222-2222-2222-2222-222222222222)',
});

function baseInput(overrides: Partial<SubmitAdverseActionInput> = {}): SubmitAdverseActionInput {
  return {
    dealId: 'deal-1',
    status: 'SENT',
    notes: 'Adverse action notice mailed to applicant on file.',
    actorEmail: 'creditofficer@bank.test',
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

describe('submitAdverseActionAction — happy path', () => {
  it('persists a durable record and it survives reload/readback via the store', async () => {
    const store = createInMemoryAdverseActionRecordStore();
    const outcome = await submitAdverseActionAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.status).toBe('SENT');

    const readback = await store.listRecordsForDeal('deal-1');
    expect(readback.success).toBe(true);
    expect(readback.records).toHaveLength(1);
    expect(readback.records?.[0]!.recordId).toBe(outcome.record.recordId);
  });

  it('emits audit + timeline with the shared correlation id', async () => {
    const store = createInMemoryAdverseActionRecordStore();
    await submitAdverseActionAction(baseInput(), store, resolvedActor);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const auditPayload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    const timelinePayload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(timelinePayload.cr664_eventsubtype).toBe(`adverseaction:sent|correlation:${auditPayload.cr664_correlationid}`);
    expect(timelinePayload.cr664_eventtype).toBe(788190002); // NoteLogged
  });
});

describe('submitAdverseActionAction — denials', () => {
  it('denies (no write attempted) when notes are blank', async () => {
    const store = createInMemoryAdverseActionRecordStore();
    const outcome = await submitAdverseActionAction(baseInput({ notes: '   ' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('refuses an unrecognized status', async () => {
    const store = createInMemoryAdverseActionRecordStore();
    const outcome = await submitAdverseActionAction(
      { ...baseInput(), status: 'MADE_UP' as never },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });
});

describe('submitAdverseActionAction — correction chain', () => {
  it('chains supersedesRecordId to the current head when re-recording with fuller detail', async () => {
    const store = createInMemoryAdverseActionRecordStore();
    const first = await submitAdverseActionAction(
      baseInput({ status: 'SENT', notes: 'Initial entry, later found incomplete.' }),
      store,
      resolvedActor,
    );
    expect(first.kind).toBe('success');
    if (first.kind !== 'success') return;

    const corrected = await submitAdverseActionAction(
      baseInput({ status: 'SENT', notes: 'Corrected entry with full mailing detail.' }),
      store,
      resolvedActor,
    );
    expect(corrected.kind).toBe('success');
    if (corrected.kind !== 'success') return;
    expect(corrected.record.supersedesRecordId).toBe(first.record.recordId);
    expect(store.all()).toHaveLength(2);
  });
});

describe('submitAdverseActionAction — write failure and governance-partial', () => {
  it('maps a raw store write failure to the shared safe message', async () => {
    const failingStore = {
      createRecord: async () => ({ success: false, error: 'Row lock timeout on cr664_adverseactionrecord.' }),
      listRecordsForDeal: async () => ({ success: true, records: [] }),
    };
    const outcome = await submitAdverseActionAction(baseInput(), failingStore, resolvedActor);
    expect(outcome.kind).toBe('write-failed');
    if (outcome.kind === 'write-failed') {
      expect(outcome.error).not.toContain('Row lock timeout');
      expect(outcome.error).toContain("We couldn't save that action");
    }
  });

  it('reports governance-partial (record IS persisted) when the audit write fails', async () => {
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: 'audit boom' } });
    const store = createInMemoryAdverseActionRecordStore();
    const outcome = await submitAdverseActionAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain('audit boom');
      expect(outcome.auditError).toContain("We couldn't save that action");
    }
    expect(store.all()).toHaveLength(1);
  });
});
