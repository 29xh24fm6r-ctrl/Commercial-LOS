#!/usr/bin/env node
// @ts-check
/**
 * Phase 4A — seed the Deal Reference values (Product Type / Loan Structure /
 * Pricing Type) into cr664_producttypereference, each tagged with the
 * cr664_category CHOICE discriminator so the three deal dropdowns are separable.
 *
 * Mirrors the reference-seed discipline in seed-stage-references.mjs:
 *   - DRY-RUN BY DEFAULT. Prints a complete plan and writes NOTHING.
 *       node scripts/seed-deal-reference-values.mjs
 *   - COMMIT requires an explicit flag AND a bearer token:
 *       $env:DATAVERSE_BEARER_TOKEN="..."   # (DATAVERSE_TOKEN also accepted)
 *       node scripts/seed-deal-reference-values.mjs --commit
 *   - VERIFY is a read-only smoke: every seed present + active under the right
 *     category, and codes unique within each category:
 *       node scripts/seed-deal-reference-values.mjs --verify
 *
 * Idempotent: a row is matched by (cr664_category value + cr664_code),
 * case-insensitive on code. Exactly one ACTIVE match → REUSED (and in --commit
 * its category/sortorder are patched only if absent/mismatched). Two+ → FAIL
 * CLOSED (operator resolves). Codes are unique WITHIN a category only, so the
 * same code may legitimately exist under two categories.
 *
 * PREREQUISITE: the maker must first add the cr664_category CHOICE column via
 * scripts/dataverse/create-deal-reference-category.ps1 (see
 * docs/DEAL_REFERENCE_VALUES_SETUP.md). If the column is missing, --commit/--verify
 * fail closed with the Dataverse error rather than guessing.
 *
 * Hard non-goals: never touches a Loan Deal row; never deactivates/deletes an
 * existing row; never invents a category (the three option values below are the
 * canonical contract — mirror src/shared/governance/dealReferenceCategories.ts).
 */

import { spawnSync } from 'node:child_process';

const DV_BEARER_TOKEN_ENV_VAR = 'DATAVERSE_BEARER_TOKEN';
const DV_ENV_URL_ENV_VAR = 'DATAVERSE_ENV_URL';

const ENTITY_SET = 'cr664_producttypereferences';
const ID_ATTR = 'cr664_producttypereferenceid';
const CATEGORY_ATTR = 'cr664_category';

/**
 * Canonical cr664_category option values — MUST match
 * src/shared/governance/dealReferenceCategories.ts.
 */
const CATEGORY = Object.freeze({
  productType: 788190000,
  loanStructure: 788190001,
  pricingType: 788190002,
});

/**
 * Seed values from the Phase 4 spec. `code` is unique within its category and is
 * the idempotency key; `sort` is the display order. No row is ever fabricated
 * beyond these — admins add the rest via the Admin → Deal Reference Values UI.
 */
