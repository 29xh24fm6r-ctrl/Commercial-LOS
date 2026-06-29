#!/usr/bin/env node
// @ts-check
/**
 * Stage Advancement — seed the canonical stage + status reference rows.
 *
 * Supplies the deterministic stage ORDERING the stage-progression engine needs:
 * seven ordered pipeline stages (cr664_dealstagereferences) carrying cr664_sequence,
 * and the five disposition statuses (cr664_dealstatusreferences). Mirrors the
 * established reference-seed discipline in phase122-lookup-repair.mjs:
 *
 *   - DRY-RUN BY DEFAULT. Prints a complete plan and writes NOTHING.
 *       node scripts/seed-stage-references.mjs
 *       node scripts/seed-stage-references.mjs --dry-run
 *   - COMMIT requires an explicit flag AND a bearer token:
 *       $env:DATAVERSE_BEARER_TOKEN="..."   # Windows PowerShell
 *       node scripts/seed-stage-references.mjs --commit
 *   - VERIFY is a read-only smoke (no token write); confirms the seven stages are
 *     present, each with a unique cr664_sequence, and the statuses exist:
 *       $env:DATAVERSE_BEARER_TOKEN="..."
 *       node scripts/seed-stage-references.mjs --verify
 *
 * Idempotent: a row is matched by cr664_code (case-insensitive). If exactly one
 * ACTIVE row already matches, it is REUSED (and, in --commit, its cr664_sequence is
 * patched only if absent/mismatched). Two+ matches → FAIL CLOSED (operator resolves).
 *
 * Hard non-goals: never touches a Loan Deal row; never enables AUTO_STAGE_ADVANCE_ENABLED
 * or any gate; never creates a non-cr664 column; never invents an order (the sequence
 * values below are the canonical template — ratify against OGB credit policy first).
 *
 * PREREQUISITE: the maker must first add the cr664_sequence (Whole Number) column to
 * cr664_dealstagereferences in make.powerapps.com (see docs/STAGE_SCHEMA_SETUP.md). If the
 * column is missing, --commit fails closed with the Dataverse error rather than guessing.
 */

import { spawnSync } from 'node:child_process';

const DV_BEARER_TOKEN_ENV_VAR = 'DATAVERSE_BEARER_TOKEN';
const DV_ENV_URL_ENV_VAR = 'DATAVERSE_ENV_URL';

/**
 * Canonical pipeline stages (the §1 model). cr664_sequence is the deterministic order.
 * TEMPLATE — ratify the stages/order against OGB credit policy before relying on them.
 */
const STAGE_SEEDS = Object.freeze([
  { code: 'INTAKE', name: 'Intake', sequence: 10 },
  { code: 'UNDERWRITING', name: 'Underwriting', sequence: 20 },
  { code: 'CREDIT_APPROVAL', name: 'Credit Approval', sequence: 30 },
  { code: 'COMMITMENT', name: 'Commitment', sequence: 40 },
  { code: 'DOCUMENTATION', name: 'Documentation', sequence: 50 },
  { code: 'CLOSING_FUNDING', name: 'Closing & Funding', sequence: 60 },
  { code: 'BOARDED', name: 'Boarded / Servicing', sequence: 70 },
].map(Object.freeze));

/** Disposition statuses (separate dimension; no sequence). */
const STATUS_SEEDS = Object.freeze([
  { code: 'OPEN', name: 'Open' },
  { code: 'ON_HOLD', name: 'On Hold' },
  { code: 'DECLINED', name: 'Declined' },
  { code: 'WITHDRAWN', name: 'Withdrawn' },
  { code: 'BOARDED', name: 'Boarded' },
].map(Object.freeze));

const STAGE_ENTITY_SET = 'cr664_dealstagereferences';
const STAGE_ID_ATTR = 'cr664_dealstagereferenceid';
const STATUS_ENTITY_SET = 'cr664_dealstatusreferences';
const STATUS_ID_ATTR = 'cr664_dealstatusreferenceid';

// A row whose code/name looks like throwaway test data is never a reuse candidate
// and is never mutated.
const UNSAFE_LABEL = /\b(test|phase\d+|demo|sample|dummy|temp)\b/i;

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
  const explicit = process.env[DV_ENV_URL_ENV_VAR];
  if (explicit) return explicit.replace(/\/$/, '');
  const res = spawnSync('pac', ['org', 'who'], { encoding: 'utf8' });
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  const m = out.match(/(https:\/\/[^\s]+\.crm\.dynamics\.com)/);
  if (m) return m[1].replace(/\/$/, '');
  bail(`Could not resolve env URL via \`pac org who\`. Set ${DV_ENV_URL_ENV_VAR} explicitly.`);
  return '';
}

