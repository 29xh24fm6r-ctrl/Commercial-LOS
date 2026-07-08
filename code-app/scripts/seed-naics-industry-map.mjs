#!/usr/bin/env node
// @ts-check
/**
 * Phase 4B — seed the NAICS sector -> deal industry mapping (cr664_naicsindustrymap).
 *
 * The deal's cr664_industry is a fixed 6-value choice-set
 * (Manufacturing / Retail / Healthcare / RealEstate / Technology / Other). NAICS
 * has 20 sectors. This seed loads ONLY the clear, defensible sector->industry
 * mappings and DELIBERATELY leaves ambiguous sectors UNMAPPED — so a deal whose
 * CRM NAICS falls in an unmapped sector honestly shows "no mapped deal industry
 * option exists" rather than a fabricated guess (Phase 4 spec).
 *
 * Mirrors the reference-seed discipline (dry-run default, --commit needs a token,
 * --verify is a read-only smoke). Idempotent by cr664_sectorcode.
 *
 * PREREQUISITE: scripts/dataverse/create-deal-industry-crm-naics.ps1 must have
 * created cr664_naicsindustrymap first (see docs/DEAL_INDUSTRY_CRM_NAICS_SETUP.md).
 *
 * Hard non-goals: never maps a sector to a deal industry that is not one of the
 * six real cr664_industry labels; never fabricates a mapping for an ambiguous
 * sector; never touches a deal or CRM organization row.
 */

import { spawnSync } from 'node:child_process';

const DV_BEARER_TOKEN_ENV_VAR = 'DATAVERSE_BEARER_TOKEN';
const DV_ENV_URL_ENV_VAR = 'DATAVERSE_ENV_URL';

const ENTITY_SET = 'cr664_naicsindustrymaps';
const ID_ATTR = 'cr664_naicsindustrymapid';

/** The six real deal industry labels (cr664_industry choice-set). */
const DEAL_INDUSTRIES = Object.freeze(['Manufacturing', 'Retail', 'Healthcare', 'RealEstate', 'Technology', 'Other']);

/**
 * Defensible NAICS sector -> deal industry mappings ONLY. Ambiguous sectors
 * (11, 21, 22, 23, 42, 48-49, 52, 54, 55, 56, 61, 71, 72, 81, 92) are left
 * UNMAPPED on purpose → the projection shows the honest "no mapped industry"
 * state and Industry stays banker-editable.
 */
const SEEDS = Object.freeze([
  { sector: '31-33', industry: 'Manufacturing', title: 'Manufacturing' },
  { sector: '44-45', industry: 'Retail', title: 'Retail Trade' },
  { sector: '62', industry: 'Healthcare', title: 'Health Care and Social Assistance' },
  { sector: '53', industry: 'RealEstate', title: 'Real Estate and Rental and Leasing' },
  { sector: '51', industry: 'Technology', title: 'Information' },
].map(Object.freeze));

const UNSAFE_LABEL = /\b(test|phase\d+|demo|sample|dummy|temp)\b/i;

function bail(msg, code = 1) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(code);
}

