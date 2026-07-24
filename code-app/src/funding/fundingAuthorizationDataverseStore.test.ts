import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

const { createMock, updateMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_fundingauthorizationsService', () => ({
  get Cr664_fundingauthorizationsService() {
    return { create: createMock, update: updateMock, getAll: getAllMock };
  },
}));

import { createDataverseFundingAuthorizationStore, __internal } from './fundingAuthorizationDataverseStore';

const { mapRowToRecord } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_recordid: 'farec-1',
    cr664_dealid: 'deal-1',
    cr664_authorizationstatus: 'PENDING',
    cr664_requestedamount: 250000,
    cr664_approvedamount: undefined,
    cr664_fundingdate: undefined,
    cr664_fundingmethod: 'Wire',
    cr664_destinationverificationstatus: 'unverified',
    cr664_conditionssatisfied: false,
    cr664_exceptionsjson: '[]',
    cr664_authorizedby: undefined,
    cr664_secondapprovedby: undefined,
    cr664_requestedby: 'requester@bank.test',
    cr664_requestedat: '2026-07-24T10:00:00.000Z',
    cr664_authorizedat: undefined,
    cr664_correlationid: 'fa-corr-1',
    cr664_supportingdocumentidsjson: '[]',
    cr664_auditeventidsjson: '[]',
    cr664_supersedesrecordid: undefined,
    ...overrides,
  };
}

function fullRecord(overrides: Partial<FundingAuthorizationRecord> = {}): FundingAuthorizationRecord {
  return {
    dealId: 'deal-1',
    authorizationStatus: 'PENDING',
    requestedAmount: 250000,
    fundingMethod: 'Wire',
    destinationVerificationStatus: 'unverified',
    conditionsSatisfied: false,
    exceptions: [],
    requestedBy: 'requester@bank.test',
    requestedAt: '2026-07-24T10:00:00.000Z',
    correlationId: 'fa-corr-1',
    supportingDocumentIds: [],
    auditEventIds: [],
    recordId: 'farec-1',
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  getAllMock.mockReset();
});

describe('fundingAuthorizationDataverseStore — row <-> record mapping', () => {
  it('maps a well-formed Dataverse row to the domain record', () => {
    const result = mapRowToRecord(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullRecord());
  });

  it('decodes exceptions / supportingDocumentIds / auditEventIds JSON columns', () => {
    const row = fullRow({
      cr664_exceptionsjson: JSON.stringify([{ id: 'ex-1', description: 'Missing insurance cert', resolved: false }]),
      cr664_supportingdocumentidsjson: JSON.stringify(['doc-1', 'doc-2']),
      cr664_auditeventidsjson: JSON.stringify(['audit-1']),
    });
    const result = mapRowToRecord(row as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exceptions).toEqual([{ id: 'ex-1', description: 'Missing insurance cert', resolved: false }]);
    expect(result.value.supportingDocumentIds).toEqual(['doc-1', 'doc-2']);
    expect(result.value.auditEventIds).toEqual(['audit-1']);
  });

  it('fails closed on malformed exceptions JSON rather than fabricating an empty/partial list', () => {
    const row = fullRow({ cr664_exceptionsjson: '{not valid json' });
    const result = mapRowToRecord(row as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not valid json/i);
  });

  it('fails closed on an exceptions entry missing a required field', () => {
    const row = fullRow({ cr664_exceptionsjson: JSON.stringify([{ id: 'ex-1', description: 'x' }]) }); // missing `resolved`
    const result = mapRowToRecord(row as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed on an unrecognized authorization status', () => {
    const row = fullRow({ cr664_authorizationstatus: 'SOMETHING_MADE_UP' });
    const result = mapRowToRecord(row as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unrecognized authorization status/i);
  });

  it('fails closed on a missing requestedAmount', () => {
    const row = fullRow({ cr664_requestedamount: undefined });
    const result = mapRowToRecord(row as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed on a missing cr664_dealid', () => {
    const row = fullRow({ cr664_dealid: undefined });
    const result = mapRowToRecord(row as never);
    expect(result.ok).toBe(false);
  });
});

describe('fundingAuthorizationDataverseStore — createRecord', () => {
  it('persists a new request via a genuine Dataverse create, mapping every field', async () => {
    createMock.mockResolvedValue({ success: true, data: { cr664_fundingauthorizationid: 'row-guid-1' } });
    const store = createDataverseFundingAuthorizationStore();
    const record = fullRecord();

    const result = await store.createRecord(record);

    expect(result.success).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0]![0];
    expect(payload).toMatchObject({
      cr664_recordid: 'farec-1',
      cr664_dealid: 'deal-1',
      cr664_authorizationstatus: 'PENDING',
      cr664_requestedamount: 250000,
      cr664_destinationverificationstatus: 'unverified',
      cr664_conditionssatisfied: false,
      cr664_requestedby: 'requester@bank.test',
      cr664_requestedat: '2026-07-24T10:00:00.000Z',
      cr664_correlationid: 'fa-corr-1',
    });
    expect(JSON.parse(payload.cr664_exceptionsjson)).toEqual([]);
  });

  it('surfaces a create failure honestly rather than reporting success', async () => {
    createMock.mockResolvedValue({ success: false, error: { message: 'Duplicate key.' } });
    const store = createDataverseFundingAuthorizationStore();
    const result = await store.createRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/duplicate key/i);
  });

  it('catches a thrown create call and reports it rather than letting it reject uncaught', async () => {
    createMock.mockRejectedValue(new Error('network down'));
    const store = createDataverseFundingAuthorizationStore();
    const result = await store.createRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network down/i);
  });
});

