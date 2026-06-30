#!/usr/bin/env node
// @ts-check
/**
 * NAICS reference seed (Phase 1 of the CRM Intelligence spec).
 *
 * Builds the canonical, idempotent seed payload for the `cr664_naicscodes`
 * Dataverse table from the OFFICIAL public-domain 2022 NAICS 6-digit list. The
 * agent never fabricates codes: the maker downloads the real Census file (see
 * docs/NAICS_SETUP.md) and this script validates + normalizes it.
 *
 * Modes:
 *   --verify            Validate the input file, derive sectors, report counts +
 *                       version + any errors. No writes. Exit non-zero on errors.
 *   --commit            Validate, then write a deterministic seed JSON
 *                       (scripts/data/naics-2022.seed.json) for the maker to import.
 *                       If DATAVERSE_URL + DATAVERSE_TOKEN are set, additionally
 *                       upsert each row by cr664_code (idempotent alternate key).
 *
 * Options:
 *   --input <path>      NAICS source CSV (cols: code,title). Default scripts/data/naics-2022.csv
 *   --version <tag>     NAICS version tag → cr664_naicsversion. Default "2022".
 *   --out <path>        Seed JSON output path. Default scripts/data/naics-2022.seed.json
 *
 * The seed payload is deterministic (sorted by code), so re-running is a no-op and
 * the Dataverse upsert (keyed on cr664_code) never duplicates rows.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Pure validation/normalization lives in an import-safe library (no shebang) so
// vitest can unit-test it without choking on this file's CLI shebang.
import { parseCsv, buildNaicsSeed } from './seedNaicsLib.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const mode = process.argv.includes('--commit') ? 'commit' : process.argv.includes('--verify') ? 'verify' : null;
  if (!mode) {
    console.error('Usage: node scripts/seed-naics.mjs (--verify | --commit) [--input <csv>] [--version 2022] [--out <json>]');
    process.exit(2);
  }
  const version = arg('--version', '2022');
  const input = resolve(ROOT, arg('--input', 'scripts/data/naics-2022.csv'));
  const out = resolve(ROOT, arg('--out', 'scripts/data/naics-2022.seed.json'));

  if (!existsSync(input)) {
    console.error(`seed-naics: input not found: ${input}\n  Download the official 2022 NAICS 6-digit list per docs/NAICS_SETUP.md and save it there.`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(input, 'utf8'));
  // Drop a header row if the first cell isn't a 6-digit code.
  const dataRows = rows.length && !/^[0-9]{6}$/.test(String(rows[0][0]).trim()) ? rows.slice(1) : rows;
  const pairs = dataRows.map((r) => [r[0], r[1]]);
  const { records, errors, skipped } = buildNaicsSeed(pairs, version);

  console.log(`seed-naics [${mode}] — version ${version}`);
  console.log(`  input rows: ${rows.length}  · 6-digit records: ${records.length}  · skipped non-detail: ${skipped}`);
  const sectors = new Set(records.map((r) => r.cr664_sectorcode));
  console.log(`  distinct sectors represented: ${sectors.size} / 20`);
  if (errors.length) {
    console.error(`  ERRORS (${errors.length}) — fail-closed, nothing written:`);
    for (const e of errors.slice(0, 20)) console.error(`    - ${e}`);
    if (errors.length > 20) console.error(`    …and ${errors.length - 20} more`);
    process.exit(1);
  }
  console.log(`  sample: ${records.slice(0, 3).map((r) => `${r.cr664_code} ${r.cr664_title} [${r.cr664_sectorcode}]`).join(' · ')}`);

  if (mode === 'verify') {
    console.log('  ✓ verify OK (no writes).');
    return;
  }

  // commit: write deterministic seed JSON for import
  writeFileSync(out, JSON.stringify({ version, generatedFrom: 'official 2022 NAICS', count: records.length, records }, null, 2));
  console.log(`  wrote seed payload: ${out} (${records.length} records)`);

  // Optional direct upsert when operator creds are present (idempotent by cr664_code).
  const dvUrl = process.env.DATAVERSE_URL;
  const dvToken = process.env.DATAVERSE_TOKEN;
  if (dvUrl && dvToken) {
    console.log(`  DATAVERSE creds present — upserting ${records.length} rows to cr664_naicscodes …`);
    let ok = 0;
    for (const rec of records) {
      const url = `${dvUrl.replace(/\/$/, '')}/api/data/v9.2/cr664_naicscodes(cr664_code='${rec.cr664_code}')`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${dvToken}`,
          'Content-Type': 'application/json',
          'If-None-Match': null, // upsert: create or update
        },
        body: JSON.stringify(rec),
      }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }));
      if (res.ok) ok++;
      else console.error(`    upsert failed ${rec.cr664_code}: ${res.status} ${res.statusText}`);
    }
    console.log(`  upserted ${ok}/${records.length} rows.`);
    if (ok !== records.length) process.exit(1);
  } else {
    console.log('  (no DATAVERSE_URL/DATAVERSE_TOKEN — import the seed JSON per docs/NAICS_SETUP.md.)');
  }
}

// Run only as a CLI; exported functions above are unit-tested.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