function requireToken() {
  const token = process.env[DV_BEARER_TOKEN_ENV_VAR];
  if (!token) bail(`Set ${DV_BEARER_TOKEN_ENV_VAR} (a Dataverse bearer token) for --commit / --verify.`);
  return token;
}

async function odataGet(url, token) {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return { ok: false, error: `GET ${url} → ${res.status}: ${await res.text()}` };
    const json = await res.json();
    return { ok: true, records: json.value ?? [] };
  } catch (err) {
    return { ok: false, error: `GET network error: ${err.message}` };
  }
}

async function odataPost(entitySet, body, token, envUrl) {
  try {
    const res = await fetch(`${envUrl}/api/data/v9.2/${entitySet}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `POST ${entitySet} → ${res.status}: ${await res.text()}` };
    return { ok: true, row: await res.json() };
  } catch (err) {
    return { ok: false, error: `POST network error: ${err.message}` };
  }
}

async function odataPatch(entitySet, id, idAttr, body, token, envUrl) {
  try {
    const res = await fetch(`${envUrl}/api/data/v9.2/${entitySet}(${id})`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `PATCH ${entitySet}(${id}) → ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

/** Find the production-safe ACTIVE row(s) matching a seed by code (or name). */
function matchCandidates(records, seed, idAttr) {
  const wantCode = seed.code.trim().toLowerCase();
  const wantName = seed.name.trim().toLowerCase();
  return records
    .map((r) => ({
      id: r[idAttr],
      name: r.cr664_name ?? '',
      code: r.cr664_code ?? '',
      active: r.cr664_activeflag === true,
      sequence: typeof r.cr664_sequence === 'number' ? r.cr664_sequence : undefined,
    }))
    .filter((r) => !UNSAFE_LABEL.test(r.code) && !UNSAFE_LABEL.test(r.name))
    .filter((r) => r.code.trim().toLowerCase() === wantCode || r.name.trim().toLowerCase() === wantName);
}

async function planOrSeedStages(mode, token, envUrl) {
  const select = `${STAGE_ID_ATTR},cr664_name,cr664_code,cr664_activeflag,cr664_sequence`;
  const read = token
    ? await odataGet(`${envUrl}/api/data/v9.2/${STAGE_ENTITY_SET}?$select=${encodeURIComponent(select)}`, token)
    : { ok: true, records: [] };
  if (!read.ok) bail(`Could not read ${STAGE_ENTITY_SET}: ${read.error}\n(If the error mentions cr664_sequence, the maker has not added the column yet — see docs/STAGE_SCHEMA_SETUP.md.)`);

  console.log(`\n── Pipeline stages (${STAGE_ENTITY_SET}) ──`);
  let created = 0, reused = 0, patched = 0;
  for (const seed of STAGE_SEEDS) {
    const cands = matchCandidates(read.records, seed, STAGE_ID_ATTR);
    if (cands.length > 1) {
      bail(`${cands.length} production-safe rows already match stage ${seed.code} — failing closed; an operator must resolve the ambiguity.`);
    }
    if (cands.length === 1) {
      const c = cands[0];
      if (!c.active) bail(`Stage ${seed.code} matches an INACTIVE row (id=${c.id}); failing closed — operator reactivates deliberately.`);
      if (c.sequence === seed.sequence) {
        console.log(`   ✓ ${seed.code.padEnd(16)} reuse (id=${c.id}, sequence=${c.sequence}).`);
        reused++;
      } else {
        console.log(`   ~ ${seed.code.padEnd(16)} reuse + set sequence ${c.sequence ?? '(none)'} → ${seed.sequence} (id=${c.id}).`);
        if (mode === 'commit') {
          const p = await odataPatch(STAGE_ENTITY_SET, c.id, STAGE_ID_ATTR, { cr664_sequence: seed.sequence }, token, envUrl);
          if (!p.ok) bail(`Patch sequence for ${seed.code} failed: ${p.error}`);
        }
        patched++;
      }
      continue;
    }
    console.log(`   + ${seed.code.padEnd(16)} CREATE name="${seed.name}" sequence=${seed.sequence} active=true`);
    if (mode === 'commit') {
      const c = await odataPost(STAGE_ENTITY_SET, { cr664_name: seed.name, cr664_code: seed.code, cr664_sequence: seed.sequence, cr664_activeflag: true }, token, envUrl);
      if (!c.ok) bail(`Create ${seed.code} failed: ${c.error}\n(If the error mentions cr664_sequence, add the column first — docs/STAGE_SCHEMA_SETUP.md.)`);
    }
    created++;
  }
  console.log(`   → ${created} to create, ${patched} to re-sequence, ${reused} reused.`);
}

async function planOrSeedStatuses(mode, token, envUrl) {
  const select = `${STATUS_ID_ATTR},cr664_name,cr664_code,cr664_activeflag`;
  const read = token
    ? await odataGet(`${envUrl}/api/data/v9.2/${STATUS_ENTITY_SET}?$select=${encodeURIComponent(select)}`, token)
    : { ok: true, records: [] };
  if (!read.ok) bail(`Could not read ${STATUS_ENTITY_SET}: ${read.error}`);

  console.log(`\n── Disposition statuses (${STATUS_ENTITY_SET}) ──`);
  let created = 0, reused = 0;
  for (const seed of STATUS_SEEDS) {
    const cands = matchCandidates(read.records, seed, STATUS_ID_ATTR);
    if (cands.length > 1) bail(`${cands.length} rows already match status ${seed.code} — failing closed.`);
    if (cands.length === 1) {
      if (!cands[0].active) bail(`Status ${seed.code} matches an INACTIVE row — failing closed.`);
      console.log(`   ✓ ${seed.code.padEnd(10)} reuse (id=${cands[0].id}).`);
      reused++;
      continue;
    }
    console.log(`   + ${seed.code.padEnd(10)} CREATE name="${seed.name}" active=true`);
    if (mode === 'commit') {
      const c = await odataPost(STATUS_ENTITY_SET, { cr664_name: seed.name, cr664_code: seed.code, cr664_activeflag: true }, token, envUrl);
      if (!c.ok) bail(`Create status ${seed.code} failed: ${c.error}`);
    }
    created++;
  }
  console.log(`   → ${created} to create, ${reused} reused.`);
}

async function verify(token, envUrl) {
  console.log('\n=== VERIFY (read-only smoke) ===');
  const select = `${STAGE_ID_ATTR},cr664_name,cr664_code,cr664_activeflag,cr664_sequence`;
  const read = await odataGet(`${envUrl}/api/data/v9.2/${STAGE_ENTITY_SET}?$select=${encodeURIComponent(select)}`, token);
  if (!read.ok) bail(`Read failed: ${read.error}\n(If it mentions cr664_sequence, the column is not added yet — docs/STAGE_SCHEMA_SETUP.md.)`);

  const problems = [];
  const bySeq = new Map();
  for (const seed of STAGE_SEEDS) {
    const cands = matchCandidates(read.records, seed, STAGE_ID_ATTR).filter((c) => c.active);
    if (cands.length === 0) { problems.push(`missing active stage ${seed.code}`); continue; }
    if (cands.length > 1) { problems.push(`duplicate active stage ${seed.code}`); continue; }
    const seq = cands[0].sequence;
    if (typeof seq !== 'number') { problems.push(`stage ${seed.code} has no cr664_sequence`); continue; }
    if (bySeq.has(seq)) problems.push(`sequence ${seq} is shared by ${bySeq.get(seq)} and ${seed.code}`);
    bySeq.set(seq, seed.code);
    console.log(`   ${String(seq).padStart(3)}  ${seed.code}`);
  }
  if (problems.length) {
    console.log('\n✖ Ordering NOT yet complete/deterministic:');
    for (const p of problems) console.log(`   - ${p}`);
    bail('Seed/verify incomplete — stageProgressionAvailability stays fail-closed.');
  }
  console.log('\n✓ Seven stages present with unique sequences. Ordering is deterministic.');
}

async function main() {
  const { commit, verify: doVerify, dryRun } = parseArgs(process.argv);
  console.log('Stage reference seed —', commit ? 'COMMIT' : doVerify ? 'VERIFY' : 'DRY-RUN (no writes)');

  if (dryRun) {
    console.log('(dry-run: planning against the canonical template; pass --commit to write, --verify to read the live env.)');
    await planOrSeedStages('plan', undefined, '');
    await planOrSeedStatuses('plan', undefined, '');
    console.log('\nDry-run complete. No data was written. Re-run with --commit (and a bearer token) to apply.');
    return;
  }

  const token = requireToken();
  const envUrl = resolveEnvUrl();
  console.log(`Env: ${envUrl}`);

  if (doVerify) { await verify(token, envUrl); return; }

  await planOrSeedStages('commit', token, envUrl);
  await planOrSeedStatuses('commit', token, envUrl);
  console.log('\n✓ Commit complete. Run with --verify to confirm deterministic ordering.');
}

main().catch((err) => bail(`Unhandled error: ${err.stack ?? err.message}`));
