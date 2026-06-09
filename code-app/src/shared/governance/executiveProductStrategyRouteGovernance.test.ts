import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  WORKSPACE_ROUTES,
  PRODUCT_STRATEGY_SURFACE_URL,
  isProductStrategySurface,
} from '../../bootstrap/workspaceRoutes';

/**
 * Phase 142I — executive product strategy ROUTE governance.
 *
 * Pins the executive-safe mounting contract: the product-strategy surface lives
 * UNDER the executive route (subordinate to executive access), so it inherits the
 * existing executive WorkspaceGate's fail-closed gating (non-executive, loading,
 * and direct-URL all bounce). NO new App route, NO new entitlement / permission
 * widening, NO write controls, NO apply-config / enable-integration /
 * register-route / approve-credit / waive / outreach execution, NO fetch, NO
 * Dataverse/CRM write, NO external URL / iframe, NO fake operational data.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/bootstrap/workspaceRoutes.ts',
  'src/competitive/buildExecutiveProductStrategySurfaceState.ts',
  'src/competitive/ProductStrategyNavigationCard.tsx',
  'src/workspaces/ExecutiveProductStrategyWorkspace.tsx',
  'src/workspaces/ExecutiveWorkspace.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  raw: readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

const APP = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
const ENTITLEMENTS = readFileSync(resolve(REPO_ROOT, 'src/bootstrap/workspaceEntitlements.ts'), 'utf8');

describe('Phase 142I — files exist', () => {
  for (const rel of ['docs/PHASE_142I_EXECUTIVE_SAFE_PRODUCT_STRATEGY_ROUTE.md', ...PROD_FILES, 'src/shared/governance/executiveProductStrategyRouteGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142I — executive-gated, fail-closed, no widening', () => {
  it('the surface lives under the executive route', () => {
    expect(PRODUCT_STRATEGY_SURFACE_URL.startsWith(WORKSPACE_ROUTES.executive)).toBe(true);
    expect(isProductStrategySurface('product-strategy')).toBe(true);
    expect(isProductStrategySurface('portfolio')).toBe(false);
  });

  it('registers no new App route for the surface and keeps the executive WorkspaceGate', () => {
    // No standalone product-strategy route; the executive route still gates.
    expect(APP).not.toMatch(/product-strategy/);
    expect(APP).not.toMatch(/ExecutiveProductStrategyWorkspace/);
    expect(APP).toMatch(/WorkspaceGate\s+allowed=\{WORKSPACE_ROUTES\.executive\}/);
  });

  it('adds no manager / banker / team / portfolio entitlement for the surface', () => {
    expect(ENTITLEMENTS).not.toMatch(/product-strategy|productStrategy/i);
  });

  it('the surface URL targets no other workspace route', () => {
    for (const other of ['banker', 'team', 'manager', 'admin'] as const) {
      expect(PRODUCT_STRATEGY_SURFACE_URL).not.toContain(WORKSPACE_ROUTES[other]);
    }
  });
});

describe('Phase 142I — no write controls / execution / fetch / external links', () => {
  it('route-surface components have no button / onClick / form / onSubmit', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/<form\b/i);
      expect(c.code).not.toMatch(/onClick/);
      expect(c.code).not.toMatch(/onSubmit/);
    }
  });

  it('no apply-config / enable-integration / register-route execution', () => {
    const hits = SOURCES.filter((f) => /\b(applyConfig|applyConfiguration|enableIntegration|activateProvider|registerRoute|mutateSchema)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no approve/decline credit / covenant waiver execution', () => {
    const hits = SOURCES.filter((f) => /\b(approveCredit|declineCredit|waiveCovenant|grantWaiver)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no borrower outreach / upload-link execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|sendSms|sendBorrower|generateUploadLink|createUploadLink)\s*\(|mailto:|twilio/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / XMLHttpRequest in the strategy workspace or composer', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no external URL or iframe (internal anchors only)', () => {
    const hits = SOURCES.filter((f) => /https?:\/\//.test(f.raw) || /<iframe/i.test(f.code) || /href=["']https?:/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fake operational data (dollar literals / emails / phones)', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
    }
    expect(hits).toEqual([]);
  });
});
