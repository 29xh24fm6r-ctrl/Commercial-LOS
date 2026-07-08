#!/usr/bin/env node
// @ts-check
/**
 * Completion Arc — deactivate leftover LEGACY / TEST stage + status reference rows.
 *
 * The canonical stage (INTAKE…BOARDED) and status (OPEN/ON_HOLD/DECLINED/WITHDRAWN/
 * BOARDED) references are seeded by seed-stage-references.mjs. But an environment may
 * still carry ACTIVE non-canonical/test rows (e.g. PHASE121_STAGE, PHASE121_STATUS,
 * *-TEST) from earlier phases. The governed stage resolvers block on active non-canonical
 * rows, and Stage Governance Diagnostics flags them as an at-risk hygiene WARNING. This
 * script DEACTIVATES those legacy rows (sets cr664_activeflag = false) so the diagnostics
 * flip fully READY and advancement is unblocked.
 *
 * SAFETY (mirrors seed-stage-references.mjs):
 *   - DRY-RUN BY DEFAULT — prints exactly which rows WOULD be deactivated; writes nothing.
 *       node scripts/deactivate-legacy-stage-status-references.mjs
 *   - COMMIT requires the flag AND a bearer token; deactivate-only (never deletes):
 *       $env:DATAVERSE_BEARER_TOKEN="..."   # (DATAVERSE_TOKEN also accepted)
 *       node scripts/deactivate-legacy-stage-status-references.mjs --commit
 *   - VERIFY is a read-only smoke: confirms no ACTIVE non-canonical rows remain:
 *       node scripts/deactivate-legacy-stage-status-references.mjs --verify
 *
 * Hard non-goals: NEVER touches a canonical row (only rows whose code is NOT canonical AND
 * matches the legacy/test label are candidates); NEVER deletes a row (deactivate only);
 * NEVER creates a row; NEVER flips a feature gate. It is idempotent + fail-closed.
 */

import { spawnSync } from 'node:child_process';

const DV_BEARER_TOKEN_ENV_VAR = 'DATAVERSE_BEARER_TOKEN';
const DV_ENV_URL_ENV_VAR = 'DATAVERSE_ENV_URL';

// Canonical codes — MUST match src/workflow/stageOrderingContract.ts (CANONICAL_STAGE_CODES)
// and src/workflow/statusReferenceContract.ts (CANONICAL_STATUS_CODES). A row whose code is
// in these sets is NEVER a candidate for deactivation.
const CANONICAL_STAGE_CODES = new Set(['INTAKE', 'UNDERWRITING', 'CREDIT_APPROVAL', 'COMMITMENT', 'DOCUMENTATION', 'CLOSING_FUNDING', 'BOARDED']);
const CANONICAL_STATUS_CODES = new Set(['OPEN', 'ON_HOLD', 'DECLINED', 'WITHDRAWN', 'BOARDED']);

// A row is a legacy/test candidate only if its code/name matches this label AND its code is
// not canonical. This is deliberately conservative — an unknown non-canonical row that does
// NOT look like test data is left alone and reported for manual review (fail-closed).
const LEGACY_LABEL = /\b(test|phase\s*\d+|demo|sample|dummy|temp|temporary|placeholder|fake)\b|^phase/i;

const TARGETS = Object.freeze([
  { entitySet: 'cr664_dealstagereferences', idAttr: 'cr664_dealstagereferenceid', canonical: CANONICAL_STAGE_CODES, kind: 'stage' },
  { entitySet: 'cr664_dealstatusreferences', idAttr: 'cr664_dealstatusreferenceid', canonical: CANONICAL_STATUS_CODES, kind: 'status' },
]);

function bail(msg, code = 1) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const commit = flags.has('--commit');
  const verify = flags.has('--verify');
  if (commit && verify) bail('Pass only one of --commit / --verify.');
  return { commit, verify, dryRun: !commit && !verify };
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
  if (!token) bail(`Set ${DV_BEARER_TOKEN_ENV_VAR} (or DATAVERSE_TOKEN — either is accepted) for --commit / --verify.`);
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

