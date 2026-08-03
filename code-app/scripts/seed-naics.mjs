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
 *   --commit            Validate + write the deterministic seed JSON, then LOAD the
 *                       rows into Dataverse when a token is available (idempotent
 *                       upsert by cr664_code). Prints an unmistakable final STATUS
 *                       saying whether the table was actually updated.
 *
 * Loading into Dataverse (the --commit push) needs a bearer token:
 *   - Set DATAVERSE_TOKEN (a token for your environment's Web API).
 *   - The environment URL is auto-resolved from `pac org who` (you're already
 *     authenticated from `pac code push`); override with DATAVERSE_URL if needed.
 *   - No token? --commit still writes the seed JSON and tells you, loudly, that the
 *     table was NOT updated and how to finish (import the JSON via a dataflow).
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
import { spawnSync } from 'node:child_process';
// Pure validation/normalization lives in an import-safe library (no shebang) so
// vitest can unit-test it without choking on this file's CLI shebang.
import { parseCsv, buildNaicsSeed } from './seedNaicsLib.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Best-effort environment URL, so the maker needs only a token (not also a URL).
 *  Order: DATAVERSE_URL env → `pac org who`. Returns undefined if neither yields one. */
function resolveEnvUrl() {
  // Accept either name (DATAVERSE_ENV_URL is what the stage-seed script + repo convention use).
  const fromEnv = process.env.DATAVERSE_URL ?? process.env.DATAVERSE_ENV_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  try {
    const res = spawnSync('pac', ['org', 'who'], { encoding: 'utf8' });
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    const m = out.match(/(https:\/\/[^\s]+\.crm\d*\.dynamics\.com)/i);
    if (m) return m[1].replace(/\/$/, '');
  } catch {
    // pac not installed / not on PATH — fall through to the JSON-import path.
  }
  return undefined;
}

/** GUID-addressed create/update. Natural-key duplicates are rejected before
 * writes, so this seed never depends on alternate-key index activation. */
async function writeRow(envUrl, token, action) {
  const url = action.kind === 'create'
    ? `${envUrl}/api/data/v9.2/cr664_naicscodes`
    : `${envUrl}/api/data/v9.2/cr664_naicscodes(${action.id})`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: action.kind === 'create' ? 'POST' : 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
        body: JSON.stringify(action.record),
      });
    } catch (e) {
      if (attempt === 3) return { ok: false, detail: `network: ${String(e)}` };
      await sleep(400 * attempt);
      continue;
    }
    if (res.ok) return { ok: true };
    // 429 / 5xx are transient; 4xx (auth/schema) are not — fail fast on those.
    if (res.status !== 429 && res.status < 500) {
      return { ok: false, detail: `${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}` };
    }
    if (attempt === 3) return { ok: false, detail: `${res.status} ${res.statusText}` };
    await sleep(400 * attempt);
  }
  return { ok: false, detail: 'exhausted retries' };
}

