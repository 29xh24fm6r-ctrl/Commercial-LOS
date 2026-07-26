import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConditionVerificationRecord } from '../workflow/conditionVerificationTypes';

const { createMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_conditionverificationsService', () => ({
  get Cr664_conditionverificationsService() {
    return { create: createMock, getAll: getAllMock };
  },
}));

import {
  createDataverseConditionVerificationStore,
  createInMemoryConditionVerificationStore,
  __internal,
} from './conditionVerificationStore';

const { mapRowToVerification, verificationToRow } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_recordid: 'cv-1',
    cr664_dealid: 'deal-1',
    cr664_conditiontype: 'CONDITIONS_PRECEDENT',
    cr664_verificationstatus: 'CLEARED',
    cr664_notes: 'Executed loan agreement and UCC-1 filed.',
    cr664_verifiedby: 'closer@bank.test',
    cr664_verifiedat: '2026-07-24T10:00:00.000Z',
    cr664_correlationid: 'cv-corr-1',
    cr664_supersedesrecordid: undefined,
    ...overrides,
  };
}

function fullRecord(overrides: Partial<ConditionVerificationRecord> = {}): ConditionVerificationRecord {
  return {
    recordId: 'cv-1',
    dealId: 'deal-1',
    conditionType: 'CONDITIONS_PRECEDENT',
    status: 'CLEARED',
    notes: 'Executed loan agreement and UCC-1 filed.',
    verifiedByActorEmail: 'closer@bank.test',
    verifiedAtIso: '2026-07-24T10:00:00.000Z',
    correlationId: 'cv-corr-1',
    supersedesRecordId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  getAllMock.mockReset();
});

describe('conditionVerificationStore — row <-> record mapping', () => {
  it('maps a well-formed Dataverse row to the domain record', () => {
    const result = mapRowToVerification(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullRecord());
  });

  it('fails closed on an unrecognized condition type rather than fabricating one', () => {
    const result = mapRowToVerification(fullRow({ cr664_conditiontype: 'MADE_UP_TYPE' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed on an unrecognized status rather than fabricating one', () => {
    const result = mapRowToVerification(fullRow({ cr664_verificationstatus: 'MADE_UP_STATUS' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when a required field is missing (dealId)', () => {
    const result = mapRowToVerification(fullRow({ cr664_dealid: undefined }) as never);
    expect(result.ok).toBe(false);
  });

  it('round-trips record -> row -> record for every field', () => {
    const record = fullRecord();
    const row = verificationToRow(record);
    const remapped = mapRowToVerification(row as never);
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(remapped.value).toEqual(record);
  });
});

describe('createInMemoryConditionVerificationStore', () => {
  it('creates and lists records scoped to their deal (reload/readback proof within a session)', async () => {
    const store = createInMemoryConditionVerificationStore();
    await store.createVerificationRecord(fullRecord({ recordId: 'cv-1', dealId: 'deal-1' }));
    await store.createVerificationRecord(fullRecord({ recordId: 'cv-2', dealId: 'deal-2' }));

    const forDeal1 = await store.listVerificationsForDeal('deal-1');
    expect(forDeal1.success).toBe(true);
    expect(forDeal1.records?.map((r) => r.recordId)).toEqual(['cv-1']);
    expect(store.all()).toHaveLength(2);
  });
});

describe('createDataverseConditionVerificationStore', () => {
  it('creates a record via the generated service with the correct payload', async () => {
    createMock.mockResolvedValueOnce({ success: true, data: { cr664_conditionverificationid: 'row-1' } });
    const store = createDataverseConditionVerificationStore();
    const result = await store.createVerificationRecord(fullRecord());
    expect(result.success).toBe(true);
    expect(result.id).toBe('cv-1');
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_recordid).toBe('cv-1');
    expect(payload.cr664_dealid).toBe('deal-1');
    expect(payload.cr664_conditiontype).toBe('CONDITIONS_PRECEDENT');
  });

  it('fails closed (never fabricates success) when the create call reports non-success', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: { message: 'Row lock timeout.' } });
    const store = createDataverseConditionVerificationStore();
    const result = await store.createVerificationRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Row lock timeout');
  });

  it('fails closed when the create call throws', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const store = createDataverseConditionVerificationStore();
    const result = await store.createVerificationRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('lists a deal-filtered set of records, skipping any malformed sibling row rather than failing the whole list', async () => {
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [fullRow(), fullRow({ cr664_recordid: 'cv-2', cr664_conditiontype: 'NOT_A_REAL_TYPE' })],
    });
    const store = createDataverseConditionVerificationStore();
    const result = await store.listVerificationsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records?.[0]!.recordId).toBe('cv-1');
    const filter = getAllMock.mock.calls[0]![0] as { filter?: string };
    expect(filter.filter).toContain("cr664_dealid eq 'deal-1'");
  });

  it('fails closed on a non-success list read', async () => {
    getAllMock.mockResolvedValueOnce({ success: false, error: { message: 'read denied' } });
    const store = createDataverseConditionVerificationStore();
    const result = await store.listVerificationsForDeal('deal-1');
    expect(result.success).toBe(false);
  });
});
