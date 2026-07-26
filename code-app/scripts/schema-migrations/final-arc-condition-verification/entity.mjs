// Shared entity/attribute definitions for the Final LOS Completion arc's Condition Verification
// Record table (Workstream E). Single source of truth for create/verify/rollback.
//
// Design note: mirrors scripts/schema-migrations/final-arc-commitment-record/entity.mjs -- a single
// table parameterized by conditionType (CONDITIONS_PRECEDENT / COLLATERAL / INSURANCE) rather than
// three separate tables, since all three share the exact same lifecycle (verified/waived/failed,
// with notes, actor, timestamp, and an append-only re-verification chain). Closes
// DOCUMENTATION:conditions_precedent / :collateral_verified / :insurance_verified
// (src/workflow/loanWorkflowRequirementRegistry.ts) -- previously untracked, display-only gaps.

export const ENTITY_LOGICAL_NAME = 'cr664_conditionverification';
export const ENTITY_DISPLAY_NAME = 'Condition Verification';
export const ENTITY_PLURAL_DISPLAY_NAME = 'Condition Verifications';
export const PRIMARY_ATTRIBUTE_LOGICAL_NAME = 'cr664_recordid';

// Columns beyond the primary id/name column, matching ConditionVerificationRecord's fields
// (src/workflow/conditionVerificationTypes.ts).
export const COLUMNS = [
  { logicalName: 'cr664_dealid', displayName: 'Deal Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_conditiontype', displayName: 'Condition Type', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_verificationstatus', displayName: 'Verification Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_notes', displayName: 'Notes', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_verifiedby', displayName: 'Verified By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_verifiedat', displayName: 'Verified At', attributeType: 'DateTime' },
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
