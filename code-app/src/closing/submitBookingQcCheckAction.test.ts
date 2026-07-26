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

import { submitBookingQcCheckAction, type SubmitBookingQcCheckInput } from './submitBookingQcCheckAction';
import { createInMemoryBookingQcCheckStore } from './bookingQcCheckStore';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

/**
 * Final LOS Completion arc — Workstream H tests. Covers blank-notes denial, invalid status denial,
 * the re-check chain (supersedesCheckId), and the standard valid/missing/malformed/
 * governance-partial matrix this codebase's other governed writes are held to.
 */

const resolvedActor: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(22222222-2222-2222-2222-222222222222)',
});

function baseInput(overrides: Partial<SubmitBookingQcCheckInput> = {}): SubmitBookingQcCheckInput {
  return {
    dealId: 'deal-1',
    status: 'PASSED',
    notes: 'Booking package reviewed; all fields match executed documents.',
    actorEmail: 'loanops@bank.test',
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

describe('submitBookingQcCheckAction — happy path', () => {
  it('persists a durable record and it survives reload/readback via the store', async () => {
    const store = createInMemoryBookingQcCheckStore();
    const outcome = await submitBookingQcCheckAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.status).toBe('PASSED');

    const readback = await store.listChecksForDeal('deal-1');
    expect(readback.success).toBe(true);
    expect(readback.records).toHaveLength(1);
    expect(readback.records?.[0]!.checkId).toBe(outcome.record.checkId);
  });

  it('emits audit + timeline with the shared correlation id', async () => {
    const store = createInMemoryBookingQcCheckStore();
    await submitBookingQcCheckAction(baseInput(), store, resolvedActor);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const auditPayload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    const timelinePayload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(timelinePayload.cr664_eventsubtype).toBe(`bookingqc:passed|correlation:${auditPayload.cr664_correlationid}`);
    expect(timelinePayload.cr664_eventtype).toBe(788190002); // NoteLogged
  });
});

describe('submitBookingQcCheckAction — denials', () => {
  it('denies (no write attempted) when notes are blank', async () => {
    const store = createInMemoryBookingQcCheckStore();
    const outcome = await submitBookingQcCheckAction(baseInput({ notes: '   ' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('refuses an unrecognized status', async () => {
    const store = createInMemoryBookingQcCheckStore();
    const outcome = await submitBookingQcCheckAction(
      { ...baseInput(), status: 'MADE_UP' as never },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });
});

describe('submitBookingQcCheckAction — re-check chain', () => {
  it('chains supersedesCheckId to the current head when re-checking after a FAILED result', async () => {
    const store = createInMemoryBookingQcCheckStore();
    const failed = await submitBookingQcCheckAction(
      baseInput({ status: 'FAILED', notes: 'Mismatch found in booking amount.' }),
      store,
      resolvedActor,
    );
    expect(failed.kind).toBe('success');
    if (failed.kind !== 'success') return;

    const passed = await submitBookingQcCheckAction(
      baseInput({ status: 'PASSED', notes: 'Corrected and re-reviewed.' }),
      store,
      resolvedActor,
    );
    expect(passed.kind).toBe('success');
    if (passed.kind !== 'success') return;
    expect(passed.record.supersedesCheckId).toBe(failed.record.checkId);
    expect(store.all()).toHaveLength(2);
  });
});

describe('submitBookingQcCheckAction — write failure and governance-partial', () => {
  it('maps a raw store write failure to the shared safe message', async () => {
    const failingStore = {
      createCheckRecord: async () => ({ success: false, error: 'Row lock timeout on cr664_bookingqccheck.' }),
      listChecksForDeal: async () => ({ success: true, records: [] }),
    };
    const outcome = await submitBookingQcCheckAction(baseInput(), failingStore, resolvedActor);
    expect(outcome.kind).toBe('write-failed');
    if (outcome.kind === 'write-failed') {
      expect(outcome.error).not.toContain('Row lock timeout');
      expect(outcome.error).toContain("We couldn't save that action");
    }
  });

  it('reports governance-partial (record IS persisted) when the audit write fails', async () => {
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: 'audit boom' } });
    const store = createInMemoryBookingQcCheckStore();
    const outcome = await submitBookingQcCheckAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain('audit boom');
      expect(outcome.auditError).toContain("We couldn't save that action");
    }
    expect(store.all()).toHaveLength(1);
  });
});
