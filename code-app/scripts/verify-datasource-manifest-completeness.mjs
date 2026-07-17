#!/usr/bin/env node
// @ts-check
/**
 * Datasource manifest completeness — diffs power.config.json's DECLARED tables
 * against the REGISTERED tables in the real, `pac code`-pulled
 * .power/schemas/appschemas/dataSourcesInfo.ts.
 *
 * Directly closes the loop on the recurring "Data source not found: Unable to
 * find data source: <table> in data sources info" live incidents this app has
 * hit (systemusers, then cr664_loandeals) — instead of discovering a missing
 * binding one production error at a time, this reports every gap in one pass.
 *
 * READ-ONLY. Local file comparison only — no Dataverse Web API call, no `pac`
 * invocation. Run this from a machine that has a REAL `.power/` artifact (i.e.
 * after `pac code add-data-source` has actually been run against the live org
 * for the tables it claims to register), not the gitignored BUILD-ONLY
 * fallback stub `npm run power:schemas:ensure` writes for local typechecking —
 * that stub is mechanically derived from power.config.json itself and would
 * therefore ALWAYS report zero missing, which would be a false all-clear. This
 * script detects and refuses to trust the fallback stub (see checkManifestKind).
 *
 *   node scripts/verify-datasource-manifest-completeness.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const POWER_CONFIG_PATH = resolve(REPO_ROOT, 'power.config.json');
const DATA_SOURCES_INFO_PATH = resolve(REPO_ROOT, '.power/schemas/appschemas/dataSourcesInfo.ts');

const FALLBACK_STUB_MARKER = 'BUILD-ONLY FALLBACK';

function bail(msg, code = 1) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(code);
}

/** Every entitySetName power.config.json declares this app needs. */
function loadDeclaredEntitySets() {
  const raw = readFileSync(POWER_CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);
  const declared = new Set();
  (function walk(node) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === 'object') {
      if (typeof node.entitySetName === 'string') {
        declared.add(node.entitySetName);
      } else {
        for (const value of Object.values(node)) walk(value);
      }
    }
  })(config);
  return declared;
}

/**
 * Returns { kind: 'real' | 'fallback-stub' | 'missing', entitySets: Set<string> }.
 * Parses `dataSourcesInfo.ts`'s top-level object keys via a targeted regex rather
 * than a full TS parse — the generated shape is stable and flat (see the file's
 * own doc comment), so this is reliable without pulling in a TS compiler here.
 */
function loadRegisteredEntitySets() {
  if (!existsSync(DATA_SOURCES_INFO_PATH)) {
    return { kind: 'missing', entitySets: new Set() };
  }
  const raw = readFileSync(DATA_SOURCES_INFO_PATH, 'utf8');
  const kind = raw.includes(FALLBACK_STUB_MARKER) ? 'fallback-stub' : 'real';
  const entitySets = new Set();
  // Matches ONLY top-level entries: `  "cr664_something": {` anchored to exactly two
  // leading spaces at the start of a line. Nested fields (`"tableId"`, `"apis": {}`,
  // etc.) are indented four spaces inside each entry and must NOT match — an
  // unanchored pattern would wrongly count "apis" as a registered entity set.
  const keyPattern = /^ {2}"([a-z][a-z0-9_]*)"\s*:\s*\{/gm;
  let match;
  while ((match = keyPattern.exec(raw)) !== null) {
    entitySets.add(match[1]);
  }
  return { kind, entitySets };
}

function main() {
  if (!existsSync(POWER_CONFIG_PATH)) bail(`power.config.json not found at ${POWER_CONFIG_PATH}.`);

  const declared = loadDeclaredEntitySets();
  const registered = loadRegisteredEntitySets();

  console.log('== verify-datasource-manifest-completeness ==');
  console.log(`Declared (power.config.json): ${declared.size} entity set(s).`);

  if (registered.kind === 'missing') {
    bail(
      `${DATA_SOURCES_INFO_PATH} does not exist. Run \`pac code add-data-source\` for each table ` +
        `(or \`npm run power:schemas:ensure\` for a local-only typecheck fallback — that fallback is ` +
        `NOT a valid input to this check; see the file's own header).`,
    );
  }
  if (registered.kind === 'fallback-stub') {
    bail(
      `${DATA_SOURCES_INFO_PATH} is the BUILD-ONLY FALLBACK stub (mechanically derived from ` +
        `power.config.json — it can never show a gap by construction). Re-run this check from a ` +
        `machine with the REAL pac-generated manifest (i.e. after \`pac code add-data-source\` has ` +
        `actually been run against the live org for every table it claims to register). A false ` +
        `all-clear here would look identical to a genuine one — refusing to report rather than lie.`,
    );
  }

  console.log(`Registered (real .power manifest): ${registered.entitySets.size} entity set(s).`);

  const missing = [...declared].filter((e) => !registered.entitySets.has(e)).sort();
  const unexpected = [...registered.entitySets].filter((e) => !declared.has(e)).sort();

  console.log(`\nMissing (declared but not registered — live queries against these will fail): ${missing.length}`);
  for (const m of missing) console.log(`  - ${m}`);

  console.log(`\nUnexpected (registered but not declared in power.config.json): ${unexpected.length}`);
  for (const u of unexpected) console.log(`  - ${u}`);

  const status = missing.length === 0 && unexpected.length === 0 ? 'PASS' : 'BLOCKED';
  console.log(
    `\nEVIDENCE: [datasource-manifest][verify] status=${status} declared=${declared.size} ` +
      `registered=${registered.entitySets.size} missing=${missing.length} unexpected=${unexpected.length} ` +
      `ts=${new Date().toISOString()}`,
  );
  process.exit(status === 'PASS' ? 0 : 1);
}

main();
