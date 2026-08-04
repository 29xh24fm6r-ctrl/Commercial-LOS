export type LegacyDocumentClassification = 'SHAREPOINT_NATIVE' | 'DATAVERSE_FILE_LEGACY' | 'METADATA_ONLY_LEGACY' | 'NO_FILE_REFERENCE' | 'MIGRATION_REQUIRED';
export function classifyDocumentStorage(input: { readonly storageProvider?: string; readonly uploadStatus?: string; readonly sharePointFileUrl?: string; readonly dataverseFilePresent?: boolean; readonly markedReceived?: boolean }): LegacyDocumentClassification {
  if (input.storageProvider === 'SHAREPOINT' && input.uploadStatus === 'SHAREPOINT_STORED' && input.sharePointFileUrl) return 'SHAREPOINT_NATIVE';
  if (input.dataverseFilePresent) return 'DATAVERSE_FILE_LEGACY';
  if (input.markedReceived && !input.sharePointFileUrl) return 'METADATA_ONLY_LEGACY';
  if (input.storageProvider === 'SHAREPOINT' || input.uploadStatus) return 'MIGRATION_REQUIRED';
  return 'NO_FILE_REFERENCE';
}
