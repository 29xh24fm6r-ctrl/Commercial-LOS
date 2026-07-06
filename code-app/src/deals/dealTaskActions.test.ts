import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_dealtask1sService', () => ({
  // Phase 21 uses `update`; Phase 70 adds `create` for the new
  // governed task-creation write. Both are stubbed at the module
  // boundary so the test file can drive either action.
  Cr664_dealtask1sService: { update: vi.fn(), create: vi.fn() },
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
import type { ResolveActorChangedBy } from './newDealAuditActorResolver';

const taskUpdate = vi.mocked(Cr664_dealtask1sService.update);
const auditCreate = vi.mocked(Cr664_auditeventsService.create);
const timelineCreate = vi.mocked(Cr664_dealtimelineeventsService.create);

// Phase 187H / G-5: the audit actor (cr664_ChangedBy) is resolved fail-closed to
// a cr664_user bind via the platform-user bridge. Tests inject the resolver.
const CORE_USER_BIND = '/cr664_users(core-1)';
const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: CORE_USER_BIND });
const failResolver: ResolveActorChangedBy = async () => ({
  ok: false,
  reason: 'matched platform-user has no linked cr664_user (CoreUser is empty)',
});

function baseInput(overrides: Partial<Parameters<typeof completeTask>[0]> = {}) {
  return {
    taskId: 'task-1',
    taskName: 'Upload tax return',
    dealId: 'deal-77',
    priorAssigneeName: 'Jane Banker',
    systemUserId: 'sys-user-1',
    actorEmail: 'banker@oldglorybank.com',
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

    const outcome = await completeTask(baseInput(), okResolver);

    expect(outcome.kind).toBe('success');
    expect(taskUpdate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
  });

  it('writes cr664_completed=true on the task', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await completeTask(baseInput({ completionNote: '  trimmed note  ' }), okResolver);

    expect(taskUpdate).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ cr664_completed: true }),
    );
  });

  it('emits a Succeeded audit event with the StatusChange + Lifecycle contract', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    await completeTask(baseInput(), okResolver);

    const payload = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_eventcategory).toBe(788190002); // Lifecycle
    expect(payload.cr664_eventtype).toBe(788190001); // StatusChange
    expect(payload.cr664_entitytype).toBe(788190000); // LoanDeal
    expect(payload.cr664_outcomestatus).toBe(788190000); // Succeeded
    expect(payload.cr664_entityid).toBe('task-1');
    expect(payload.cr664_relatedentitytype).toBe('cr664_dealtask1');
    expect(payload.cr664_relatedentityid).toBe('task-1');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    // Phase 187H / G-5: ChangedBy is the resolved cr664_user bind — never a
    // systemuser id — and the redundant ActorUser + owner/state are gone.
    expect(payload['cr664_ChangedBy@odata.bind']).toBe(CORE_USER_BIND);
    expect(payload['cr664_ActorUser@odata.bind']).toBeUndefined();
    expect(payload.ownerid).toBeUndefined();
    expect(payload.owneridtype).toBeUndefined();
    expect(payload.statecode).toBeUndefined();
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

    await completeTask(baseInput(), okResolver);

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

    const outcome = await completeTask(baseInput(), okResolver);

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

    const outcome = await completeTask(baseInput(), okResolver);

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

    const outcome = await completeTask(baseInput(), okResolver);

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

    const outcome = await completeTask(baseInput(), okResolver);

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toBe('audit boom');
      expect(outcome.timelineError).toBe('timeline boom');
    }
  });

  it('fails closed when the actor cannot be resolved: task completes, NO audit POST, governance-partial', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('should-not-be-used'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));

    const outcome = await completeTask(baseInput(), failResolver);

    expect(outcome.kind).toBe('governance-partial');
    if (outcome.kind === 'governance-partial') {
      expect(outcome.auditError).toMatch(/CoreUser is empty/);
    }
    // No audit row is POSTed with an unresolved actor — never a systemuser bind.
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty completion note without touching any service', async () => {
    const outcome = await completeTask(baseInput({ completionNote: '   ' }), okResolver);
    expect(outcome.kind).toBe('unknown');
    expect(taskUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('generates a distinct correlation id for each attempt; same id used on audit AND timeline within one attempt', async () => {
    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-1'));
    timelineCreate.mockReturnValue(successTimeline('t-1'));
    await completeTask(baseInput(), okResolver);

    taskUpdate.mockReturnValue(successUpdate());
    auditCreate.mockReturnValue(successAudit('a-2'));
    timelineCreate.mockReturnValue(successTimeline('t-2'));
    await completeTask(baseInput(), okResolver);

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

// ===========================================================================
// Phase 70 — createDocumentReviewTask
// ===========================================================================

import { createDocumentReviewTask } from './dealTaskActions';

const taskCreate = vi.mocked(Cr664_dealtask1sService.create);

function reviewTaskInput(
  overrides: Partial<Parameters<typeof createDocumentReviewTask>[0]> = {},
) {
  return {
    dealId: 'deal-77',
    documentId: 'doc-1',
    documentName: 'Personal Financial Statement',
    systemUserId: 'sys-user-1',
    actorEmail: 'banker@oldglorybank.com',
    bankerName: 'M. Paller',
    followUpNote: 'Defer review until Friday — checking against memo.',
    ...overrides,
  };
}

function successCreate(newTaskId: string) {
  return Promise.resolve({
    success: true,
    data: { cr664_dealtask1id: newTaskId },
  } as unknown as ReturnType<typeof Cr664_dealtask1sService.create> extends Promise<infer R>
    ? R
    : never);
}
function failedCreate(message: string) {
  return Promise.resolve({
    success: false,
    data: undefined,
    error: { message },
  } as unknown as ReturnType<typeof Cr664_dealtask1sService.create> extends Promise<infer R>
    ? R
    : never);
}

describe('Phase 70 — createDocumentReviewTask', () => {
  beforeEach(() => {
    taskCreate.mockReset();
    auditCreate.mockReset();
    timelineCreate.mockReset();
  });

  describe('happy path', () => {
    it('returns kind: success with the new taskId', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-1'));
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      const result = await createDocumentReviewTask(reviewTaskInput(), okResolver);
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.taskId).toBe('task-new-1');
      }
    });

    it('builds the task title from the document name', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-1'));
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await createDocumentReviewTask(reviewTaskInput(), okResolver);
      const payload = taskCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.cr664_taskname).toBe(
        'Follow up on document review: Personal Financial Statement',
      );
      expect(payload.cr664_completed).toBe(false);
      // Self-assign + deal bind are required by the schema. Both
      // must be present and point at the banker / deal.
      expect(payload['cr664_AssignedTo@odata.bind']).toBe(
        '/systemusers(sys-user-1)',
      );
      expect(payload['cr664_Deal@odata.bind']).toBe(
        '/cr664_loandeals(deal-77)',
      );
    });

    it('audit row carries document-related linkage + the follow-up note', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-1'));
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await createDocumentReviewTask(reviewTaskInput(), okResolver);
      const audit = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(audit.cr664_auditeventname).toBe('DealTask Created');
      expect(audit.cr664_entityid).toBe('task-new-1');
      expect(audit.cr664_relatedentitytype).toBe('cr664_documentchecklist');
      expect(audit.cr664_relatedentityid).toBe('doc-1');
      expect(audit['cr664_LoanDeal@odata.bind']).toBe(
        '/cr664_loandeals(deal-77)',
      );
      expect(audit.cr664_fieldname).toBe('cr664_taskname');
      expect(audit.cr664_beforestate).toBe('No follow-up review task');
      expect(audit.cr664_afterstate).toBe('Follow-up review task created');
      const notes = audit.cr664_notes as string;
      expect(notes).toContain('Personal Financial Statement');
      expect(notes).toContain('Defer review until Friday');
      expect(notes).toContain('M. Paller');
    });

    it('timeline row uses TaskCreated event type + bare correlation subtype', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-1'));
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await createDocumentReviewTask(reviewTaskInput(), okResolver);
      const tl = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(tl.cr664_eventtype).toBe(788190004); // TaskCreated
      const audit = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(tl.cr664_eventsubtype).toBe(
        `correlation:${audit.cr664_correlationid as string}`,
      );
      const summary = tl.cr664_summary as string;
      expect(summary).toContain('Personal Financial Statement');
      // Phase 45 conservative copy: no "review failed" / "escalation"
      // / "compliance" / "approved" / "accepted" / "cleared" wording.
      expect(summary).not.toMatch(/\breview failed\b/i);
      expect(summary).not.toMatch(/\bescalation\b/i);
      expect(summary).not.toMatch(/\bcompliance\b/i);
      expect(summary).not.toMatch(/\bapproved\b/i);
      expect(summary).not.toMatch(/\baccepted\b/i);
      expect(summary).not.toMatch(/\bcleared\b/i);
    });

    it('emits ONE task-create, ONE audit, and ONE timeline row', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-1'));
      auditCreate.mockReturnValueOnce(successAudit('aud-1'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));
      await createDocumentReviewTask(reviewTaskInput(), okResolver);
      expect(taskCreate).toHaveBeenCalledTimes(1);
      expect(auditCreate).toHaveBeenCalledTimes(1);
      expect(timelineCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('input validation', () => {
    it('rejects an empty follow-up note before any write', async () => {
      const result = await createDocumentReviewTask(
        reviewTaskInput({ followUpNote: '   ' }),
        okResolver,
      );
      expect(result.kind).toBe('unknown');
      expect(taskCreate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
      expect(timelineCreate).not.toHaveBeenCalled();
    });

    it('rejects an empty document name before any write', async () => {
      const result = await createDocumentReviewTask(
        reviewTaskInput({ documentName: '   ' }),
        okResolver,
      );
      expect(result.kind).toBe('unknown');
      expect(taskCreate).not.toHaveBeenCalled();
    });
  });

  describe('task-create-failed branch', () => {
    it('returns task-create-failed when the task service returns success:false', async () => {
      taskCreate.mockReturnValueOnce(failedCreate('schema rejected payload'));
      // The best-effort failure audit row is fire-and-forget;
      // mock it as success so the assertion focuses on the outcome.
      auditCreate.mockReturnValueOnce(successAudit('aud-failed'));
      const result = await createDocumentReviewTask(reviewTaskInput(), okResolver);
      expect(result.kind).toBe('task-create-failed');
      if (result.kind === 'task-create-failed') {
        expect(result.taskError).toBe('schema rejected payload');
      }
      expect(timelineCreate).not.toHaveBeenCalled();
    });

    it('returns task-create-failed when the task service throws', async () => {
      taskCreate.mockImplementationOnce(() => {
        throw new Error('network error');
      });
      auditCreate.mockReturnValueOnce(successAudit('aud-failed'));
      const result = await createDocumentReviewTask(reviewTaskInput(), okResolver);
      expect(result.kind).toBe('task-create-failed');
      if (result.kind === 'task-create-failed') {
        expect(result.taskError).toContain('network error');
      }
      expect(timelineCreate).not.toHaveBeenCalled();
    });
  });

  describe('governance-partial branch', () => {
    it('reports governance-partial when audit fails but timeline succeeds', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-2'));
      auditCreate.mockReturnValueOnce(failedAudit('audit boom'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-2'));
      const result = await createDocumentReviewTask(reviewTaskInput(), okResolver);
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.taskId).toBe('task-new-2');
        expect(result.auditError).toBe('audit boom');
        expect(result.timelineError).toBeUndefined();
      }
    });

    it('reports governance-partial when timeline fails but audit succeeds', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-3'));
      auditCreate.mockReturnValueOnce(successAudit('aud-3'));
      timelineCreate.mockReturnValueOnce(failedTimeline('timeline boom'));
      const result = await createDocumentReviewTask(reviewTaskInput(), okResolver);
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.taskId).toBe('task-new-3');
        expect(result.timelineError).toBe('timeline boom');
        expect(result.auditError).toBeUndefined();
      }
    });

    it('reports governance-partial when BOTH audit and timeline fail', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-4'));
      auditCreate.mockReturnValueOnce(failedAudit('audit boom'));
      timelineCreate.mockReturnValueOnce(failedTimeline('timeline boom'));
      const result = await createDocumentReviewTask(reviewTaskInput(), okResolver);
      expect(result.kind).toBe('governance-partial');
      if (result.kind === 'governance-partial') {
        expect(result.auditError).toBe('audit boom');
        expect(result.timelineError).toBe('timeline boom');
      }
    });
  });

  describe('correlation discipline (Phase 46 invariants)', () => {
    it('audit + timeline share ONE correlation id from prefix "rt"', async () => {
      taskCreate.mockReturnValueOnce(successCreate('task-new-5'));
      auditCreate.mockReturnValueOnce(successAudit('aud-5'));
      timelineCreate.mockReturnValueOnce(successTimeline('tl-5'));
      await createDocumentReviewTask(reviewTaskInput(), okResolver);
      const audit = auditCreate.mock.calls[0]![0] as Record<string, unknown>;
      const tl = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
      const cid = audit.cr664_correlationid as string;
      expect(typeof cid).toBe('string');
      expect(cid.length).toBeGreaterThan(0);
      expect(tl.cr664_eventsubtype).toBe(`correlation:${cid}`);
    });
  });
});

