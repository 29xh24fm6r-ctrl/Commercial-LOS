#!/usr/bin/env node
// Idempotently creates the PR 142 (N-17) governed test/production classification column on
// cr664_loandeal. Safe to re-run.
//
// Usage: DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... node create-columns.mjs
//
// Requires an OAuth access token for an account with System Customizer or System Administrator
// security role in the target Dataverse environment. This script does not perform authentication
// itself.

import { TABLE_LOGICAL_NAME, COLUMNS, requireEnv, apiBase, authHeaders } from './columns.mjs';

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
  };
}

function buildAttributePayload(col) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: col.logicalName,
    DisplayName: label(col.displayName),
    RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
    // No DefaultValue is set -- left unset (null) on every deal so
    // testDealClassification.ts's name-convention fallback stays authoritative until an admin
    // explicitly classifies a record either way.
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: label(col.trueLabel) },
      FalseOption: { Value: 0, Label: label(col.falseLabel) },
    },
  };
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

  console.log('\nAll columns processed. Publish customizations in the Maker Portal, then regenerate the SDK, then run verify-columns.mjs.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
