// Shared column definitions for the PR 106 risk-rating / underwriting-
// recommendation schema migration. Single source of truth for
// create/verify/rollback, mirroring scripts/schema-migrations/
// pr105-loan-structure/columns.mjs exactly (same idiom, independent
// migration -- this PR does not assume PR 105 has merged).

export const TABLE_LOGICAL_NAME = 'cr664_loandeal';

export const COLUMNS = [
  {
    logicalName: 'cr664_riskratinginputs',
    displayName: 'Risk Rating Inputs (JSON)',
    attributeType: 'Memo',
    maxLength: 1048576,
  },
  {
    logicalName: 'cr664_underwritingrecommendationinputs',
    displayName: 'Underwriting Recommendation Inputs (JSON)',
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
