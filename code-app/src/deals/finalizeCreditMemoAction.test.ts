import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { getAll: vi.fn(), update: vi.fn() },
}));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_creditmemodraftsectionsService } from '../generated/services/Cr664_creditmemodraftsectionsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { finalizeCreditMemoAction } from './finalizeCreditMemoAction';
import type { ResolveActorChangedBy } from './newDealAuditActorResolver';

const memoGetAll = vi.mocked(Cr664_creditmemo1sService.getAll);
const memoUpdate = vi.mocked(Cr664_creditmemo1sService.update);
const sectionGetAll = vi.mocked(Cr664_creditmemodraftsectionsService.getAll);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

const CORE_USER_BIND = '/cr664_users(core-1)';
const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: CORE_USER_BIND });
const failResolver: ResolveActorChangedBy = async () => ({
  ok: false,
  reason: 'matched platform-user has no linked cr664_user (CoreUser is empty)',
});

type AnyResult = { success: boolean; data?: unknown; error?: { message: string } };
function ok(data: unknown): Promise<AnyResult> {
  return Promise.resolve({ success: true, data }) as unknown as Promise<AnyResult>;
}
function fail(message: string): Promise<AnyResult> {
  return Promise.resolve({ success: false, data: undefined, error: { message } }) as unknown as Promise<AnyResult>;
}

function memoRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_creditmemo1id: 'memo-1',
    cr664_memoname: 'Acme Corp — Credit Memo',
    cr664_statusname: 'Draft',
    cr664_status: 788190000,
    cr664_memotype: 'Standard',
    cr664_version: 1,
    cr664_generatedat: '2026-07-20T00:00:00.000Z',
    modifiedon: '2026-07-20T00:00:00.000Z',
    cr664_borrowersafe: false,
    cr664_memotext: 'Full memo text',
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof finalizeCreditMemoAction>[0]> = {}) {
  return {
    dealId: 'deal-1',
    actorEmail: 'officer@bank.test',
    memoId: 'memo-1',
    finalizeNote: 'Committee approved; finalizing memo.',
    ...overrides,
  };
}

describe('finalizeCreditMemoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every test re-stubs the mocks it needs; this just keeps sectionGetAll
    // answering something reasonable by default since loadDealCreditMemo always
    // fires both queries in parallel.
    sectionGetAll.mockImplementation(() => ok([]) as never);
  });

  it('rejects a blank finalization note without reading anything', async () => {
    const outcome = await finalizeCreditMemoAction(baseInput({ finalizeNote: '   ' }), okResolver);
    expect(outcome.kind).toBe('invalid-input');
    expect(memoGetAll).not.toHaveBeenCalled();
  });

  it('rejects when no memo has ever been drafted for the deal', async () => {
    memoGetAll.mockImplementation(() => ok([]) as never);
    const outcome = await finalizeCreditMemoAction(baseInput(), okResolver);
    expect(outcome).toEqual({ kind: 'invalid-input', message: 'No credit memo has been drafted for this deal yet.' });
    expect(memoUpdate).not.toHaveBeenCalled();
  });

  it('rejects (stale-caller) when the caller memoId is not the current highest-version memo', async () => {
    memoGetAll.mockImplementation(() =>
      ok([memoRow({ cr664_creditmemo1id: 'memo-2', cr664_version: 2 }), memoRow({ cr664_creditmemo1id: 'memo-1', cr664_version: 1 })]) as never,
    );
    const outcome = await finalizeCreditMemoAction(baseInput({ memoId: 'memo-1' }), okResolver);
    expect(outcome.kind).toBe('invalid-input');
    if (outcome.kind === 'invalid-input') {
      expect(outcome.message).toMatch(/newer credit memo draft \(v2\)/);
    }
    expect(memoUpdate).not.toHaveBeenCalled();
  });

  it('rejects finalizing an already-Final memo', async () => {
    memoGetAll.mockImplementation(() => ok([memoRow({ cr664_status: 788190001, cr664_statusname: 'Final' })]) as never);
    const outcome = await finalizeCreditMemoAction(baseInput(), okResolver);
    expect(outcome).toEqual({ kind: 'invalid-input', message: 'This credit memo has already been finalized.' });
    expect(memoUpdate).not.toHaveBeenCalled();
  });

  it('rejects finalizing a Stale memo', async () => {
    memoGetAll.mockImplementation(() => ok([memoRow({ cr664_status: 788190002, cr664_statusname: 'Stale' })]) as never);
    const outcome = await finalizeCreditMemoAction(baseInput(), okResolver);
    expect(outcome).toEqual({ kind: 'invalid-input', message: 'This credit memo has Stale status. Save a new draft before finalizing.' });
    expect(memoUpdate).not.toHaveBeenCalled();
  });

  it('finalizes the current draft memo and writes audit + timeline on success', async () => {
    memoGetAll.mockImplementation(() => ok([memoRow()]) as never);
    memoUpdate.mockImplementation(() => ok({ cr664_creditmemo1id: 'memo-1' }) as never);
    auditCreate.mockImplementation(() => ok({ cr664_auditeventid: 'audit-1' }) as never);
    timelineCreate.mockImplementation(() => ok({ cr664_dealtimelineeventid: 'tl-1' }) as never);

    const outcome = await finalizeCreditMemoAction(baseInput(), okResolver);

    expect(outcome).toEqual({ kind: 'success', memoId: 'memo-1' });
    expect(memoUpdate).toHaveBeenCalledWith('memo-1', { cr664_status: 788190001 });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
  });

  it('returns write-failed (banker-safe message, no raw Dataverse text) when the update fails', async () => {
    memoGetAll.mockImplementation(() => ok([memoRow()]) as never);
    memoUpdate.mockImplementation(() => fail('EntityRecordNotFound: cr664_creditmemo1 attribute cr664_status') as never);
    auditCreate.mockImplementation(() => ok({ cr664_auditeventid: 'audit-1' }) as never);

    const outcome = await finalizeCreditMemoAction(baseInput(), okResolver);

    expect(outcome.kind).toBe('write-failed');
    if (outcome.kind === 'write-failed') {
      expect(outcome.error).not.toMatch(/EntityRecordNotFound/);
      expect(outcome.error).not.toMatch(/cr664_creditmemo1/);
    }
  });

  it('returns governance-partial when the memo update succeeds but the audit write fails', async () => {
    memoGetAll.mockImplementation(() => ok([memoRow()]) as never);
    memoUpdate.mockImplementation(() => ok({ cr664_creditmemo1id: 'memo-1' }) as never);
    auditCreate.mockImplementation(() => fail('OData-Error: trace-12345') as never);
    timelineCreate.mockImplementation(() => ok({ cr664_dealtimelineeventid: 'tl-1' }) as never);

    const outcome = await finalizeCreditMemoAction(baseInput(), okResolver);

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.memoId).toBe('memo-1');
      expect(outcome.auditError).toBeTruthy();
      expect(outcome.auditError).not.toMatch(/trace-12345/);
      expect(outcome.timelineError).toBeUndefined();
    }
  });

  it('fails closed (governance-partial audit error) when the actor identity cannot be resolved', async () => {
    memoGetAll.mockImplementation(() => ok([memoRow()]) as never);
    memoUpdate.mockImplementation(() => ok({ cr664_creditmemo1id: 'memo-1' }) as never);
    timelineCreate.mockImplementation(() => ok({ cr664_dealtimelineeventid: 'tl-1' }) as never);

    const outcome = await finalizeCreditMemoAction(baseInput(), failResolver);

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBeTruthy();
    }
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
