// Shared entity/attribute definitions for the Final LOS Completion arc's Adverse Action Record
// table (Workstream J). Single source of truth for create/verify/rollback.
//
// Design note: mirrors scripts/schema-migrations/final-arc-booking-qc-check/entity.mjs -- an
// Adverse Action Record is a per-deal, append-only history (a correction re-records via
// supersedesRecordId rather than mutating a prior row), so this is its OWN table with a plain
// string dealId column (not yet a Lookup relationship). Closes DECLINE:adverse_action
// (src/workflow/loanWorkflowRequirementRegistry.ts) -- previously untracked with no backing concept
// anywhere in the codebase (confirmed by direct search -- see
// docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md). This table records only that the
// notification/documentation obligation `canonicalStageTransition.ts` flags on every DECLINE
// (`adverseActionPending: true`) was completed by an authorized credit officer -- it does NOT
// define or enforce the regulatory content of an adverse-action notice, which is a product/legal
// policy decision out of scope for this arc (see the header comment on
// src/workflow/adverseActionRecordTypes.ts).

export const ENTITY_LOGICAL_NAME = 'cr664_adverseactionrecord';
export const ENTITY_DISPLAY_NAME = 'Adverse Action Record';
export const ENTITY_PLURAL_DISPLAY_NAME = 'Adverse Action Records';
export const PRIMARY_ATTRIBUTE_LOGICAL_NAME = 'cr664_recordid';

// Columns beyond the primary id/name column, matching AdverseActionRecord's fields
// (src/workflow/adverseActionRecordTypes.ts).
export const COLUMNS = [
  { logicalName: 'cr664_dealid', displayName: 'Deal Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_actionstatus', displayName: 'Action Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_notes', displayName: 'Notes', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_recordedby', displayName: 'Recorded By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_recordedat', displayName: 'Recorded At', attributeType: 'DateTime' },
  { logicalName: 'cr664_correlationid', displayName: 'Correlation Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_supersedesrecordid', displayName: 'Supersedes Record Id', attributeType: 'String', maxLength: 100 },
];

export function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

export function apiBase(dataverseUrl) {
  return `${dataverseUrl.replace(/\/+$/, '')}/api/data/v9.2`;
}

export function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}
