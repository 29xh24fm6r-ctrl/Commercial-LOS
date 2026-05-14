import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';

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
const TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED = 788190010;
const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
const TIMELINE_SUBTYPE_DOCUMENT_REVIEWED = 'documentchecklist:reviewed';

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

// ---------------------------------------------------------------------------
// Phase 51: governed write for marking an outstanding document received.
//
// What this is:
//   - A metadata-only governed write that stamps cr664_receiveddate on
//     an existing cr664_DocumentChecklist row. This is what flips the
//     row from "outstanding" to "received" in the DealDocuments UI
//     (see dealDocumentQueries.ts → deriveStatus).
//
// What this is NOT (honestly):
//   - It is not a binary file upload. The cr664_DocumentChecklist
//     schema has NO File column today; there is nowhere to upload to.
//     The @microsoft/power-apps SDK supports uploadFileToRecord, but
//     the Dataverse table needs a File column registered first. Until
//     that schema work lands, this phase wires the metadata side of
//     the workflow only.
//   - It does NOT set cr664_uploadstatus. That flag is reserved for
//     a future phase that wires actual in-app binary upload. Setting
//     it here would conflate "marked received" with "uploaded through
//     this app" and break the existing "Source: Uploaded" surface
//     semantics.
//
// Three-write coordination matches Phase 22 (requestDocument):
//   1. Update cr664_DocumentChecklist.cr664_receiveddate = now ISO.
//   2. Emit cr664_AuditEvent ('DocumentChecklist Received') with
//      outcome=Succeeded.
//   3. Emit cr664_DealTimelineEvent with eventtype=DocumentUploaded
//      (788190010 — the closest existing schema enum value; the
//      banker is recording that the document has arrived). The
//      summary uses banker-safe "Document marked received" wording
//      throughout — no claim of binary upload.
//
// Outcome shape mirrors requestDocument: success | receive-failed |
// governance-partial | unknown.
// ---------------------------------------------------------------------------

