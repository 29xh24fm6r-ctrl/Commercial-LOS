import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_dealtask1sService', () => ({
  Cr664_dealtask1sService: { update: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));

import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { completeTask } from './dealTaskActions';

const taskUpdate = vi.mocked(Cr664_dealtask1sService.update);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

function baseInput(overrides: Partial<Parameters<typeof completeTask>[0]> = {}) {
  return {
    taskId: 'task-1',
    taskName: 'Upload tax return',
    dealId: 'deal-77',
    priorAssigneeName: 'Jane Banker',
    systemUserId: 'sys-user-1',
    completionNote: 'received and filed',
    ...overrides,
  };
}

function successUpdate() {
  return Promise.resolve({ success: true, data: undefined } as unknown as ReturnType<
    typeof Cr664_dealtask1sService.update
  > extends Promise<infer R>
    ? R
    : never);
}
function failedUpdate(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_dealtask1sService.update> extends Promise<
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
  taskUpdate.mockReset();
  auditCreate.mockReset();
  timelineCreate.mockReset();
});

describe('completeTask', () => {
  it('returns success when task update + audit + timeline all succeed', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    const outcome = await completeTask(baseInput());

    expect(outcome.kind).toBe('success');
    expect(taskUpdate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
  });

  it('writes cr664_completed=true on the task', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await completeTask(baseInput({ completionNote: '  trimmed note  ' }));

    expect(taskUpdate).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ cr664_completed: true }),
    );
  });

  it('emits a Succeeded audit event with the StatusChange + Lifecycle contract', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await completeTask(baseInput());

    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventcategory).toBe(788190002); // Lifecycle
    expect(payload.cr664_eventtype).toBe(788190001); // StatusChange
    expect(payload.cr664_entitytype).toBe(788190000); // LoanDeal
    expect(payload.cr664_outcomestatus).toBe(788190000); // Succeeded
    expect(payload.cr664_entityid).toBe('task-1');
    expect(payload.cr664_relatedentitytype).toBe('cr664_dealtask1');
    expect(payload.cr664_relatedentityid).toBe('task-1');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload['cr664_ActorUser@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_fieldname).toBe('cr664_completed');
    expect(payload.cr664_oldvalue).toBe('false');
    expect(payload.cr664_newvalue).toBe('true');
    expect(payload.cr664_beforestate).toBe('Open');
    expect(payload.cr664_afterstate).toBe('Completed');
    expect(payload.cr664_notes).toBe('received and filed');
    expect(payload.cr664_sourcescreensourceprocess).toBe(
      'DealWorkspace/DealTasks/complete',
    );
    expect(typeof payload.cr664_correlationid).toBe('string');
  });

  it('emits a DealTimelineEvent with cr664_eventtype=TaskCompleted (788190005)', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await completeTask(baseInput());

    const payload = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190005);
    expect(payload.cr664_title).toBe('Upload tax return');
    expect(payload.cr664_summary).toBe('received and filed');
    expect(payload.cr664_issystemgenerated).toBe(false);
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload['cr664_EventBy@odata.bind']).toBe('/systemusers(sys-user-1)');
    expect(payload.cr664_relatedentitytype).toBe('cr664_dealtask1');
    expect(payload.cr664_relatedentityid).toBe('task-1');
    expect(payload.cr664_visibilityscope).toBe(788190000); // BankerAndManager
  });

  it('returns task-failed and fires a best-effort Failed audit when the task update fails', async () => {
    taskUpdate.mockReturnValue(failedUpdate('row locked'));
    auditCreate.mockReturnValue(successAudit('a-fail-trace'));
    timelineCreate.mockReturnValue(successTimeline('t-not-called'));

    const outcome = await completeTask(baseInput());

    expect(outcome.kind).toBe('task-failed');
    if (outcome.kind === 'task-failed') {
      expect(outcome.taskError).toBe('row locked');
    }
    expect(taskUpdate).toHaveBeenCalledTimes(1);
    // Best-effort Failed audit fired.
    expect(auditCreate).toHaveBeenCalled();
    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190001); // Failed
    expect(payload.cr664_failurereason).toBe('row locked');
    // Timeline is NOT attempted on task-failed.
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('returns governance-partial when audit fails but task + timeline succeed', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(failedAudit('audit write blocked'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    const outcome = await completeTask(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBe('audit write blocked');
      expect(outcome.timelineError).toBeUndefined();
    }
  });

  it('returns governance-partial when timeline fails but task + audit succeed', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(failedTimeline('timeline endpoint 500'));

    const outcome = await completeTask(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBeUndefined();
      expect(outcome.timelineError).toBe('timeline endpoint 500');
    }
  });

  it('returns governance-partial reporting BOTH errors when audit and timeline both fail', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(failedAudit('audit boom'));
    timelineCreate.mockReturnValue(failedTimeline('timeline boom'));

    const outcome = await completeTask(baseInput());

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBe('audit boom');
      expect(outcome.timelineError).toBe('timeline boom');
    }
  });

  it('rejects an empty completion note without touching any service', async () => {
    const outcome = await completeTask(baseInput({ completionNote: '   ' }));
    expect(outcome.kind).toBe('unknown');
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('generates a distinct correlation id for each attempt; same id used on audit AND timeline within one attempt', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));
    await completeTask(baseInput());

    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-2'));
    timelineCreate.mockReturnValue(successTimeline('t-2'));
    await completeTask(baseInput());

    const audit1 = (auditCreate.mock.calls[0]![0] as Record<string, unknown>).cr664_correlationid;
    const audit2 = (auditCreate.mock.calls[1]![0] as Record<string, unknown>).cr664_correlationid;
    const timeline1 = (timelineCreate.mock.calls[0]![0] as Record<string, unknown>).cr664_eventsubtype;
    const timeline2 = (timelineCreate.mock.calls[1]![0] as Record<string, unknown>).cr664_eventsubtype;

    expect(audit1).not.toEqual(audit2);
    // Timeline encodes correlation id in eventsubtype: 'correlation:<id>'
    expect(timeline1).toBe(`correlation:${audit1 as string}`);
    expect(timeline2).toBe(`correlation:${audit2 as string}`);
  });
});
