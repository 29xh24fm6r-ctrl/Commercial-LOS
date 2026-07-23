// Shared column definitions for the PR 105 loan-structure schema migration.
// Single source of truth for create/verify/rollback so the three scripts
// can never drift out of sync with each other or with
// docs/factory-arc/PR105_LOAN_STRUCTURE_SCHEMA_MIGRATION.md.

export const TABLE_LOGICAL_NAME = 'cr664_loandeal';

export const COLUMNS = [
  {
    logicalName: 'cr664_loanpurpose',
    displayName: 'Loan Purpose',
    attributeType: 'String',
    maxLength: 200,
  },
  {
    logicalName: 'cr664_loantermmonths',
    displayName: 'Loan Term (Months)',
    attributeType: 'Integer',
  },
  {
    logicalName: 'cr664_ownershipstructure',
    displayName: 'Ownership Structure',
    attributeType: 'String',
    maxLength: 100,
  },
  {
    logicalName: 'cr664_financialspreadinputs',
    displayName: 'Financial Spread Inputs (JSON)',
    attributeType: 'Memo',
    maxLength: 1048576,
  },
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
