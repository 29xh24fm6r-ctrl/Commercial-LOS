import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ActorChangedByResolution,
  type ResolveActorChangedBy,
} from './newDealAuditActorResolver';
import { timelineEventByBind } from './timelineActorBind';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

// Schema-verified enum constants (mirrors documentActions.ts).
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;
const TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED = 788190010;

// ---------------------------------------------------------------------------
// Intakeâ†’UW repair: governed intake of a REQUIRED document that has no
// checklist row yet.
//
// What this is:
//   - A governed CREATE of a cr664_DocumentChecklist row, associated to the
//     deal (cr664_Deal), classified by the required document's name
//     (cr664_documentname), and stamped received (cr664_receiveddate). This is
//     the supported operator path to add a mandatory document (e.g. the Loan
//     Application) that the checklist-generation automation has not produced â€”
//     the live-smoke gap (no add/upload action; checklist pilot disabled). Once
//     the row exists in received state, the stage-exit document requirement is
//     satisfied (loanWorkflowRules matches by name over received+reviewed) and,
//     because it is a real Dataverse row, it survives refresh.
//
// What this is NOT (honestly):
//   - It is NOT a binary file upload. The cr664_DocumentChecklist schema still
//     has NO File column (see markDocumentReceived above and
//     documentUploadActivation.ts); there is nowhere to store bytes. This
//     records the GOVERNED RECEIPT of the required document as metadata â€” the
//     banker attests it has been received â€” and never sets cr664_uploadstatus
//     (which is reserved for a future in-app binary upload once the maker adds a
//     File column). The UI copy says "record received", never "upload".
//
// Discipline mirrors the other governed writes, with an added readback PROOF:
//   1. Create the cr664_DocumentChecklist row (deal FK + name + received date).
//   2. Readback (get) and verify name + received date + deal FK persisted;
//      a missing/mismatched readback fails closed as readback-mismatch.
//   3. Emit cr664_AuditEvent ('DocumentChecklist Added') with outcome.
//   4. Emit cr664_DealTimelineEvent (DocumentUploaded enum â€” the closest
//      "document arrived" value) so the ledger records the intake.
// ---------------------------------------------------------------------------

export type AddRequiredDocumentOutcome =
  | { kind: 'success'; documentId: string }
  | { kind: 'create-failed'; docError: string }
  | { kind: 'readback-mismatch'; docError: string }
  | {
      kind: 'governance-partial';
      documentId: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface AddRequiredDocumentInput {
  dealId: string;
  /** The required document's business name, e.g. "Loan application". Written to cr664_documentname. */
  documentName: string;
  systemUserId: string;
  /** Acting banker's email â€” resolved fail-closed to the audit's REQUIRED cr664_ChangedBy. */
  actorEmail: string;
  /** Banker's receipt note (recorded verbatim in the audit + timeline). */
  intakeNote: string;
}

/** Dataverse `_x_value` GUIDs come back lowercase, no braces; normalize both sides for compare. */
function normalizeDocGuid(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/[{}]/g, '').toLowerCase() : '';
}

async function emitAuditEventForAdd(opts: {
  input: AddRequiredDocumentInput;
  documentId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
  const payload = {
    cr664_auditeventname: 'DocumentChecklist Added',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.documentId,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.documentId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_receiveddate',
    cr664_oldvalue: '',
    cr664_newvalue: opts.nowIso,
    cr664_beforestate: 'Not on checklist',
    cr664_afterstate: 'Received',
    cr664_notes: opts.input.intakeNote,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealDocuments/add-required',
    cr664_correlationid: opts.correlationId,
  };
  try {
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

async function emitTimelineEventForAdd(opts: {
  input: AddRequiredDocumentInput;
  documentId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_title: opts.input.documentName,
    cr664_summary: opts.input.intakeNote,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.documentId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ...timelineEventByBind(opts.actor),
    cr664_eventsubtype: `correlation:${opts.correlationId}`,
  };
  try {
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

export async function addRequiredDocument(
  input: AddRequiredDocumentInput,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<AddRequiredDocumentOutcome> {
  const name = input.documentName.trim();
  if (name.length === 0) {
    return { kind: 'unknown', message: 'Document name must not be empty.' };
  }
  const dealId = input.dealId.trim();
  if (dealId.length === 0) {
    return { kind: 'unknown', message: 'No deal is in context.' };
  }
  const note = input.intakeNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Receipt note must not be empty.' };
  }

  const correlationId = newCorrelationId('da');
  const nowIso = new Date().toISOString();
  const actor = await resolveActorChangedBy(input.actorEmail);

  // Step 1: create the checklist row â€” deal FK + business name + received date.
  let documentId: string;
  try {
    const created = await Cr664_documentchecklistsService.create({
      cr664_documentname: name,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${dealId})`,
      cr664_requestdate: nowIso,
      cr664_receiveddate: nowIso,
    } as unknown as Parameters<typeof Cr664_documentchecklistsService.create>[0]);
    if (!created.success || !created.data?.cr664_documentchecklistid) {
      // Final LOS Completion arc (Workstream P) — never render a raw transport error verbatim.
      return {
        kind: 'create-failed',
        docError: mapBusinessSafeError(created.error?.message ?? 'Document create failed', correlationId).safeMessage,
      };
    }
    documentId = created.data.cr664_documentchecklistid;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'create-failed', docError: mapBusinessSafeError(message, correlationId).safeMessage };
  }

  // Step 2: readback PROOF â€” the row must carry the name, received date, and deal FK we wrote.
  try {
    const rb = await Cr664_documentchecklistsService.get(documentId);
    const row = rb.data as unknown as Record<string, unknown> | undefined;
    const nameOk = typeof row?.cr664_documentname === 'string' && row.cr664_documentname.trim().toLowerCase() === name.toLowerCase();
    const receivedOk = typeof row?.cr664_receiveddate === 'string' && row.cr664_receiveddate.length > 0;
    const dealOk = normalizeDocGuid(row?._cr664_deal_value) === normalizeDocGuid(dealId);
    if (!rb.success || !nameOk || !receivedOk || !dealOk) {
      void emitAuditEventForAdd({ input, documentId, actor, correlationId, outcome: AUDIT_OUTCOME_FAILED, failureReason: 'readback did not confirm the created document', nowIso });
      return { kind: 'readback-mismatch', docError: 'The document was created but could not be verified on readback.' };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'readback-mismatch', docError: mapBusinessSafeError(message, correlationId).safeMessage };
  }

  // Step 3 + 4: audit + timeline in parallel; either failing â†’ governance-partial (the row IS persisted).
  const [audit, timeline] = await Promise.all([
    emitAuditEventForAdd({ input, documentId, actor, correlationId, outcome: AUDIT_OUTCOME_SUCCEEDED, failureReason: undefined, nowIso }),
    emitTimelineEventForAdd({ input, documentId, actor, correlationId, nowIso }),
  ]);
  if (audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      documentId,
      auditError: audit.error ? mapBusinessSafeError(audit.error, correlationId).safeMessage : undefined,
      timelineError: timeline.error ? mapBusinessSafeError(timeline.error, correlationId).safeMessage : undefined,
    };
  }
  return { kind: 'success', documentId };
}