export type MarkDocumentReceivedOutcome =
  | { kind: 'success' }
  | { kind: 'receive-failed'; docError: string }
  | {
      kind: 'governance-partial';
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface MarkDocumentReceivedInput {
  documentId: string;
  documentName: string;
  dealId: string;
  systemUserId: string;
  receiveNote: string;
}

async function emitAuditEventForReceive(opts: {
  input: MarkDocumentReceivedInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_auditeventname: 'DocumentChecklist Received',
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
    cr664_fieldname: 'cr664_receiveddate',
    cr664_oldvalue: '',
    cr664_newvalue: opts.nowIso,
    cr664_beforestate: 'Outstanding',
    cr664_afterstate: 'Received',
    cr664_notes: opts.input.receiveNote,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealDocuments/receive',
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

async function emitTimelineEventForReceive(opts: {
  input: MarkDocumentReceivedInput;
  correlationId: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_title: opts.input.documentName,
    cr664_summary: opts.input.receiveNote,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED,
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

export async function markDocumentReceived(
  input: MarkDocumentReceivedInput,
): Promise<MarkDocumentReceivedOutcome> {
  const note = input.receiveNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Receipt note must not be empty.' };
  }

  const correlationId = newCorrelationId('rd');
  const nowIso = new Date().toISOString();

  // Step 1: stamp cr664_receiveddate. This is the only schema-level
  // write — the deriveStatus selector flips the document from
  // outstanding → received off this field alone.
  try {
    const update = await Cr664_documentchecklistsService.update(input.documentId, {
      cr664_receiveddate: nowIso,
    } as unknown as Parameters<typeof Cr664_documentchecklistsService.update>[1]);
    if (!update.success) {
      void emitAuditEventForReceive({
        input,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: update.error?.message ?? 'Unknown document update error',
        nowIso,
      });
      return {
        kind: 'receive-failed',
        docError: update.error?.message ?? 'Document update failed',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEventForReceive({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
      nowIso,
    });
    return { kind: 'receive-failed', docError: message };
  }

  // Step 2 + 3: audit + timeline in parallel. Either failing flips
  // the outcome to governance-partial.
  const [audit, timeline] = await Promise.all([
    emitAuditEventForReceive({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
    }),
    emitTimelineEventForReceive({ input, correlationId, nowIso }),
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
// Phase 55: governed write for marking a received document reviewed.
//
// What this is:
//   - The third (and final, given the current schema) transition in the
//     document lifecycle: outstanding → received → reviewed. Writes the
//     banker's display name to cr664_reviewer so the existing
//     deriveStatus logic flips the row Received → Reviewed. Clears the
//     Phase 54 pending-review signal automatically (the predicate
//     keys off reviewer presence).
//
// What this is NOT (honestly):
//   - It is NOT approval. The banker has read the document and is
//     stamping their identity as the reviewer. The audit + timeline
//     events use conservative wording ("Document reviewed") — never
//     "approved", "cleared", "accepted", "validated".
//   - It is NOT a content judgment. The note flows verbatim to the
//     audit trail; the action makes no claim about what the document
//     contains.
//   - It does NOT touch cr664_uploadstatus, the file column (which
//     still doesn't exist), or any other field besides cr664_reviewer.
//
// Three-write coordination mirrors Phase 22 / Phase 51:
//   1. Update cr664_DocumentChecklist.cr664_reviewer = <banker name>.
//   2. Emit cr664_AuditEvent ('DocumentChecklist Reviewed') with
//      outcome=Succeeded.
//   3. Emit cr664_DealTimelineEvent (NoteLogged, subtype
//      'documentchecklist:reviewed|correlation:<id>') so the deal
//      activity ledger records the review.
//
// Outcome shape: success | review-failed | governance-partial |
// unknown — same Phase 47 four-branch shape every other governed
// write uses.
// ---------------------------------------------------------------------------

export type MarkDocumentReviewedOutcome =
  | { kind: 'success' }
  | { kind: 'review-failed'; docError: string }
  | {
      kind: 'governance-partial';
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface MarkDocumentReviewedInput {
  documentId: string;
  documentName: string;
  dealId: string;
  systemUserId: string;
  /** Display name written to cr664_reviewer. This is the banker's
   *  visible identity on the deal-documents card (the schema's
   *  reviewer field is a text column, not a user lookup). The
   *  systemUserId on the audit + timeline events is the durable
   *  identity link; the reviewer field is the human-readable
   *  display. */
  reviewerName: string;
  reviewNote: string;
}

async function emitAuditEventForReview(opts: {
  input: MarkDocumentReviewedInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_auditeventname: 'DocumentChecklist Reviewed',
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
    cr664_fieldname: 'cr664_reviewer',
    cr664_oldvalue: '',
    cr664_newvalue: opts.input.reviewerName,
    cr664_beforestate: 'Received',
    cr664_afterstate: 'Reviewed',
    cr664_notes: opts.input.reviewNote,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealDocuments/review',
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

async function emitTimelineEventForReview(opts: {
  input: MarkDocumentReviewedInput;
  correlationId: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_title: opts.input.documentName,
    cr664_summary: opts.input.reviewNote,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.input.documentId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    'cr664_EventBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_eventsubtype: `${TIMELINE_SUBTYPE_DOCUMENT_REVIEWED}|correlation:${opts.correlationId}`,
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

export async function markDocumentReviewed(
  input: MarkDocumentReviewedInput,
): Promise<MarkDocumentReviewedOutcome> {
  const note = input.reviewNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Review note must not be empty.' };
  }
  const reviewerName = input.reviewerName.trim();
  if (reviewerName.length === 0) {
    return {
      kind: 'unknown',
      message: 'Reviewer display name must not be empty.',
    };
  }

  const correlationId = newCorrelationId('rv');
  const nowIso = new Date().toISOString();

  // Step 1: stamp cr664_reviewer. This is the only schema-level
  // write — the deriveStatus selector flips the document from
  // received → reviewed off this field alone, and the Phase 54
  // pending-review signal clears because its predicate keys off
  // reviewer presence.
  try {
    const update = await Cr664_documentchecklistsService.update(input.documentId, {
      cr664_reviewer: reviewerName,
    } as unknown as Parameters<typeof Cr664_documentchecklistsService.update>[1]);
    if (!update.success) {
      void emitAuditEventForReview({
        input,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: update.error?.message ?? 'Unknown document update error',
        nowIso,
      });
      return {
        kind: 'review-failed',
        docError: update.error?.message ?? 'Document update failed',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEventForReview({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
      nowIso,
    });
    return { kind: 'review-failed', docError: message };
  }

  // Step 2 + 3: audit + timeline in parallel. Either failing flips
  // the outcome to governance-partial.
  const [audit, timeline] = await Promise.all([
    emitAuditEventForReview({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
    }),
    emitTimelineEventForReview({ input, correlationId, nowIso }),
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
