import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bankerCrmPreviewInput,
  managerCrmPreviewInput,
  executiveCrmPreviewInput,
} from '../../crm/workspaceIntegration/crmWorkspacePreviewInputs';

/**
 * BUGFIX-PRODUCTION-CRM-SURFACES-NOT-VISIBLE-1 — CRM workspace visibility
 * certification.
 *
 * The Phase 148 CRM working surfaces were defined but mounted nowhere in the live
 * workspace path. This test proves they are now actually rendered in the
 * production Banker / Manager / Executive workspace components — it FAILS if the
 * live Banker workspace stops rendering the CRM Command Center entry — and that
 * the mount stays read-only, preview-honest, and free of writes / live calls /
 * permission widening.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('BUGFIX-CRM-VISIBLE — required files exist', () => {
  for (const rel of [
    'src/crm/workspaceIntegration/crmWorkspacePreviewInputs.ts',
    'src/banker/BankerCrmIntelligencePanel.tsx',
  ]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('BUGFIX-CRM-VISIBLE — Banker workspace mounts the CRM entry', () => {
  const shell = read('src/banker/BankerShell.tsx');
  const panel = read('src/banker/BankerCrmIntelligencePanel.tsx');

  it('BankerShell imports and renders the CRM intelligence panel', () => {
    expect(shell).toMatch(/import\s*\{\s*BankerCrmIntelligencePanel\s*\}/);
    expect(shell).toMatch(/<BankerCrmIntelligencePanel\s*\/>/);
  });

  it('the panel renders the required CRM Command Center entry copy', () => {
    expect(panel).toContain('CRM Command Center');
    expect(panel).toContain('Salesforce and nCino preview intelligence');
    expect(panel).toContain('Review source-of-truth, matching, sync preview, and dry-run posture.');
  });

  it('the panel renders the read-only CRM banker working surface', () => {
    expect(panel).toContain('CrmBankerWorkingSurface');
    expect(panel).toContain('bankerCrmPreviewInput');
  });
});

describe('BUGFIX-CRM-VISIBLE — Manager + Executive workspaces mount their CRM surfaces', () => {
  it('ManagerWorkspace renders CrmManagerWorkingSurface', () => {
    const src = read('src/workspaces/ManagerWorkspace.tsx');
    expect(src).toMatch(/import\s*\{\s*CrmManagerWorkingSurface\s*\}/);
    expect(src).toMatch(/<CrmManagerWorkingSurface\s+input=\{managerCrmPreviewInput\(\)\}/);
  });

  it('ExecutiveWorkspace renders CrmExecutiveWorkingSurface', () => {
    const src = read('src/workspaces/ExecutiveWorkspace.tsx');
    expect(src).toMatch(/import\s*\{\s*CrmExecutiveWorkingSurface\s*\}/);
    expect(src).toMatch(/<CrmExecutiveWorkingSurface\s+input=\{executiveCrmPreviewInput\(\)\}/);
  });
});

describe('BUGFIX-CRM-VISIBLE — mount is read-only, preview-honest, no writes / widening', () => {
  const MOUNT_FILES = [
    'src/crm/workspaceIntegration/crmWorkspacePreviewInputs.ts',
    'src/banker/BankerCrmIntelligencePanel.tsx',
  ];

  it('no fetch / XHR / axios / write verbs / eval in the new mount source', () => {
    for (const rel of MOUNT_FILES) {
      const src = read(rel);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/\baxios\b/);
      expect(src).not.toMatch(/\beval\s*\(|new\s+Function\b|dangerouslySetInnerHTML/);
      expect(src).not.toMatch(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
      expect(src).not.toMatch(/createRecord|updateRecord|deleteRecord|upsert\w*\s*\(/);
    }
  });

  it('no sync-now / push-now / enable-live / write-now controls and no fake sync success copy', () => {
    for (const rel of MOUNT_FILES) {
      const src = read(rel);
      expect(src).not.toMatch(/syncNow|pushNow|writeNow|enableLive/);
      expect(src.toLowerCase()).not.toContain('synced successfully');
      expect(src.toLowerCase()).not.toContain('salesforce updated');
      expect(src.toLowerCase()).not.toContain('ncino updated');
    }
  });

  it('no permission-widening or new-route patterns in the new mount source', () => {
    for (const rel of MOUNT_FILES) {
      const src = read(rel);
      expect(src).not.toMatch(/grant\w*Permission|widen\w*|elevatePrivilege|addRole\s*\(|<Route\b|createBrowserRouter/i);
    }
  });

  it('no prohibited fake-data identifiers', () => {
    for (const rel of MOUNT_FILES) {
      const src = read(rel);
      expect(src).not.toMatch(/\b(sampleDeal|mockDeal|fakeDeal|demoDeal|sampleData|mockData|fakeData|demoData|hardcodedDeals|placeholderRows)\b/);
    }
  });
});

describe('BUGFIX-CRM-VISIBLE — preview inputs are honest (not-connected, zero counts, no live href)', () => {
  it('banker preview is not-connected and exposes no command-center href', () => {
    const i = bankerCrmPreviewInput();
    expect(i.salesforceReadiness).toMatch(/preview/i);
    expect(i.ncinoReadiness).toMatch(/preview/i);
    expect(i.sourceOfTruthGaps).toBe(0);
    expect(i.syncPreviewBlockers).toBe(0);
    expect(i.crmCommandCenterHref).toBeUndefined();
    expect(i.nextSafeBankerStep).toMatch(/no live connection/i);
  });

  it('manager preview is not-connected with no assignment changes', () => {
    const i = managerCrmPreviewInput();
    expect(i.teamCrmReadiness).toMatch(/preview/i);
    expect(i.syncPreviewBlockedCount).toBe(0);
    expect(i.crmCommandCenterHref).toBeUndefined();
    expect(i.nextSafeManagerStep).toMatch(/no assignment changes/i);
  });

  it('executive preview shows no revenue figures and no live writes', () => {
    const i = executiveCrmPreviewInput();
    expect(i.revenueDataAvailability).toMatch(/no revenue figures/i);
    expect(i.relationshipIntelligenceGaps).toBe(0);
    expect(i.crmCommandCenterHref).toBeUndefined();
    expect(i.nextExecutiveStep).toMatch(/no live writes/i);
  });
});
