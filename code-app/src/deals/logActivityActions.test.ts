import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { logActivity } from './logActivityActions';

const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

function input(overrides: Partial<Parameters<typeof logActivity>[0]> = {}) {
  return {
    dealId: 'deal-1',
    dealName: 'Expansion Loan',
    systemUserId: 'sys-user-1',
    bankerName: 'Matt Paller',
    note: 'Client called to confirm diligence timing.',
    ...overrides,
  };
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

function successTimeline(id: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_dealtimelineeventid: id },
  } as unknown as ReturnType<
    typeof Cr664_dealtimelineeventsService.create
  > extends Promise<infer R>
    ? R
    : never);
}

function failedTimeline(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<
    typeof Cr664_dealtimelineeventsService.create
  > extends Promise<infer R>
    ? R
    : never);
}

beforeEach(() => {
  auditCreate.mockReset();
  timelineCreate.mockReset();
});

describe('Phase 160 -- logActivity', () => {
  it('creates a canonical timeline activity and matching audit row', async () => {
    timelineCreate.mockReturnValue(successTimeline('activity-1'));
    auditCreate.mockReturnValue(successAudit('audit-1'));

    const outcome = await logActivity(input());

    expect(outcome).toEqual({ kind: 'success', activityId: 'activity-1' });
    expect(timelineCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('uses only minimum safe timeline fields and binds to the selected deal/user', async () => {
    timelineCreate.mockReturnValue(successTimeline('activity-1'));
    auditCreate.mockReturnValue(successAudit('audit-1'));

    await logActivity(input({ note: '  trimmed note  ' }));

    const payload = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'cr664_Deal@odata.bind',
        'cr664_EventBy@odata.bind',
        'cr664_eventat',
        'cr664_eventsubtype',
        'cr664_eventtype',
        'cr664_issystemgenerated',
        'cr664_relatedentityid',
        'cr664_relatedentitytype',
        'cr664_summary',
        'cr664_title',
        'cr664_visibilityscope',
        'ownerid',
        'owneridtype',
        'statecode',
      ].sort(),
    );
    expect(payload.cr664_summary).toBe('trimmed note');
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload['cr664_EventBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_eventtype).toBe(788190002);
    expect(payload.cr664_visibilityscope).toBe(788190000);
  });

  it('returns activity-failed and does not claim success when the timeline create fails', async () => {
    timelineCreate.mockReturnValue(failedTimeline('timeline denied'));
    auditCreate.mockReturnValue(successAudit('audit-failed-1'));

    const outcome = await logActivity(input());

    expect(outcome).toEqual({
      kind: 'activity-failed',
      activityError: 'timeline denied',
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const auditPayload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(auditPayload.cr664_outcomestatus).toBe(788190001);
    expect(auditPayload.cr664_failurereason).toBe('timeline denied');
  });

  it('returns governance-partial when activity persists but audit fails', async () => {
    timelineCreate.mockReturnValue(successTimeline('activity-1'));
    auditCreate.mockReturnValue(failedAudit('audit denied'));

    const outcome = await logActivity(input());

    expect(outcome).toEqual({
      kind: 'governance-partial',
      activityId: 'activity-1',
      auditError: 'audit denied',
      timelineError: undefined,
    });
  });

  it('blocks empty notes without creating local or Dataverse activity', async () => {
    const outcome = await logActivity(input({ note: '   ' }));

    expect(outcome.kind).toBe('unknown');
    expect(timelineCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
