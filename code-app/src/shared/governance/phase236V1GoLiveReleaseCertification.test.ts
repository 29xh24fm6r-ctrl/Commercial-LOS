import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveV1GoLiveReleaseCertification } from '../../admin/v1GoLiveReleaseCertificationModel';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const READONLY_FILES = [
  'src/admin/v1GoLiveReleaseCertificationModel.ts',
  'src/admin/V1GoLiveReleaseCertificationPanel.tsx',
];
const DOC_REL = 'docs/PHASE_236_V1_GO_LIVE_RELEASE_CERTIFICATION.md';

describe('Phase 236 — V1.0 go-live release certification contract', () => {
  it('the release certification model reflects the WF-1A posture: stage-advance armed, operating restart still certified', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    // WF-1A armed the stage-advancement live-write gate for the "walk one deal" pilot, so a
    // live-write category is enabled → live mutation expansion is ready. The governed operating
    // restart posture derives from the operating-coverage + build/regression gates (independent
    // of the live-write gates), so it stays certified.
    expect(vm.liveMutationExpansionReady).toBe(true);
    expect(vm.operatingRestartReady).toBe(true);
  });

  it('the legacy panel is retired from the admin workspace', () => {
    const ws = read('src/workspaces/AdminWorkspace.tsx');
    expect(ws).not.toContain('V1GoLiveReleaseCertificationPanel');
    expect(ws).toMatch(/<FinalOperatingCertificationPanel\s*\/>/);
  });

  it('the certification doc exists and includes the required sections', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## Purpose',
      '## Current gate status',
      '## What is ready',
      '## What remains gated',
      '## What users can safely do on day one',
      '## What users cannot do until certified live gates clear',
      '## Required pre-release commands',
      '## Expected green baseline',
      '## Rollback posture',
      '## No external vendor dependency',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/npm run build/);
    expect(doc).toMatch(/npm test -- --run/);
    expect(doc).toMatch(/614 \/ 614/);
    expect(doc).toMatch(/9923 \/ 9923/);
  });

  it('adds no hidden writes / fetches / SDK / create-update-delete / send primitives', () => {
    for (const file of READONLY_FILES) {
      const src = read(file);
      expect(src, file).not.toMatch(/\bfetch\s*\(/);
      expect(src, file).not.toMatch(/XMLHttpRequest/);
      expect(src, file).not.toMatch(/graph\.microsoft\.com/i);
      expect(src, file).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
      expect(src, file).not.toMatch(/\bsendMail\b|\bsendBorrower/i);
      expect(src, file).not.toMatch(/@microsoft\/power-apps/);
      expect(src, file).not.toMatch(/from ['"][^'"]*\/generated\//);
    }
  });

  it('flips no gate and widens no route/permission', () => {
    for (const file of READONLY_FILES) {
      const src = read(file);
      expect(src, file).not.toMatch(/_ENABLED\s*=/);
      expect(src, file).not.toMatch(/WORKSPACE_ROUTES|deriveWorkspaceLinks|useEntitledRoutes/);
      expect(src, file).not.toMatch(/grantEntitlement|grantRole|addRole|securityRole/i);
    }
  });

  it('does not import banker/manager/executive role components (no cross-role import)', () => {
    const modelSrc = read('src/admin/v1GoLiveReleaseCertificationModel.ts');
    expect(modelSrc).not.toMatch(/from ['"]\.\.\/(banker|manager|team|executive)\//);
  });

  it('implies no external Salesforce / nCino vendor dependency', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    // Vendor terms appear only in the negation certification, the approved pattern.
    expect(vm.certifications.join(' ')).toMatch(/No external Salesforce or nCino/i);
    const withoutCerts = JSON.stringify({ ...vm, certifications: [] });
    expect(withoutCerts).not.toMatch(/salesforce|ncino/i);
  });

  it('names the live-write categories that remain gated (all except the WF-1A-armed stage advance)', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    // WF-1A armed Stage advancement; every OTHER live-write category stays gated.
    expect(vm.gatedLiveWriteCategories).toEqual([
      'New Deal create',
      'CRM writeback / live persistence',
      'Document checklist generation',
      'Borrower communication send',
      'Portfolio boarding live persistence',
    ]);
  });
});