describe('fundingAuthorizationDataverseStore — updateRecord (approval / rejection / revocation)', () => {
  it('resolves the existing row by cr664_recordid, then updates it (approval)', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [{ cr664_fundingauthorizationid: 'row-guid-1' }] });
    updateMock.mockResolvedValue({ success: true });
    const store = createDataverseFundingAuthorizationStore();

    const approved = fullRecord({ authorizationStatus: 'APPROVED', approvedAmount: 250000, authorizedBy: 'approver@bank.test', authorizedAt: '2026-07-24T11:00:00.000Z' });
    const result = await store.updateRecord(approved);

    expect(result.success).toBe(true);
    expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({ filter: `cr664_recordid eq 'farec-1'` }));
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [rowId, changedFields] = updateMock.mock.calls[0]!;
    expect(rowId).toBe('row-guid-1');
    expect(changedFields).toMatchObject({ cr664_authorizationstatus: 'APPROVED', cr664_approvedamount: 250000, cr664_authorizedby: 'approver@bank.test' });
  });

  it('persists a rejection the same way (status flips to REJECTED)', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [{ cr664_fundingauthorizationid: 'row-guid-1' }] });
    updateMock.mockResolvedValue({ success: true });
    const store = createDataverseFundingAuthorizationStore();

    const rejected = fullRecord({ authorizationStatus: 'REJECTED' });
    const result = await store.updateRecord(rejected);

    expect(result.success).toBe(true);
    const [, changedFields] = updateMock.mock.calls[0]!;
    expect(changedFields).toMatchObject({ cr664_authorizationstatus: 'REJECTED' });
  });

  it('persists a revocation the same way (status flips to REVOKED)', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [{ cr664_fundingauthorizationid: 'row-guid-1' }] });
    updateMock.mockResolvedValue({ success: true });
    const store = createDataverseFundingAuthorizationStore();

    const revoked = fullRecord({ authorizationStatus: 'REVOKED' });
    const result = await store.updateRecord(revoked);

    expect(result.success).toBe(true);
    const [, changedFields] = updateMock.mock.calls[0]!;
    expect(changedFields).toMatchObject({ cr664_authorizationstatus: 'REVOKED' });
  });

  it('fails closed when no existing row matches the record id', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    const store = createDataverseFundingAuthorizationStore();
    const result = await store.updateRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no existing funding authorization row/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('fails closed when the record id ambiguously matches more than one row', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [{ cr664_fundingauthorizationid: 'row-guid-1' }, { cr664_fundingauthorizationid: 'row-guid-2' }],
    });
    const store = createDataverseFundingAuthorizationStore();
    const result = await store.updateRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ambiguous/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('surfaces an update-call failure honestly', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [{ cr664_fundingauthorizationid: 'row-guid-1' }] });
    updateMock.mockResolvedValue({ success: false, error: { message: 'Row lock timeout.' } });
    const store = createDataverseFundingAuthorizationStore();
    const result = await store.updateRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/row lock timeout/i);
  });
});

