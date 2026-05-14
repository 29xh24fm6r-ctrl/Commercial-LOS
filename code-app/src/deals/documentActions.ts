import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';

/**
 * Phase 22: governed write for requesting an outstanding document on
 * a deal. Same three-write coordination as phase 21 (completeTask):
 *
 *   1. Update cr664_DocumentChecklist.cr664_requestdate = now ISO.
 *      The schema has NO request-by / request-note columns; the note
 *      and actor live only in the audit + timeline events.
 *   2. Emit cr664_AuditEvent (Lifecycle / StatusChange) recording the
 *      request, with the prior request date in the before state.
 *   3. Emit cr664_DealTimelineEvent with eventtype=DocumentRequested
 *      (788190009 — exact enum match) so the deal's activity ledger
 *      records the request.
 *
 * Outcome shape mirrors completeTask exactly: success | doc-failed |
 * governance-partial (audit and/or timeline failed; doc IS updated) |
 * unknown.
 *
 * Per the phase-22 guardrail: this is an IN-APP governed request only.
 * No borrower email / Outlook integration. External communication
 * (delivery failure, borrower-safe content rules) is a later phase.
 */

export type RequestDocumentOutcome =
  | { kind: 'success' }
  | { kind: 'doc-failed'; docError: string }
  | {
      kind: 'governance-partial';
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface RequestDocumentInput {
  documentId: string;
  documentName: string;
  dealId: string;
  /** Prior cr664_requestdate, if any. Captured at click time so the
   *  audit event records 'Not yet requested' vs 'Re-requested (after
   *  <date>)' precisely. */
  priorRequestDate: string | undefined;
  systemUserId: string;
  requestNote: string;
}

// Enum constants — locked to the verified schema, kept inline so the
// action doesn't depend on the generated runtime enum maps.
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const TIMELINE_EVENT_TYPE_DOCUMENT_REQUESTED = 788190009;
const TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000;

function beforeStateForRequest(prior: string | undefined): string {
  if (!prior) return 'Not yet requested';
  return `Previously requested (${prior})`;
}

async function emitAuditEvent(opts: {
  input: RequestDocumentInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_auditeventname: 'DocumentChecklist Requested',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.input.documentId,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.input.documentId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'cr664_requestdate',
    cr664_oldvalue: opts.input.priorRequestDate ?? '',
    cr664_newvalue: opts.nowIso,
    cr664_beforestate: beforeStateForRequest(opts.input.priorRequestDate),
    cr664_afterstate: 'Requested',
    cr664_notes: opts.input.requestNote,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealDocuments/request',
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
  input: RequestDocumentInput;
  correlationId: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_title: opts.input.documentName,
    cr664_summary: opts.input.requestNote,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_DOCUMENT_REQUESTED,
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

export async function requestDocument(
  input: RequestDocumentInput,
): Promise<RequestDocumentOutcome> {
  const note = input.requestNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Request note must not be empty.' };
  }

  const correlationId = newCorrelationId('dr');
  const nowIso = new Date().toISOString();

  // Step 1: stamp the document's request date.
  try {
    const update = await Cr664_documentchecklistsService.update(input.documentId, {
      cr664_requestdate: nowIso,
    } as unknown as Parameters<typeof Cr664_documentchecklistsService.update>[1]);
    if (!update.success) {
      void emitAuditEvent({
        input,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: update.error?.message ?? 'Unknown document update error',
        nowIso,
      });
      return {
        kind: 'doc-failed',
        docError: update.error?.message ?? 'Document update failed',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
      nowIso,
    });
    return { kind: 'doc-failed', docError: message };
  }

  // Step 2 + 3: audit + timeline in parallel. Either failing flips
  // the outcome to governance-partial.
  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
    }),
    emitTimelineEvent({ input, correlationId, nowIso }),
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
