/**
 * WF-1A — general "Add Task" governed write (Deal Workspace).
 *
 * A banker creates an arbitrary follow-up task on a deal: title + assignee
 * (systemuser) + optional due date. Same governed discipline as completeTask /
 * createDocumentReviewTask — create the task, then emit the audit + timeline
 * pair with a fail-closed cr664_user actor (governance-partial if either
 * governance write fails; the task itself IS created).
 *
 * cr664_dealtask1 has NO description/notes/priority/category column (confirmed
 * against the generated model), so the operator note is NOT stored on the task;
 * it lives only in the governed audit + timeline rows.
 *
 * NOTE (governance): this is a genuine governed write but is deliberately NOT
 * yet added to GOVERNED_WRITES / ACTION_BY_WRITE_ID. WF-1A is an explicitly
 * pre-production pilot ("walk one deal"); registering it in the certified
 * inventory would require bumping frozen release-certification snapshots
 * (PHASE_111_SNAPSHOT, phase129A AUDIT_COUNTS, ReleaseReadinessGate) from 13
 * governed writes to 14 — a deliberate re-certification event. That belongs to
 * WF-1B (hardening), not this walk. Keeping the write in its own module until
 * then avoids falsifying those frozen baselines.
 */

// The generated services are dynamic-imported inside each function so this
// module stays SDK-free at load time — consumers (DealTasks) can be collected
// under vitest without the @microsoft/power-apps/data SDK resolving statically.
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ActorChangedByResolution,
  type ResolveActorChangedBy,
} from './newDealAuditActorResolver';

// Enum values — kept inline (schema-verified), matching dealTaskActions.ts.
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE = 788190002;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;
const TIMELINE_EVENT_TYPE_TASK_CREATED = 788190004;

