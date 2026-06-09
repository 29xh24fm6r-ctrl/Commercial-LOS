import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { PRODUCT_PROCESS_TEMPLATE_REGISTRY } from '../../platform/productProcessTemplateRegistry';
import { deriveProductProcessTemplateSelection } from '../../platform/deriveProductProcessTemplateSelection';

/**
 * Phase 142D — product/process template governance.
 *
 * Pins the metadata-only contract: no create/edit/delete/activate template, no
 * product/covenant/document-request/task creation, no workflow mutation, no CRM/
 * Dataverse writes, no fetch in components, no final credit approval/decline, no
 * covenant waiver, and no fake borrower/product data. NOTE: the model
 * deliberately names disabled capabilities as structural fields (`finalApproval:
 * false`, `containsLiveProductWrite: false`) — scans target EXECUTION patterns.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/platform/productProcessTemplateTypes.ts',
  'src/platform/productProcessTemplateRegistry.ts',
  'src/platform/deriveProductProcessTemplateSelection.ts',
  'src/platform/deriveProductProcessRequirements.ts',
  'src/platform/deriveProductProcessTemplateReadiness.ts',
  'src/platform/ProductProcessTemplateCatalogPanel.tsx',
  'src/platform/ProductProcessTemplateSelectionPanel.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 142D — files exist', () => {
  for (const rel of ['docs/PHASE_142D_PRODUCT_PROCESS_TEMPLATE_REGISTRY.md', ...PROD_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142D — no template / product / requirement / task mutation', () => {
  it('panels have no button / onClick mutation control', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
    }
  });

  it('no create / edit / delete / activate template execution', () => {
    const hits = SOURCES.filter((f) => /\b(createTemplate|editTemplate|deleteTemplate|activateTemplate|saveTemplate)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no product / covenant / document-request / task creation execution', () => {
    const hits = SOURCES.filter((f) => /\b(createProduct|createCovenant|createDocumentRequest|createTask|addTask)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no workflow mutation / covenant waiver execution', () => {
    const hits = SOURCES.filter((f) => /\b(mutateWorkflow|updateRoute|updateStage|waiveCovenant|grantWaiver)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142D — no writes / fetch / approval / fake data', () => {
  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / Dataverse SDK in React components', () => {
    const hits = SOURCES.filter((f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code)));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no final credit approval / decline recommendation and no finalApproval true', () => {
    const hits = SOURCES.filter((f) => /recommend(s|ed)?\s+(approval|decline)|approveCredit\s*\(|finalApproval:\s*true/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sample emails / phones / dollar literals / external URLs / placeholder names', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      if (/https?:\/\//.test(f.code)) hits.push(`${f.rel} url`);
      if (/\bAcme\b|\bContoso\b|\bJohn\s+Smith\b/i.test(f.code)) hits.push(`${f.rel} name`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no template panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/ProductProcessTemplateCatalogPanel|ProductProcessTemplateSelectionPanel/);
  });
});

describe('Phase 142D — behavioral: metadata-only, read-only', () => {
  it('every template is a static governed template with no live product write', () => {
    for (const t of PRODUCT_PROCESS_TEMPLATE_REGISTRY) {
      expect(t.source).toBe('static_governed_template');
      expect(t.auditSummary.containsLiveProductWrite).toBe(false);
    }
  });

  it('template selection is read-only and invents no product', () => {
    const r = deriveProductProcessTemplateSelection({ input: {} });
    expect(r.readOnly).toBe(true);
    expect(r.primaryTemplateKey).toBeUndefined();
  });
});
