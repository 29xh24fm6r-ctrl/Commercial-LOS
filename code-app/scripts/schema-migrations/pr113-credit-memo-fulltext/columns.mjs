// Shared column definition for the PR 113 credit-memo full-text schema migration proposal.
// Single source of truth for create/verify/rollback so the three scripts can never drift out of
// sync with each other or with docs/factory-arc/PR113_CREDIT_MEMO_PERSISTENCE.md.
//
// PROPOSED, NOT APPLIED. The SEV-1 credit-memo save crash (cr664_memotext exceeding its live
// ~2,000-character Dataverse ceiling) is already fixed WITHOUT this column -- see
// src/deals/creditMemoActions.ts's buildSafeMemoTextSummary(), which now writes a short, bounded
// manifest to cr664_memotext while the full, untruncated memo body is durably preserved verbatim
// across the already-existing cr664_creditmemodraftsection rows. This migration is offered ONLY as
// an optional future enhancement (Option B from the remediation brief) if the business later wants
// the top-level cr664_creditmemo1 row itself to carry one single full-fidelity blob rather than
// relying on the section rows for full text. No code in this app reads or writes this column yet;
// it is not wired into any write/read path until a separately reviewed follow-up decides to.

export const TABLE_LOGICAL_NAME = 'cr664_creditmemo1';

export const COLUMNS = [
  {
    logicalName: 'cr664_memotextlong',
    displayName: 'Memo Text (Full, Long-Form)',
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
