import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';

/**
 * Phase 21: governed write for completing an open cr664_DealTask1 from
 * the Deal Workspace.
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
const AUDIT_OUTCOME_SUCCEEDED = 788190000;
const AUDIT_OUTCOME_FAILED = 788190001;

const TIMELINE_EVENT_TYPE_TASK_COMPLETED = 788190005;
const TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000;

function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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

  const correlationId = newCorrelationId();

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
