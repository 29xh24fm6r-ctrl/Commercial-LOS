// Shared entity/attribute definitions for the Final LOS Completion arc's Commitment Record table
// (Workstream D). Single source of truth for create/verify/rollback.
//
// Design note: mirrors scripts/schema-migrations/final-arc-credit-approval-decision/entity.mjs
// exactly -- a Commitment Record is a per-deal, append-only history (issued, then accepted/declined/
// expired/withdrawn, possibly superseded by a re-issued commitment), so this is its OWN table with a
// plain string dealId column (not yet a Lookup relationship), NOT another additive column on
// cr664_loandeal.
//
// Closes COMMITMENT:commitment_issued / COMMITMENT:borrower_acceptance
// (src/workflow/loanWorkflowRequirementRegistry.ts) -- previously untracked, display-only gaps.

export const ENTITY_LOGICAL_NAME = 'cr664_commitmentrecord';
export const ENTITY_DISPLAY_NAME = 'Commitment Record';
export const ENTITY_PLURAL_DISPLAY_NAME = 'Commitment Records';
export const PRIMARY_ATTRIBUTE_LOGICAL_NAME = 'cr664_commitmentid';

// Columns beyond the primary id/name column, matching CommitmentRecord's fields
// (src/workflow/commitmentRecordTypes.ts).
export const COLUMNS = [
  { logicalName: 'cr664_dealid', displayName: 'Deal Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_commitmentstatus', displayName: 'Commitment Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_approvedamount', displayName: 'Approved Amount', attributeType: 'Decimal' },
  { logicalName: 'cr664_approvedproduct', displayName: 'Approved Product', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_approvedtermmonths', displayName: 'Approved Term (Months)', attributeType: 'Decimal' },
  { logicalName: 'cr664_approvedpricing', displayName: 'Approved Pricing', attributeType: 'String', maxLength: 200 },
  { logicalName: 'cr664_keytermssummary', displayName: 'Key Terms Summary', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_expirationdate', displayName: 'Expiration Date', attributeType: 'DateTime' },
  { logicalName: 'cr664_issuedby', displayName: 'Issued By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_issuedat', displayName: 'Issued At', attributeType: 'DateTime' },
  { logicalName: 'cr664_respondedby', displayName: 'Responded By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_respondedat', displayName: 'Responded At', attributeType: 'DateTime' },
  { logicalName: 'cr664_declinereason', displayName: 'Decline Reason', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_correlationid', displayName: 'Correlation Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_supersedescommitmentid', displayName: 'Supersedes Commitment Id', attributeType: 'String', maxLength: 100 },
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
