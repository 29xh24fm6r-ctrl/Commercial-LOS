import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutedDocumentAttestationRecord } from '../workflow/executedDocumentAttestationTypes';

const { createMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_executeddocattestationsService', () => ({
  get Cr664_executeddocattestationsService() {
    return { create: createMock, getAll: getAllMock };
  },
}));

import {
  createDataverseExecutedDocumentAttestationStore,
  createInMemoryExecutedDocumentAttestationStore,
  __internal,
} from './executedDocumentAttestationStore';

const { mapRowToAttestation, attestationToRow } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_attestationid: 'edc-1',
    cr664_dealid: 'deal-1',
    cr664_attestationstatus: 'ATTESTED',
    cr664_executeddate: '2026-07-20T00:00:00.000Z',
    cr664_notes: 'All documents executed at closing table, originals retained.',
    cr664_attestedby: 'closer@bank.test',
    cr664_attestedat: '2026-07-24T10:00:00.000Z',
    cr664_correlationid: 'edc-corr-1',
    cr664_supersedesattestationid: undefined,
    ...overrides,
  };
}

function fullRecord(overrides: Partial<ExecutedDocumentAttestationRecord> = {}): ExecutedDocumentAttestationRecord {
  return {
    attestationId: 'edc-1',
    dealId: 'deal-1',
    status: 'ATTESTED',
    executedDateIso: '2026-07-20T00:00:00.000Z',
    notes: 'All documents executed at closing table, originals retained.',
    attestedByActorEmail: 'closer@bank.test',
    attestedAtIso: '2026-07-24T10:00:00.000Z',
    correlationId: 'edc-corr-1',
    supersedesAttestationId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  getAllMock.mockReset();
});

describe('executedDocumentAttestationStore — row <-> record mapping', () => {
  it('maps a well-formed Dataverse row to the domain record', () => {
    const result = mapRowToAttestation(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullRecord());
  });

  it('fails closed on an unrecognized status rather than fabricating one', () => {
    const result = mapRowToAttestation(fullRow({ cr664_attestationstatus: 'MADE_UP' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when a required field is missing (executedDate)', () => {
    const result = mapRowToAttestation(fullRow({ cr664_executeddate: undefined }) as never);
    expect(result.ok).toBe(false);
  });

  it('round-trips record -> row -> record for every field', () => {
    const record = fullRecord();
    const row = attestationToRow(record);
    const remapped = mapRowToAttestation(row as never);
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(remapped.value).toEqual(record);
  });
});

describe('createInMemoryExecutedDocumentAttestationStore', () => {
  it('creates and lists records scoped to their deal (reload/readback proof within a session)', async () => {
    const store = createInMemoryExecutedDocumentAttestationStore();
    await store.createAttestationRecord(fullRecord({ attestationId: 'edc-1', dealId: 'deal-1' }));
    await store.createAttestationRecord(fullRecord({ attestationId: 'edc-2', dealId: 'deal-2' }));

    const forDeal1 = await store.listAttestationsForDeal('deal-1');
    expect(forDeal1.success).toBe(true);
    expect(forDeal1.records?.map((r) => r.attestationId)).toEqual(['edc-1']);
    expect(store.all()).toHaveLength(2);
  });
});

describe('createDataverseExecutedDocumentAttestationStore', () => {
  it('creates a record via the generated service with the correct payload', async () => {
    createMock.mockResolvedValueOnce({ success: true, data: { cr664_executeddocattestationid: 'row-1' } });
    const store = createDataverseExecutedDocumentAttestationStore();
    const result = await store.createAttestationRecord(fullRecord());
    expect(result.success).toBe(true);
    expect(result.id).toBe('edc-1');
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_attestationid).toBe('edc-1');
    expect(payload.cr664_dealid).toBe('deal-1');
    expect(payload.cr664_attestationstatus).toBe('ATTESTED');
  });

  it('fails closed (never fabricates success) when the create call reports non-success', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: { message: 'Row lock timeout.' } });
    const store = createDataverseExecutedDocumentAttestationStore();
    const result = await store.createAttestationRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Row lock timeout');
  });

  it('fails closed when the create call throws', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const store = createDataverseExecutedDocumentAttestationStore();
    const result = await store.createAttestationRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('lists a deal-filtered set of records, skipping any malformed sibling row rather than failing the whole list', async () => {
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [fullRow(), fullRow({ cr664_attestationid: 'edc-2', cr664_attestationstatus: 'NOT_A_REAL_STATUS' })],
    });
    const store = createDataverseExecutedDocumentAttestationStore();
    const result = await store.listAttestationsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records?.[0]!.attestationId).toBe('edc-1');
    const filter = getAllMock.mock.calls[0]![0] as { filter?: string };
    expect(filter.filter).toContain("cr664_dealid eq 'deal-1'");
  });

  it('fails closed on a non-success list read', async () => {
    getAllMock.mockResolvedValueOnce({ success: false, error: { message: 'read denied' } });
    const store = createDataverseExecutedDocumentAttestationStore();
    const result = await store.listAttestationsForDeal('deal-1');
    expect(result.success).toBe(false);
  });
});
