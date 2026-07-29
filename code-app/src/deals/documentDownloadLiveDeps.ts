import { buildNewDealAuditPayload } from './dealOriginationAudit';
import { createActorChangedByResolver } from './newDealAuditActorResolver';
import type { DocumentDownloadDeps } from './documentDownloadAction';
import {
  DOCUMENT_CHECKLIST_ENTITY_SET,
  DOCUMENT_CHECKLIST_FILE_COLUMN,
} from './documentUploadSchema';

export function buildLiveDocumentDownloadDeps(): DocumentDownloadDeps {
  return {
    resolveActorChangedBy: createActorChangedByResolver(),

    async downloadBytes(documentId) {
      try {
        const [{ getClient }, { dataSourcesInfo }] = await Promise.all([
          import('@microsoft/power-apps/data'),
          import('../../.power/schemas/appschemas/dataSourcesInfo'),
        ]);
        const client = getClient(dataSourcesInfo);
        const result = await client.downloadFileFromRecord(
          DOCUMENT_CHECKLIST_ENTITY_SET,
          documentId,
          DOCUMENT_CHECKLIST_FILE_COLUMN,
        );
        if (!result.success || !result.data) {
          return {
            ok: false,
            error:
              result.error?.message ??
              'downloadFileFromRecord returned non-success.',
          };
        }
        return { ok: true, content: result.data };
      } catch (error: unknown) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async emitAudit(input) {
      if (!input.actor.ok || !input.actor.changedByBind) {
        return {
          ok: false,
          error: input.actor.reason ?? 'audit actor identity unresolved',
        };
      }
      const nowIso = new Date().toISOString();
      const payload = buildNewDealAuditPayload(
        {
          eventName: 'Document File Downloaded',
          dealId: input.dealId,
          changedByBind: input.actor.changedByBind,
          correlationId: `document-download:${input.documentId}:${nowIso}`,
          outcome: input.outcome,
          sourceProcess: 'DealWorkspace/DealDocuments/download',
          notes: input.failureReason
            ? `Document ${input.documentId} download failed: ${input.failureReason}.`
            : `Document ${input.documentId} downloaded as ${input.fileName}; ` +
              `${input.byteLength} bytes; SHA-256 ${input.sha256}.`,
          failureReason: input.failureReason,
          fieldName: 'cr664_documentfile',
          oldValue: '',
          newValue: input.failureReason ? '' : 'downloaded',
        },
        nowIso,
      );
      try {
        const { Cr664_auditeventsService } = await import(
          '../generated/services/Cr664_auditeventsService'
        );
        const result = await Cr664_auditeventsService.create(
          payload as unknown as Parameters<
            typeof Cr664_auditeventsService.create
          >[0],
        );
        return result.success
          ? { ok: true }
          : {
              ok: false,
              error:
                result.error?.message ??
                'Document access audit returned non-success.',
            };
      } catch (error: unknown) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
