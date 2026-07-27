import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CreditApprovalDecisionRecord } from '../workflow/creditApprovalDecisionTypes';

const { createMock, getAllMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_creditapprovaldecisionsService', () => ({
  get Cr664_creditapprovaldecisionsService() {
    return { create: createMock, getAll: getAllMock };
  },
}));

import {
  createDataverseCreditApprovalDecisionStore,
  createInMemoryCreditApprovalDecisionStore,
  __internal,
} from './creditApprovalDecisionStore';

const { mapRowToDecision, decisionToRow } = __internal;

function fullRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_decisionid: 'cad-1',
    cr664_dealid: 'deal-1',
    cr664_decisionstatus: 'APPROVED',
    cr664_approvedamount: 500000,
    cr664_approvedproduct: 'SBA 7(a)',
    cr664_approvedtermmonths: 84,
    cr664_approvedpricing: 'Prime + 2.00%',
    cr664_collateralsummary: 'UCC-1 on all business assets.',
    cr664_conditionsjson: JSON.stringify(['Executed loan agreement', 'Insurance evidence on file']),
    cr664_authoritytier: 'committee',
    cr664_rationale: 'DSCR and collateral coverage support approval.',
    cr664_requestedby: 'banker@bank.test',
    cr664_requestedat: '2026-07-24T10:00:00.000Z',
    cr664_decidedby: 'committee-member@bank.test',
    cr664_decidedat: '2026-07-24T12:00:00.000Z',
    cr664_correlationid: 'ca-corr-1',
    cr664_supersedesdecisionid: undefined,
    ...overrides,
  };
}

function fullRecord(overrides: Partial<CreditApprovalDecisionRecord> = {}): CreditApprovalDecisionRecord {
  return {
    decisionId: 'cad-1',
    dealId: 'deal-1',
    status: 'APPROVED',
    approvedAmount: 500000,
    approvedProduct: 'SBA 7(a)',
    approvedTermMonths: 84,
    approvedPricing: 'Prime + 2.00%',
    collateralSummary: 'UCC-1 on all business assets.',
    conditions: ['Executed loan agreement', 'Insurance evidence on file'],
    authorityTier: 'committee',
    rationale: 'DSCR and collateral coverage support approval.',
    requestedByActorEmail: 'banker@bank.test',
    requestedAtIso: '2026-07-24T10:00:00.000Z',
    decidedByActorEmail: 'committee-member@bank.test',
    decidedAtIso: '2026-07-24T12:00:00.000Z',
    correlationId: 'ca-corr-1',
    supersedesDecisionId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockReset();
  getAllMock.mockReset();
});

describe('creditApprovalDecisionStore — row <-> record mapping', () => {
  it('maps a well-formed Dataverse row to the domain record', () => {
    const result = mapRowToDecision(fullRow() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(fullRecord());
  });

  it('carries supersedesDecisionId through when present', () => {
    const result = mapRowToDecision(fullRow({ cr664_supersedesdecisionid: 'cad-0' }) as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supersedesDecisionId).toBe('cad-0');
  });

  it('defaults conditions to an empty array (never fabricates a condition) when JSON is absent', () => {
    const result = mapRowToDecision(fullRow({ cr664_conditionsjson: undefined }) as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conditions).toEqual([]);
  });

  it('fails closed on an unrecognized decision status rather than fabricating one', () => {
    const result = mapRowToDecision(fullRow({ cr664_decisionstatus: 'MADE_UP_STATUS' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed on malformed conditions JSON (not a string array)', () => {
    const result = mapRowToDecision(fullRow({ cr664_conditionsjson: JSON.stringify({ not: 'an array' }) }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed on invalid JSON in the conditions column', () => {
    const result = mapRowToDecision(fullRow({ cr664_conditionsjson: '{not valid json' }) as never);
    expect(result.ok).toBe(false);
  });

  it('fails closed when a required field is missing (dealId)', () => {
    const result = mapRowToDecision(fullRow({ cr664_dealid: undefined }) as never);
    expect(result.ok).toBe(false);
  });

  it('round-trips record -> row -> record for every field', () => {
    const record = fullRecord();
    const row = decisionToRow(record);
    const remapped = mapRowToDecision(row as never);
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(remapped.value).toEqual(record);
  });
});

describe('createInMemoryCreditApprovalDecisionStore', () => {
  it('creates and lists records scoped to their deal (reload/readback proof within a session)', async () => {
    const store = createInMemoryCreditApprovalDecisionStore();
    await store.createDecisionRecord(fullRecord({ decisionId: 'cad-1', dealId: 'deal-1' }));
    await store.createDecisionRecord(fullRecord({ decisionId: 'cad-2', dealId: 'deal-2' }));

    const forDeal1 = await store.listDecisionsForDeal('deal-1');
    expect(forDeal1.success).toBe(true);
    expect(forDeal1.decisions?.map((d) => d.decisionId)).toEqual(['cad-1']);
    expect(store.all()).toHaveLength(2);
  });
});

describe('createDataverseCreditApprovalDecisionStore', () => {
  it('creates a record via the generated service with the correct payload', async () => {
    createMock.mockResolvedValueOnce({ success: true, data: { cr664_creditapprovaldecisionid: 'row-1' } });
    const store = createDataverseCreditApprovalDecisionStore();
    const result = await store.createDecisionRecord(fullRecord());
    expect(result.success).toBe(true);
    expect(result.id).toBe('cad-1');
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_decisionid).toBe('cad-1');
    expect(payload.cr664_dealid).toBe('deal-1');
    expect(payload.cr664_decisionstatus).toBe('APPROVED');
    expect(JSON.parse(payload.cr664_conditionsjson as string)).toEqual([
      'Executed loan agreement',
      'Insurance evidence on file',
    ]);
  });

  it('fails closed (never fabricates success) when the create call reports non-success', async () => {
    createMock.mockResolvedValueOnce({ success: false, error: { message: 'Row lock timeout.' } });
    const store = createDataverseCreditApprovalDecisionStore();
    const result = await store.createDecisionRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Row lock timeout');
  });

  it('fails closed when the create call throws', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const store = createDataverseCreditApprovalDecisionStore();
    const result = await store.createDecisionRecord(fullRecord());
    expect(result.success).toBe(false);
    expect(result.error).toContain('network down');
  });

  it('lists a deal-filtered set of decisions, skipping any malformed sibling row rather than failing the whole list', async () => {
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [fullRow(), fullRow({ cr664_decisionid: 'cad-2', cr664_decisionstatus: 'NOT_A_REAL_STATUS' })],
    });
    const store = createDataverseCreditApprovalDecisionStore();
    const result = await store.listDecisionsForDeal('deal-1');
    expect(result.success).toBe(true);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions?.[0]!.decisionId).toBe('cad-1');
    const filter = getAllMock.mock.calls[0]![0] as { filter?: string };
    expect(filter.filter).toContain("cr664_dealid eq 'deal-1'");
  });

  it('fails closed on a non-success list read', async () => {
    getAllMock.mockResolvedValueOnce({ success: false, error: { message: 'read denied' } });
    const store = createDataverseCreditApprovalDecisionStore();
    const result = await store.listDecisionsForDeal('deal-1');
    expect(result.success).toBe(false);
  });
});
