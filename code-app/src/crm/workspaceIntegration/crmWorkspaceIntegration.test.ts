import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_SRC = resolve(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_SRC, rel), 'utf8');
}

describe('Phase 148A — CRM workspace placement route safety', () => {
  it('CrmBankerWorkingSurface exists and is read-only', () => {
    const src = readSrc('crm/workspaceIntegration/CrmBankerWorkingSurface.tsx');
    expect(src).toContain('read-only');
    expect(src).toContain('Live writes disabled');
    expect(src).not.toMatch(/syncNow|pushNow|writeNow|enableLive/);
  });

  it('CrmManagerWorkingSurface exists and has no assignment mutation', () => {
    const src = readSrc('crm/workspaceIntegration/CrmManagerWorkingSurface.tsx');
    expect(src).toContain('read-only');
    expect(src).toContain('No assignment mutation');
    expect(src).not.toMatch(/syncNow|pushNow|writeNow|enableLive/);
  });

  it('CrmExecutiveWorkingSurface exists and has no fake revenue', () => {
    const src = readSrc('crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx');
    expect(src).toContain('read-only');
    expect(src).toContain('No fake revenue');
    expect(src).not.toMatch(/syncNow|pushNow|writeNow|enableLive/);
  });

  it('no workspace integration file contains permission-widening patterns', () => {
    const files = [
      'crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
      'crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
      'crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
    ];
    for (const rel of files) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/\baxios\b/);
      expect(src).not.toMatch(/\beval\s*\(/);
      expect(src).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('no workspace integration file uses demo language', () => {
    const files = [
      'crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
      'crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
      'crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
    ];
    for (const rel of files) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/\bdemo\b/i);
    }
  });
});