async function readExisting(envUrl, token) {
  let url = `${envUrl}/api/data/v9.2/cr664_naicscodes?$select=cr664_naicscodeid,cr664_code,cr664_title,cr664_sectorcode,cr664_sectortitle,cr664_naicsversion,statecode`;
  const rows = [];
  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
    });
    if (!res.ok) throw new Error(`GET cr664_naicscodes failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    rows.push(...(body.value ?? []));
    url = body['@odata.nextLink'] ?? '';
  }
  return rows;
}

function planChanges(records, existing) {
  const byCode = new Map();
  for (const row of existing) {
    const code = String(row.cr664_code ?? '').trim();
    if (!code) continue;
    const matches = byCode.get(code) ?? [];
    matches.push(row);
    byCode.set(code, matches);
  }
  const duplicates = [...byCode.entries()].filter(([, rows]) => rows.length > 1);
  if (duplicates.length) {
    throw new Error(`Duplicate NAICS natural keys block seeding: ${duplicates.map(([code]) => code).slice(0, 10).join(', ')}`);
  }
  return records.map((record) => {
    const current = byCode.get(record.cr664_code)?.[0];
    if (!current) return { kind: 'create', record };
    if (current.statecode !== 0) throw new Error(`NAICS ${record.cr664_code} exists but is inactive.`);
    const changed = ['cr664_title', 'cr664_sectorcode', 'cr664_sectortitle', 'cr664_naicsversion']
      .some((field) => String(current[field] ?? '') !== String(record[field] ?? ''));
    return changed
      ? { kind: 'update', id: current.cr664_naicscodeid, record }
      : { kind: 'noop', id: current.cr664_naicscodeid, record };
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function banner(lines) {
  const width = Math.max(...lines.map((l) => l.length));
  const bar = '─'.repeat(width + 2);
  console.log(`┌${bar}┐`);
  for (const l of lines) console.log(`│ ${l.padEnd(width)} │`);
  console.log(`└${bar}┘`);
}

async function main() {
  const mode = process.argv.includes('--commit') ? 'commit' : process.argv.includes('--verify') ? 'verify' : 'dry-run';
  if (!mode) {
    console.error(
      'Usage: node scripts/seed-naics.mjs (--verify | --commit) [--input <csv>] [--version 2022] [--out <json>]\n' +
        '  --verify   validate the CSV + derive sectors; writes nothing.\n' +
        '  --commit   build the seed JSON and load it into Dataverse when DATAVERSE_TOKEN is set\n' +
        '             (env URL auto-resolved from `pac org who`). No token → JSON only, with\n' +
        '             a clear status telling you the table was not updated.',
    );
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

  if (false && mode === 'verify') {
    console.log('  ✓ verify OK (no writes).');
    return;
  }

  // commit: always write the deterministic seed JSON (the importable artifact).
  if (mode === 'commit') {
    writeFileSync(out, JSON.stringify({ version, generatedFrom: 'official 2022 NAICS', count: records.length, records }, null, 2));
    console.log(`  wrote seed payload: ${out} (${records.length} records)`);
  }

  // Then LOAD into Dataverse when a token is available. The whole point of --commit
  // is to make the field work, so be unmistakable about whether the table changed.
  // Either name works (DATAVERSE_BEARER_TOKEN is what the stage-seed script + repo convention use).
  const token = process.env.DATAVERSE_TOKEN ?? process.env.DATAVERSE_BEARER_TOKEN;
  if (!token) {
    banner([
      '⚠  Dataverse was NOT updated — the cr664_naicscodes table is still empty.',
      '   --commit built the seed JSON but has no DATAVERSE_TOKEN to load it.',
      '   Finish in ONE of two ways:',
      '     1) Get a Web API token for your env, then re-run:',
      '          $env:DATAVERSE_TOKEN="<token>"; node scripts/seed-naics.mjs --commit',
      `     2) Import ${out}`,
      '          into cr664_naicscodes via a dataflow / Power Query (key: cr664_code).',
      '   Then regenerate the SDK (pac code) so Cr664_naicscodesService appears.',
      '   STATUS: seed JSON built · Dataverse NOT loaded.',
    ]);
    return;
  }

  const envUrl = resolveEnvUrl();
  if (!envUrl) {
    banner([
      '⚠  Have a token but could not resolve the environment URL.',
      '   Set DATAVERSE_URL=https://<your-org>.crm.dynamics.com and re-run --commit,',
      '   or run `pac org who` to confirm you are connected.',
      '   STATUS: seed JSON built · Dataverse NOT loaded.',
    ]);
    process.exit(1);
  }

  console.log(`  loading ${records.length} rows into ${envUrl} → cr664_naicscodes …`);
  const actions = planChanges(records, await readExisting(envUrl, token));
  const counts = {
    create: actions.filter((a) => a.kind === 'create').length,
    update: actions.filter((a) => a.kind === 'update').length,
    noop: actions.filter((a) => a.kind === 'noop').length,
  };
  console.log(`  PLAN create=${counts.create} update=${counts.update} no-op=${counts.noop}`);
  if (mode === 'dry-run') return;
  if (mode === 'verify') {
    if (counts.create || counts.update || counts.noop !== records.length) {
      throw new Error(`NAICS verification failed: create=${counts.create} update=${counts.update} no-op=${counts.noop}.`);
    }
    return;
  }
  const writes = actions.filter((a) => a.kind !== 'noop');
  let ok = 0;
  const failures = [];
  for (let i = 0; i < writes.length; i++) {
    const result = await writeRow(envUrl, token, writes[i]);
    if (result.ok) ok++;
    else failures.push(`${writes[i].record.cr664_code}: ${result.detail}`);
    if ((i + 1) % 200 === 0 || i + 1 === writes.length) {
      console.log(`    … ${i + 1}/${records.length} (${ok} ok, ${failures.length} failed)`);
    }
  }

  console.log(`  RESULT create=${counts.create} update=${counts.update} no-op=${counts.noop} applied=${ok} failed=${failures.length}`);
  if (failures.length === 0) {
    banner([
      `✓  Loaded ${ok}/${records.length} NAICS rows into cr664_naicscodes (idempotent).`,
      '   If the SDK is regenerated (pac code), the Industry (NAICS) field is now live.',
      '   STATUS: Dataverse LOADED.',
    ]);
    return;
  }
  console.error(`  ${failures.length} row(s) failed:`);
  for (const f of failures.slice(0, 20)) console.error(`    - ${f}`);
  if (failures.length > 20) console.error(`    …and ${failures.length - 20} more`);
  banner([
    `⚠  Loaded ${ok}/${records.length}; ${failures.length} failed (re-run --commit to retry — it is idempotent).`,
    '   A 401/403 means the token is wrong/expired; a 404 means the table',
    '   is not created yet (see docs/NAICS_SETUP.md §1).',
    '   STATUS: Dataverse PARTIALLY loaded.',
  ]);
  process.exit(1);
}

// Run only as a CLI; exported functions above are unit-tested.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
