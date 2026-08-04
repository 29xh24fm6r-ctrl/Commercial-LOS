import { describe, expect, it } from 'vitest';
import { DEAL_DOCUMENT_STORAGE_COLUMNS, DEAL_DOCUMENT_STORAGE_NEW_TABLES } from './dealDocumentStorageSchemaPlan';
describe('deal document storage schema plan', () => {
  it('has unique table/column identities and the required storage facts', () => {
    const keys = DEAL_DOCUMENT_STORAGE_COLUMNS.map((row) => `${row.table}.${row.logicalName}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['cr664_loandeal.cr664_companyloanfolderpath', 'cr664_documentchecklist.cr664_requirementkey', 'cr664_documentchecklist.cr664_sharepointfileurl', 'cr664_documentchecklist.cr664_documentuploadstatus']));
  });
  it('defines mapping, exception, and due-diligence tables without duplicating generated files', () => {
    expect(DEAL_DOCUMENT_STORAGE_NEW_TABLES.map((row) => row.logicalName)).toEqual(['cr664_documentrequirementfilemap', 'cr664_documentexception', 'cr664_duediligencedefinition']);
  });
});
