import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_dataqualityflagsService', () => ({
  Cr664_dataqualityflagsService: {
    update: vi.fn(),
  },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: {
    create: vi.fn(),
  },
}));

import { Cr664_dataqualityflagsService } from '../generated/services/Cr664_dataqualityflagsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { resolveDataQualityFlag } from './dataQualityActions';

const updateMock = vi.mocked(Cr664_dataqualityflagsService.update);
const createMock = vi.mocked(Cr664_auditeventsService.create);

function baseInput(overrides: Partial<Parameters<typeof resolveDataQualityFlag>[0]> = {}) {
  return {
    flagId: 'flag-1',
    flagName: 'Orphan record',
    flagType: 'OrphanRecord',
    systemUserId: 'sys-user-1',
    resolutionNote: 'investigated and fixed',
    ...overrides,
  };
}

function successUpdate() {
  // Cast through unknown — we don't need the full Cr664_dataqualityflags
  // shape in the test, only `success`.
  return Promise.resolve({ success: true, data: undefined } as unknown as ReturnType<
    typeof Cr664_dataqualityflagsService.update
  > extends Promise<infer R>
    ? R
    : never);
}

function failedUpdate(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_dataqualityflagsService.update> extends Promise<
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

describe('resolveDataQualityFlag', () => {
  it('returns success when both the flag update and audit emission succeed', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-42'));

    const outcome = await resolveDataQualityFlag(baseInput());

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.auditEventId).toBe('audit-42');
    }
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('writes resolutionstatus=Resolved (788190001) and the note onto the flag', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-1'));

    await resolveDataQualityFlag(baseInput({ resolutionNote: '   trimmed note  ' }));

    expect(updateMock).toHaveBeenCalledWith(
      'flag-1',
      expect.objectContaining({
        cr664_resolutionstatus: 788190001,
        cr664_resolutionnotes: 'trimmed note',
      }),
    );
  });

  it('emits a Succeeded audit event with beforestate=Open, afterstate=Resolved, full lookup binds', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-7'));

    await resolveDataQualityFlag(baseInput());

    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190000); // Succeeded
    expect(payload.cr664_eventcategory).toBe(788190007); // Exception
    expect(payload.cr664_eventtype).toBe(788190006); // ExceptionResolved
    expect(payload.cr664_entityid).toBe('flag-1');
    expect(payload.cr664_relatedentitytype).toBe('cr664_dataqualityflag');
    expect(payload.cr664_relatedentityid).toBe('flag-1');
    expect(payload.cr664_beforestate).toBe('Open');
    expect(payload.cr664_afterstate).toBe('Resolved');
    expect(payload.cr664_oldvalue).toBe('Open');
    expect(payload.cr664_newvalue).toBe('Resolved');
    expect(payload.cr664_fieldname).toBe('cr664_resolutionstatus');
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload['cr664_ActorUser@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_sourcescreensourceprocess).toBe(
      'AdminWorkspace/DataQualityFlags',
    );
    expect(payload.cr664_notes).toBe('investigated and fixed');
    expect(typeof payload.cr664_correlationid).toBe('string');
    expect((payload.cr664_correlationid as string).length).toBeGreaterThan(0);
  });

  it('returns flag-failed and leaves the audit emission as a best-effort Failed event when the update returns non-success', async () => {
    updateMock.mockReturnValue(failedUpdate('FK violation'));
    // Best-effort audit (fire-and-forget). Just give it a resolved
    // promise so the action completes cleanly.
    createMock.mockReturnValue(successAudit('audit-fail-trace'));

    const outcome = await resolveDataQualityFlag(baseInput());

    expect(outcome.kind).toBe('flag-failed');
    if (outcome.kind === 'flag-failed') {
      expect(outcome.flagError).toBe('FK violation');
    }
    expect(updateMock).toHaveBeenCalledTimes(1);
    // Action attempts to emit a Failed audit event best-effort; assert
    // outcome=Failed (788190001) on the payload.
    expect(createMock).toHaveBeenCalled();
    const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190001); // Failed
    expect(payload.cr664_failurereason).toBe('FK violation');
  });

  it('returns flag-failed and emits a best-effort Failed audit when update throws', async () => {
    updateMock.mockImplementation(() => {
      throw new Error('network down');
    });
    createMock.mockReturnValue(successAudit('audit-fail-thrown'));

    const outcome = await resolveDataQualityFlag(baseInput());

    expect(outcome.kind).toBe('flag-failed');
    if (outcome.kind === 'flag-failed') {
      expect(outcome.flagError).toBe('network down');
    }
  });

  it('returns audit-failed when the flag updates but the audit create returns non-success', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(failedAudit('audit table not writable'));

    const outcome = await resolveDataQualityFlag(baseInput());

    expect(outcome.kind).toBe('audit-failed');
    if (outcome.kind === 'audit-failed') {
      expect(outcome.auditError).toBe('audit table not writable');
    }
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('returns audit-failed when the flag updates but the audit create throws', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockImplementation(() => {
      throw new Error('audit endpoint 500');
    });

    const outcome = await resolveDataQualityFlag(baseInput());

    expect(outcome.kind).toBe('audit-failed');
    if (outcome.kind === 'audit-failed') {
      expect(outcome.auditError).toBe('audit endpoint 500');
    }
  });

  it('rejects an empty note without calling either service', async () => {
    const outcome = await resolveDataQualityFlag(baseInput({ resolutionNote: '   ' }));

    expect(outcome.kind).toBe('unknown');
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('generates a distinct correlation id for each attempt', async () => {
    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-a'));
    await resolveDataQualityFlag(baseInput());

    updateMock.mockReturnValue(successUpdate());
    createMock.mockReturnValue(successAudit('audit-b'));
    await resolveDataQualityFlag(baseInput());

    const first = (createMock.mock.calls[0]![0] as Record<string, unknown>).cr664_correlationid;
    const second = (createMock.mock.calls[1]![0] as Record<string, unknown>).cr664_correlationid;
    expect(typeof first).toBe('string');
    expect(typeof second).toBe('string');
    expect(first).not.toEqual(second);
  });
});
