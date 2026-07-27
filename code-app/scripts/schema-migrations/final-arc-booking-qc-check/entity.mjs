// Shared entity/attribute definitions for the Final LOS Completion arc's Booking QC Check table
// (Workstream H). Single source of truth for create/verify/rollback.
//
// Design note: mirrors scripts/schema-migrations/final-arc-condition-verification/entity.mjs -- a
// Booking QC Check is a per-deal, append-only history (a failed check can be re-run after
// correction), so this is its OWN table with a plain string dealId column (not yet a Lookup
// relationship). Closes CLOSING_FUNDING:booking_qc
// (src/workflow/loanWorkflowRequirementRegistry.ts) -- previously untracked, display-only, with no
// backing concept anywhere in the codebase (confirmed by direct search -- see
// docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md).

export const ENTITY_LOGICAL_NAME = 'cr664_bookingqccheck';
export const ENTITY_DISPLAY_NAME = 'Booking QC Check';
export const ENTITY_PLURAL_DISPLAY_NAME = 'Booking QC Checks';
export const PRIMARY_ATTRIBUTE_LOGICAL_NAME = 'cr664_checkid';

// Columns beyond the primary id/name column, matching BookingQcCheckRecord's fields
// (src/workflow/bookingQcCheckTypes.ts).
export const COLUMNS = [
  { logicalName: 'cr664_dealid', displayName: 'Deal Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_qcstatus', displayName: 'QC Status', attributeType: 'String', maxLength: 40 },
  { logicalName: 'cr664_notes', displayName: 'Notes', attributeType: 'Memo', maxLength: 4000 },
  { logicalName: 'cr664_reviewedby', displayName: 'Reviewed By', attributeType: 'String', maxLength: 320 },
  { logicalName: 'cr664_reviewedat', displayName: 'Reviewed At', attributeType: 'DateTime' },
  { logicalName: 'cr664_correlationid', displayName: 'Correlation Id', attributeType: 'String', maxLength: 100 },
  { logicalName: 'cr664_supersedescheckid', displayName: 'Supersedes Check Id', attributeType: 'String', maxLength: 100 },
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
