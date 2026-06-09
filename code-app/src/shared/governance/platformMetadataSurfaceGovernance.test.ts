import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { derivePlatformObjectCatalog } from '../../platform/derivePlatformObjectCatalog';
import { derivePlatformViewCatalog } from '../../platform/derivePlatformViewCatalog';
import { derivePlatformObjectRelationshipMap } from '../../platform/derivePlatformObjectRelationshipMap';

/**
 * Phase 142B — governed platform metadata surface governance.
 *
 * Pins the read-only contract for the object/view/relationship surfaces and
 * panels: no create/edit object/view, no add-custom-field, no arbitrary query
 * UI, no schema mutation execution, no CRM/Dataverse writes, no fetch in
 * components, no external graph dependency, no route registration, no fake data,
 * and no record IDs / PII in the relationship metadata.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const SURFACE_FILES = [
  'src/platform/platformSurfaceTypes.ts',
  'src/platform/derivePlatformObjectCatalog.ts',
  'src/platform/derivePlatformViewCatalog.ts',
  'src/platform/derivePlatformObjectRelationshipMap.ts',
  'src/platform/deriveWorkspaceCapabilityGroups.ts',
  'src/platform/PlatformObjectCatalogPanel.tsx',
  'src/platform/PlatformViewCatalogPanel.tsx',
  'src/platform/PlatformRelationshipMapPanel.tsx',
  'src/platform/PlatformMetadataDashboard.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = SURFACE_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 142B — files exist', () => {
  for (const rel of ['docs/PHASE_142B_GOVERNED_PLATFORM_OBJECT_VIEW_SURFACES.md', ...SURFACE_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142B — panels are read-only (no mutation controls)', () => {
  const components = SOURCES.filter((f) => f.isComponent);

  it('no panel has a button or an onClick mutation handler', () => {
    for (const c of components) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
    }
  });

  it('no create / edit / save object / view control text', () => {
    for (const c of components) {
      expect(c.code).not.toMatch(/createObject|editObject|saveView|createView|editView|addCustomField|createField/i);
    }
  });

  it('no arbitrary query UI (no textarea / query input)', () => {
    for (const c of components) {
      expect(c.code).not.toMatch(/<textarea/i);
      expect(c.code).not.toMatch(/runQuery|executeQuery|\$filter/i);
    }
  });

  it('no external graph dependency', () => {
    for (const c of components) {
      expect(c.code).not.toMatch(/\b(d3|cytoscape|reactflow|react-flow|mermaid|vis-network|sigma)\b/i);
      expect(c.code).not.toMatch(/<canvas/i);
    }
  });
});

describe('Phase 142B — no writes / fetch / mutation / fake data', () => {
  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no schema mutation / custom-field execution', () => {
    const hits = SOURCES.filter((f) => /\b(mutateSchema|createCustomField|alterTable|addColumn|createField)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / Dataverse SDK in React components', () => {
    const hits = SOURCES.filter((f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code)));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sample emails / phones / dollar literals / external URLs', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      if (/https?:\/\//.test(f.code)) hits.push(`${f.rel} url`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no platform metadata route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/PlatformMetadataDashboard|PlatformObjectCatalogPanel|PlatformViewCatalogPanel/);
  });
});

describe('Phase 142B — behavioral: read-only, no record data / PII', () => {
  it('the object catalog carries no record data and writeEnabledDefault stays false', () => {
    const catalog = derivePlatformObjectCatalog({ context: { workspace: 'strategy' } });
    for (const o of catalog) expect(o.writeEnabledDefault).toBe(false);
    expect(JSON.stringify(catalog)).not.toMatch(/"records"|recordId/);
  });

  it('every view is read-only', () => {
    const views = derivePlatformViewCatalog({ context: { workspace: 'strategy' } });
    for (const v of views) expect(v.readOnly).toBe(true);
  });

  it('the relationship map carries no record IDs or PII and redacts hidden targets', () => {
    const edges = derivePlatformObjectRelationshipMap({ context: { workspace: 'banker' } });
    expect(JSON.stringify(edges)).not.toMatch(/recordId|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(edges.some((e) => !e.visible && e.toObjectKey === 'redacted')).toBe(true);
  });
});
