import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdverseActionRecord } from '../workflow/adverseActionRecordTypes';

const { createMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_adverseactionrecordsService', () => ({
  get Cr664_adverseactionrecordsService() {
    return { create: createMock, getAll: getAllMock };
  },
}));

import { createDataverseAdverseActionRecordStore, createInMemoryAdverseActionRecordStore, __internal } from './adverseActionRecordStore';

const { mapRowToRecord, recordToRow } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_recordid: 'aa-1',
    cr664_dealid: 'deal-1',
    cr664_actionstatus: 'SENT',
    cr664_notes: 'Adverse action notice mailed to applicant on file.',
    cr664_recordedby: 'creditofficer@bank.test',
    cr664_recordedat: '2026-07-26T10:00:00.000Z',
    cr664_correlationid: 'aa-corr-1',
    cr664_supersedesrecordid: undefined,
    ...overrides,
  };
}

function fullRecord(overrides: Partial<AdverseActionRecord> = {}): AdverseActionRecord {
  return {
    recordId: 'aa-1',
    dealId: 'deal-1',
    status: 'SENT',
    notes: 'Adverse action notice mailed to applicant on file.',
    recordedByActorEmail: 'creditofficer@bank.test',
    recordedAtIso: '2026-07-26T10:00:00.000Z',
    correlationId: 'aa-corr-1',
    supersedesRecordId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  getAllMock.mockReset();
});

describe('adverseActionRecordStore — row <-> record mapping', () => {
  it('maps a well-formed Dataverse row to the domain record', () => {
    const result = mapRowToRecord(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullRecord());
  });

  it('fails closed on an unrecognized status rather than fabricating one', () => {
    const result = mapRowToRecord(fullRow({ cr664_actionstatus: 'MADE_UP' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when a required field is missing (dealId)', () => {
    const result = mapRowToRecord(fullRow({ cr664_dealid: undefined }) as never);
    expect(result.ok).toBe(false);
  });

  it('round-trips record -> row -> record for every field', () => {
    const record = fullRecord();
    const row = recordToRow(record);
    const remapped = mapRowToRecord(row as never);
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(remapped.value).toEqual(record);
  });
});

describe('createInMemoryAdverseActionRecordStore', () => {
  it('creates and lists records scoped to their deal (reload/readback proof within a session)', async () => {
    const store = createInMemoryAdverseActionRecordStore();
    await store.createRecord(fullRecord({ recordId: 'aa-1', dealId: 'deal-1' }));
    await store.createRecord(fullRecord({ recordId: 'aa-2', dealId: 'deal-2' }));

    const forDeal1 = await store.listRecordsForDeal('deal-1');
    expect(forDeal1.success).toBe(true);
    expect(forDeal1.records?.map((r) => r.recordId)).toEqual(['aa-1']);
    expect(store.all()).toHaveLength(2);
  });
});

describe('createDataverseAdverseActionRecordStore', () => {
  it('creates a record via the generated service with the correct payload', async () => {
    createMock.mockResolvedValueOnce({ success: true, data: { cr664_adverseactionrecordid: 'row-1' } });
    const store = createDataverseAdverseActionRecordStore();
    const result = await store.createRecord(fullRecord());
    expect(result.success).toBe(true);
    expect(result.id).toBe('aa-1');
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_recordid).toBe('aa-1');
    expect(payload.cr664_dealid).toBe('deal-1');
    expect(payload.cr664_actionstatus).toBe('SENT');
  });

  it('fails closed (never fabricates success) when the create call reports non-success', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: { message: 'Row lock timeout.' } });
    const store = createDataverseAdverseActionRecordStore();
    const result = await store.createRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Row lock timeout');
  });

  it('fails closed when the create call throws', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const store = createDataverseAdverseActionRecordStore();
    const result = await store.createRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('lists a deal-filtered set of records, skipping any malformed sibling row rather than failing the whole list', async () => {
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [fullRow(), fullRow({ cr664_recordid: 'aa-2', cr664_actionstatus: 'NOT_A_REAL_STATUS' })],
    });
    const store = createDataverseAdverseActionRecordStore();
    const result = await store.listRecordsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records?.[0]!.recordId).toBe('aa-1');
    const filter = getAllMock.mock.calls[0]![0] as { filter?: string };
    expect(filter.filter).toContain("cr664_dealid eq 'deal-1'");
  });

  it('fails closed on a non-success list read', async () => {
    getAllMock.mockResolvedValueOnce({ success: false, error: { message: 'read denied' } });
    const store = createDataverseAdverseActionRecordStore();
    const result = await store.listRecordsForDeal('deal-1');
    expect(result.success).toBe(false);
  });
});
