/**
 * Live (Dataverse) wiring for `performDocumentRequirementAction`
 * (documentRequirementActions.ts). Kept SEPARATE from the pure action so its
 * SDK-free static graph stays testable without a live client — mirrors
 * documentUploadLiveDeps.ts / checklistLiveWriteDeps.ts exactly. Every
 * generated-service import is a dynamic `await import(...)` inside a
 * function, never a static top-level import.
 */

import { createActorChangedByResolver } from './newDealAuditActorResolver';
import { AUDIT_OUTCOME_SUCCEEDED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import { timelineEventByBind } from './timelineActorBind';
import type {
  DocumentRequirementActionDeps,
  DocumentRequirementAuditPayload,
  DocumentRequirementTimelinePayload,
  FindRowByNameResult,
} from './documentRequirementActions';
import type { DocumentRequirementAction } from './documentRequirementLifecycle';

const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const TIMELINE_EVENT_TYPE_DOCUMENT_REQUESTED = 788190009;
const TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED = 788190010;
const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;

/** Human-readable audit event name per action. */
const AUDIT_EVENT_NAME: Readonly<Record<DocumentRequirementAction, string>> = Object.freeze({
  acknowledge: 'Document Requirement Acknowledged',
  request: 'Document Requirement Requested',
  receive: 'Document Requirement Received',
  review: 'Document Requirement Reviewed',
  return_for_correction: 'Document Requirement Returned for Correction',
  waive: 'Document Requirement Waived',
  mark_not_applicable: 'Document Requirement Marked Not Applicable',
  reopen: 'Document Requirement Reopened',
});

/** The closest existing schema timeline enum per action — no dedicated per-verb value exists live. */
const TIMELINE_EVENT_TYPE: Readonly<Record<DocumentRequirementAction, number>> = Object.freeze({
  acknowledge: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
  request: TIMELINE_EVENT_TYPE_DOCUMENT_REQUESTED,
  receive: TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED,
  review: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
  return_for_correction: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
  waive: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
  mark_not_applicable: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
  reopen: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
});

async function liveFindRowByName(dealId: string, documentName: string): Promise<FindRowByNameResult> {
  try {
    const { Cr664_documentchecklistsService } = await import(
      '../generated/services/Cr664_documentchecklistsService'
    );
    const res = await Cr664_documentchecklistsService.getAll({
      filter: `_cr664_deal_value eq ${dealId} and statecode eq 0`,
    });
    if (!res.success) {
      return { ok: false, error: res.error?.message ?? 'documentchecklists getAll returned non-success.' };
    }
    const needle = documentName.trim().toLowerCase();
    const match = (res.data ?? []).find(
      (r) => (r.cr664_documentname ?? '').trim().toLowerCase() === needle,
    ) as { cr664_documentchecklistid?: string; cr664_acknowledged?: boolean } | undefined;
    if (!match?.cr664_documentchecklistid) return { ok: true, row: undefined };
    return { ok: true, row: { id: match.cr664_documentchecklistid, acknowledged: Boolean(match.cr664_acknowledged) } };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function liveCreateRow(input: {
  dealId: string;
  documentName: string;
  fields: Record<string, unknown>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { Cr664_documentchecklistsService } = await import(
      '../generated/services/Cr664_documentchecklistsService'
    );
    const payload = {
      cr664_documentname: input.documentName,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
      ...input.fields,
    };
    const res = await Cr664_documentchecklistsService.create(
      payload as unknown as Parameters<typeof Cr664_documentchecklistsService.create>[0],
    );
    if (!res.success || !res.data?.cr664_documentchecklistid) {
      return { ok: false, error: res.error?.message ?? 'documentchecklists create returned non-success.' };
    }
    return { ok: true, id: res.data.cr664_documentchecklistid };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function liveUpdateRow(
  documentId: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Cr664_documentchecklistsService } = await import(
      '../generated/services/Cr664_documentchecklistsService'
    );
    const res = await Cr664_documentchecklistsService.update(
      documentId,
      fields as unknown as Parameters<typeof Cr664_documentchecklistsService.update>[1],
    );
    if (!res.success) {
      return { ok: false, error: res.error?.message ?? 'documentchecklists update returned non-success.' };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function liveEmitAudit(payload: DocumentRequirementAuditPayload): Promise<{ ok: boolean; error?: string }> {
  if (!payload.actor.ok || !payload.actor.changedByBind) {
    return {
      ok: false,
      error:
        'audit blocked: cr664_ChangedBy could not be resolved to a cr664_user — ' +
        `${payload.actor.reason ?? 'no actor identity'}. No audit row written (fail-closed).`,
    };
  }
  assertChangedByCoreUserBind(payload.actor.changedByBind);
  try {
    const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
    const auditPayload = {
      cr664_auditeventname: AUDIT_EVENT_NAME[payload.action],
      cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
      cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
      cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
      cr664_entityid: payload.documentId,
      cr664_relatedentitytype: 'cr664_documentchecklist',
      cr664_relatedentityid: payload.documentId,
      'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${payload.dealId})`,
      cr664_outcomestatus: AUDIT_OUTCOME_SUCCEEDED,
      cr664_failurereason: undefined,
      cr664_changeddate: payload.nowIso,
      'cr664_ChangedBy@odata.bind': payload.actor.changedByBind,
      cr664_fieldname: 'cr664_requirementstatus',
      cr664_oldvalue: payload.fromStatus,
      cr664_newvalue: payload.toStatus,
      cr664_beforestate: payload.fromStatus,
      cr664_afterstate: payload.toStatus,
      cr664_notes: payload.waiverReason ?? '',
      cr664_sourcescreensourceprocess: `DealWorkspace/DealDocuments/${payload.action}`,
      cr664_correlationid: payload.correlationId,
    };
    const result = await Cr664_auditeventsService.create(
      auditPayload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return { ok: false, error: result.error?.message ?? 'AuditEvent create returned non-success.' };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function liveEmitTimeline(payload: DocumentRequirementTimelinePayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Cr664_dealtimelineeventsService } = await import(
      '../generated/services/Cr664_dealtimelineeventsService'
    );
    const timelinePayload = {
      cr664_title: payload.documentName,
      cr664_summary: AUDIT_EVENT_NAME[payload.action],
      cr664_eventat: payload.nowIso,
      cr664_eventtype: TIMELINE_EVENT_TYPE[payload.action],
      cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
      cr664_issystemgenerated: false,
      cr664_relatedentitytype: 'cr664_documentchecklist',
      cr664_relatedentityid: payload.documentId,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${payload.dealId})`,
      ...timelineEventByBind(payload.actor),
      cr664_eventsubtype: `documentrequirement:${payload.action}|correlation:${payload.correlationId}`,
    };
    const result = await Cr664_dealtimelineeventsService.create(
      timelinePayload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
    );
    if (!result.success) {
      return { ok: false, error: result.error?.message ?? 'DealTimelineEvent create returned non-success.' };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildLiveDocumentRequirementActionDeps(): DocumentRequirementActionDeps {
  return {
    findRowByName: liveFindRowByName,
    createRow: liveCreateRow,
    updateRow: liveUpdateRow,
    resolveActorChangedBy: createActorChangedByResolver(),
    emitAudit: liveEmitAudit,
    emitTimeline: liveEmitTimeline,
  };
}
