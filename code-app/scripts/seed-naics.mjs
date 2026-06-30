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

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');

/**
 * Two-digit prefix → { sectorCode, sectorTitle }. MIRRORS src/crm/naics/naicsSectorMap.ts
 * (a test pins that they stay in sync). Ranged sectors expand to multiple prefixes.
 */
export const SECTOR_BY_PREFIX = Object.freeze({
  '11': { sectorCode: '11', sectorTitle: 'Agriculture, Forestry, Fishing and Hunting' },
  '21': { sectorCode: '21', sectorTitle: 'Mining, Quarrying, and Oil and Gas Extraction' },
  '22': { sectorCode: '22', sectorTitle: 'Utilities' },
  '23': { sectorCode: '23', sectorTitle: 'Construction' },
  '31': { sectorCode: '31-33', sectorTitle: 'Manufacturing' },
  '32': { sectorCode: '31-33', sectorTitle: 'Manufacturing' },
  '33': { sectorCode: '31-33', sectorTitle: 'Manufacturing' },
  '42': { sectorCode: '42', sectorTitle: 'Wholesale Trade' },
  '44': { sectorCode: '44-45', sectorTitle: 'Retail Trade' },
  '45': { sectorCode: '44-45', sectorTitle: 'Retail Trade' },
  '48': { sectorCode: '48-49', sectorTitle: 'Transportation and Warehousing' },
  '49': { sectorCode: '48-49', sectorTitle: 'Transportation and Warehousing' },
  '51': { sectorCode: '51', sectorTitle: 'Information' },
  '52': { sectorCode: '52', sectorTitle: 'Finance and Insurance' },
  '53': { sectorCode: '53', sectorTitle: 'Real Estate and Rental and Leasing' },
  '54': { sectorCode: '54', sectorTitle: 'Professional, Scientific, and Technical Services' },
  '55': { sectorCode: '55', sectorTitle: 'Management of Companies and Enterprises' },
  '56': { sectorCode: '56', sectorTitle: 'Administrative and Support and Waste Management and Remediation Services' },
  '61': { sectorCode: '61', sectorTitle: 'Educational Services' },
  '62': { sectorCode: '62', sectorTitle: 'Health Care and Social Assistance' },
  '71': { sectorCode: '71', sectorTitle: 'Arts, Entertainment, and Recreation' },
  '72': { sectorCode: '72', sectorTitle: 'Accommodation and Food Services' },
  '81': { sectorCode: '81', sectorTitle: 'Other Services (except Public Administration)' },
  '92': { sectorCode: '92', sectorTitle: 'Public Administration' },
});

/** Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas). */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Validate + normalize raw [code, title] pairs into seed records. Fail-closed:
 * a 6-digit code whose prefix is not a known sector is an ERROR, never coerced.
 * Returns { records, errors, skipped }.
 */
export function buildNaicsSeed(pairs, version) {
  const records = [];
  const errors = [];
  let skipped = 0;
  const seen = new Set();
  for (const [rawCode, rawTitle] of pairs) {
    const code = String(rawCode ?? '').trim();
    const title = String(rawTitle ?? '').trim();
    if (!/^[0-9]{6}$/.test(code)) { skipped++; continue; } // not a 6-digit detail code
    if (seen.has(code)) continue; // idempotent dedupe
    seen.add(code);
    if (title.length === 0) { errors.push(`${code}: missing title`); continue; }
    const sector = SECTOR_BY_PREFIX[code.slice(0, 2)];
    if (!sector) { errors.push(`${code}: prefix ${code.slice(0, 2)} maps to no NAICS sector`); continue; }
    records.push({
      cr664_code: code,
      cr664_title: title,
      cr664_sectorcode: sector.sectorCode,
      cr664_sectortitle: sector.sectorTitle,
      cr664_naicsversion: version,
    });
  }
  records.sort((a, b) => a.cr664_code.localeCompare(b.cr664_code)); // deterministic
  return { records, errors, skipped };
}

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
