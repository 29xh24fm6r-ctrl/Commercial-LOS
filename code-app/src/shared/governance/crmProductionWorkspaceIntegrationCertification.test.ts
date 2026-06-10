import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('Phase 148F — all Phase 148 docs exist on disk', () => {
  const DOCS = [
    'docs/PHASE_148A_CRM_WORKSPACE_PLACEMENT_ROUTE_SAFETY.md',
    'docs/PHASE_148B_BANKER_CRM_WORKING_SURFACE.md',
    'docs/PHASE_148C_MANAGER_CRM_WORKING_SURFACE.md',
    'docs/PHASE_148D_EXECUTIVE_CRM_WORKING_SURFACE.md',
    'docs/PHASE_148E_WORKING_SYSTEM_NAVIGATION_COPY_CLEANUP.md',
    'docs/PHASE_148F_CRM_PRODUCTION_WORKSPACE_INTEGRATION_CERTIFICATION.md',
  ];
  for (const rel of DOCS) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 148F — workspace integration source files exist', () => {
  const FILES = [
    'src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
    'src/crm/workspaceIntegration/crmWorkspaceIntegration.test.ts',
  ];
  for (const rel of FILES) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 148F — no demo language in Phase 148 source', () => {
  const FILES = [
    'src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
  ];

  it('no Phase 148 workspace source uses "demo" in user-facing copy', () => {
    for (const rel of FILES) {
      const src = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      // Strip comments
      const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(stripped, `${rel} contains "demo"`).not.toMatch(/\bdemo\b/i);
    }
  });
});

describe('Phase 148F — no forbidden patterns in workspace integration source', () => {
  const FILES = [
    'src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
  ];

  const FORBIDDEN = [
    { pattern: /\bfetch\s*\(/, label: 'fetch()' },
    { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
    { pattern: /\baxios\b/, label: 'axios' },
    { pattern: /\beval\s*\(/, label: 'eval()' },
    { pattern: /dangerouslySetInnerHTML/, label: 'dangerouslySetInnerHTML' },
    { pattern: /syncNow|pushNow|writeNow|enableLive/, label: 'action handler' },
    { pattern: /synced successfully|pushed successfully|connected successfully/i, label: 'fake success' },
  ];

  for (const { pattern, label } of FORBIDDEN) {
    it(`no source contains ${label}`, () => {
      for (const rel of FILES) {
        const code = readFileSync(resolve(REPO_ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(code, `${rel} has ${label}`).not.toMatch(pattern);
      }
    });
  }
});

describe('Phase 148F — certification doc pins production workspace posture', () => {
  it('certification doc exists and pins key guarantees', () => {
    const doc = readFileSync(resolve(REPO_ROOT, 'docs/PHASE_148F_CRM_PRODUCTION_WORKSPACE_INTEGRATION_CERTIFICATION.md'), 'utf8');
    expect(doc).toContain('production workspace');
    expect(doc).toContain('No live Salesforce writes');
    expect(doc).toContain('No live nCino writes');
    expect(doc).toContain('readOnly');
    expect(doc).toContain('previewOnly');
    expect(doc).toContain('dryRunOnly');
    // Doc mentions "demo-ready" only in negation (e.g. "No demo-ready framing")
    expect(doc).toContain('not a demo');
  });
});
