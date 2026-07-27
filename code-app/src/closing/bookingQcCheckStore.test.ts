import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BookingQcCheckRecord } from '../workflow/bookingQcCheckTypes';

const { createMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_bookingqcchecksService', () => ({
  get Cr664_bookingqcchecksService() {
    return { create: createMock, getAll: getAllMock };
  },
}));

import { createDataverseBookingQcCheckStore, createInMemoryBookingQcCheckStore, __internal } from './bookingQcCheckStore';

const { mapRowToCheck, checkToRow } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_checkid: 'qc-1',
    cr664_dealid: 'deal-1',
    cr664_qcstatus: 'PASSED',
    cr664_notes: 'Booking package reviewed; all fields match executed documents.',
    cr664_reviewedby: 'loanops@bank.test',
    cr664_reviewedat: '2026-07-24T10:00:00.000Z',
    cr664_correlationid: 'qc-corr-1',
    cr664_supersedescheckid: undefined,
    ...overrides,
  };
}

function fullRecord(overrides: Partial<BookingQcCheckRecord> = {}): BookingQcCheckRecord {
  return {
    checkId: 'qc-1',
    dealId: 'deal-1',
    status: 'PASSED',
    notes: 'Booking package reviewed; all fields match executed documents.',
    reviewedByActorEmail: 'loanops@bank.test',
    reviewedAtIso: '2026-07-24T10:00:00.000Z',
    correlationId: 'qc-corr-1',
    supersedesCheckId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  getAllMock.mockReset();
});

describe('bookingQcCheckStore — row <-> record mapping', () => {
  it('maps a well-formed Dataverse row to the domain record', () => {
    const result = mapRowToCheck(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullRecord());
  });

  it('fails closed on an unrecognized status rather than fabricating one', () => {
    const result = mapRowToCheck(fullRow({ cr664_qcstatus: 'MADE_UP' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when a required field is missing (dealId)', () => {
    const result = mapRowToCheck(fullRow({ cr664_dealid: undefined }) as never);
    expect(result.ok).toBe(false);
  });

  it('round-trips record -> row -> record for every field', () => {
    const record = fullRecord();
    const row = checkToRow(record);
    const remapped = mapRowToCheck(row as never);
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(remapped.value).toEqual(record);
  });
});

describe('createInMemoryBookingQcCheckStore', () => {
  it('creates and lists records scoped to their deal (reload/readback proof within a session)', async () => {
    const store = createInMemoryBookingQcCheckStore();
    await store.createCheckRecord(fullRecord({ checkId: 'qc-1', dealId: 'deal-1' }));
    await store.createCheckRecord(fullRecord({ checkId: 'qc-2', dealId: 'deal-2' }));

    const forDeal1 = await store.listChecksForDeal('deal-1');
    expect(forDeal1.success).toBe(true);
    expect(forDeal1.records?.map((r) => r.checkId)).toEqual(['qc-1']);
    expect(store.all()).toHaveLength(2);
  });
});

describe('createDataverseBookingQcCheckStore', () => {
  it('creates a record via the generated service with the correct payload', async () => {
    createMock.mockResolvedValueOnce({ success: true, data: { cr664_bookingqccheckid: 'row-1' } });
    const store = createDataverseBookingQcCheckStore();
    const result = await store.createCheckRecord(fullRecord());
    expect(result.success).toBe(true);
    expect(result.id).toBe('qc-1');
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_checkid).toBe('qc-1');
    expect(payload.cr664_dealid).toBe('deal-1');
    expect(payload.cr664_qcstatus).toBe('PASSED');
  });

  it('fails closed (never fabricates success) when the create call reports non-success', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: { message: 'Row lock timeout.' } });
    const store = createDataverseBookingQcCheckStore();
    const result = await store.createCheckRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Row lock timeout');
  });

  it('fails closed when the create call throws', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const store = createDataverseBookingQcCheckStore();
    const result = await store.createCheckRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('lists a deal-filtered set of records, skipping any malformed sibling row rather than failing the whole list', async () => {
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [fullRow(), fullRow({ cr664_checkid: 'qc-2', cr664_qcstatus: 'NOT_A_REAL_STATUS' })],
    });
    const store = createDataverseBookingQcCheckStore();
    const result = await store.listChecksForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records?.[0]!.checkId).toBe('qc-1');
    const filter = getAllMock.mock.calls[0]![0] as { filter?: string };
    expect(filter.filter).toContain("cr664_dealid eq 'deal-1'");
  });

  it('fails closed on a non-success list read', async () => {
    getAllMock.mockResolvedValueOnce({ success: false, error: { message: 'read denied' } });
    const store = createDataverseBookingQcCheckStore();
    const result = await store.listChecksForDeal('deal-1');
    expect(result.success).toBe(false);
  });
});
