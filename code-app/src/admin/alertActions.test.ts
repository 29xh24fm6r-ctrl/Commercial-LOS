import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_alertqueuesService', () => ({
  Cr664_alertqueuesService: {
    update: vi.fn(),
  },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: {
    create: vi.fn(),
  },
}));

import { Cr664_alertqueuesService } from '../generated/services/Cr664_alertqueuesService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { resolveAlert, dismissAlert } from './alertActions';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

const updateMock = vi.mocked(Cr664_alertqueuesService.update);
const createMock = vi.mocked(Cr664_auditeventsService.create);

// Phase 187H / G-5: the audit actor (cr664_ChangedBy) is resolved fail-closed to
// a cr664_user bind via the platform-user bridge. Tests inject the resolver.
const CORE_USER_BIND = '/cr664_users(core-1)';
const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: CORE_USER_BIND });
const failResolver: ResolveActorChangedBy = async () => ({
  ok: false,
  reason: 'matched platform-user has no linked cr664_user (CoreUser is empty)',
});

function baseInput(overrides: Partial<Parameters<typeof resolveAlert>[0]> = {}) {
  return {
    alertId: 'alert-1',
    alertName: 'Compliance check failed',
    priorStatus: 'In progress',
    systemUserId: 'sys-user-1',
    actorEmail: 'admin@oldglorybank.com',
    resolutionNote: 'reviewed and corrected',
    ...overrides,
  };
}

function successUpdate() {
  return Promise.resolve({ success: true, data: undefined } as unknown as ReturnType<
    typeof Cr664_alertqueuesService.update
  > extends Promise<infer R>
    ? R
    : never);
}
function failedUpdate(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_alertqueuesService.update> extends Promise<
    infer R
  >
    ? R
    : never);
}
function successAudit(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_auditeventid: id },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create> extends Promise<infer R>
    ? R
    : never);
}
function failedAudit(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create> extends Promise<infer R>
    ? R
    : never);
}

beforeEach(() => {
  updateMock.mockReset();
  createMock.mockReset();
});

describe('resolveAlert', () => {
  it('writes alertstatus=Resolved (788190003) and full lifecycle fields', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-1'));

    await resolveAlert(baseInput(), okResolver);

    expect(updateMock).toHaveBeenCalledWith(
      'alert-1',
      expect.objectContaining({
        cr664_alertstatus: 788190003,
        cr664_resolutionnotes: 'reviewed and corrected',
        'cr664_ResolvedBy@odata.bind': '/systemusers(sys-user-1)',
      }),
    );
    const payload = updateMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(typeof payload.cr664_resolveddate).toBe('string');
  });

  it("emits a Succeeded audit event with afterstate='Resolved' and the resolve sourceprocess", async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-1'));

    await resolveAlert(baseInput(), okResolver);

    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventcategory).toBe(788190003); // Alert
    expect(payload.cr664_outcomestatus).toBe(788190000); // Succeeded
    expect(payload.cr664_afterstate).toBe('Resolved');
    expect(payload.cr664_newvalue).toBe('Resolved');
    expect(payload.cr664_beforestate).toBe('In progress');
    expect(payload.cr664_oldvalue).toBe('In progress');
    expect(payload.cr664_relatedentitytype).toBe('cr664_alertqueue');
    expect(payload.cr664_sourcescreensourceprocess).toBe(
      'AdminWorkspace/AlertBacklog/resolve',
    );
    expect(payload.cr664_auditeventname).toBe('AlertQueue Resolved');
    // Phase 187H / G-5: ChangedBy is the resolved cr664_user bind — never a
    // systemuser id — and the redundant ActorUser + owner/state are gone.
    expect(payload['cr664_ChangedBy@odata.bind']).toBe(CORE_USER_BIND);
    expect(payload['cr664_ActorUser@odata.bind']).toBeUndefined();
    expect(payload.ownerid).toBeUndefined();
    expect(payload.owneridtype).toBeUndefined();
    expect(payload.statecode).toBeUndefined();
  });

  it('returns audit-failed when the alert updates but the audit create fails', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(failedAudit('audit write rejected'));

    const outcome = await resolveAlert(baseInput(), okResolver);

    expect(outcome.kind).toBe('audit-failed');
    if (outcome.kind === 'audit-failed') {
      expect(outcome.auditError).toBe('audit write rejected');
    }
  });

  it('returns alert-failed and attempts a best-effort Failed audit when update fails', async () => {
    updateMock.mockReturnValue(failedUpdate('lock conflict'));
    createMock.mockReturnValue(successAudit('audit-fail-trace'));

    const outcome = await resolveAlert(baseInput(), okResolver);

    expect(outcome.kind).toBe('alert-failed');
    if (outcome.kind === 'alert-failed') {
      expect(outcome.alertError).toBe('lock conflict');
    }
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190001); // Failed
    expect(payload.cr664_failurereason).toBe('lock conflict');
  });

  it('rejects an empty note without touching either service', async () => {
    const outcome = await resolveAlert(baseInput({ resolutionNote: '   ' }), okResolver);
    expect(outcome.kind).toBe('unknown');
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('fails closed when the actor cannot be resolved: alert updates, NO audit POST, audit-failed', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('should-not-be-used'));

    const outcome = await resolveAlert(baseInput(), failResolver);

    // Primary alert update still happens.
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe('audit-failed');
    if (outcome.kind === 'audit-failed') {
      expect(outcome.auditError).toMatch(/CoreUser is empty/);
    }
    // No audit row is POSTed with an unresolved actor — never a systemuser bind.
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('dismissAlert', () => {
  it('writes alertstatus=Closed (788190004) instead of Resolved', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-d1'));

    await dismissAlert(baseInput(), okResolver);

    expect(updateMock).toHaveBeenCalledWith(
      'alert-1',
      expect.objectContaining({
        cr664_alertstatus: 788190004,
      }),
    );
  });

  it("emits an audit event with afterstate='Closed' and the dismiss sourceprocess", async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-d2'));

    await dismissAlert(baseInput(), okResolver);

    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_afterstate).toBe('Closed');
    expect(payload.cr664_newvalue).toBe('Closed');
    expect(payload.cr664_sourcescreensourceprocess).toBe(
      'AdminWorkspace/AlertBacklog/dismiss',
    );
    expect(payload.cr664_auditeventname).toBe('AlertQueue Dismissed');
  });
});

describe('alertActions correlation id discipline', () => {
  it('generates a distinct correlation id per attempt across resolve and dismiss', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('a1'));
    await resolveAlert(baseInput(), okResolver);

    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('a2'));
    await resolveAlert(baseInput(), okResolver);

    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('a3'));
    await dismissAlert(baseInput(), okResolver);

    const ids = createMock.mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).cr664_correlationid,
    );
    expect(new Set(ids).size).toBe(3);
  });
});
