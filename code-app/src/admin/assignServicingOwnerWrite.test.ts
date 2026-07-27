import { describe, it, expect, vi } from 'vitest';
import {
  writeAssignServicingOwner,
  type AssignServicingOwnerWriteDeps,
  type ServicingOwnerLoanRow,
} from './assignServicingOwnerWrite';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

const CORE_USER_BIND = '/cr664_users(core-1)';
const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: CORE_USER_BIND });
const failResolver: ResolveActorChangedBy = async () => ({
  ok: false,
  reason: 'matched platform-user has no linked cr664_user (CoreUser is empty)',
});

function row(overrides: Partial<ServicingOwnerLoanRow> = {}): ServicingOwnerLoanRow {
  return {
    id: 'loan-1',
    name: 'Acme Working Capital',
    loanNumber: 'LN-1001',
    borrowerName: 'Acme Manufacturing, LLC',
    active: true,
    currentServicingOwnerId: undefined,
    currentServicingOwnerName: undefined,
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof writeAssignServicingOwner>[0]> = {}) {
  return {
    loanId: 'loan-1',
    servicingOwnerId: 'su-2',
    servicingOwnerName: 'Jamie Rivera',
    actorEmail: 'admin@oldglorybank.com',
    actorSystemUserId: 'sys-admin-1',
    authorized: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AssignServicingOwnerWriteDeps> = {}): AssignServicingOwnerWriteDeps {
  return {
    getLoan: vi.fn(async () => ({ success: true, row: row() })),
    updateLoan: vi.fn(async () => ({ success: true })),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    resolveActorChangedBy: okResolver,
    ...overrides,
  };
}

describe('writeAssignServicingOwner', () => {
  it('fails closed when the caller is not authorized, without reading anything', async () => {
    const deps = makeDeps();
    const outcome = await writeAssignServicingOwner(baseInput({ authorized: false }), deps);
    expect(outcome).toEqual({ kind: 'unauthorized', reason: 'Caller is not an authorized administrator.' });
    expect(deps.getLoan).not.toHaveBeenCalled();
  });

  it('fails closed when no admin systemuserid is resolved', async () => {
    const deps = makeDeps();
    const outcome = await writeAssignServicingOwner(baseInput({ actorSystemUserId: undefined }), deps);
    expect(outcome.kind).toBe('identity-unresolved');
    expect(deps.getLoan).not.toHaveBeenCalled();
  });

  it('rejects a blank loan id', async () => {
    const outcome = await writeAssignServicingOwner(baseInput({ loanId: '  ' }), makeDeps());
    expect(outcome).toEqual({ kind: 'invalid-input', reason: 'No portfolio loan was selected.' });
  });

  it('rejects a blank servicing owner id', async () => {
    const outcome = await writeAssignServicingOwner(baseInput({ servicingOwnerId: '  ' }), makeDeps());
    expect(outcome).toEqual({ kind: 'invalid-input', reason: 'No servicing owner was selected.' });
  });

  it('fails closed when the audit actor cannot be resolved to a cr664_user', async () => {
    const deps = makeDeps({ resolveActorChangedBy: failResolver });
    const outcome = await writeAssignServicingOwner(baseInput(), deps);
    expect(outcome.kind).toBe('identity-unresolved');
    expect(deps.updateLoan).not.toHaveBeenCalled();
  });

  it('reports not-found when the fresh read fails', async () => {
    const deps = makeDeps({ getLoan: vi.fn(async () => ({ success: false, error: { message: 'not found' } })) });
    const outcome = await writeAssignServicingOwner(baseInput(), deps);
    expect(outcome.kind).toBe('not-found');
  });

  it('rejects a no-op reassignment to the SAME owner already on file', async () => {
    const deps = makeDeps({
      getLoan: vi.fn(async () => ({ success: true, row: row({ currentServicingOwnerId: 'su-2', currentServicingOwnerName: 'Jamie Rivera' }) })),
    });
    const outcome = await writeAssignServicingOwner(baseInput(), deps);
    expect(outcome.kind).toBe('already-assigned');
    expect(deps.updateLoan).not.toHaveBeenCalled();
  });

  it('assigns a NEW servicing owner and verifies the readback before emitting a Succeeded audit', async () => {
    const getLoan = vi
      .fn()
      .mockResolvedValueOnce({ success: true, row: row({ currentServicingOwnerId: 'su-1', currentServicingOwnerName: 'Prior Owner' }) })
      .mockResolvedValueOnce({ success: true, row: row({ currentServicingOwnerId: 'su-2', currentServicingOwnerName: 'Jamie Rivera' }) });
    const updateLoan = vi.fn(async (_loanId: string, _patch: Record<string, unknown>) => ({ success: true }));
    const emitAudit = vi.fn(async (_payload: Record<string, unknown>) => ({ success: true, id: 'audit-1' }));
    const deps = makeDeps({ getLoan, updateLoan, emitAudit });

    const outcome = await writeAssignServicingOwner(baseInput(), deps);

    expect(outcome).toEqual({
      kind: 'success',
      loanId: 'loan-1',
      servicingOwnerId: 'su-2',
      servicingOwnerName: 'Jamie Rivera',
      correlationId: expect.any(String),
      auditId: 'audit-1',
    });
    expect(updateLoan).toHaveBeenCalledWith('loan-1', { 'cr664_AssignedServicingOwner@odata.bind': '/systemusers(su-2)' });
    expect(getLoan).toHaveBeenCalledTimes(2);
    const auditPayload = emitAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(auditPayload.cr664_oldvalue).toBe('Prior Owner');
    expect(auditPayload.cr664_newvalue).toBe('Jamie Rivera');
  });

  it('returns write-failed when the update itself fails', async () => {
    const deps = makeDeps({ updateLoan: vi.fn(async () => ({ success: false, error: { message: 'Dataverse: OData-Error trace-123' } })) });
    const outcome = await writeAssignServicingOwner(baseInput(), deps);
    expect(outcome.kind).toBe('write-failed');
  });

  it('fails closed with readback-mismatch when the readback does not show the new owner (never assumes success)', async () => {
    const getLoan = vi
      .fn()
      .mockResolvedValueOnce({ success: true, row: row({ currentServicingOwnerId: undefined }) })
      .mockResolvedValueOnce({ success: true, row: row({ currentServicingOwnerId: 'su-STALE' }) });
    const deps = makeDeps({ getLoan });
    const outcome = await writeAssignServicingOwner(baseInput(), deps);
    expect(outcome.kind).toBe('readback-mismatch');
  });

  it('reports audit-failed (write itself already succeeded) when the audit create fails', async () => {
    const getLoan = vi
      .fn()
      .mockResolvedValueOnce({ success: true, row: row({ currentServicingOwnerId: undefined }) })
      .mockResolvedValueOnce({ success: true, row: row({ currentServicingOwnerId: 'su-2' }) });
    const deps = makeDeps({ getLoan, emitAudit: vi.fn(async () => ({ success: false, error: { message: 'audit down' } })) });
    const outcome = await writeAssignServicingOwner(baseInput(), deps);
    expect(outcome.kind).toBe('audit-failed');
    if (outcome.kind === 'audit-failed') expect(outcome.loanId).toBe('loan-1');
  });
});