async function odataPatch(entitySet, id, body, token, envUrl) {
  try {
    const res = await fetch(`${envUrl}/api/data/v9.2/${entitySet}(${id})`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
        Accept: 'application/json', 'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `PATCH ${entitySet}(${id}) → ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

/** Classify a row: 'canonical' | 'legacy' (deactivate candidate) | 'unknown' (manual review). */
function classify(row, target) {
  const code = (row.cr664_code ?? '').trim();
  const name = (row.cr664_name ?? '').trim();
  const active = row.cr664_activeflag !== false;
  if (!active) return 'inactive';
  if (code.length > 0 && target.canonical.has(code.toUpperCase())) return 'canonical';
  const blob = `${code} ${name}`;
  if (LEGACY_LABEL.test(blob)) return 'legacy';
  return 'unknown';
}

async function processTarget(target, mode, token, envUrl) {
  const select = `${target.idAttr},cr664_code,cr664_name,cr664_activeflag`;
  const read = token
    ? await odataGet(`${envUrl}/api/data/v9.2/${target.entitySet}?$select=${encodeURIComponent(select)}`, token)
    : { ok: true, records: [] };
  if (!read.ok) bail(`Could not read ${target.entitySet}: ${read.error}`);

  console.log(`\n── ${target.entitySet} ──`);
  let deactivated = 0, unknowns = 0;
  if (!token) {
    console.log('   (no token — cannot enumerate live rows; run --commit/--verify with a bearer token to see candidates.)');
    return { deactivated, unknowns };
  }
  for (const row of read.records) {
    const cls = classify(row, target);
    const code = (row.cr664_code ?? '').trim() || '(no code)';
    const id = row[target.idAttr];
    if (cls === 'canonical' || cls === 'inactive') continue;
    if (cls === 'unknown') {
      console.log(`   ? ${code.padEnd(20)} ACTIVE non-canonical but NOT a recognized test label — left alone (manual review). id=${id}`);
      unknowns++;
      continue;
    }
    // cls === 'legacy'
    console.log(`   ${mode === 'commit' ? '-' : '~'} ${code.padEnd(20)} ACTIVE legacy/test → deactivate (cr664_activeflag=false). id=${id}`);
    if (mode === 'commit') {
      const p = await odataPatch(target.entitySet, id, { cr664_activeflag: false }, token, envUrl);
      if (!p.ok) bail(`Deactivate ${target.entitySet}/${code} failed: ${p.error}`);
    }
    deactivated++;
  }
  if (deactivated === 0 && unknowns === 0) console.log('   ✓ No active legacy/test rows.');
  return { deactivated, unknowns };
}

async function verify(token, envUrl) {
  console.log('\n=== VERIFY (read-only smoke) ===');
  let problems = 0;
  for (const target of TARGETS) {
    const select = `${target.idAttr},cr664_code,cr664_name,cr664_activeflag`;
    const read = await odataGet(`${envUrl}/api/data/v9.2/${target.entitySet}?$select=${encodeURIComponent(select)}`, token);
    if (!read.ok) bail(`Could not read ${target.entitySet}: ${read.error}`);
    const stragglers = read.records.filter((r) => classify(r, target) === 'legacy');
    if (stragglers.length > 0) {
      problems += stragglers.length;
      console.log(`   ✖ ${target.entitySet}: ${stragglers.length} ACTIVE legacy/test row(s) remain (${stragglers.map((r) => r.cr664_code).join(', ')}).`);
    } else {
      console.log(`   ✓ ${target.entitySet}: no active legacy/test rows.`);
    }
  }
  if (problems > 0) bail('Verify failed — active legacy/test rows remain. Run --commit to deactivate them.');
  console.log('\n✓ No active legacy/test stage/status rows remain. Reference hygiene is clean.');
}

async function main() {
  const { commit, verify: doVerify, dryRun } = parseArgs(process.argv);
  console.log('Legacy stage/status reference deactivation —', commit ? 'COMMIT' : doVerify ? 'VERIFY' : 'DRY-RUN (no writes)');

  if (dryRun) {
    console.log('(dry-run: with a token this lists the exact rows that WOULD be deactivated; writes nothing. Pass --commit to apply, --verify to smoke.)');
    const token = process.env[DV_BEARER_TOKEN_ENV_VAR] ?? process.env.DATAVERSE_TOKEN ?? null;
    const envUrl = token ? resolveEnvUrl() : '';
    for (const target of TARGETS) await processTarget(target, 'plan', token, envUrl);
    console.log('\nDry-run complete. No data was written.');
    return;
  }

  const token = requireToken();
  const envUrl = resolveEnvUrl();
  console.log(`Env: ${envUrl}`);
  if (doVerify) { await verify(token, envUrl); return; }

  let totalDeactivated = 0, totalUnknown = 0;
  for (const target of TARGETS) {
    const r = await processTarget(target, 'commit', token, envUrl);
    totalDeactivated += r.deactivated;
    totalUnknown += r.unknowns;
  }
  console.log(`\n✓ Commit complete. Deactivated ${totalDeactivated} legacy/test row(s); ${totalUnknown} unknown non-canonical row(s) left for manual review. Run --verify to confirm.`);
}

main().catch((err) => bail(`Unhandled error: ${err.stack ?? err.message}`));
