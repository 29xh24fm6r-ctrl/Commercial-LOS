import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import {
  createRecentSurfaceRegistry,
  drillThroughIssues,
  RECENT_SURFACE_DESCRIPTORS,
} from '../drillthrough/drillThroughRegistry';
import { resolveDrillThroughAction } from '../drillthrough/drillThroughTypes';

/**
 * Phase 144A — system-wide drill-through contract governance.
 *
 * Proves: the Phase 144A doc + shared primitives exist; the read-only panel
 * renders read-only details; recent Phase 142/143 surfaces expose detail behavior
 * or an honest unavailable reason; and the drill-through production source adds NO
 * write/network pattern (fetch/XHR/axios/POST/PATCH/PUT/DELETE/Dataverse mutation/
 * Salesforce-nCino write/Graph-Outlook-PowerAutomate/eval/Function), NO permission
 * widening, NO fake/sample/mock data, and NO sync-now/push-now/apply-now/approve/
 * deny/vote action control.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const DRILLTHROUGH_PROD_FILES: readonly string[] = [
  'src/shared/drillthrough/drillThroughTypes.ts',
  'src/shared/drillthrough/drillThroughRegistry.ts',
  'src/shared/drillthrough/DrillThroughPanel.tsx',
  'src/shared/drillthrough/DrillThroughCard.tsx',
];

const DRILLTHROUGH_SUPPORT_FILES: readonly string[] = [
  'src/shared/drillthrough/drillThroughRegistry.test.ts',
  'src/shared/drillthrough/DrillThroughPanel.test.tsx',
  'src/shared/drillthrough/DrillThroughCard.test.tsx',
  'docs/PHASE_144A_SYSTEM_WIDE_DRILL_THROUGH_CONTRACT.md',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = DRILLTHROUGH_PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  raw: readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 144A — required doc and primitives exist', () => {
  for (const rel of [...DRILLTHROUGH_PROD_FILES, ...DRILLTHROUGH_SUPPORT_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 144A — no write / network / external pattern introduced', () => {
  it('imports only relative modules + react', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

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

  it('no Salesforce / nCino write call', () => {
    const hits = SOURCES.filter((f) => /salesforce\w*write|ncino\w*write|writeToSalesforce|writeToNcino/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Graph / Outlook / Power Automate API usage', () => {
    const hits = SOURCES.filter((f) => /graph\.microsoft|microsoftgraph|outlook(client|service|services|api)|power[\s_-]?automate/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no token / secret / env var / endpoint URL', () => {
    const hits = SOURCES.filter((f) => /process\.env|https?:\/\/|(api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['"][^'"]+['"]/i.test(f.raw));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no eval / Function constructor', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 144A — no permission widening, no write controls, no fake data', () => {
  it('no permission / role / scope widening', () => {
    const hits = SOURCES.filter((f) => /grant\w*Permission|widen\w*|elevatePrivilege|addRole\s*\(|setScope\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no <button> / <form> / onClick / onSubmit action control', () => {
    const hits = SOURCES.filter((f) => /<button\b|<form\b|onClick|onSubmit|type=['"]submit['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sync-now / push-now / apply-now / approve / deny / vote affordance label', () => {
    const hits = SOURCES.filter((f) => /['"][^'"]*\b(sync now|push now|apply now|approve|deny|vote)\b[^'"]*['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fake / sample / mock data', () => {
    const hits = SOURCES.filter((f) => /\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('App.tsx mounts no Phase 144A drill-through route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/DrillThroughCard|DrillThroughPanel|drillThroughRegistry/);
  });
});

describe('Phase 144A — read-only panel renders read-only details', () => {
  const panel = readFileSync(resolve(REPO_ROOT, 'src/shared/drillthrough/DrillThroughPanel.tsx'), 'utf8');
  it('panel pins a read-only badge and a read-only footer disclaimer', () => {
    expect(panel).toContain('Read-only');
    expect(panel).toMatch(/no write, no live call, and no state change occurs here/i);
  });
  it('panel renders an honest unavailable branch (no fabricated rows)', () => {
    expect(panel).toMatch(/unavailable/i);
  });
});

describe('Phase 144A — recent Phase 142/143 surfaces are under the contract', () => {
  const reg = createRecentSurfaceRegistry();

  it('every recent surface is registered and read-only', () => {
    for (const d of RECENT_SURFACE_DESCRIPTORS) {
      expect(reg.has(d.surface)).toBe(true);
      const withContent = reg.build(d.surface, { id: `${d.surface}`, title: d.label, summary: `${d.label} summary.`, sourceCounts: [{ label: 'Items', count: 1 }] });
      expect(withContent!.readOnly).toBe(true);
      expect(drillThroughIssues(withContent!)).toEqual([]);
      expect(resolveDrillThroughAction(withContent!).kind).toBe('panel');
    }
  });

  it('every recent surface degrades to an honest unavailable reason (never a blank drawer)', () => {
    for (const d of RECENT_SURFACE_DESCRIPTORS) {
      const empty = reg.build(d.surface, { id: `${d.surface}-e`, title: d.label, summary: 'No detail yet.' });
      expect(empty!.unavailableReason).toBeTruthy();
      expect(resolveDrillThroughAction(empty!).kind).toBe('unavailable');
    }
  });

  it('covers the named executive / manager / portfolio / committee / CRM / integration / servicing surfaces', () => {
    const surfaces = new Set(RECENT_SURFACE_DESCRIPTORS.map((d) => d.surface));
    for (const required of [
      'executive_command_center',
      'product_profitability_roe',
      'committee_package_queue',
      'package_export',
      'esign_envelope',
      'core_banking_lookup',
      'aml_kyc_policy_gate',
      'servicing_lifecycle',
      'crm_relationship_intelligence',
      'crm_connector_readiness',
      'crm_entity_matching',
      'crm_sync_preview',
      'crm_writeback_policy',
      'crm_activity_timeline',
    ] as const) {
      expect(surfaces.has(required)).toBe(true);
    }
  });
});
