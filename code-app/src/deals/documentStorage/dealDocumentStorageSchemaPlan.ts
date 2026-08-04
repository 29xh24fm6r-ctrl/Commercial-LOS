export interface StorageColumnPlan { readonly table: string; readonly logicalName: string; readonly type: 'String' | 'Memo' | 'Integer' | 'BigInt' | 'Boolean' | 'DateTime' | 'Lookup'; readonly required: boolean; readonly targetTable?: string; }
export interface StorageRelationshipPlan { readonly schemaName: string; readonly fromTable: string; readonly fromColumn: string; readonly toTable: string; }
export interface StorageAlternateKeyPlan { readonly schemaName: string; readonly table: string; readonly columns: readonly string[]; }
export const DEAL_DOCUMENT_STORAGE_SCHEMA_VERSION = '1.0.0';
export const DEAL_DOCUMENT_STORAGE_COLUMNS: readonly StorageColumnPlan[] = [
  ...['sharepointsiteurl', 'documentlibraryname', 'annualloanfolderpath', 'companyloanfolderpath', 'companyloanfolderurl', 'sharepointfolderitemid', 'folderstatus', 'foldernamingsource', 'storageconfigurationversion', 'folderborroweridentity'].map((name) => ({ table: 'cr664_loandeal', logicalName: `cr664_${name}`, type: 'String' as const, required: false })),
  ...['foldercreatedon', 'folderlastverifiedon'].map((name) => ({ table: 'cr664_loandeal', logicalName: `cr664_${name}`, type: 'DateTime' as const, required: false })),
  { table: 'cr664_loandeal', logicalName: 'cr664_foldercreatedby', type: 'Lookup', required: false, targetTable: 'cr664_user' },
  ...['requirementkey', 'requirementgroup', 'requirementsource', 'applicabilitystate', 'reviewlevel', 'blockinglevel', 'stageactivated', 'storageprovider', 'documentuploadstatus', 'sharepointsiteurl', 'documentlibraryname', 'sharepointfolderpath', 'sharepointfileurl', 'sharepointitemid', 'originalfilename', 'storedfilename', 'mimetype'].map((name) => ({ table: 'cr664_documentchecklist', logicalName: `cr664_${name}`, type: 'String' as const, required: false })),
  { table: 'cr664_documentchecklist', logicalName: 'cr664_requirementversion', type: 'Integer', required: false },
  { table: 'cr664_documentchecklist', logicalName: 'cr664_displayyear', type: 'Integer', required: false },
  { table: 'cr664_documentchecklist', logicalName: 'cr664_filesizebytes', type: 'BigInt', required: false },
  { table: 'cr664_documentchecklist', logicalName: 'cr664_activeversion', type: 'Boolean', required: false },
  ...['uploadedon', 'storageverifiedon', 'reviewedon'].map((name) => ({ table: 'cr664_documentchecklist', logicalName: `cr664_${name}`, type: 'DateTime' as const, required: false })),
  ...[['uploadedby', 'cr664_user'], ['reviewedby', 'cr664_user'], ['replacesdocument', 'cr664_documentchecklist']].map(([name, targetTable]) => ({ table: 'cr664_documentchecklist', logicalName: `cr664_${name}`, type: 'Lookup' as const, required: false, targetTable })),
];
export const DEAL_DOCUMENT_STORAGE_NEW_TABLES = Object.freeze([
  { logicalName: 'cr664_documentrequirementfilemap', purpose: 'Explicit audited many-to-many requirement-to-file mapping.' },
  { logicalName: 'cr664_documentexception', purpose: 'Governed exception request, decision, expiry, and audit correlation.' },
  { logicalName: 'cr664_duediligencedefinition', purpose: 'Versioned structured post-approval requirement catalog.' },
]);
