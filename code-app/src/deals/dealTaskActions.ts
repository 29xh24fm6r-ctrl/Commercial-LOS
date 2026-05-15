import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';

/**
 * Phase 21: governed write for completing an open cr664_DealTask1 from
 * the Deal Workspace.
 * Phase 70: governed write for creating a self-assigned follow-up
 * review task. See `createDocumentReviewTask` at the bottom of this
 * file. The two writes share the deal-task entity but otherwise
 * operate independently (separate outcome unions, separate
 * correlation prefixes, separate audit / timeline payloads).
 *
 * Three coordinated writes:
 *   1. Update the task: cr664_completed = true.
 *      cr664_DealTask1 has NO completion-date / completion-by /
 *      completion-notes columns; the note lives only in the audit
 *      event and the timeline event.
 *   2. Emit a cr664_AuditEvent with category=Lifecycle,
 *      eventtype=StatusChange, before/after = false/true.
 *   3. Emit a cr664_DealTimelineEvent with eventtype=TaskCompleted
 *      (exact enum match, 788190005) so the deal's activity ledger
 *      reflects the action.
 *
 * Outcome model — UI distinguishes:
 *   success            all three writes ok.
 *   task-failed        task update failed; nothing else attempted on
 *                      the deal-side; a Failed audit is fired
 *                      best-effort.
 *   governance-partial task IS completed server-side, but one or both
 *                      governance writes (audit, timeline) failed.
 *                      CRITICAL — caller must NOT retry the task
 *                      update; only the missing governance writes
 *                      could be reattempted (left to admin).
 *   unknown            defensive fallback.
 */

