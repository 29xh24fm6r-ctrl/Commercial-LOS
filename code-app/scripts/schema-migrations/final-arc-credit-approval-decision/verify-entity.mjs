#!/usr/bin/env node
// Verifies the cr664_creditapprovaldecision table and its columns exist.
// Exits 0 (all present) or 1 (missing), printing exactly which.
//
// Usage: DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... node verify-entity.mjs

import { ENTITY_LOGICAL_NAME, COLUMNS, requireEnv, apiBase, authHeaders } from './entity.mjs';

async function main() {
  const dataverseUrl = requireEnv('DATAVERSE_URL');
  const accessToken = requireEnv('DATAVERSE_ACCESS_TOKEN');
  const base = apiBase(dataverseUrl);
  const headers = authHeaders(accessToken);

  const entityRes = await fetch(`${base}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')?$select=LogicalName`, { headers });
  if (entityRes.status !== 200) {
    console.error(`Entity ${ENTITY_LOGICAL_NAME} does not exist yet. Run create-entity.mjs (or apply via Maker Portal).`);
    process.exit(1);
  }

  const attrRes = await fetch(
    `${base}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes?$select=LogicalName,AttributeType`,
    { headers },
  );
  if (!attrRes.ok) {
    console.error(`Failed to read attribute metadata: ${attrRes.status} ${attrRes.statusText}`);
    console.error(await attrRes.text());
    process.exit(1);
  }
  const body = await attrRes.json();
  const existing = new Set((body.value ?? []).map((a) => a.LogicalName));

  const missing = COLUMNS.filter((c) => !existing.has(c.logicalName)).map((c) => c.logicalName);
  if (missing.length === 0) {
    console.log(`Entity ${ENTITY_LOGICAL_NAME} and all ${COLUMNS.length} columns are present.`);
    process.exit(0);
  }
  console.error(`Missing columns on ${ENTITY_LOGICAL_NAME}: ${missing.join(', ')}`);
  console.error('Migration is NOT complete. Run create-entity.mjs, then re-run this script.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
