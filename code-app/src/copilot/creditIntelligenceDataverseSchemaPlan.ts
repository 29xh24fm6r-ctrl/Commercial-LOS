/** Additive Dataverse persistence contract for governed Copilot intelligence. */
export interface CreditIntelligenceColumnPlan {
  readonly logicalName: string;
  readonly type: 'String' | 'Memo' | 'DateTime' | 'Lookup' | 'Choice' | 'Boolean' | 'Decimal';
  readonly required: boolean;
  readonly immutable?: boolean;
}

export interface CreditIntelligenceTablePlan {
  readonly logicalName: string;
  readonly purpose: string;
  readonly appendOnly: boolean;
  readonly columns: readonly CreditIntelligenceColumnPlan[];
}

const provenanceColumns: readonly CreditIntelligenceColumnPlan[] = [
  { logicalName: 'cr664_correlationid', type: 'String', required: true, immutable: true },
  { logicalName: 'cr664_sourceid', type: 'String', required: true, immutable: true },
  { logicalName: 'cr664_sourcetype', type: 'Choice', required: true, immutable: true },
  { logicalName: 'cr664_locator', type: 'String', required: true, immutable: true },
  { logicalName: 'cr664_retrievedat', type: 'DateTime', required: true, immutable: true },
  { logicalName: 'cr664_contenthash', type: 'String', required: true, immutable: true },
  { logicalName: 'cr664_permissionbasis', type: 'Memo', required: true, immutable: true },
];

