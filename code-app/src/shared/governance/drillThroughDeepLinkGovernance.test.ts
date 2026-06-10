import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import {
  sanitizeDrillThroughTargetId,
  parseDrillThroughTargetId,
  buildDrillThroughUrl,
} from '../drillthrough/drillThroughDeepLink';

/**
 * Phase 144D — drill-through deep-link governance.
 *
 * Proves the deep-link layer is a safe, read-only, same-page URL-state helper:
 * the source sanitizes/validates target ids, never fetches / navigates outside
 * the page / executes the param, and the cockpit wiring opens panels whose payload
 * comes from the registry — not from the URL text.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const DEEPLINK_PROD_FILES: readonly string[] = [
  'src/shared/drillthrough/drillThroughDeepLink.ts',
  'src/shared/drillthrough/useDrillThroughDeepLink.ts',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = DEEPLINK_PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  raw: readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 144D — required deep-link source + doc exist', () => {
  for (const rel of [
    ...DEEPLINK_PROD_FILES,
    'src/shared/drillthrough/drillThroughDeepLink.test.ts',
    'src/shared/drillthrough/useDrillThroughDeepLink.test.tsx',
    'docs/PHASE_144D_DRILL_THROUGH_ROUTE_DEEP_LINK_SUPPORT.md',
  ]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 144D — deep-link source validates and sanitizes', () => {
  const helpers = SOURCES.find((s) => s.rel.endsWith('drillThroughDeepLink.ts'))!;
  it('declares a charset allow-list, a length cap, and a protocol deny-list', () => {
    expect(helpers.raw).toMatch(/A-Za-z0-9:._-/); // safe charset
    expect(helpers.raw).toMatch(/MAX_TARGET_ID_LENGTH/);
    expect(helpers.raw).toMatch(/DENY_SUBSTRINGS/);
    expect(helpers.raw).toMatch(/sanitizeDrillThroughTargetId/);
    expect(helpers.raw).toMatch(/isValidDrillThroughTargetId/);
  });
});

describe('Phase 144D — deep-link source adds no write / network / sink / exec', () => {
  it('no fetch / XMLHttpRequest / axios', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Dataverse create / update / upsert / delete call', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Salesforce / nCino write, Graph / Outlook / Power Automate', () => {
    const hits = SOURCES.filter((f) => /salesforce\w*write|ncino\w*write|graph\.microsoft|microsoftgraph|outlook(client|service|services|api)|power[\s_-]?automate/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no eval / Function constructor / dangerouslySetInnerHTML', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b|dangerouslySetInnerHTML/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no navigation sink that could execute a forged param (location/window.open/href=javascript)', () => {
    const hits = SOURCES.filter((f) =>
      /location\.(href|assign|replace)\s*=|window\.open\s*\(|document\.write\s*\(|(href|to|url)\s*[:=]\s*['"]?\s*javascript:/i.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the only "javascript:" reference is inside the protocol deny-list (a rejection, not a sink)', () => {
    for (const f of SOURCES) {
      const occurrences = (f.code.match(/javascript:/gi) ?? []).length;
      const denied = /DENY_SUBSTRINGS[\s\S]*javascript:/i.test(f.code);
      if (occurrences > 0) expect(denied).toBe(true);
    }
  });

  it('no approve / deny / vote / sync-now / push-now / apply-now affordance', () => {
    const hits = SOURCES.filter((f) => /['"][^'"]*\b(sync now|push now|apply now|approve|deny|vote)\b[^'"]*['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fake / sample / mock data', () => {
    const hits = SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 144D — behaviour: fails closed, never builds an external url', () => {
  it('rejects protocol/script/oversized/unsafe ids', () => {
    for (const bad of ['javascript:alert', 'data:text', 'a/b', '<x>', "a'b", 'a b', 'a'.repeat(200)]) {
      expect(sanitizeDrillThroughTargetId(bad)).toBeNull();
    }
  });

  it('parses only a valid id from a search string', () => {
    expect(parseDrillThroughTargetId('?drill=portfolio-kpi-blocked')).toBe('portfolio-kpi-blocked');
    expect(parseDrillThroughTargetId('?drill=javascript:alert')).toBeNull();
  });

  it('builds a same-page relative url (no protocol/host)', () => {
    const url = buildDrillThroughUrl({ pathname: '/portfolio', search: '' }, 'portfolio-kpi-blocked');
    expect(url).not.toMatch(/https?:|:\/\//);
    expect(url.startsWith('/portfolio')).toBe(true);
  });
});

describe('Phase 144D — wiring: detail payload comes from the registry, not the URL', () => {
  it('the Portfolio cockpit wires the deep-link hook and gates availability by target ids', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'src/portfolio/PortfolioCommandCenter.tsx'), 'utf8');
    expect(src).toMatch(/useDrillThroughDeepLink/);
    expect(src).toMatch(/Object\.values\(targets\)\.map\(\(t\) => t\.id\)/);
    expect(src).toMatch(/deepLink\.isActive\(target\.id\)/);
  });

  it('the panel renders the target title from the payload, not a raw param', () => {
    const panel = readFileSync(resolve(REPO_ROOT, 'src/shared/drillthrough/DrillThroughPanel.tsx'), 'utf8');
    expect(panel).toMatch(/target\.title/);
  });
});
