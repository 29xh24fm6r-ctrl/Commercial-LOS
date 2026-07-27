import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_dataqualityflagsService', () => ({
  Cr664_dataqualityflagsService: {
    create: vi.fn(),
  },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: {
    create: vi.fn(),
  },
}));

import { Cr664_dataqualityflagsService } from '../generated/services/Cr664_dataqualityflagsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { createDataQualityFlag, type CreateFlagInput } from './createDataQualityFlagAction';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';
import type { DataQualityFlagCandidate } from './dataQuality/dataQualityFlagCandidates';

const flagCreateMock = vi.mocked(Cr664_dataqualityflagsService.create);
const auditCreateMock = vi.mocked(Cr664_auditeventsService.create);

const CORE_USER_BIND = '/cr664_users(core-1)';
const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: CORE_USER_BIND });
const failResolver: ResolveActorChangedBy = async () => ({
  ok: false,
  reason: 'matched platform-user has no linked cr664_user (CoreUser is empty)',
});

const candidate: DataQualityFlagCandidate = {
  category: 'zero-amount-deal',
  flagName: 'Active deal with no recorded amount',
  flagDescription: 'Deal "X" (stage: BOARDED) is active but its amount is zero.',
  sourceTable: 'cr664_loandeal',
  sourceRecordId: 'deal-1',
};

function baseInput(overrides: Partial<CreateFlagInput> = {}): CreateFlagInput {
  return { candidate, actorEmail: 'admin@oldglorybank.com', ...overrides };
}

function successCreate(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_dataqualityflagid: id },
  } as unknown as ReturnType<typeof Cr664_dataqualityflagsService.create>);
}

function failedCreate(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_dataqualityflagsService.create>);
}

function successAudit(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_auditeventid: id },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create>);
}

function failedAudit(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_auditeventsService.create>);
}

beforeEach(() => {
  flagCreateMock.mockReset();
  auditCreateMock.mockReset();
});

describe('createDataQualityFlag', () => {
  it('returns success when both the flag create and audit emission succeed', async () => {
    flagCreateMock.mockReturnValueOnce(successCreate('flag-9'));
    auditCreateMock.mockReturnValueOnce(successAudit('audit-9'));

    const outcome = await createDataQualityFlag(baseInput(), okResolver);
    expect(outcome).toEqual({ kind: 'success', flagId: 'flag-9', auditEventId: 'audit-9' });
  });

  it('sends the candidate fields through to the flag create payload', async () => {
    flagCreateMock.mockReturnValueOnce(successCreate('flag-9'));
    auditCreateMock.mockReturnValueOnce(successAudit('audit-9'));

    await createDataQualityFlag(baseInput(), okResolver);
    const payload = flagCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_flagname).toBe(candidate.flagName);
    expect(payload.cr664_flagdescription).toBe(candidate.flagDescription);
    expect(payload.cr664_sourcetable).toBe(candidate.sourceTable);
    expect(payload.cr664_sourcerecordid).toBe(candidate.sourceRecordId);
    expect(payload.cr664_flagtype).toBe('InvalidValue');
    expect(payload.cr664_resolutionstatus).toBe(788190000);
  });

  it('maps inconsistent-boarding-linkage to the BrokenReference flag type', async () => {
    flagCreateMock.mockReturnValueOnce(successCreate('flag-1'));
    auditCreateMock.mockReturnValueOnce(successAudit('audit-1'));

    await createDataQualityFlag(
      baseInput({
        candidate: { ...candidate, category: 'inconsistent-boarding-linkage' },
      }),
      okResolver,
    );
    const payload = flagCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_flagtype).toBe('BrokenReference');
  });

  it('returns create-failed and never attempts the audit when flag creation fails', async () => {
    flagCreateMock.mockReturnValueOnce(failedCreate('duplicate key'));

    const outcome = await createDataQualityFlag(baseInput(), okResolver);
    expect(outcome).toEqual({ kind: 'create-failed', createError: 'duplicate key' });
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('returns create-failed when the create throws', async () => {
    flagCreateMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });

    const outcome = await createDataQualityFlag(baseInput(), okResolver);
    expect(outcome).toEqual({ kind: 'create-failed', createError: 'network down' });
  });

  it('returns audit-failed when the flag was created but the audit event fails', async () => {
    flagCreateMock.mockReturnValueOnce(successCreate('flag-2'));
    auditCreateMock.mockReturnValueOnce(failedAudit('audit table unavailable'));

    const outcome = await createDataQualityFlag(baseInput(), okResolver);
    expect(outcome).toEqual({
      kind: 'audit-failed',
      flagId: 'flag-2',
      auditError: 'audit table unavailable',
    });
  });

  it('returns audit-failed when the actor identity cannot be resolved (fail-closed, never posts without a cr664_user bind)', async () => {
    flagCreateMock.mockReturnValueOnce(successCreate('flag-3'));

    const outcome = await createDataQualityFlag(baseInput(), failResolver);
    expect(outcome.kind).toBe('audit-failed');
    expect(auditCreateMock).not.toHaveBeenCalled();
  });
});
