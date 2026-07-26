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

import {
  submitExecutedDocumentAttestationAction,
  type SubmitExecutedDocumentAttestationInput,
} from './submitExecutedDocumentAttestationAction';
import { createInMemoryExecutedDocumentAttestationStore } from './executedDocumentAttestationStore';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

/**
 * Final LOS Completion arc — Workstream F tests. Covers blank-notes/blank-date denial, invalid
 * status denial, the re-attestation chain (supersedesAttestationId), and the standard
 * valid/missing/malformed/governance-partial matrix this codebase's other governed writes are held
 * to.
 */

const resolvedActor: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(22222222-2222-2222-2222-222222222222)',
});

function baseInput(overrides: Partial<SubmitExecutedDocumentAttestationInput> = {}): SubmitExecutedDocumentAttestationInput {
  return {
    dealId: 'deal-1',
    status: 'ATTESTED',
    executedDateIso: '2026-07-20',
    notes: 'All documents executed at closing table, originals retained.',
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

describe('submitExecutedDocumentAttestationAction — happy path', () => {
  it('persists a durable record and it survives reload/readback via the store', async () => {
    const store = createInMemoryExecutedDocumentAttestationStore();
    const outcome = await submitExecutedDocumentAttestationAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.record.status).toBe('ATTESTED');

    const readback = await store.listAttestationsForDeal('deal-1');
    expect(readback.success).toBe(true);
    expect(readback.records).toHaveLength(1);
    expect(readback.records?.[0]!.attestationId).toBe(outcome.record.attestationId);
  });

  it('emits audit + timeline with the shared correlation id', async () => {
    const store = createInMemoryExecutedDocumentAttestationStore();
    await submitExecutedDocumentAttestationAction(baseInput(), store, resolvedActor);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const auditPayload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    const timelinePayload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(timelinePayload.cr664_eventsubtype).toBe(`executeddocs:attested|correlation:${auditPayload.cr664_correlationid}`);
    expect(timelinePayload.cr664_eventtype).toBe(788190002); // NoteLogged
  });
});

describe('submitExecutedDocumentAttestationAction — denials', () => {
  it('denies (no write attempted) when notes are blank', async () => {
    const store = createInMemoryExecutedDocumentAttestationStore();
    const outcome = await submitExecutedDocumentAttestationAction(baseInput({ notes: '   ' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('denies (no write attempted) when the executed date is blank', async () => {
    const store = createInMemoryExecutedDocumentAttestationStore();
    const outcome = await submitExecutedDocumentAttestationAction(baseInput({ executedDateIso: '   ' }), store, resolvedActor);
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });

  it('refuses an unrecognized status', async () => {
    const store = createInMemoryExecutedDocumentAttestationStore();
    const outcome = await submitExecutedDocumentAttestationAction(
      { ...baseInput(), status: 'MADE_UP' as never },
      store,
      resolvedActor,
    );
    expect(outcome.kind).toBe('invalid-input');
    expect(store.all()).toHaveLength(0);
  });
});

describe('submitExecutedDocumentAttestationAction — re-attestation chain', () => {
  it('chains supersedesAttestationId to the current head when correcting a prior attestation', async () => {
    const store = createInMemoryExecutedDocumentAttestationStore();
    const first = await submitExecutedDocumentAttestationAction(baseInput(), store, resolvedActor);
    expect(first.kind).toBe('success');
    if (first.kind !== 'success') return;

    const revoked = await submitExecutedDocumentAttestationAction(
      baseInput({ status: 'REVOKED', notes: 'Recorded in error -- documents were not yet executed.' }),
      store,
      resolvedActor,
    );
    expect(revoked.kind).toBe('success');
    if (revoked.kind !== 'success') return;
    expect(revoked.record.supersedesAttestationId).toBe(first.record.attestationId);
    expect(store.all()).toHaveLength(2);
  });
});

describe('submitExecutedDocumentAttestationAction — write failure and governance-partial', () => {
  it('maps a raw store write failure to the shared safe message', async () => {
    const failingStore = {
      createAttestationRecord: async () => ({ success: false, error: 'Row lock timeout on cr664_executeddocattestation.' }),
      listAttestationsForDeal: async () => ({ success: true, records: [] }),
    };
    const outcome = await submitExecutedDocumentAttestationAction(baseInput(), failingStore, resolvedActor);
    expect(outcome.kind).toBe('write-failed');
    if (outcome.kind === 'write-failed') {
      expect(outcome.error).not.toContain('Row lock timeout');
      expect(outcome.error).toContain("We couldn't save that action");
    }
  });

  it('reports governance-partial (record IS persisted) when the audit write fails', async () => {
    auditCreateMock.mockResolvedValueOnce({ success: false, error: { message: 'audit boom' } });
    const store = createInMemoryExecutedDocumentAttestationStore();
    const outcome = await submitExecutedDocumentAttestationAction(baseInput(), store, resolvedActor);
    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).not.toContain('audit boom');
      expect(outcome.auditError).toContain("We couldn't save that action");
    }
    expect(store.all()).toHaveLength(1);
  });
});
