import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_CHECKLIST_ENTITY_SET,
  DOCUMENT_CHECKLIST_TABLE_LOGICAL,
  DOCUMENT_CHECKLIST_FILE_COLUMN,
  DOCUMENT_UPLOAD_METADATA_COLUMNS,
} from './documentUploadSchema';

/**
 * P0-2 — pins the canonical Dataverse schema names for document upload so the operator runbook,
 * the provisioning script, and the live wiring can never silently diverge. If the File column name
 * ever changes, this test and the runbook must change together.
 */
describe('P0-2 document upload schema names', () => {
  it('names the exact File column, table, and entity set the provisioning script creates', () => {
    expect(DOCUMENT_CHECKLIST_FILE_COLUMN).toBe('cr664_documentfile');
    expect(DOCUMENT_CHECKLIST_TABLE_LOGICAL).toBe('cr664_documentchecklist');
    expect(DOCUMENT_CHECKLIST_ENTITY_SET).toBe('cr664_documentchecklists');
  });

  it('lists the supporting upload-metadata columns written after a successful binary upload', () => {
    expect(DOCUMENT_UPLOAD_METADATA_COLUMNS).toMatchObject({
      originalFileName: 'cr664_originalfilename',
      mimeType: 'cr664_mimetype',
      fileSizeBytes: 'cr664_filesizebytes',
      uploadedOn: 'cr664_uploadedon',
      uploadStatus: 'cr664_uploadstatus',
      receivedDate: 'cr664_receiveddate',
      uploadedByBind: 'cr664_UploadedBy@odata.bind',
    });
  });
});