describe('fundingAuthorizationDataverseStore — getCurrentRecordForDeal', () => {
  it('scopes the query to the exact deal id', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    const store = createDataverseFundingAuthorizationStore();
    await store.getCurrentRecordForDeal('deal-xyz');
    expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({ filter: `cr664_dealid eq 'deal-xyz'` }));
  });

  it('escapes a single quote in the deal id to prevent OData filter injection', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    const store = createDataverseFundingAuthorizationStore();
    await store.getCurrentRecordForDeal("deal-o'brien");
    expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({ filter: `cr664_dealid eq 'deal-o''brien'` }));
  });

  it('selects the latest non-superseded record as "current" — a supersession chain of 3 resolves to the newest', async () => {
    const revoked = fullRow({ cr664_recordid: 'farec-1', cr664_authorizationstatus: 'REVOKED', cr664_requestedat: '2026-07-20T00:00:00.000Z' });
    const rejectedRetry = fullRow({
      cr664_recordid: 'farec-2',
      cr664_authorizationstatus: 'REJECTED',
      cr664_requestedat: '2026-07-22T00:00:00.000Z',
      cr664_supersedesrecordid: 'farec-1',
    });
    const currentPending = fullRow({
      cr664_recordid: 'farec-3',
      cr664_authorizationstatus: 'PENDING',
      cr664_requestedat: '2026-07-24T00:00:00.000Z',
      cr664_supersedesrecordid: 'farec-2',
    });
    getAllMock.mockResolvedValue({ success: true, data: [revoked, rejectedRetry, currentPending] });
    const store = createDataverseFundingAuthorizationStore();

    const result = await store.getCurrentRecordForDeal('deal-1');

    expect(result.success).toBe(true);
    expect(result.record?.recordId).toBe('farec-3');
  });

  it('the entire deal history is preserved — superseded records are never deleted, only excluded from "current"', async () => {
    const revoked = fullRow({ cr664_recordid: 'farec-1', cr664_authorizationstatus: 'REVOKED', cr664_requestedat: '2026-07-20T00:00:00.000Z' });
    const currentPending = fullRow({
      cr664_recordid: 'farec-2',
      cr664_authorizationstatus: 'PENDING',
      cr664_requestedat: '2026-07-22T00:00:00.000Z',
      cr664_supersedesrecordid: 'farec-1',
    });
    getAllMock.mockResolvedValue({ success: true, data: [revoked, currentPending] });
    const store = createDataverseFundingAuthorizationStore();

    // getAll (not this adapter's own read path) still reports both rows exist — the adapter itself
    // never deletes or mutates the superseded row when computing "current."
    expect(getAllMock).not.toHaveBeenCalled();
    await store.getCurrentRecordForDeal('deal-1');
    expect(getAllMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a read failure honestly rather than reporting an empty/undefined record', async () => {
    getAllMock.mockResolvedValue({ success: false, error: { message: 'Timeout retrieving records.' } });
    const store = createDataverseFundingAuthorizationStore();
    const result = await store.getCurrentRecordForDeal('deal-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timeout retrieving records/i);
  });

  it('catches a thrown read call', async () => {
    getAllMock.mockRejectedValue(new Error('SDK exploded'));
    const store = createDataverseFundingAuthorizationStore();
    const result = await store.getCurrentRecordForDeal('deal-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sdk exploded/i);
  });

  it('fails the ENTIRE read when a single row in the deal history is malformed, rather than silently dropping it', async () => {
    const good = fullRow({ cr664_recordid: 'farec-1' });
    const malformed = fullRow({ cr664_recordid: 'farec-2', cr664_exceptionsjson: 'not-json-at-all' });
    getAllMock.mockResolvedValue({ success: true, data: [good, malformed] });
    const store = createDataverseFundingAuthorizationStore();

    const result = await store.getCurrentRecordForDeal('deal-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/farec-2/);
  });
});