// ===========================================================================
// WF-1A — createDealTask (general Add Task)
// ===========================================================================

import { createDealTask } from './createDealTaskAction';

function dealTaskInput(overrides: Partial<Parameters<typeof createDealTask>[0]> = {}) {
  return {
    dealId: 'deal-77',
    taskName: 'Order flood determination',
    assigneeSystemUserId: 'assignee-9',
    assigneeName: 'Dana Assignee',
    dueDate: '2026-08-01',
    actorSystemUserId: 'sys-user-1',
    actorEmail: 'banker@oldglorybank.com',
    note: 'Rush — closing in two weeks.',
    ...overrides,
  };
}

describe('WF-1A — createDealTask', () => {
  beforeEach(() => {
    taskCreate.mockReset();
    auditCreate.mockReset();
    timelineCreate.mockReset();
  });

  it('creates the task with the assignee/deal binds + due date, then audit + timeline (success)', async () => {
    taskCreate.mockReturnValueOnce(successCreate('task-new-1'));
    auditCreate.mockReturnValueOnce(successAudit('a-1'));
    timelineCreate.mockReturnValueOnce(successTimeline('tl-1'));

    const result = await createDealTask(dealTaskInput(), okResolver);

    expect(result).toEqual({ kind: 'success', taskId: 'task-new-1' });
    const payload = taskCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_taskname).toBe('Order flood determination');
    expect(payload.cr664_completed).toBe(false);
    expect(payload['cr664_AssignedTo@odata.bind']).toBe('/systemusers(assignee-9)');
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-77)');
    expect(payload.cr664_duedate).toBe('2026-08-01');
    // Owner = acting banker (not the assignee); app-level assignment is the lookup.
    expect(payload.ownerid).toBe('sys-user-1');
    // Governance pair fired.
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledTimes(1);
    const tl = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(tl['cr664_EventBy@odata.bind']).toBe('/systemusers(sys-user-1)');
  });

  it('omits cr664_duedate when no due date is provided', async () => {
    taskCreate.mockReturnValueOnce(successCreate('task-new-2'));
    auditCreate.mockReturnValueOnce(successAudit('a-2'));
    timelineCreate.mockReturnValueOnce(successTimeline('tl-2'));

    await createDealTask(dealTaskInput({ dueDate: undefined }), okResolver);

    const payload = taskCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect('cr664_duedate' in payload).toBe(false);
  });

  it('validates a blank title and an empty assignee before any write', async () => {
    expect((await createDealTask(dealTaskInput({ taskName: '   ' }), okResolver)).kind).toBe('unknown');
    expect((await createDealTask(dealTaskInput({ assigneeSystemUserId: '' }), okResolver)).kind).toBe('unknown');
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('fails closed on an unresolved audit actor: task IS created, audit is NOT written (governance-partial)', async () => {
    taskCreate.mockReturnValueOnce(successCreate('task-new-3'));
    // timeline can still succeed; the audit must fail closed on the unresolved actor.
    timelineCreate.mockReturnValueOnce(successTimeline('tl-3'));

    const result = await createDealTask(dealTaskInput(), failResolver);

    expect(result.kind).toBe('governance-partial');
    if (result.kind === 'governance-partial') {
      expect(result.taskId).toBe('task-new-3');
      expect(result.auditError).toMatch(/cr664_user|unresolved/i);
    }
    // Fail-closed: no audit row was POSTed without a resolved cr664_user actor.
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('reports task-create-failed when the task write fails (no governance-partial)', async () => {
    taskCreate.mockReturnValueOnce(failedCreate('schema rejected payload'));

    const result = await createDealTask(dealTaskInput(), okResolver);

    expect(result.kind).toBe('task-create-failed');
    if (result.kind === 'task-create-failed') expect(result.taskError).toMatch(/schema rejected/);
  });
});
