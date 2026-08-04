import { describe, expect, it } from 'vitest';
import {
  DEAL_DOCUMENT_STORAGE_ALTERNATE_KEYS,
  DEAL_DOCUMENT_STORAGE_NEW_TABLE_COLUMNS,
  DEAL_DOCUMENT_STORAGE_RELATIONSHIPS,
} from './dealDocumentStorageSchemaRelationships';

describe('document storage schema relationships', () => {
  it('defines the governed mapping, exception, and due-diligence records', () => {
    expect(new Set(DEAL_DOCUMENT_STORAGE_NEW_TABLE_COLUMNS.map((column) => column.table))).toEqual(new Set([
      'cr664_documentrequirementfilemap',
      'cr664_documentexception',
      'cr664_duediligencedefinition',
    ]));
    expect(DEAL_DOCUMENT_STORAGE_NEW_TABLE_COLUMNS.filter((column) => column.required).length).toBeGreaterThan(0);
  });

  it('defines every ownership relationship and deterministic alternate key', () => {
    expect(DEAL_DOCUMENT_STORAGE_RELATIONSHIPS).toHaveLength(13);
    expect(DEAL_DOCUMENT_STORAGE_RELATIONSHIPS).toContainEqual(expect.objectContaining({
      fromTable: 'cr664_documentrequirementfilemap',
      fromColumn: 'cr664_requirement',
      toTable: 'cr664_documentchecklist',
    }));
    expect(DEAL_DOCUMENT_STORAGE_ALTERNATE_KEYS).toHaveLength(3);
    expect(DEAL_DOCUMENT_STORAGE_ALTERNATE_KEYS.every((key) => key.columns.length > 0)).toBe(true);
  });
});
