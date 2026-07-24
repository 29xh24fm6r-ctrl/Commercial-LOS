#!/usr/bin/env node
// Idempotently creates the PR 113 credit-memo full-text column on cr664_creditmemo1.
// Safe to re-run: checks the column's existence before attempting to create it.
//
// NOT required to fix the SEV-1 credit-memo save crash -- that fix is already live in
// src/deals/creditMemoActions.ts without any schema change. Run this ONLY if the business decides
// it wants a single full-fidelity blob on the parent row (see columns.mjs's header comment).
//
// Usage: DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... node create-columns.mjs
//
// Requires an OAuth access token for an account with System Customizer or System Administrator
// security role in the target Dataverse environment. This script does not perform authentication
// itself.

import { TABLE_LOGICAL_NAME, COLUMNS, requireEnv, apiBase, authHeaders } from './columns.mjs';

function buildAttributePayload(col) {
  const displayLabel = {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: col.displayName, LanguageCode: 1033 }],
  };
  const base = {
    SchemaName: col.logicalName,
    DisplayName: displayLabel,
    RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
  };

  switch (col.attributeType) {
    case 'Memo':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
        ...base,
        MaxLength: col.maxLength,
      };
    default:
      throw new Error(`Unsupported attributeType in columns.mjs: ${col.attributeType}`);
  }
}

async function columnExists(base, headers, logicalName) {
  const res = await fetch(
    `${base}/EntityDefinitions(LogicalName='${TABLE_LOGICAL_NAME}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`,
    { headers },
  );
  return res.status === 200;
}

async function main() {
  const dataverseUrl = requireEnv('DATAVERSE_URL');
  const accessToken = requireEnv('DATAVERSE_ACCESS_TOKEN');
  const base = apiBase(dataverseUrl);
  const headers = authHeaders(accessToken);

  for (const col of COLUMNS) {
    if (await columnExists(base, headers, col.logicalName)) {
      console.log(`SKIP (already exists): ${col.logicalName}`);
      continue;
    }
    const res = await fetch(`${base}/EntityDefinitions(LogicalName='${TABLE_LOGICAL_NAME}')/Attributes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildAttributePayload(col)),
    });
    if (!res.ok) {
      console.error(`FAILED to create ${col.logicalName}: ${res.status} ${res.statusText}`);
      console.error(await res.text());
      process.exit(1);
    }
    console.log(`CREATED: ${col.logicalName}`);
  }

  console.log('\nColumn processed. Publish customizations in the Maker Portal, then regenerate the SDK, then run verify-columns.mjs.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