const SEEDS = Object.freeze([
  // Product Type
  { category: 'productType', code: 'EQUIPMENT', name: 'Equipment', sort: 10 },
  { category: 'productType', code: 'SBA_7A', name: 'SBA 7(a)', sort: 20 },
  { category: 'productType', code: 'SBA_504', name: 'SBA 504', sort: 30 },
  { category: 'productType', code: 'LINE_OF_CREDIT', name: 'Line of Credit', sort: 40 },
  { category: 'productType', code: 'COMMERCIAL_MORTGAGE', name: 'Commercial Mortgage', sort: 50 },
  { category: 'productType', code: 'TERM_LOAN', name: 'Term Loan', sort: 60 },
  { category: 'productType', code: 'CONSTRUCTION_LOAN', name: 'Construction Loan', sort: 70 },
  { category: 'productType', code: 'CRE', name: 'CRE', sort: 80 },
  { category: 'productType', code: 'WORKING_CAPITAL', name: 'Working Capital', sort: 90 },
  // Loan Structure
  { category: 'loanStructure', code: 'TERM_LOAN', name: 'Term loan', sort: 10 },
  { category: 'loanStructure', code: 'REVOLVING_LOC', name: 'Revolving line of credit', sort: 20 },
  { category: 'loanStructure', code: 'CONSTRUCTION_TO_PERM', name: 'Construction-to-permanent', sort: 30 },
  { category: 'loanStructure', code: 'IO_THEN_AMORTIZING', name: 'Interest-only period then amortizing', sort: 40 },
  { category: 'loanStructure', code: 'FULLY_AMORTIZING', name: 'Fully amortizing', sort: 50 },
  { category: 'loanStructure', code: 'BALLOON', name: 'Balloon', sort: 60 },
  { category: 'loanStructure', code: 'SBA_GUARANTEED', name: 'SBA guaranteed', sort: 70 },
  { category: 'loanStructure', code: 'PARTICIPATION', name: 'Participation', sort: 80 },
  { category: 'loanStructure', code: 'SYNDICATED', name: 'Syndicated', sort: 90 },
  { category: 'loanStructure', code: 'OWNER_OCCUPIED_CRE', name: 'Owner-occupied CRE', sort: 100 },
  // Pricing Type
  { category: 'pricingType', code: 'FIXED', name: 'Fixed', sort: 10 },
  { category: 'pricingType', code: 'VARIABLE', name: 'Variable', sort: 20 },
  { category: 'pricingType', code: 'WSJ_PRIME_SPREAD', name: 'WSJ Prime + spread', sort: 30 },
  { category: 'pricingType', code: 'SOFR_SPREAD', name: 'SOFR + spread', sort: 40 },
  { category: 'pricingType', code: 'SBA_STANDARD', name: 'SBA standard pricing', sort: 50 },
  { category: 'pricingType', code: 'FLOOR_RATE', name: 'Floor rate', sort: 60 },
  { category: 'pricingType', code: 'TIERED', name: 'Tiered pricing', sort: 70 },
].map(Object.freeze));

// A row whose code/name looks like throwaway test data is never a reuse
// candidate and is never mutated.
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

