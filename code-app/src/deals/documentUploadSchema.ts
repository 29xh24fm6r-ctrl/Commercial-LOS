/**
 * P0-2 — canonical Dataverse schema names for binary document upload, in ONE SDK-free place so the
 * operator runbook (docs/P0-2_DOCUMENT_UPLOAD_OPERATOR_DEPENDENCY.md), the live upload wiring
 * (documentUploadLiveDeps.ts), and the provisioning script
 * (scripts/dataverse/create-document-checklist-file-columns.ps1) cannot drift apart.
 *
 * These columns do NOT yet exist in the live org — upload stays fail-closed behind
 * DOCUMENT_FILE_UPLOAD_ENABLED / DOCUMENT_UPLOAD_ENABLED until an operator provisions them and
 * regenerates the SDK. See the runbook for the exact sequence.
 */

/** OData entity set for the document checklist table (plural). */
export const DOCUMENT_CHECKLIST_ENTITY_SET = 'cr664_documentchecklists' as const;

/** Singular logical table name (used by `pac code add-data-source -t`). */
export const DOCUMENT_CHECKLIST_TABLE_LOGICAL = 'cr664_documentchecklist' as const;

/** The Dataverse File column that holds the uploaded binary. This is the schema blocker. */
export const DOCUMENT_CHECKLIST_FILE_COLUMN = 'cr664_documentfile' as const;

/** Supporting upload-metadata columns provisioned alongside the File column. */
export const DOCUMENT_UPLOAD_METADATA_COLUMNS = {
  originalFileName: 'cr664_originalfilename',
  mimeType: 'cr664_mimetype',
  fileSizeBytes: 'cr664_filesizebytes',
  uploadedOn: 'cr664_uploadedon',
  uploadStatus: 'cr664_uploadstatus',
  receivedDate: 'cr664_receiveddate',
  uploadedByBind: 'cr664_UploadedBy@odata.bind',
} as const;
