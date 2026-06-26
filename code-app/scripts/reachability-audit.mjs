#!/usr/bin/env node
// @ts-check
/**
 * Reachability audit (Phase 0 / Phase 2 of the full-system activation plan).
 *
 * Starting from the real app entry (`src/main.tsx`), follows static + dynamic
 * RELATIVE imports, resolving `.ts/.tsx/.js/.jsx` and `index.*`, and reports
 * which non-test source files under `src/` are reachable vs orphaned.
 *
 * Gate behavior:
 *   - If the intentional-unrouted allow-file (src/navigation/intentionallyUnrouted.ts)
 *     exists, the script EXITS NON-ZERO when any non-test source file is orphaned
 *     AND not listed in the allow-file ("unexpected orphan"). This is the CI gate.
 *   - If the allow-file does not exist yet (Phase 0), the script is report-only and
 *     exits 0 (there is no baseline to compare against).
 *
 * Flags:
 *   --report   force report-only (never fail), even if the allow-file exists
 *   --json     emit machine-readable JSON summary
 *   --quiet    suppress the per-orphan list (totals + group breakdown only)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..'); // code-app/
const SRC = resolve(ROOT, 'src');
const ENTRY = resolve(SRC, 'main.tsx');
const ALLOW_FILE = resolve(SRC, 'navigation', 'intentionallyUnrouted.ts');

const args = new Set(process.argv.slice(2));
const FORCE_REPORT = args.has('--report');
const JSON_OUT = args.has('--json');
const QUIET = args.has('--quiet');

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const RESOLVE_ORDER = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

/** Normalize an absolute path to a repo-relative, forward-slashed string. */
function rel(abs) {
  return relative(ROOT, abs).split(sep).join('/');
}

/** Is this a non-test, non-decl source file we care about for reachability? */
function isCountedSource(absPath) {
  const base = absPath.split(sep).pop() ?? '';
  if (!SOURCE_EXTS.some((e) => base.endsWith(e))) return false;
  if (base.endsWith('.d.ts')) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base)) return false;
  if (/\.stories\.[cm]?[jt]sx?$/.test(base)) return false;
  // Test-harness / setup files are not product surface.
  if (/(^|\.)setupTests?\./.test(base)) return false;
  if (base === 'vite-env.d.ts') return false;
  return true;
}

/** Recursively list every counted source file under src/. */
function listAllSources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      // Skip obvious non-product dirs.
      if (entry === '__mocks__' || entry === '__tests__' || entry === '__snapshots__') continue;
      listAllSources(abs, out);
    } else if (isCountedSource(abs)) {
      out.push(abs);
    }
  }
  return out;
}

/** Extract relative import/export specifiers (static + dynamic) from source. */
function extractRelativeSpecifiers(code) {
  const specs = new Set();
  // import ... from '...'  |  export ... from '...'  |  import '...'
  const staticRe = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  // bare side-effect import: import '...'
  const sideRe = /import\s+['"]([^'"]+)['"]/g;
  // dynamic import('...')
  const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, sideRe, dynRe]) {
    let m;
    while ((m = re.exec(code)) !== null) {
      const spec = m[1];
      if (spec.startsWith('.')) specs.add(spec);
    }
  }
  return [...specs];
}

/** Resolve a relative specifier from an importer file to an absolute file path. */
function resolveSpecifier(fromFile, spec) {
  const baseAbs = resolve(dirname(fromFile), spec);
  for (const suffix of RESOLVE_ORDER) {
    const candidate = baseAbs + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** BFS the import graph from the entry. */
function computeReachable() {
  const reachable = new Set();
  const unresolved = [];
  const stack = [ENTRY];
  while (stack.length) {
    const file = stack.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    let code;
    try {
      code = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const spec of extractRelativeSpecifiers(code)) {
      const resolved = resolveSpecifier(file, spec);
      if (resolved) {
        if (!reachable.has(resolved)) stack.push(resolved);
      } else {
        unresolved.push({ from: rel(file), spec });
      }
    }
  }
  return { reachable, unresolved };
}

/** Parse the allow-file (if present) for its `path:` string literals. */
function loadAllowList() {
  if (!existsSync(ALLOW_FILE)) return null;
  const code = readFileSync(ALLOW_FILE, 'utf8');
  const allow = new Set();
  const re = /path:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    allow.add(m[1].split(sep).join('/'));
  }
  return allow;
}

function topGroup(relPath) {
  // relPath like src/crm/foo.tsx -> "src/crm"; src/App.tsx -> "src"
  const parts = relPath.split('/');
  if (parts.length <= 2) return parts[0];
  return `${parts[0]}/${parts[1]}`;
}

// ---- run ----
if (!existsSync(ENTRY)) {
  console.error(`reachability-audit: entry not found: ${rel(ENTRY)}`);
  process.exit(2);
}

const allSources = listAllSources(SRC);
const { reachable, unresolved } = computeReachable();

const reachableCounted = allSources.filter((f) => reachable.has(f));
const orphans = allSources.filter((f) => !reachable.has(f)).map(rel).sort();

const allow = loadAllowList();
const allowList = allow ?? new Set();
const unexpectedOrphans = orphans.filter((o) => !allowList.has(o));
const expectedOrphans = orphans.filter((o) => allowList.has(o));

// group orphans by top dir
const byGroup = {};
for (const o of orphans) {
  const g = topGroup(o);
  byGroup[g] = (byGroup[g] || 0) + 1;
}

const summary = {
  totalNonTestSources: allSources.length,
  reachable: reachableCounted.length,
  orphan: orphans.length,
  orphanPct: allSources.length
    ? +((orphans.length / allSources.length) * 100).toFixed(1)
    : 0,
  allowFilePresent: allow !== null,
  allowListedOrphans: expectedOrphans.length,
  unexpectedOrphans: unexpectedOrphans.length,
  unresolvedImports: unresolved.length,
};

if (JSON_OUT) {
  console.log(
    JSON.stringify({ ...summary, byGroup, unexpectedOrphanList: unexpectedOrphans }, null, 2),
  );
} else {
  console.log('Reachability audit — entry: src/main.tsx');
  console.log('────────────────────────────────────────');
  console.log(`  total non-test sources : ${summary.totalNonTestSources}`);
  console.log(`  reachable              : ${summary.reachable}`);
  console.log(`  orphaned               : ${summary.orphan}  (${summary.orphanPct}%)`);
  if (allow !== null) {
    console.log(`  allow-listed orphans   : ${summary.allowListedOrphans}`);
    console.log(`  UNEXPECTED orphans     : ${summary.unexpectedOrphans}`);
  } else {
    console.log('  allow-file             : (absent — report-only, Phase 0 baseline)');
  }
  console.log('\n  orphans by subsystem:');
  for (const g of Object.keys(byGroup).sort((a, b) => byGroup[b] - byGroup[a])) {
    console.log(`    ${String(byGroup[g]).padStart(4)}  ${g}`);
  }
  if (!QUIET && unexpectedOrphans.length && allow !== null) {
    console.log('\n  UNEXPECTED orphans (orphaned AND not in intentionallyUnrouted.ts):');
    for (const o of unexpectedOrphans) console.log(`    - ${o}`);
  }
}

// Gate: only fail when the allow-file exists (Phase 2+) and there are unexpected orphans.
if (!FORCE_REPORT && allow !== null && unexpectedOrphans.length > 0) {
  console.error(
    `\nreachability-audit: FAIL — ${unexpectedOrphans.length} unexpected orphan(s). ` +
      `Route them, or add to src/navigation/intentionallyUnrouted.ts with a reason.`,
  );
  process.exit(1);
}
process.exit(0);
