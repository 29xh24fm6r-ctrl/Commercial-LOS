// Shared entity/attribute definitions for the Final LOS Completion arc's Credit Approval Decision
// table (Workstream C). Single source of truth for create/verify/rollback.
//
// Design note: mirrors scripts/schema-migrations/pr107-funding-authorization/entity.mjs exactly --
// a Credit Approval Decision is a per-deal, append-only history (a deal can be submitted, returned,
// resubmitted, approved-with-conditions, or superseded by a later decision over time), so this is
// its OWN table with a plain string dealId column (not yet a Lookup relationship -- same
// not-yet-a-lookup posture as pr123-closing-document-persistence and pr107-funding-authorization),
// NOT another additive single-value JSON column on cr664_loandeal.
//
// Field list matches the arc specification's ~20-field requirement: approval amount/product/term/
// pricing/collateral/conditions/authority tier/rationale, plus the full actor/timestamp/correlation
// trail every governed write in this codebase carries.

export const ENTITY_LOGICAL_NAME = 'cr664_creditapprovaldecision';
export const ENTITY_DISPLAY_NAME = 'Credit Approval Decision';
export const ENTITY_PLURAL_DISPLAY_NAME = 'Credit Approval Decisions';
export const PRIMARY_ATTRIBUTE_LOGICAL_NAME = 'cr664_decisionid';

// Columns beyond the primary id/name column, matching CreditApprovalDecisionRecord's fields
// (src/workflow/creditApprovalTypes.ts).
export const COLUMNS = [
  { logicalName: 'cr664_dealid', displayName: 'Deal Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_decisionstatus', displayName: 'Decision Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_approvedamount', displayName: 'Approved Amount', attributeType: 'Decimal' },
  { logicalName: 'cr664_approvedproduct', displayName: 'Approved Product', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_approvedtermmonths', displayName: 'Approved Term (Months)', attributeType: 'Decimal' },
  { logicalName: 'cr664_approvedpricing', displayName: 'Approved Pricing', attributeType: 'String', maxLength: 200 },
  { logicalName: 'cr664_collateralsummary', displayName: 'Collateral Summary', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_conditionsjson', displayName: 'Conditions of Approval (JSON)', attributeType: 'Memo', maxLength: 1048576 },
  { logicalName: 'cr664_authoritytier', displayName: 'Authority Tier', attributeType: 'String', maxLength: 60 },
  { logicalName: 'cr664_rationale', displayName: 'Rationale', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_requestedby', displayName: 'Requested By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_requestedat', displayName: 'Requested At', attributeType: 'DateTime' },
  { logicalName: 'cr664_decidedby', displayName: 'Decided By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_decidedat', displayName: 'Decided At', attributeType: 'DateTime' },
  { logicalName: 'cr664_correlationid', displayName: 'Correlation Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_supersedesdecisionid', displayName: 'Supersedes Decision Id', attributeType: 'String', maxLength: 100 },
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
