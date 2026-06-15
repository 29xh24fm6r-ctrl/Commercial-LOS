#!/usr/bin/env node
// @ts-check
/**
 * Phase 170I -- repair the local runtime data-source manifest from
 * power.config.json.
 *
 * `code-app/.power/` is gitignored, so `.power/schemas/appschemas/
 * dataSourcesInfo.ts` (the manifest the bundled app uses at runtime via
 * `getClient(dataSourcesInfo)`) is a LOCAL artifact. The available
 * toolchain does not regenerate it from `power.config.json`, so a native
 * Dataverse data source registered in `power.config.json` (tracked) can be
 * MISSING from the local manifest, producing the runtime error:
 *
 *   "Unable to find data source: <entitySet> in data sources info."
 *
 * This script makes the local manifest consistent with the tracked
 * `power.config.json` databaseReferences."default.cds" data sources. It is:
 *   - ADDITIVE only: it inserts any missing native entry and never removes
 *     or rewrites an existing entry (so connector entries such as the
 *     Office365 Outlook data source are preserved).
 *   - Native only: every entry it writes is
 *     { tableId:"", version:"", primaryKey:"<logical>id",
 *       dataSourceType:"Dataverse", apis:{} } -- it NEVER writes a generic
 *     MicrosoftDataverse / shared_commondataserviceforapps connector entry.
 *   - GUID-free, offline, idempotent: no network, no Dataverse call, no
 *     record read/write. Run it again and it reports "already present".
 *
 * Usage:
 *   node scripts/sync-datasourcesinfo.mjs            # repair (default)
 *   node scripts/sync-datasourcesinfo.mjs --check    # report only, exit 1 if missing
 *
 * Output stays local (.power is gitignored); nothing here is committed.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const POWER_CONFIG = 'power.config.json';
const DSI = '.power/schemas/appschemas/dataSourcesInfo.ts';
const checkOnly = process.argv.includes('--check');

function bail(msg) {
  console.error(`sync-datasourcesinfo: ${msg}`);
  process.exit(2);
}

if (!existsSync(POWER_CONFIG)) bail(`${POWER_CONFIG} not found (run from code-app/).`);
if (!existsSync(DSI)) {
  bail(
    `${DSI} not found. It is a generated/local (.gitignored) artifact; ` +
      `produce it via the normal build/sync before running this repair.`,
  );
}

const config = JSON.parse(readFileSync(POWER_CONFIG, 'utf8'));
const cds = config?.databaseReferences?.['default.cds']?.dataSources ?? {};
/** @type {{entitySetName:string, logicalName:string}[]} */
const sources = Object.values(cds).map((s) => ({
  entitySetName: s.entitySetName,
  logicalName: s.logicalName,
}));

let dsi = readFileSync(DSI, 'utf8');

// A native entry uses the entity-set name as the key and the logical name
// + "id" as the primary key (matches every existing cr664_* entry).
function entryBlock(entitySetName, logicalName) {
  return (
    `  "${entitySetName}": {\n` +
    `    "tableId": "",\n` +
    `    "version": "",\n` +
    `    "primaryKey": "${logicalName}id",\n` +
    `    "dataSourceType": "Dataverse",\n` +
    `    "apis": {}\n` +
    `  },\n`
  );
}

const missing = sources.filter(
  (s) => s.entitySetName && !dsi.includes(`"${s.entitySetName}": {`),
);

if (missing.length === 0) {
  console.log('sync-datasourcesinfo: all power.config data sources already present in the local manifest. No change.');
  process.exit(0);
}

console.log('sync-datasourcesinfo: data sources missing from the local manifest:');
for (const s of missing) console.log(`   - ${s.entitySetName} (primaryKey ${s.logicalName}id)`);

if (checkOnly) {
  console.error(
    `\nsync-datasourcesinfo: ${missing.length} missing entr${missing.length === 1 ? 'y' : 'ies'}. ` +
      `Run \`node scripts/sync-datasourcesinfo.mjs\` to repair the local manifest before pac code push.`,
  );
  process.exit(1);
}

const anchor = 'export const dataSourcesInfo = {\n';
const idx = dsi.indexOf(anchor);
if (idx === -1) bail(`could not find the dataSourcesInfo object opening in ${DSI}.`);
const insertAt = idx + anchor.length;
const additions = missing.map((s) => entryBlock(s.entitySetName, s.logicalName)).join('');
dsi = dsi.slice(0, insertAt) + additions + dsi.slice(insertAt);
writeFileSync(DSI, dsi);

console.log(`\nsync-datasourcesinfo: added ${missing.length} native entr${missing.length === 1 ? 'y' : 'ies'} to ${DSI} (local; not committed).`);
