// Shared entity/attribute definitions for the Final LOS Completion arc's Executed Document
// Attestation table (Workstream F). Single source of truth for create/verify/rollback.
//
// Design note: distinct from the existing cr664_closingdocumentmanifest table (PR107/PR123) --
// that table tracks GENERATION of closing documents (draft/final content), never whether the
// borrower actually EXECUTED (signed) them. This is that missing fact: closes
// CLOSING_FUNDING:executed_docs (src/workflow/loanWorkflowRequirementRegistry.ts) -- previously
// untracked, display-only.

export const ENTITY_LOGICAL_NAME = 'cr664_executeddocattestation';
export const ENTITY_DISPLAY_NAME = 'Executed Document Attestation';
export const ENTITY_PLURAL_DISPLAY_NAME = 'Executed Document Attestations';
export const PRIMARY_ATTRIBUTE_LOGICAL_NAME = 'cr664_attestationid';

// Columns beyond the primary id/name column, matching ExecutedDocumentAttestationRecord's fields
// (src/workflow/executedDocumentAttestationTypes.ts).
export const COLUMNS = [
  { logicalName: 'cr664_dealid', displayName: 'Deal Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_attestationstatus', displayName: 'Attestation Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_executeddate', displayName: 'Executed Date', attributeType: 'DateTime' },
  { logicalName: 'cr664_notes', displayName: 'Notes', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_attestedby', displayName: 'Attested By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_attestedat', displayName: 'Attested At', attributeType: 'DateTime' },
  { logicalName: 'cr664_correlationid', displayName: 'Correlation Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_supersedesattestationid', displayName: 'Supersedes Attestation Id', attributeType: 'String', maxLength: 100 },
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
