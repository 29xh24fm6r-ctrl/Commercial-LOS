import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 149 — Authorized data-flow certification.
 * Verifies production workspace surfaces rely on authorized data
 * providers or explicit props, not hidden global fake data.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSafe(rel: string): string {
  const full = resolve(REPO_ROOT, rel);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Phase 149 — authorized data flow: no global fake data injection', () => {
  const WORKSPACE_SURFACES = [
    'src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
    'src/crm/commandCenter/CrmCommandCenter.tsx',
    'src/crm/commandCenter/CrmCommandCenterShell.tsx',
    'src/crm/salesforceLane/SalesforceLane.tsx',
    'src/crm/ncinoLane/NcinoLane.tsx',
  ];

  for (const rel of WORKSPACE_SURFACES) {
    it(`${rel} does not import global fake data`, () => {
      const code = stripComments(readSafe(rel));
      expect(code).not.toMatch(/\bsampleData\b|\bfakeData\b|\bmockData\b|\bdemoData\b/);
      expect(code).not.toMatch(/\bfakeDeal|\bmockDeal|\bsampleDeal|\bdemoDeal/);
    });

    it(`${rel} does not construct inline fake records`, () => {
      const code = stripComments(readSafe(rel));
      expect(code).not.toMatch(/dealName:\s*['"]Acme/i);
      expect(code).not.toMatch(/clientName:\s*['"]Test Client/i);
      expect(code).not.toMatch(/borrowerName:\s*['"]John Doe/i);
    });
  }
});

describe('Phase 149 — workspace surfaces use props/view-model pattern', () => {
  it('CRM working surfaces accept explicit input props', () => {
    for (const rel of [
      'src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
      'src/crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
      'src/crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
    ]) {
      const code = readSafe(rel);
      expect(code).toMatch(/interface Props/);
      expect(code).toMatch(/\binput\b/);
    }
  });

  it('CRM lanes accept explicit viewModel props', () => {
    for (const rel of [
      'src/crm/salesforceLane/SalesforceLane.tsx',
      'src/crm/ncinoLane/NcinoLane.tsx',
    ]) {
      const code = readSafe(rel);
      expect(code).toMatch(/interface Props/);
      expect(code).toMatch(/viewModel/);
    }
  });
});

describe('Phase 149 — no permission widening in workspace integration', () => {
  const FILES = [
    'src/crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
    'src/crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
  ];

  it('no workspace integration imports from other role providers', () => {
    for (const rel of FILES) {
      const code = readSafe(rel);
      expect(code).not.toMatch(/from ['"].*\/banker\/BankerContext/);
      expect(code).not.toMatch(/from ['"].*\/manager\/ManagerContext/);
      expect(code).not.toMatch(/from ['"].*\/executive\//);
      expect(code).not.toMatch(/from ['"].*\/team\/TeamContext/);
    }
  });
});