export type CreateDealTaskOutcome =
  | { kind: 'success'; taskId: string }
  | { kind: 'task-create-failed'; taskError: string }
  | {
      kind: 'governance-partial';
      taskId: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface CreateDealTaskInput {
  /** Authorized deal id (already passed loadDealForBanker). */
  dealId: string;
  /** Task title (required — cr664_taskname). */
  taskName: string;
  /** Assignee systemuser id — cr664_AssignedTo@odata.bind is schema-required. */
  assigneeSystemUserId: string;
  /** Optional assignee display name for the audit/timeline note (human-readable). */
  assigneeName?: string;
  /** Optional ISO due date — cr664_duedate. */
  dueDate?: string;
  /** Acting banker's Dataverse systemuser id. Retained as identity context; it is
   *  NOT bound into any lookup (owner is server-defaulted; the audit cr664_ChangedBy
   *  AND timeline cr664_EventBy both target cr664_user, resolved from actorEmail). */
  actorSystemUserId: string;
  /** Acting banker's email — resolved fail-closed to the cr664_user bind used by
   *  BOTH the audit cr664_ChangedBy and the timeline cr664_EventBy. A systemuser id
   *  is NEVER bound into either cr664_user lookup. */
  actorEmail: string;
  /** Optional operator note; copied to the audit + timeline (never onto the task). */
  note?: string;
}

function buildDealTaskNote(input: CreateDealTaskInput): string {
  const assignee = input.assigneeName?.trim() || 'the selected user';
  const base = `Task "${input.taskName.trim()}" created and assigned to ${assignee}.`;
  const note = input.note?.trim();
  return note ? `${base} Note: ${note}` : base;
}

async function emitAddTaskAuditEvent(opts: {
  input: CreateDealTaskInput;
  actor: ActorChangedByResolution;
  taskId: string;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
  const nowIso = new Date().toISOString();
  const payload = {
    cr664_auditeventname: 'DealTask Created',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.taskId,
    cr664_relatedentitytype: 'cr664_dealtask1',
    cr664_relatedentityid: opts.taskId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_taskname',
    cr664_oldvalue: '',
    cr664_newvalue: opts.input.taskName.trim(),
    cr664_beforestate: 'No task',
    cr664_afterstate: 'Task created',
    cr664_notes: buildDealTaskNote(opts.input),
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealTasks/create',
    cr664_correlationid: opts.correlationId,
  };
  try {
    const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return { id: undefined, error: result.error?.message ?? 'AuditEvent create returned non-success' };
    }
    return { id: result.data?.cr664_auditeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

async function emitAddTaskTimelineEvent(opts: {
  input: CreateDealTaskInput;
  actor: ActorChangedByResolution;
  taskId: string;
  correlationId: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  // cr664_EventBy targets the custom cr664_user table — NOT systemuser — exactly
  // like the audit's cr664_ChangedBy. Binding a systemuser id here is what caused
  // the live "Entity 'cr664_User' ... Does Not Exist" failure. Reuse the SAME
  // resolved cr664_user bind the audit uses; never bind a systemuser id.
  // cr664_EventBy is an OPTIONAL lookup, so when the actor cannot resolve we OMIT
  // it (the event still records) rather than fake an identity — fail-closed.
  const eventByBind = opts.actor.ok && opts.actor.changedByBind ? opts.actor.changedByBind : undefined;
  const payload = {
    cr664_title: opts.input.taskName.trim(),
    cr664_summary: buildDealTaskNote(opts.input),
    cr664_eventat: nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_TASK_CREATED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_dealtask1',
    cr664_relatedentityid: opts.taskId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ...(eventByBind ? { 'cr664_EventBy@odata.bind': eventByBind } : {}),
    cr664_eventsubtype: `correlation:${opts.correlationId}`,
  };
  try {
    const { Cr664_dealtimelineeventsService } = await import('../generated/services/Cr664_dealtimelineeventsService');
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
    );
    if (!result.success) {
      return { id: undefined, error: result.error?.message ?? 'DealTimelineEvent create returned non-success' };
    }
    return { id: result.data?.cr664_dealtimelineeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createDealTask(
  input: CreateDealTaskInput,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<CreateDealTaskOutcome> {
  const taskName = input.taskName.trim();
  if (taskName.length === 0) {
    return { kind: 'unknown', message: 'Task title must not be empty.' };
  }
  // cr664_AssignedTo is required by the entity schema; fail closed if absent.
  if (input.assigneeSystemUserId.trim().length === 0) {
    return { kind: 'unknown', message: 'An assignee is required.' };
  }

  const correlationId = newCorrelationId('at');
  const actor = await resolveActorChangedBy(input.actorEmail);

  // Step 1: create the task. Owner is server-defaulted to the calling user;
  // cr664_AssignedTo carries the app-level assignment (no ownerid/statecode set).
  let taskId: string;
  try {
    const { Cr664_dealtask1sService } = await import('../generated/services/Cr664_dealtask1sService');
    const create = await Cr664_dealtask1sService.create({
      cr664_taskname: taskName,
      cr664_completed: false,
      'cr664_AssignedTo@odata.bind': `/systemusers(${input.assigneeSystemUserId})`,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
      ...(input.dueDate && input.dueDate.trim().length > 0 ? { cr664_duedate: input.dueDate } : {}),
    } as unknown as Parameters<typeof Cr664_dealtask1sService.create>[0]);
    if (!create.success || !create.data?.cr664_dealtask1id) {
      const msg = create.error?.message ?? 'DealTask create returned non-success';
      void emitAddTaskAuditEvent({ input, actor, taskId: 'unknown', correlationId, outcome: AUDIT_OUTCOME_FAILED, failureReason: msg });
      return { kind: 'task-create-failed', taskError: msg };
    }
    taskId = create.data.cr664_dealtask1id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAddTaskAuditEvent({ input, actor, taskId: 'unknown', correlationId, outcome: AUDIT_OUTCOME_FAILED, failureReason: message });
    return { kind: 'task-create-failed', taskError: message };
  }

  // Step 2 + 3: audit + timeline, in parallel. Either failure → governance-partial.
  const [audit, timeline] = await Promise.all([
    emitAddTaskAuditEvent({ input, actor, taskId, correlationId, outcome: AUDIT_OUTCOME_SUCCEEDED, failureReason: undefined }),
    emitAddTaskTimelineEvent({ input, actor, taskId, correlationId }),
  ]);

  if (audit.error || timeline.error) {
    return { kind: 'governance-partial', taskId, auditError: audit.error, timelineError: timeline.error };
  }
  return { kind: 'success', taskId };
}
