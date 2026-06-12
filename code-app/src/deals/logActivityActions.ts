import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { AUDIT_OUTCOME_FAILED, AUDIT_OUTCOME_SUCCEEDED } from '../shared/governance/auditEnums';
import { newCorrelationId } from '../shared/governance/correlationId';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';

/**
 * Phase 160: governed write for banker-authored activity notes.
 *
 * The canonical activity row is cr664_DealTimelineEvent. A matching
 * audit row records the attempt and shares the same correlation id.
 */

const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;
const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;

export type LogActivityOutcome =
  | { kind: 'success'; activityId: string }
  | { kind: 'activity-failed'; activityError: string }
  | {
      kind: 'governance-partial';
      activityId: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface LogActivityInput {
  dealId: string;
  dealName: string;
  systemUserId: string;
  bankerName: string | undefined;
  note: string;
}

async function emitAuditEvent(opts: {
  input: LogActivityInput;
  correlationId: string;
  activityId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  const payload = {
    cr664_auditeventname: 'Deal Activity Logged',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.input.dealId,
    cr664_relatedentitytype: 'cr664_dealtimelineevent',
    cr664_relatedentityid: opts.activityId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'cr664_dealtimelineeventid',
    cr664_oldvalue: 'No banker activity note',
    cr664_newvalue: opts.activityId,
    cr664_beforestate: 'No banker activity note',
    cr664_afterstate: 'Banker activity note logged',
    cr664_notes:
      `Activity note logged on "${opts.input.dealName}". ` +
      `Banker: ${opts.input.bankerName ?? 'Unknown banker'}. ` +
      `Note: ${opts.input.note}`,
    cr664_sourcescreensourceprocess: 'BankerWorkspace/GreetingHeader/log-activity',
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

async function createTimelineEvent(opts: {
  input: LogActivityInput;
  correlationId: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  const payload = {
    cr664_title: 'Banker activity note',
    cr664_summary: opts.input.note,
    cr664_eventat: nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_loandeal',
    cr664_relatedentityid: opts.input.dealId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    'cr664_EventBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_eventsubtype: `activity:note|correlation:${opts.correlationId}`,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
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

export async function logActivity(input: LogActivityInput): Promise<LogActivityOutcome> {
  const note = input.note.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Activity note must not be empty.' };
  }
  if (!input.dealId.trim()) {
    return { kind: 'unknown', message: 'A deal must be selected before logging activity.' };
  }

  const normalized: LogActivityInput = {
    ...input,
    note,
    dealName: input.dealName.trim() || 'Selected deal',
  };
  const correlationId = newCorrelationId('la');
  const timeline = await createTimelineEvent({ input: normalized, correlationId });

  if (timeline.error || !timeline.id) {
    void emitAuditEvent({
      input: normalized,
      correlationId,
      activityId: 'unknown',
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: timeline.error ?? 'DealTimelineEvent create returned no id',
    });
    return {
      kind: 'activity-failed',
      activityError: timeline.error ?? 'DealTimelineEvent create returned no id',
    };
  }

  const audit = await emitAuditEvent({
    input: normalized,
    correlationId,
    activityId: timeline.id,
    outcome: AUDIT_OUTCOME_SUCCEEDED,
    failureReason: undefined,
  });

  if (audit.error) {
    return {
      kind: 'governance-partial',
      activityId: timeline.id,
      auditError: audit.error,
      timelineError: undefined,
    };
  }

  return { kind: 'success', activityId: timeline.id };
}
