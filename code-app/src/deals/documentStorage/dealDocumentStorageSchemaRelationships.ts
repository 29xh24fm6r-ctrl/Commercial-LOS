import type { StorageAlternateKeyPlan, StorageColumnPlan, StorageRelationshipPlan } from './dealDocumentStorageSchemaPlan';

export const DEAL_DOCUMENT_STORAGE_NEW_TABLE_COLUMNS: readonly StorageColumnPlan[] = Object.freeze([
  { table: 'cr664_documentrequirementfilemap', logicalName: 'cr664_correlationid', type: 'String', required: true },
  { table: 'cr664_documentrequirementfilemap', logicalName: 'cr664_active', type: 'Boolean', required: false },
  { table: 'cr664_documentrequirementfilemap', logicalName: 'cr664_mappedon', type: 'DateTime', required: false },
  { table: 'cr664_documentexception', logicalName: 'cr664_requirementkey', type: 'String', required: true },
  { table: 'cr664_documentexception', logicalName: 'cr664_exceptionreason', type: 'Memo', required: true },
  { table: 'cr664_documentexception', logicalName: 'cr664_requestedon', type: 'DateTime', required: true },
  { table: 'cr664_documentexception', logicalName: 'cr664_approvalstatus', type: 'String', required: true },
  { table: 'cr664_documentexception', logicalName: 'cr664_decisiondate', type: 'DateTime', required: false },
  { table: 'cr664_documentexception', logicalName: 'cr664_decisionnote', type: 'Memo', required: false },
  { table: 'cr664_documentexception', logicalName: 'cr664_expiration', type: 'DateTime', required: false },
  { table: 'cr664_documentexception', logicalName: 'cr664_auditcorrelationid', type: 'String', required: true },
  { table: 'cr664_duediligencedefinition', logicalName: 'cr664_stablekey', type: 'String', required: true },
  { table: 'cr664_duediligencedefinition', logicalName: 'cr664_definitionversion', type: 'Integer', required: true },
  { table: 'cr664_duediligencedefinition', logicalName: 'cr664_section', type: 'String', required: true },
  { table: 'cr664_duediligencedefinition', logicalName: 'cr664_itemtype', type: 'String', required: true },
  { table: 'cr664_duediligencedefinition', logicalName: 'cr664_stageactivated', type: 'String', required: true },
  { table: 'cr664_duediligencedefinition', logicalName: 'cr664_applicabilitysource', type: 'String', required: false },
  { table: 'cr664_duediligencedefinition', logicalName: 'cr664_active', type: 'Boolean', required: false },
]);

const relationships: ReadonlyArray<readonly [string, string, string, string]> = [
  ['cr664_loandeal_foldercreatedby', 'cr664_loandeal', 'cr664_foldercreatedby', 'cr664_user'],
  ['cr664_documentchecklist_uploadedby', 'cr664_documentchecklist', 'cr664_uploadedby', 'cr664_user'],
  ['cr664_documentchecklist_reviewedby', 'cr664_documentchecklist', 'cr664_reviewedby', 'cr664_user'],
  ['cr664_documentchecklist_replacesdocument', 'cr664_documentchecklist', 'cr664_replacesdocument', 'cr664_documentchecklist'],
  ['cr664_documentrequirementfilemap_deal', 'cr664_documentrequirementfilemap', 'cr664_deal', 'cr664_loandeal'],
  ['cr664_documentrequirementfilemap_document', 'cr664_documentrequirementfilemap', 'cr664_document', 'cr664_documentchecklist'],
  ['cr664_documentrequirementfilemap_requirement', 'cr664_documentrequirementfilemap', 'cr664_requirement', 'cr664_documentchecklist'],
  ['cr664_documentrequirementfilemap_mappedby', 'cr664_documentrequirementfilemap', 'cr664_mappedby', 'cr664_user'],
  ['cr664_documentexception_deal', 'cr664_documentexception', 'cr664_deal', 'cr664_loandeal'],
  ['cr664_documentexception_requirement', 'cr664_documentexception', 'cr664_requirement', 'cr664_documentchecklist'],
  ['cr664_documentexception_requestedby', 'cr664_documentexception', 'cr664_requestedby', 'cr664_user'],
  ['cr664_documentexception_decidedby', 'cr664_documentexception', 'cr664_decidedby', 'cr664_user'],
  ['cr664_documentexception_supportingdocument', 'cr664_documentexception', 'cr664_supportingdocument', 'cr664_documentchecklist'],
];

export const DEAL_DOCUMENT_STORAGE_RELATIONSHIPS: readonly StorageRelationshipPlan[] = Object.freeze(
  relationships.map(([schemaName, fromTable, fromColumn, toTable]) => ({ schemaName, fromTable, fromColumn, toTable })),
);

export const DEAL_DOCUMENT_STORAGE_ALTERNATE_KEYS: readonly StorageAlternateKeyPlan[] = Object.freeze([
  { schemaName: 'cr664_documentrequirementfilemap_correlation_key', table: 'cr664_documentrequirementfilemap', columns: ['cr664_correlationid'] },
  { schemaName: 'cr664_documentexception_correlation_key', table: 'cr664_documentexception', columns: ['cr664_auditcorrelationid'] },
  { schemaName: 'cr664_duediligencedefinition_stable_key', table: 'cr664_duediligencedefinition', columns: ['cr664_stablekey', 'cr664_definitionversion'] },
]);