export type CompleteTaskOutcome =
  | { kind: 'success' }
  | { kind: 'task-failed'; taskError: string }
  | {
      kind: 'governance-partial';
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface CompleteTaskInput {
  taskId: string;
  taskName: string;
  dealId: string;
  /** Current task display info captured at click time; used for the
   *  audit before/after labels. */
  priorAssigneeName: string | undefined;
  systemUserId: string;
  completionNote: string;
}

// Enum values — kept inline so the action doesn't depend on the
// generated runtime enum maps. Locked to the schema we verified.
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const TIMELINE_EVENT_TYPE_TASK_COMPLETED = 788190005;

async function emitAuditEvent(opts: {
  input: CompleteTaskInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  const payload = {
    cr664_auditeventname: 'DealTask Completed',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.input.taskId,
    cr664_relatedentitytype: 'cr664_dealtask1',
    cr664_relatedentityid: opts.input.taskId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'cr664_completed',
    cr664_oldvalue: 'false',
    cr664_newvalue: 'true',
    cr664_beforestate: 'Open',
    cr664_afterstate: 'Completed',
    cr664_notes: opts.input.completionNote,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealTasks/complete',
    cr664_correlationid: opts.correlationId,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'AuditEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_auditeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

async function emitTimelineEvent(opts: {
  input: CompleteTaskInput;
  correlationId: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  const payload = {
    cr664_title: opts.input.taskName,
    cr664_summary: opts.input.completionNote,
    cr664_eventat: nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_TASK_COMPLETED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_dealtask1',
    cr664_relatedentityid: opts.input.taskId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    'cr664_EventBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_eventsubtype: `correlation:${opts.correlationId}`,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<
        typeof Cr664_dealtimelineeventsService.create
      >[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'DealTimelineEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_dealtimelineeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function completeTask(input: CompleteTaskInput): Promise<CompleteTaskOutcome> {
  const note = input.completionNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Completion note must not be empty.' };
  }

  const correlationId = newCorrelationId('dt');

  // Step 1: flip task to completed.
  try {
    const update = await Cr664_dealtask1sService.update(input.taskId, {
      cr664_completed: true,
    } as unknown as Parameters<typeof Cr664_dealtask1sService.update>[1]);
    if (!update.success) {
      void emitAuditEvent({
        input,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: update.error?.message ?? 'Unknown task update error',
      });
      return {
        kind: 'task-failed',
        taskError: update.error?.message ?? 'Task update failed',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
    });
    return { kind: 'task-failed', taskError: message };
  }

  // Step 2 + 3: emit audit + timeline events. Run in parallel — they
  // don't depend on each other. Both succeeding is the only path to
  // 'success'; any failure flips the outcome to governance-partial.
  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
    }),
    emitTimelineEvent({ input, correlationId }),
  ]);

  if (audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      auditError: audit.error,
      timelineError: timeline.error,
    };
  }
  return { kind: 'success' };
}

// ---------------------------------------------------------------------------
// Phase 70: createDocumentReviewTask
//
// Banker-initiated follow-up: from a pending-review-document signal
// (Phase 54 derivation in src/shared/workQueue/primitives.ts), the
// banker creates a self-assigned deal task with a structured title
// that names the document. The task lives on cr664_dealtask1s; the
// schema has NO document-foreign-key column on that entity, so we
// carry the document linkage via:
//   - the task title (banker-readable: "Follow up on document review: <name>")
//   - the audit row's cr664_relatedentitytype + cr664_relatedentityid
//     (recorded as cr664_documentchecklist + the document id)
//   - the timeline row's cr664_relatedentitytype + cr664_relatedentityid
//     (same)
//
// The task itself surfaces in the deal's open-tasks list and the
// banker's own work queue via the existing Phase 21/32 task pipeline.
//
// Phase 70 deliberately does NOT add automation: a task is created
// only when a banker explicitly clicks the "Create review task"
// action. No background sweep, no auto-assignment, no escalation
// routing.
// ---------------------------------------------------------------------------

const AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE = 788190002;
const TIMELINE_EVENT_TYPE_TASK_CREATED = 788190004;

export type CreateDocumentReviewTaskOutcome =
  | { kind: 'success'; taskId: string }
  | { kind: 'task-create-failed'; taskError: string }
  | {
      kind: 'governance-partial';
      taskId: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface CreateDocumentReviewTaskInput {
  /** Authorized deal id (already passed loadDealForBanker). */
  dealId: string;
  /** The document checklist row this follow-up relates to. Surfaces in
   *  the task title + audit / timeline linkage. */
  documentId: string;
  documentName: string;
  /** Self-assign: the banker creating the task is the assignee. The
   *  cr664_AssignedTo bind on cr664_dealtask1s is required by schema. */
  systemUserId: string;
  /** Optional banker name; used in audit notes for human readability. */
  bankerName: string | undefined;
  /** Banker-provided follow-up note (required). Appears in audit notes
   *  and timeline summary so the activity ledger explains why the task
   *  was created. */
  followUpNote: string;
}

function buildReviewTaskTitle(documentName: string): string {
  return `Follow up on document review: ${documentName}`;
}

async function emitCreateTaskAuditEvent(opts: {
  input: CreateDocumentReviewTaskInput;
  taskId: string;
  taskTitle: string;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  const notes =
    `Follow-up review task created for document "${opts.input.documentName}". ` +
    `Assigned to ${opts.input.bankerName ?? 'self'}. ` +
    `Note: ${opts.input.followUpNote}`;
  const payload = {
    cr664_auditeventname: 'DealTask Created',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.taskId,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.input.documentId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'cr664_taskname',
    cr664_oldvalue: '',
    cr664_newvalue: opts.taskTitle,
    cr664_beforestate: 'No follow-up review task',
    cr664_afterstate: 'Follow-up review task created',
    cr664_notes: notes,
    cr664_sourcescreensourceprocess:
      'DealWorkspace/DealDocuments/create-review-task',
    cr664_correlationid: opts.correlationId,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'AuditEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_auditeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

async function emitCreateTaskTimelineEvent(opts: {
  input: CreateDocumentReviewTaskInput;
  taskId: string;
  taskTitle: string;
  correlationId: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  // Phase 45 conservative copy: action-oriented, banker-safe. No
  // "review failed", "escalation", "compliance" wording.
  const summary =
    `Follow-up review task created for "${opts.input.documentName}". ` +
    `Note: ${opts.input.followUpNote}`;
  const payload = {
    cr664_title: opts.taskTitle,
    cr664_summary: summary,
    cr664_eventat: nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_TASK_CREATED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.input.documentId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    'cr664_EventBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_eventsubtype: `correlation:${opts.correlationId}`,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<
        typeof Cr664_dealtimelineeventsService.create
      >[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'DealTimelineEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_dealtimelineeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function createDocumentReviewTask(
  input: CreateDocumentReviewTaskInput,
): Promise<CreateDocumentReviewTaskOutcome> {
  const note = input.followUpNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Follow-up note must not be empty.' };
  }
  if (!input.documentName.trim()) {
    return { kind: 'unknown', message: 'Document name must not be empty.' };
  }

  const correlationId = newCorrelationId('rt');
  const taskTitle = buildReviewTaskTitle(input.documentName.trim());

  // Step 1: create the task. cr664_dealtask1s requires
  // cr664_AssignedTo@odata.bind; we self-assign to the banker. The
  // Deal bind is also set so the task surfaces in the deal's task list.
  let taskId: string;
  try {
    const create = await Cr664_dealtask1sService.create({
      cr664_taskname: taskTitle,
      cr664_completed: false,
      'cr664_AssignedTo@odata.bind': `/systemusers(${input.systemUserId})`,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
      ownerid: input.systemUserId,
      owneridtype: 'systemuser',
      statecode: 0,
    } as unknown as Parameters<typeof Cr664_dealtask1sService.create>[0]);
    if (!create.success || !create.data?.cr664_dealtask1id) {
      const msg = create.error?.message ?? 'DealTask create returned non-success';
      void emitCreateTaskAuditEvent({
        input,
        taskId: 'unknown',
        taskTitle,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: msg,
      });
      return { kind: 'task-create-failed', taskError: msg };
    }
    taskId = create.data.cr664_dealtask1id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitCreateTaskAuditEvent({
      input,
      taskId: 'unknown',
      taskTitle,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
    });
    return { kind: 'task-create-failed', taskError: message };
  }

  // Step 2 + 3: audit + timeline, in parallel. Either failure flips
  // outcome to governance-partial; the task itself IS created.
  const [audit, timeline] = await Promise.all([
    emitCreateTaskAuditEvent({
      input,
      taskId,
      taskTitle,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
    }),
    emitCreateTaskTimelineEvent({
      input,
      taskId,
      taskTitle,
      correlationId,
    }),
  ]);

  if (audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      taskId,
      auditError: audit.error,
      timelineError: timeline.error,
    };
  }
  return { kind: 'success', taskId };
}
