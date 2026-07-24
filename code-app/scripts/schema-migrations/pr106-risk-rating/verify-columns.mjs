#!/usr/bin/env node
// Verifies whether the PR 106 risk-rating columns exist on cr664_loandeal.
// Exits 0 (all present) or 1 (one or more missing), printing exactly which.
//
// Usage: DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... node verify-columns.mjs

import { TABLE_LOGICAL_NAME, COLUMNS, requireEnv, apiBase, authHeaders } from './columns.mjs';

async function main() {
  const dataverseUrl = requireEnv('DATAVERSE_URL');
  const accessToken = requireEnv('DATAVERSE_ACCESS_TOKEN');

  const url = `${apiBase(dataverseUrl)}/EntityDefinitions(LogicalName='${TABLE_LOGICAL_NAME}')/Attributes?$select=LogicalName,AttributeType`;
  const res = await fetch(url, { headers: authHeaders(accessToken) });
  if (!res.ok) {
    console.error(`Failed to read attribute metadata: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const body = await res.json();
  const existing = new Map((body.value ?? []).map((a) => [a.LogicalName, a.AttributeType]));

  const missing = [];
  const mismatched = [];
  for (const col of COLUMNS) {
    if (!existing.has(col.logicalName)) {
      missing.push(col.logicalName);
      continue;
    }
    const actualType = existing.get(col.logicalName);
    if (actualType !== col.attributeType) {
      mismatched.push(`${col.logicalName} (expected ${col.attributeType}, found ${actualType})`);
    }
  }

  if (missing.length === 0 && mismatched.length === 0) {
    console.log(`All ${COLUMNS.length} PR 106 risk-rating columns are present on ${TABLE_LOGICAL_NAME}.`);
    process.exit(0);
  }
  if (missing.length > 0) {
    console.error(`Missing columns on ${TABLE_LOGICAL_NAME}: ${missing.join(', ')}`);
  }
  if (mismatched.length > 0) {
    console.error(`Type-mismatched columns on ${TABLE_LOGICAL_NAME}: ${mismatched.join(', ')}`);
  }
  console.error('Migration is NOT complete. Run create-columns.mjs (or apply via Maker Portal per the migration doc), then re-run this script.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
