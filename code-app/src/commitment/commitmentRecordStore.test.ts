import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CommitmentRecord } from '../workflow/commitmentRecordTypes';

const { createMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_commitmentrecordsService', () => ({
  get Cr664_commitmentrecordsService() {
    return { create: createMock, getAll: getAllMock };
  },
}));

import {
  createDataverseCommitmentStore,
  createInMemoryCommitmentStore,
  __internal,
} from './commitmentRecordStore';

const { mapRowToCommitment, commitmentToRow } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_commitmentid: 'cmt-1',
    cr664_dealid: 'deal-1',
    cr664_commitmentstatus: 'ISSUED',
    cr664_approvedamount: 500000,
    cr664_approvedproduct: 'SBA 7(a)',
    cr664_approvedtermmonths: 84,
    cr664_approvedpricing: 'Prime + 2.00%',
    cr664_keytermssummary: 'Term loan, monthly P&I, standard covenants.',
    cr664_expirationdate: '2026-08-24T00:00:00.000Z',
    cr664_issuedby: 'banker@bank.test',
    cr664_issuedat: '2026-07-24T10:00:00.000Z',
    cr664_respondedby: undefined,
    cr664_respondedat: undefined,
    cr664_declinereason: undefined,
    cr664_correlationid: 'cmt-corr-1',
    cr664_supersedescommitmentid: undefined,
    ...overrides,
  };
}

function fullRecord(overrides: Partial<CommitmentRecord> = {}): CommitmentRecord {
  return {
    commitmentId: 'cmt-1',
    dealId: 'deal-1',
    status: 'ISSUED',
    approvedAmount: 500000,
    approvedProduct: 'SBA 7(a)',
    approvedTermMonths: 84,
    approvedPricing: 'Prime + 2.00%',
    keyTermsSummary: 'Term loan, monthly P&I, standard covenants.',
    expirationDateIso: '2026-08-24T00:00:00.000Z',
    issuedByActorEmail: 'banker@bank.test',
    issuedAtIso: '2026-07-24T10:00:00.000Z',
    respondedByActorEmail: undefined,
    respondedAtIso: undefined,
    declineReason: undefined,
    correlationId: 'cmt-corr-1',
    supersedesCommitmentId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  getAllMock.mockReset();
});

describe('commitmentRecordStore — row <-> record mapping', () => {
  it('maps a well-formed Dataverse row to the domain record', () => {
    const result = mapRowToCommitment(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullRecord());
  });

  it('carries supersedesCommitmentId through when present', () => {
    const result = mapRowToCommitment(fullRow({ cr664_supersedescommitmentid: 'cmt-0' }) as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supersedesCommitmentId).toBe('cmt-0');
  });

  it('fails closed on an unrecognized commitment status rather than fabricating one', () => {
    const result = mapRowToCommitment(fullRow({ cr664_commitmentstatus: 'MADE_UP_STATUS' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when a required field is missing (dealId)', () => {
    const result = mapRowToCommitment(fullRow({ cr664_dealid: undefined }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when keyTermsSummary is missing', () => {
    const result = mapRowToCommitment(fullRow({ cr664_keytermssummary: undefined }) as never);
    expect(result.ok).toBe(false);
  });

  it('round-trips record -> row -> record for every field', () => {
    const record = fullRecord();
    const row = commitmentToRow(record);
    const remapped = mapRowToCommitment(row as never);
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(remapped.value).toEqual(record);
  });
});

describe('createInMemoryCommitmentStore', () => {
  it('creates and lists records scoped to their deal (reload/readback proof within a session)', async () => {
    const store = createInMemoryCommitmentStore();
    await store.createCommitmentRecord(fullRecord({ commitmentId: 'cmt-1', dealId: 'deal-1' }));
    await store.createCommitmentRecord(fullRecord({ commitmentId: 'cmt-2', dealId: 'deal-2' }));

    const forDeal1 = await store.listCommitmentsForDeal('deal-1');
    expect(forDeal1.success).toBe(true);
    expect(forDeal1.commitments?.map((c) => c.commitmentId)).toEqual(['cmt-1']);
    expect(store.all()).toHaveLength(2);
  });
});

describe('createDataverseCommitmentStore', () => {
  it('creates a record via the generated service with the correct payload', async () => {
    createMock.mockResolvedValueOnce({ success: true, data: { cr664_commitmentrecordid: 'row-1' } });
    const store = createDataverseCommitmentStore();
    const result = await store.createCommitmentRecord(fullRecord());
    expect(result.success).toBe(true);
    expect(result.id).toBe('cmt-1');
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_commitmentid).toBe('cmt-1');
    expect(payload.cr664_dealid).toBe('deal-1');
    expect(payload.cr664_commitmentstatus).toBe('ISSUED');
  });

  it('fails closed (never fabricates success) when the create call reports non-success', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: { message: 'Row lock timeout.' } });
    const store = createDataverseCommitmentStore();
    const result = await store.createCommitmentRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Row lock timeout');
  });

  it('fails closed when the create call throws', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const store = createDataverseCommitmentStore();
    const result = await store.createCommitmentRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('lists a deal-filtered set of commitments, skipping any malformed sibling row rather than failing the whole list', async () => {
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [fullRow(), fullRow({ cr664_commitmentid: 'cmt-2', cr664_commitmentstatus: 'NOT_A_REAL_STATUS' })],
    });
    const store = createDataverseCommitmentStore();
    const result = await store.listCommitmentsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.commitments).toHaveLength(1);
    expect(result.commitments?.[0]!.commitmentId).toBe('cmt-1');
    const filter = getAllMock.mock.calls[0]![0] as { filter?: string };
    expect(filter.filter).toContain("cr664_dealid eq 'deal-1'");
  });

  it('fails closed on a non-success list read', async () => {
    getAllMock.mockResolvedValueOnce({ success: false, error: { message: 'read denied' } });
    const store = createDataverseCommitmentStore();
    const result = await store.listCommitmentsForDeal('deal-1');
    expect(result.success).toBe(false);
  });
});