export const CREDIT_INTELLIGENCE_DATAVERSE_SCHEMA: readonly CreditIntelligenceTablePlan[] = [
  {
    logicalName: 'cr664_creditintelligencerun',
    purpose: 'Immutable request, actor, tool, policy, completion status, and evaluation hash.',
    appendOnly: true,
    columns: [
      { logicalName: 'cr664_correlationid', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_tool', type: 'Choice', required: true, immutable: true },
      { logicalName: 'cr664_actor', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_deal', type: 'Lookup', required: false, immutable: true },
      { logicalName: 'cr664_purpose', type: 'Choice', required: true, immutable: true },
      { logicalName: 'cr664_requestedat', type: 'DateTime', required: true, immutable: true },
      { logicalName: 'cr664_completedat', type: 'DateTime', required: false, immutable: true },
      { logicalName: 'cr664_status', type: 'Choice', required: true, immutable: true },
      { logicalName: 'cr664_evaluationhash', type: 'String', required: false, immutable: true },
      { logicalName: 'cr664_modeldeployment', type: 'String', required: false, immutable: true },
      { logicalName: 'cr664_modelversion', type: 'String', required: false, immutable: true },
    ],
  },
  {
    logicalName: 'cr664_creditevidence',
    purpose: 'Source-level provenance and immutable content hashes for every Copilot fact.',
    appendOnly: true,
    columns: [
      ...provenanceColumns,
      { logicalName: 'cr664_run', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_sourcerecordid', type: 'String', required: false, immutable: true },
      { logicalName: 'cr664_title', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_freshness', type: 'Choice', required: true, immutable: true },
    ],
  },
  {
    logicalName: 'cr664_creditfact',
    purpose: 'Typed facts classified as verified, CRM-provided, calculated, unverified, or inferred.',
    appendOnly: true,
    columns: [
      { logicalName: 'cr664_run', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_evidence', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_factname', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_factvaluejson', type: 'Memo', required: true, immutable: true },
      { logicalName: 'cr664_factclass', type: 'Choice', required: true, immutable: true },
      { logicalName: 'cr664_confidence', type: 'Decimal', required: false, immutable: true },
      { logicalName: 'cr664_asof', type: 'DateTime', required: false, immutable: true },
      { logicalName: 'cr664_humanverificationrequired', type: 'Boolean', required: true, immutable: true },
    ],
  },
  {
    logicalName: 'cr664_documentextraction',
    purpose: 'Page- and field-level Document Intelligence results awaiting human acceptance.',
    appendOnly: true,
    columns: [
      { logicalName: 'cr664_run', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_documentid', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_documenthash', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_modelid', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_modelversion', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_page', type: 'Decimal', required: true, immutable: true },
      { logicalName: 'cr664_fieldname', type: 'String', required: true, immutable: true },
      { logicalName: 'cr664_valuejson', type: 'Memo', required: true, immutable: true },
      { logicalName: 'cr664_confidence', type: 'Decimal', required: true, immutable: true },
      { logicalName: 'cr664_humanstatus', type: 'Choice', required: true, immutable: false },
    ],
  },
  {
    logicalName: 'cr664_copilotproposal',
    purpose: 'Human-confirmed proposal staging; never proof that the proposed action occurred.',
    appendOnly: true,
    columns: [
      { logicalName: 'cr664_run', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_proposaltype', type: 'Choice', required: true, immutable: true },
      { logicalName: 'cr664_rationale', type: 'Memo', required: true, immutable: true },
      { logicalName: 'cr664_governedwritepath', type: 'String', required: false, immutable: true },
      { logicalName: 'cr664_confirmationstatus', type: 'Choice', required: true, immutable: false },
      { logicalName: 'cr664_confirmedby', type: 'Lookup', required: false, immutable: false },
      { logicalName: 'cr664_confirmedat', type: 'DateTime', required: false, immutable: false },
      { logicalName: 'cr664_governedwriteid', type: 'String', required: false, immutable: false },
    ],
  },
  {
    logicalName: 'cr664_portfoliointelligencealert',
    purpose: 'Cited monitoring observations and proposed follow-up, not automatic risk decisions.',
    appendOnly: true,
    columns: [
      { logicalName: 'cr664_run', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_deal', type: 'Lookup', required: true, immutable: true },
      { logicalName: 'cr664_alerttype', type: 'Choice', required: true, immutable: true },
      { logicalName: 'cr664_summary', type: 'Memo', required: true, immutable: true },
      { logicalName: 'cr664_evidencejson', type: 'Memo', required: true, immutable: true },
      { logicalName: 'cr664_humanstatus', type: 'Choice', required: true, immutable: false },
    ],
  },
  {
    logicalName: 'cr664_creditintelligencepermission',
    purpose: 'Effective-dated, per-user permission for one intelligence tool and institution.',
    appendOnly: false,
    columns: [
      { logicalName: 'cr664_actor', type: 'Lookup', required: true },
      { logicalName: 'cr664_tool', type: 'String', required: true },
      { logicalName: 'cr664_bankid', type: 'String', required: true },
      { logicalName: 'cr664_effectivefrom', type: 'DateTime', required: true },
      { logicalName: 'cr664_effectivethrough', type: 'DateTime', required: false },
    ],
  },
  {
    logicalName: 'cr664_creditintelligencesource',
    purpose: 'Explicit allowlist and purpose/permission contract for each governed evidence source.',
    appendOnly: false,
    columns: [
      { logicalName: 'cr664_sourceid', type: 'String', required: true },
      { logicalName: 'cr664_sourcetype', type: 'String', required: true },
      { logicalName: 'cr664_enabled', type: 'Boolean', required: true },
      { logicalName: 'cr664_permittedtoolsjson', type: 'Memo', required: true },
      { logicalName: 'cr664_permissionmodel', type: 'String', required: true },
      { logicalName: 'cr664_maximumagehours', type: 'Decimal', required: false },
    ],
  },
];

export function validateCreditIntelligenceSchemaPlan(): readonly string[] {
  const errors: string[] = [];
  const tables = new Set<string>();
  for (const table of CREDIT_INTELLIGENCE_DATAVERSE_SCHEMA) {
    if (tables.has(table.logicalName)) errors.push(`duplicate table ${table.logicalName}`);
    tables.add(table.logicalName);
    const columns = new Set<string>();
    for (const column of table.columns) {
      if (columns.has(column.logicalName)) errors.push(`duplicate column ${table.logicalName}.${column.logicalName}`);
      columns.add(column.logicalName);
    }
  }
  return errors;
}
