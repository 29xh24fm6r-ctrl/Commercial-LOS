// Shared column definitions for the PR 142 (N-17, Production Remediation Factory Arc Phase 11)
// governed test/production classification field, mirroring scripts/schema-migrations/
// pr106-risk-rating/columns.mjs exactly (same idiom, independent migration -- this PR does not
// assume any other schema-migrations PR has merged).

export const TABLE_LOGICAL_NAME = 'cr664_loandeal';

export const COLUMNS = [
  {
    logicalName: 'cr664_istestrecord',
    displayName: 'Is Test Record',
    attributeType: 'Boolean',
    trueLabel: 'Test / smoke record',
    falseLabel: 'Production record',
    // No default value is set (left unset/null on every existing and newly-created deal until an
    // admin explicitly classifies it) -- src/shared/deals/testDealClassification.ts's
    // isTestOrSmokeDeal() falls back to the pre-existing name-convention match whenever this column
    // is unset, so leaving it unset is a safe, non-breaking default, not an oversight.
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
