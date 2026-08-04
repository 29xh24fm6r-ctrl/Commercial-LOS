import { describe, expect, it } from 'vitest';
import { classifyDocumentStorage } from './legacyDocumentClassification';
describe('legacy document classification', () => {
  it('distinguishes native, Dataverse-file, metadata-only, and invalid records', () => {
    expect(classifyDocumentStorage({ storageProvider: 'SHAREPOINT', uploadStatus: 'SHAREPOINT_STORED', sharePointFileUrl: 'https://sp/file' })).toBe('SHAREPOINT_NATIVE');
    expect(classifyDocumentStorage({ dataverseFilePresent: true })).toBe('DATAVERSE_FILE_LEGACY');
    expect(classifyDocumentStorage({ markedReceived: true })).toBe('METADATA_ONLY_LEGACY');
    expect(classifyDocumentStorage({ storageProvider: 'SHAREPOINT' })).toBe('MIGRATION_REQUIRED');
  });
});
