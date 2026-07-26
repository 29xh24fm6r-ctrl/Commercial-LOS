// Shared column definition for the PR 138 CRM industry projection schema migration
// (N-22/N-23, Production Remediation Factory Arc Phase 7). Single source of truth
// for create/verify/rollback, mirroring scripts/schema-migrations/pr106-risk-rating/
// columns.mjs exactly (same idiom, independent migration).

export const TABLE_LOGICAL_NAME = 'cr664_loandeal';

export const COLUMNS = [
  {
    logicalName: 'cr664_crmindustryprojection',
    displayName: 'CRM Industry Projection (JSON)',
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