// Fail closed if any seed points at a non-real deal industry (guards typos).
for (const s of SEEDS) {
  if (!DEAL_INDUSTRIES.includes(s.industry)) {
    bail(`Seed maps sector ${s.sector} to "${s.industry}", which is not a real deal industry label.`);
  }
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

async function odataPost(body, token, envUrl) {
  try {
    const res = await fetch(`${envUrl}/api/data/v9.2/${ENTITY_SET}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
        Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `POST ${ENTITY_SET} → ${res.status}: ${await res.text()}` };
    return { ok: true, row: await res.json() };
  } catch (err) {
    return { ok: false, error: `POST network error: ${err.message}` };
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

function matchCandidates(records, seed) {
  const wantSector = seed.sector.trim().toLowerCase();
  return records
    .map((r) => ({
      id: r[ID_ATTR],
      sector: r.cr664_sectorcode ?? '',
      industry: r.cr664_dealindustry ?? '',
      name: r.cr664_name ?? '',
      active: r.cr664_activeflag === true,
    }))
    .filter((r) => !UNSAFE_LABEL.test(r.name) && !UNSAFE_LABEL.test(r.sector))
    .filter((r) => r.sector.trim().toLowerCase() === wantSector);
}

const SELECT = `${ID_ATTR},cr664_name,cr664_sectorcode,cr664_dealindustry,cr664_activeflag`;

async function readAll(token, envUrl) {
  const read = token
    ? await odataGet(`${envUrl}/api/data/v9.2/${ENTITY_SET}?$select=${encodeURIComponent(SELECT)}`, token)
    : { ok: true, records: [] };
  if (!read.ok) {
    bail(
      `Could not read ${ENTITY_SET}: ${read.error}\n` +
        `(If the table does not exist yet, run scripts/dataverse/create-deal-industry-crm-naics.ps1 first. ` +
        `See docs/DEAL_INDUSTRY_CRM_NAICS_SETUP.md.)`,
    );
  }
  return read.records;
}

async function planOrSeed(mode, token, envUrl) {
  const records = await readAll(token, envUrl);
  let created = 0, reused = 0, patched = 0;
  console.log(`\n── NAICS sector → deal industry (${ENTITY_SET}) ──`);
  for (const seed of SEEDS) {
    const cands = matchCandidates(records, seed);
    if (cands.length > 1) bail(`${cands.length} rows already match sector ${seed.sector} — failing closed; operator resolves.`);
    if (cands.length === 1) {
      const c = cands[0];
      if (!c.active) bail(`Sector ${seed.sector} matches an INACTIVE row (id=${c.id}); failing closed — operator reactivates deliberately.`);
      if (c.industry.trim() === seed.industry) {
        console.log(`   ✓ ${seed.sector.padEnd(6)} → ${seed.industry.padEnd(14)} reuse (id=${c.id}).`);
        reused++;
      } else {
        console.log(`   ~ ${seed.sector.padEnd(6)} → set industry ${c.industry || '(none)'} → ${seed.industry} (id=${c.id}).`);
        if (mode === 'commit') {
          const p = await odataPatch(c.id, { cr664_dealindustry: seed.industry }, token, envUrl);
          if (!p.ok) bail(`Patch sector ${seed.sector} failed: ${p.error}`);
        }
        patched++;
      }
      continue;
    }
    console.log(`   + ${seed.sector.padEnd(6)} → ${seed.industry.padEnd(14)} CREATE (${seed.title})`);
    if (mode === 'commit') {
      const body = {
        cr664_name: `${seed.industry} (${seed.sector})`,
        cr664_sectorcode: seed.sector,
        cr664_dealindustry: seed.industry,
        cr664_activeflag: true,
      };
      const c = await odataPost(body, token, envUrl);
      if (!c.ok) bail(`Create sector ${seed.sector} failed: ${c.error}`);
    }
    created++;
  }
  console.log(`\n   → ${created} to create, ${patched} to patch, ${reused} reused. (Ambiguous sectors intentionally left unmapped.)`);
}

async function verify(token, envUrl) {
  console.log('\n=== VERIFY (read-only smoke) ===');
  const records = await readAll(token, envUrl);
  const problems = [];
  for (const seed of SEEDS) {
    const cands = matchCandidates(records, seed).filter((c) => c.active);
    if (cands.length === 0) { problems.push(`missing active mapping for sector ${seed.sector}`); continue; }
    if (cands.length > 1) { problems.push(`duplicate active mapping for sector ${seed.sector}`); continue; }
    if (cands[0].industry.trim() !== seed.industry) { problems.push(`sector ${seed.sector} maps to "${cands[0].industry}", expected "${seed.industry}"`); continue; }
    if (!DEAL_INDUSTRIES.includes(cands[0].industry.trim())) { problems.push(`sector ${seed.sector} maps to a non-real industry`); continue; }
    console.log(`   ${seed.sector.padEnd(6)} → ${seed.industry}`);
  }
  if (problems.length) {
    console.log('\n✖ NAICS→industry mapping NOT yet complete:');
    for (const p of problems) console.log(`   - ${p}`);
    bail('Seed/verify incomplete — the CRM/NAICS industry projection stays honest (no mapping → banker keeps manual).');
  }
  console.log('\n✓ All defensible sector→industry mappings present + active. Ambiguous sectors remain unmapped by design.');
}

async function main() {
  const { commit, verify: doVerify, dryRun } = parseArgs(process.argv);
  console.log('NAICS→industry map seed —', commit ? 'COMMIT' : doVerify ? 'VERIFY' : 'DRY-RUN (no writes)');

  if (dryRun) {
    console.log('(dry-run: planning against the canonical mapping template; pass --commit to write, --verify to read the live env.)');
    await planOrSeed('plan', undefined, '');
    console.log('\nDry-run complete. No data was written. Re-run with --commit (and a bearer token) to apply.');
    return;
  }

  const token = requireToken();
  const envUrl = resolveEnvUrl();
  console.log(`Env: ${envUrl}`);

  if (doVerify) { await verify(token, envUrl); return; }

  await planOrSeed('commit', token, envUrl);
  console.log('\n✓ Commit complete. Run with --verify to confirm.');
}

main().catch((err) => bail(`Unhandled error: ${err.stack ?? err.message}`));
