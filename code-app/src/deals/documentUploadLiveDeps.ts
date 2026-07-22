/**
 * Live (Dataverse) wiring for `uploadDocumentFile` (documentUploadAction.ts).
 * Kept SEPARATE from the pure action so its SDK-free static graph stays
 * testable without a live client; only the factory below touches the
 * generated SDK / Power Apps data client, and only when actually called.
 * Mirrors checklistLiveWriteDeps.ts's dynamic-import convention exactly
 * (lives in src/deals/, not src/workflow/, for the same governance-scan
 * reason documented there).
 *
 * `uploadFile` calls the SDK client's `uploadFileToRecord` directly — per
 * docs/PHASE_51_DOCUMENT_UPLOAD_SCOPE.md §3, binary upload is on the
 * underlying client object, not the per-entity generated service, which
 * exposes CRUD only.
 */

import { createActorChangedByResolver } from './newDealAuditActorResolver';
import { buildNewDealAuditPayload, summarizeAuditPayloadShape } from './dealOriginationAudit';
import { timelineEventByBind } from './timelineActorBind';
import { newCorrelationId } from '../shared/governance/correlationId';
import type { DocumentUploadDeps } from './documentUploadAction';
import { DOCUMENT_UPLOAD_ENUMS, assertChangedByCoreUserBind } from './documentUploadAction';
import { DOCUMENT_CHECKLIST_ENTITY_SET, DOCUMENT_CHECKLIST_FILE_COLUMN } from './documentUploadSchema';

const CHECKLIST_ENTITY_SET = DOCUMENT_CHECKLIST_ENTITY_SET;
const CHECKLIST_FILE_COLUMN = DOCUMENT_CHECKLIST_FILE_COLUMN;

export function buildLiveDocumentUploadDeps(): DocumentUploadDeps {
  return {
    async uploadFile({ documentId, fileName, content }) {
      try {
        const [{ getClient }, { dataSourcesInfo }] = await Promise.all([
          import('@microsoft/power-apps/data'),
          import('../../.power/schemas/appschemas/dataSourcesInfo'),
        ]);
        const client = getClient(dataSourcesInfo);
        const res = await client.uploadFileToRecord(CHECKLIST_ENTITY_SET, documentId, CHECKLIST_FILE_COLUMN, fileName, content);
        if (!res.success) {
          return { ok: false, error: res.error?.message ?? 'uploadFileToRecord returned non-success.' };
        }
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async updateMetadata({ documentId, originalFileName, mimeType, fileSizeBytes, uploadedOnIso, uploadedByBind, nowIso }) {
      try {
        const { Cr664_documentchecklistsService } = await import(
          '../generated/services/Cr664_documentchecklistsService'
        );
        const payload: Record<string, unknown> = {
          cr664_originalfilename: originalFileName,
          cr664_mimetype: mimeType,
          cr664_filesizebytes: fileSizeBytes,
          cr664_uploadedon: uploadedOnIso,
          cr664_uploadstatus: true,
          cr664_receiveddate: nowIso,
        };
        // Omitted (never bound) when the actor cannot resolve — no faked identity.
        if (uploadedByBind) payload['cr664_UploadedBy@odata.bind'] = uploadedByBind;
        const res = await Cr664_documentchecklistsService.update(
          documentId,
          payload as unknown as Parameters<typeof Cr664_documentchecklistsService.update>[1],
        );
        if (!res.success) {
          return { ok: false, error: res.error?.message ?? 'documentchecklists update returned non-success.' };
        }
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async readback(documentId) {
      try {
        const { Cr664_documentchecklistsService } = await import(
          '../generated/services/Cr664_documentchecklistsService'
        );
        const res = await Cr664_documentchecklistsService.get(documentId, {
          select: ['cr664_originalfilename'],
        } as unknown as Parameters<typeof Cr664_documentchecklistsService.get>[1]);
        if (!res.success || !res.data) return { ok: false };
        const raw = res.data as unknown as Record<string, unknown>;
        return { ok: true, originalFileName: typeof raw['cr664_originalfilename'] === 'string' ? (raw['cr664_originalfilename'] as string) : undefined };
      } catch {
        return { ok: false };
      }
    },

    resolveActorChangedBy: createActorChangedByResolver(),

    async emitAudit({ documentId, dealId, outcome, failureReason, correlationId, nowIso, actor }) {
      if (!actor.ok || !actor.changedByBind) {
        return { ok: false, error: actor.reason ?? 'audit actor identity unresolved' };
      }
      assertChangedByCoreUserBind(actor.changedByBind);
      const payload = buildNewDealAuditPayload(
        {
          eventName: 'Document File Uploaded',
          dealId,
          changedByBind: actor.changedByBind,
          correlationId,
          outcome,
          sourceProcess: 'documentUploadAction/uploadDocumentFile',
          notes: failureReason ? `Document file upload failed for ${documentId}: ${failureReason}.` : `Document file uploaded for ${documentId}.`,
          failureReason,
          fieldName: 'cr664_documentfile',
          oldValue: '',
          newValue: failureReason ? '' : 'uploaded',
        },
        nowIso,
      );
      const shape = summarizeAuditPayloadShape(payload);
      try {
        const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
        const res = await Cr664_auditeventsService.create(
          payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
        );
        if (!res.success) return { ok: false, error: `${res.error?.message ?? 'AuditEvent create returned non-success.'} | ${shape}` };
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: `${err instanceof Error ? err.message : String(err)} | ${shape}` };
      }
    },

    async emitTimeline({ documentId, dealId, documentName, fileName, correlationId, nowIso, actor }) {
      const payload = {
        cr664_title: documentName,
        cr664_summary: `Uploaded ${fileName}`,
        cr664_eventat: nowIso,
        cr664_eventtype: DOCUMENT_UPLOAD_ENUMS.TIMELINE_EVENT_TYPE_DOCUMENT_UPLOADED,
        cr664_visibilityscope: DOCUMENT_UPLOAD_ENUMS.TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
        cr664_issystemgenerated: false,
        cr664_relatedentitytype: 'cr664_documentchecklist',
        cr664_relatedentityid: documentId,
        'cr664_Deal@odata.bind': `/cr664_loandeals(${dealId})`,
        ...timelineEventByBind(actor),
        cr664_eventsubtype: `correlation:${correlationId}`,
      };
      try {
        const { Cr664_dealtimelineeventsService } = await import(
          '../generated/services/Cr664_dealtimelineeventsService'
        );
        const res = await Cr664_dealtimelineeventsService.create(
          payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
        );
        if (!res.success) return { ok: false, error: res.error?.message ?? 'DealTimelineEvent create returned non-success.' };
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/** Kept for parity with checklistLiveWriteDeps.ts's convention of a spare correlation-id factory available to callers. */
export const newDocumentUploadCorrelationId = () => newCorrelationId('du');