async function odataPost(body, token, envUrl) {
  try {
    const res = await fetch(`${envUrl}/api/data/v9.2/${ENTITY_SET}`, {
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
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `PATCH ${ENTITY_SET}(${id}) → ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `PATCH network error: ${err.message}` };
  }
}

/** ACTIVE, production-safe rows matching a seed by (category value + code). */
function matchCandidates(records, seed) {
  const wantCode = seed.code.trim().toLowerCase();
  const wantCat = CATEGORY[seed.category];
  return records
    .map((r) => ({
      id: r[ID_ATTR],
      name: r.cr664_name ?? '',
      code: r.cr664_code ?? '',
      category: typeof r[CATEGORY_ATTR] === 'number' ? r[CATEGORY_ATTR] : undefined,
      sort: typeof r.cr664_sortorder === 'number' ? r.cr664_sortorder : undefined,
      active: r.cr664_activeflag === true,
    }))
    .filter((r) => !UNSAFE_LABEL.test(r.code) && !UNSAFE_LABEL.test(r.name))
    .filter((r) => r.category === wantCat && r.code.trim().toLowerCase() === wantCode);
}

const SELECT = `${ID_ATTR},cr664_name,cr664_code,cr664_activeflag,cr664_sortorder,${CATEGORY_ATTR}`;

async function readAll(token, envUrl) {
  const read = token
    ? await odataGet(`${envUrl}/api/data/v9.2/${ENTITY_SET}?$select=${encodeURIComponent(SELECT)}`, token)
    : { ok: true, records: [] };
  if (!read.ok) {
    bail(
      `Could not read ${ENTITY_SET}: ${read.error}\n` +
        `(If the error mentions ${CATEGORY_ATTR}, the maker has not added the CHOICE column yet — run ` +
        `scripts/dataverse/create-deal-reference-category.ps1 first. See docs/DEAL_REFERENCE_VALUES_SETUP.md.)`,
    );
  }
  return read.records;
}

async function planOrSeed(mode, token, envUrl) {
  const records = await readAll(token, envUrl);
  let created = 0, reused = 0, patched = 0;
  let lastCat = '';
  for (const seed of SEEDS) {
    if (seed.category !== lastCat) {
      console.log(`\n── ${seed.category} (${CATEGORY[seed.category]}) ──`);
      lastCat = seed.category;
    }
    const cands = matchCandidates(records, seed);
    if (cands.length > 1) {
      bail(`${cands.length} production-safe rows already match ${seed.category}/${seed.code} — failing closed; an operator must resolve the ambiguity.`);
    }
    if (cands.length === 1) {
      const c = cands[0];
      if (!c.active) bail(`${seed.category}/${seed.code} matches an INACTIVE row (id=${c.id}); failing closed — operator reactivates deliberately (via the Admin UI).`);
      const needsCat = c.category !== CATEGORY[seed.category];
      const needsSort = c.sort !== seed.sort;
      if (!needsCat && !needsSort) {
        console.log(`   ✓ ${seed.code.padEnd(22)} reuse (id=${c.id}).`);
        reused++;
      } else {
        console.log(`   ~ ${seed.code.padEnd(22)} reuse + patch${needsCat ? ' category' : ''}${needsSort ? ' sortorder' : ''} (id=${c.id}).`);
        if (mode === 'commit') {
          const patch = {};
          if (needsCat) patch[CATEGORY_ATTR] = CATEGORY[seed.category];
          if (needsSort) patch.cr664_sortorder = seed.sort;
          const p = await odataPatch(c.id, patch, token, envUrl);
          if (!p.ok) bail(`Patch ${seed.category}/${seed.code} failed: ${p.error}`);
        }
        patched++;
      }
      continue;
    }
    console.log(`   + ${seed.code.padEnd(22)} CREATE name="${seed.name}" sort=${seed.sort} active=true`);
    if (mode === 'commit') {
      const body = {
        cr664_name: seed.name,
        cr664_code: seed.code,
        cr664_sortorder: seed.sort,
        cr664_activeflag: true,
        [CATEGORY_ATTR]: CATEGORY[seed.category],
      };
      const c = await odataPost(body, token, envUrl);
      if (!c.ok) bail(`Create ${seed.category}/${seed.code} failed: ${c.error}\n(If the error mentions ${CATEGORY_ATTR}, add the column first — create-deal-reference-category.ps1.)`);
    }
    created++;
  }
  console.log(`\n   → ${created} to create, ${patched} to patch, ${reused} reused.`);
}

async function verify(token, envUrl) {
  console.log('\n=== VERIFY (read-only smoke) ===');
  const records = await readAll(token, envUrl);
  const problems = [];
  /** @type {Map<string, Set<string>>} category → set of active codes (dup guard) */
  const byCatCodes = new Map();
  for (const seed of SEEDS) {
    const cands = matchCandidates(records, seed).filter((c) => c.active);
    if (cands.length === 0) { problems.push(`missing active ${seed.category}/${seed.code}`); continue; }
    if (cands.length > 1) { problems.push(`duplicate active ${seed.category}/${seed.code}`); continue; }
    const codes = byCatCodes.get(seed.category) ?? new Set();
    const key = seed.code.trim().toLowerCase();
    if (codes.has(key)) problems.push(`code ${seed.code} duplicated within ${seed.category}`);
    codes.add(key);
    byCatCodes.set(seed.category, codes);
  }
  if (problems.length) {
    console.log('\n✖ Deal reference values NOT yet complete:');
    for (const p of problems) console.log(`   - ${p}`);
    bail('Seed/verify incomplete — the deal dropdowns stay honest (only real active rows appear).');
  }
  for (const cat of Object.keys(CATEGORY)) {
    const n = SEEDS.filter((s) => s.category === cat).length;
    console.log(`   ${cat.padEnd(14)} ${n} active values present.`);
  }
  console.log('\n✓ All seed values present + active under the correct category, codes unique within category.');
}

async function main() {
  const { commit, verify: doVerify, dryRun } = parseArgs(process.argv);
  console.log('Deal reference value seed —', commit ? 'COMMIT' : doVerify ? 'VERIFY' : 'DRY-RUN (no writes)');

  if (dryRun) {
    console.log('(dry-run: planning against the canonical seed template; pass --commit to write, --verify to read the live env.)');
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
