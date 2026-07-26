#!/usr/bin/env node
// Rolls back the cr664_executeddocattestation table by deleting the ENTIRE
// entity (all its columns and any rows go with it). Safe at any point
// before a live persistence adapter is wired and used -- no live code
// writes to this table until then. If real attestations have already
// been recorded, export them first: deleting the entity deletes that data
// permanently.
//
// Usage: DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... node rollback-entity.mjs
//        (add --confirm to actually delete; without it, this is a dry run)

import { ENTITY_LOGICAL_NAME, requireEnv, apiBase, authHeaders } from './entity.mjs';

async function main() {
  const dataverseUrl = requireEnv('DATAVERSE_URL');
  const accessToken = requireEnv('DATAVERSE_ACCESS_TOKEN');
  const confirmed = process.argv.includes('--confirm');
  const base = apiBase(dataverseUrl);
  const headers = authHeaders(accessToken);

  if (!confirmed) {
    console.log(`DRY RUN (pass --confirm to actually delete). Entity that would be removed: ${ENTITY_LOGICAL_NAME}`);
    console.log('WARNING: this deletes the entire table, including any rows, permanently.');
    return;
  }

  const res = await fetch(`${base}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')`, { method: 'DELETE', headers });
  if (res.status === 404) {
    console.log(`SKIP (already absent): ${ENTITY_LOGICAL_NAME}`);
    return;
  }
  if (!res.ok) {
    console.error(`FAILED to delete ${ENTITY_LOGICAL_NAME}: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  console.log(`DELETED entity: ${ENTITY_LOGICAL_NAME}`);
  console.log('Publish customizations in the Maker Portal to finalize.');
}

main().catch((err) => {
  console.error('Rollback failed:', err);
  process.exit(1);
});
