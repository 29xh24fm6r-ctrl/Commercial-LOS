// Shared entity/attribute definitions for the PR 107 funding-authorization
// table. Single source of truth for create/verify/rollback.
//
// Design note: FundingAuthorizationRecord (src/funding/fundingAuthorizationTypes.ts)
// is a per-deal, append-only history (a deal can have multiple funding
// requests over time via supersedesRecordId chains), so this is modeled as
// its OWN table with a lookup to cr664_loandeal -- NOT another additive JSON
// column on cr664_loandeal (which could only ever hold one record, not a
// history). The two array-valued fields (exceptions, supportingDocumentIds
// + auditEventIds) are serialized as JSON text columns on this same table
// for now (an MVP simplification, not fully normalized to child tables) --
// a future refinement can split them out once real usage patterns exist.

export const ENTITY_LOGICAL_NAME = 'cr664_fundingauthorization';
export const ENTITY_DISPLAY_NAME = 'Funding Authorization';
export const ENTITY_PLURAL_DISPLAY_NAME = 'Funding Authorizations';
export const PRIMARY_ATTRIBUTE_LOGICAL_NAME = 'cr664_recordid';

// Columns beyond the primary id/name column, matching FundingAuthorizationRecord's fields.
export const COLUMNS = [
  { logicalName: 'cr664_dealid', displayName: 'Deal Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_authorizationstatus', displayName: 'Authorization Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_requestedamount', displayName: 'Requested Amount', attributeType: 'Decimal' },
  { logicalName: 'cr664_approvedamount', displayName: 'Approved Amount', attributeType: 'Decimal' },
  { logicalName: 'cr664_fundingdate', displayName: 'Funding Date', attributeType: 'DateTime' },
  { logicalName: 'cr664_fundingmethod', displayName: 'Funding Method', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_destinationverificationstatus', displayName: 'Destination Verification Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_conditionssatisfied', displayName: 'Conditions Satisfied', attributeType: 'Boolean' },
  { logicalName: 'cr664_exceptionsjson', displayName: 'Exceptions (JSON)', attributeType: 'Memo', maxLength: 1048576 },
  { logicalName: 'cr664_authorizedby', displayName: 'Authorized By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_secondapprovedby', displayName: 'Second Approved By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_requestedby', displayName: 'Requested By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_requestedat', displayName: 'Requested At', attributeType: 'DateTime' },
  { logicalName: 'cr664_authorizedat', displayName: 'Authorized At', attributeType: 'DateTime' },
  { logicalName: 'cr664_correlationid', displayName: 'Correlation Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_supportingdocumentidsjson', displayName: 'Supporting Document Ids (JSON)', attributeType: 'Memo', maxLength: 1048576 },
  { logicalName: 'cr664_auditeventidsjson', displayName: 'Audit Event Ids (JSON)', attributeType: 'Memo', maxLength: 1048576 },
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
