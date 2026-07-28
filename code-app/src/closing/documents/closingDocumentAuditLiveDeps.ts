import type { ClosingDocumentAuditEvent, EmitClosingDocumentAudit } from './closingDocumentAudit';

/**
 * Live audit sink for a successfully persisted closing-document manifest.
 * The manifest write remains authoritative; a rejected audit is surfaced by
 * the generation outcome as partial evidence and never rolls the document back.
 */
export const liveEmitClosingDocumentAudit: EmitClosingDocumentAudit = async (
  event: ClosingDocumentAuditEvent,
) => {
  const { manifest, changedByBind } = event;
  try {
    // Keep the Power Apps client behind the invoked write boundary. This lets
    // read-only component tests load the panel without bootstrapping the host
    // data runtime, while production still resolves the generated service at
    // the moment the governed action runs.
    const { Cr664_auditeventsService } = await import(
      '../../generated/services/Cr664_auditeventsService'
    );
    const result = await Cr664_auditeventsService.create(
      {
        cr664_auditeventname: `Closing document generated: ${manifest.templateKey}`,
        cr664_entityid: manifest.dealId,
        cr664_entitytype: 788190000,
        cr664_eventcategory: 788190002,
        cr664_eventtype: 788190001,
        cr664_outcomestatus: 788190000,
        cr664_changeddate: manifest.generatedAtIso,
        cr664_correlationid: manifest.correlationId,
        cr664_relatedentityid: manifest.manifestId,
        cr664_relatedentitytype: 'cr664_closingdocumentmanifest',
        cr664_fieldname: 'closing_document_manifest',
        cr664_newvalue: manifest.manifestId,
        cr664_notes: JSON.stringify({
          templateKey: manifest.templateKey,
          templateVersion: manifest.templateVersion,
          contentHash: manifest.contentHash,
          status: manifest.status,
          supersedesManifestId: manifest.supersedesManifestId,
        }),
        cr664_sourcescreensourceprocess: 'DealWorkspace/Closing/Documents/generate',
        'cr664_ChangedBy@odata.bind': changedByBind,
        'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${manifest.dealId})`,
      } as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    return result.success
      ? { success: true }
      : {
          success: false,
          error: result.error?.message ?? 'Closing-document audit create returned non-success.',
        };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
