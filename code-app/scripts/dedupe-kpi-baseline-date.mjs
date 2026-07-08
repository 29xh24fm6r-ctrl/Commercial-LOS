#!/usr/bin/env node
// @ts-check
/**
 * Completion Arc — dedupe the single-valued KPI_BASELINE_DATE system setting.
 *
 * KPI_BASELINE_DATE is a single-value setting, but the live environment holds MULTIPLE
 * active cr664_systemsettings rows carrying conflicting cr664_kpibaselinedate values. The
 * pure resolver (src/admin/kpiBaselineResolution.ts) fails CLOSED and renders "baseline
 * ambiguous" until it is deduped to ONE approved value. This script performs that dedupe:
 * it CLEARS cr664_kpibaselinedate (sets it to null) on every active row whose value is NOT
 * the operator-approved baseline, so exactly one distinct value remains.
 *
 * It never deletes a row and never touches any other setting field — it only clears the
 * conflicting baseline values on the non-approved rows.
 *
 * SAFETY:
 *   - DRY-RUN BY DEFAULT — lists the conflicting values; writes nothing.
 *       node scripts/dedupe-kpi-baseline-date.mjs
 *   - COMMIT requires --approve "<value>" AND a bearer token:
 *       $env:DATAVERSE_BEARER_TOKEN="..."
 *       node scripts/dedupe-kpi-baseline-date.mjs --approve "2026-01-01T00:00:00Z" --commit
 *   - VERIFY confirms exactly one distinct baseline remains (read-only):
 *       node scripts/dedupe-kpi-baseline-date.mjs --verify
 *
 * The approved value MUST already exist on at least one active row (the script refuses to
 * invent a baseline). Fail-closed + idempotent.
 */

import { spawnSync } from 'node:child_process';

const DV_BEARER_TOKEN_ENV_VAR = 'DATAVERSE_BEARER_TOKEN';
const DV_ENV_URL_ENV_VAR = 'DATAVERSE_ENV_URL';

const ENTITY_SET = 'cr664_systemsettings';
const ID_ATTR = 'cr664_systemsettingid';
const BASELINE_ATTR = 'cr664_kpibaselinedate';
const NAME_ATTR = 'cr664_settingname';

function bail(msg, code = 1) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set(args);
  const commit = flags.has('--commit');
  const verify = flags.has('--verify');
  if (commit && verify) bail('Pass only one of --commit / --verify.');
  const ai = args.indexOf('--approve');
  const approve = ai >= 0 ? (args[ai + 1] ?? '').trim() : '';
  return { commit, verify, dryRun: !commit && !verify, approve };
}

function resolveEnvUrl() {
  const explicit = process.env[DV_ENV_URL_ENV_VAR] ?? process.env.DATAVERSE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const res = spawnSync('pac', ['org', 'who'], { encoding: 'utf8' });
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  const m = out.match(/(https:\/\/[^\s]+\.crm\d*\.dynamics\.com)/i);
  if (m) return m[1].replace(/\/$/, '');
  bail(`Could not resolve env URL via \`pac org who\`. Set ${DV_ENV_URL_ENV_VAR} (or DATAVERSE_URL) explicitly.`);
  return '';
}

function requireToken() {
  const token = process.env[DV_BEARER_TOKEN_ENV_VAR] ?? process.env.DATAVERSE_TOKEN;
  if (!token) bail(`Set ${DV_BEARER_TOKEN_ENV_VAR} (or DATAVERSE_TOKEN) for --commit / --verify.`);
  return token;
}

async function odataGet(url, token) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, error: `GET ${url} → ${res.status}: ${await res.text()}` };
    const json = await res.json();
    return { ok: true, records: json.value ?? [] };
  } catch (err) {
    return { ok: false, error: `GET network error: ${err.message}` };
  }
}

