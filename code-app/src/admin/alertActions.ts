import { Cr664_alertqueuesService } from '../generated/services/Cr664_alertqueuesService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';

/**
 * Phase 19: governed writes for cr664_AlertQueue remediation.
 *
 * Parallel to Phase 18 (resolveDataQualityFlag) by design. Two actions:
 *
 *   Resolve   — alert was addressed. status -> Resolved (788190003).
 *   Dismiss   — closed without action (false positive / out of scope).
 *               status -> Closed (788190004).
 *
 * Both writes touch the same field set; the difference is the target
 * status value and the audit before/after state strings. Outcome
 * shape mirrors Phase 18 exactly so the modal can render the same
 * critical 'audit-failed' warning when the alert update succeeds but
 * the audit emission fails.
 *
 * NOTE on the audit eventtype: cr664_AuditEvent.cr664_eventtype enum
 * does NOT include a 'Dismissed' value. Both Resolve and Dismiss use
 * ExceptionResolved (788190006) — the precise terminal state lives
 * in cr664_afterstate ('Resolved' or 'Closed') and cr664_newvalue.
 * The eventcategory IS exactly Alert (788190003), so audit rows are
 * cleanly filterable by category in admin review.
 */

export type AlertOutcome =
  | { kind: 'success'; auditEventId: string | undefined }
  | { kind: 'audit-failed'; auditError: string }
  | { kind: 'alert-failed'; alertError: string }
  | { kind: 'unknown'; message: string };

export type AlertActionMode = 'resolve' | 'dismiss';

export interface AlertActionInput {
  alertId: string;
  alertName: string;
  /** Current status display name (e.g. 'New', 'In progress'). Captured
   *  as the audit before-state so reviewers can see what was active
   *  prior to remediation. */
  priorStatus: string | undefined;
  systemUserId: string;
  resolutionNote: string;
}

// Cr664 enum values
const ALERT_STATUS_RESOLVED = 788190003;
const ALERT_STATUS_CLOSED = 788190004;

const EVENT_CATEGORY_ALERT = 788190003;
const EVENT_TYPE_EXCEPTION_RESOLVED = 788190006;
const ENTITY_TYPE_CONFIGURATION = 788190005;
const OUTCOME_SUCCEEDED = 788190000;
const OUTCOME_FAILED = 788190001;

interface RemediationParams {
  mode: AlertActionMode;
  targetStatus: number;
  afterStateLabel: string;
  auditEventName: string;
}

const RESOLVE_PARAMS: RemediationParams = {
  mode: 'resolve',
  targetStatus: ALERT_STATUS_RESOLVED,
  afterStateLabel: 'Resolved',
  auditEventName: 'AlertQueue Resolved',
};

const DISMISS_PARAMS: RemediationParams = {
  mode: 'dismiss',
  targetStatus: ALERT_STATUS_CLOSED,
  afterStateLabel: 'Closed',
  auditEventName: 'AlertQueue Dismissed',
};

async function emitAuditEvent(opts: {
  input: AlertActionInput;
  params: RemediationParams;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  const beforeState = opts.input.priorStatus ?? 'Open';
  const payload = {
    cr664_auditeventname: opts.params.auditEventName,
    cr664_eventcategory: EVENT_CATEGORY_ALERT,
    cr664_eventtype: EVENT_TYPE_EXCEPTION_RESOLVED,
    cr664_entitytype: ENTITY_TYPE_CONFIGURATION,
    cr664_entityid: opts.input.alertId,
    cr664_relatedentitytype: 'cr664_alertqueue',
    cr664_relatedentityid: opts.input.alertId,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'cr664_alertstatus',
    cr664_oldvalue: beforeState,
    cr664_newvalue: opts.params.afterStateLabel,
    cr664_beforestate: beforeState,
    cr664_afterstate: opts.params.afterStateLabel,
    cr664_notes: opts.input.resolutionNote,
    cr664_sourcescreensourceprocess: `AdminWorkspace/AlertBacklog/${opts.params.mode}`,
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

async function applyAlertRemediation(
  params: RemediationParams,
  input: AlertActionInput,
): Promise<AlertOutcome> {
  const note = input.resolutionNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Resolution note must not be empty.' };
  }

  const correlationId = newCorrelationId('al');
  const nowIso = new Date().toISOString();

  // Step 1: update the alert lifecycle fields.
  try {
    const update = await Cr664_alertqueuesService.update(input.alertId, {
      cr664_alertstatus: params.targetStatus,
      cr664_resolveddate: nowIso,
      cr664_resolutionnotes: note,
      'cr664_ResolvedBy@odata.bind': `/systemusers(${input.systemUserId})`,
    } as unknown as Parameters<typeof Cr664_alertqueuesService.update>[1]);

    if (!update.success) {
      void emitAuditEvent({
        input,
        params,
        correlationId,
        outcome: OUTCOME_FAILED,
        failureReason: update.error?.message ?? 'Unknown alert update error',
      });
      return {
        kind: 'alert-failed',
        alertError: update.error?.message ?? 'Alert update failed',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      input,
      params,
      correlationId,
      outcome: OUTCOME_FAILED,
      failureReason: message,
    });
    return { kind: 'alert-failed', alertError: message };
  }

  // Step 2: emit the Succeeded audit event. Alert is updated server-
  // side at this point; audit failure is a CRITICAL partial state.
  const audit = await emitAuditEvent({
    input,
    params,
    correlationId,
    outcome: OUTCOME_SUCCEEDED,
    failureReason: undefined,
  });
  if (audit.error) {
    return { kind: 'audit-failed', auditError: audit.error };
  }
  return { kind: 'success', auditEventId: audit.id };
}

export function resolveAlert(input: AlertActionInput): Promise<AlertOutcome> {
  return applyAlertRemediation(RESOLVE_PARAMS, input);
}

export function dismissAlert(input: AlertActionInput): Promise<AlertOutcome> {
  return applyAlertRemediation(DISMISS_PARAMS, input);
}
