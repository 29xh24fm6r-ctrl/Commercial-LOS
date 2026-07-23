#!/usr/bin/env node
// Rolls back the PR 105 loan-structure columns by deleting each attribute.
// Safe at any point before the corresponding feature flags
// (ORIGINATION_LOAN_STRUCTURE_FIELDS_ENABLED / FINANCIAL_SPREAD_PERSISTENCE_ENABLED)
// are flipped to true -- no live code reads or writes these columns until then.
// If a flag WAS flipped and the column has real data, export it first: deleting
// the attribute deletes its data on every row.
//
// Usage: DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... node rollback-columns.mjs
//        (add --confirm to actually delete; without it, this is a dry run)

import { TABLE_LOGICAL_NAME, COLUMNS, requireEnv, apiBase, authHeaders } from './columns.mjs';

async function main() {
  const dataverseUrl = requireEnv('DATAVERSE_URL');
  const accessToken = requireEnv('DATAVERSE_ACCESS_TOKEN');
  const confirmed = process.argv.includes('--confirm');
  const base = apiBase(dataverseUrl);
  const headers = authHeaders(accessToken);

  if (!confirmed) {
    console.log('DRY RUN (pass --confirm to actually delete). Columns that would be removed:');
    for (const col of COLUMNS) console.log(`  - ${col.logicalName}`);
    return;
  }

  for (const col of COLUMNS) {
    const res = await fetch(
      `${base}/EntityDefinitions(LogicalName='${TABLE_LOGICAL_NAME}')/Attributes(LogicalName='${col.logicalName}')`,
      { method: 'DELETE', headers },
    );
    if (res.status === 404) {
      console.log(`SKIP (already absent): ${col.logicalName}`);
      continue;
    }
    if (!res.ok) {
      console.error(`FAILED to delete ${col.logicalName}: ${res.status} ${res.statusText}`);
      console.error(await res.text());
      process.exit(1);
    }
    console.log(`DELETED: ${col.logicalName}`);
  }
  console.log('\nRollback complete. Publish customizations in the Maker Portal to finalize.');
}

main().catch((err) => {
  console.error('Rollback failed:', err);
  process.exit(1);
});
