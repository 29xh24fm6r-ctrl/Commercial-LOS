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
  it('the release certification model exists and certifies operating-restart vs live-mutation posture', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    expect(vm.operatingRestartReady).toBe(true);
    expect(vm.liveMutationExpansionReady).toBe(false);
    // It must never claim a live-write category is enabled.
    expect(vm.certifications.join(' ')).toMatch(/Not ready for live mutation expansion/i);
  });

  it('the admin panel is mounted high in the admin workspace', () => {
    const ws = read('src/workspaces/AdminWorkspace.tsx');
    expect(ws).toMatch(/import \{ V1GoLiveReleaseCertificationPanel \}/);
    expect(ws).toMatch(/<V1GoLiveReleaseCertificationPanel \/>/);
    // High visibility: it sits at the top of the readiness stack (before the
    // detailed activation/launch panels).
    expect(ws.indexOf('<V1GoLiveReleaseCertificationPanel />')).toBeLessThan(
      ws.indexOf('<FullSystemLaunchReadinessConsole />'),
    );
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

  it('explicitly names the intentionally gated live-write categories', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    expect(vm.gatedLiveWriteCategories).toEqual(
      expect.arrayContaining([
        'New Deal create',
        'CRM writeback / live persistence',
        'Document checklist generation',
        'Borrower communication send',
        'Stage advancement',
        'Portfolio boarding live persistence',
      ]),
    );
  });
});