async function odataPatch(id, body, token, envUrl) {
  try {
    const res = await fetch(`${envUrl}/api/data/v9.2/${ENTITY_SET}(${id})`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
        Accept: 'application/json', 'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `PATCH ${ENTITY_SET}(${id}) → ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

async function readActiveRows(token, envUrl) {
  const select = `${ID_ATTR},${NAME_ATTR},${BASELINE_ATTR}`;
  const read = await odataGet(`${envUrl}/api/data/v9.2/${ENTITY_SET}?$select=${encodeURIComponent(select)}&$filter=statecode eq 0`, token);
  if (!read.ok) bail(`Could not read ${ENTITY_SET}: ${read.error}`);
  return read.records.map((r) => ({ id: r[ID_ATTR], name: r[NAME_ATTR] ?? '', baseline: (r[BASELINE_ATTR] ?? '').trim() }));
}

function distinct(rows) {
  return [...new Set(rows.filter((r) => r.baseline.length > 0).map((r) => r.baseline))];
}

async function main() {
  const { commit, verify: doVerify, dryRun, approve } = parseArgs(process.argv);
  console.log('KPI_BASELINE_DATE dedupe —', commit ? 'COMMIT' : doVerify ? 'VERIFY' : 'DRY-RUN (no writes)');

  if (dryRun && !(process.env[DV_BEARER_TOKEN_ENV_VAR] ?? process.env.DATAVERSE_TOKEN)) {
    console.log('(dry-run without a token: cannot enumerate live rows. Provide a bearer token to see the conflicting values, then --approve "<value>" --commit.)');
    return;
  }

  const token = requireToken();
  const envUrl = resolveEnvUrl();
  console.log(`Env: ${envUrl}`);
  const rows = await readActiveRows(token, envUrl);
  const values = distinct(rows);

  console.log(`\n── ${ENTITY_SET}.${BASELINE_ATTR} (active rows) ──`);
  console.log(`   distinct baseline values: ${values.length === 0 ? '(none)' : values.join(', ')}`);

  if (values.length <= 1) {
    console.log(values.length === 0 ? '   ✓ No baseline set — nothing to dedupe.' : `   ✓ Already single-valued (${values[0]}) — nothing to dedupe.`);
    if (doVerify) console.log('\n✓ VERIFY: KPI_BASELINE_DATE resolves to a single value.');
    return;
  }

  // values.length > 1 → ambiguous.
  if (doVerify) bail(`VERIFY: KPI_BASELINE_DATE is still AMBIGUOUS (${values.length} values: ${values.join(', ')}). Run --approve "<value>" --commit.`);

  if (!approve) {
    bail(`Ambiguous (${values.length} values). Re-run with --approve "<one of: ${values.join(' | ')}>" --commit to keep that value and CLEAR the others.`);
  }
  if (!values.includes(approve)) {
    bail(`--approve "${approve}" is not one of the existing baseline values (${values.join(', ')}). The script refuses to invent a baseline.`);
  }

  const toClear = rows.filter((r) => r.baseline.length > 0 && r.baseline !== approve);
  console.log(`\n   Approved baseline: ${approve}`);
  console.log(`   Rows to clear (cr664_kpibaselinedate → null): ${toClear.length}`);
  for (const r of toClear) {
    console.log(`   ${commit ? '-' : '~'} ${(r.name || '(unnamed setting)').padEnd(28)} ${r.baseline} → (cleared). id=${r.id}`);
    if (commit) {
      const p = await odataPatch(r.id, { [BASELINE_ATTR]: null }, token, envUrl);
      if (!p.ok) bail(`Clear baseline on ${r.id} failed: ${p.error}`);
    }
  }

  if (commit) {
    console.log(`\n✓ Commit complete. Cleared ${toClear.length} conflicting baseline value(s); KPI_BASELINE_DATE now resolves to ${approve}. Run --verify to confirm.`);
  } else {
    console.log('\nDry-run complete. No data was written. Add --commit to apply.');
  }
}

main().catch((err) => bail(`Unhandled error: ${err.stack ?? err.message}`));
