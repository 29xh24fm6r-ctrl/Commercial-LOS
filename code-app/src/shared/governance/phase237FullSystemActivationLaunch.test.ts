import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveFullActivationLaunchCertification } from '../../admin/fullActivationLaunchCertificationModel';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const FILES = [
  'src/admin/fullActivationLaunchCertificationModel.ts',
  'src/admin/FullSystemActivationLaunchPanel.tsx',
];
const ADAPTER_FILES = [
  'src/workflow/checklistWriteDependency.ts',
  'src/workflow/stageAdvanceWriteDependency.ts',
  'src/crm/crmWritebackAdapter.ts',
];
const DOC_REL = 'docs/PHASE_237_FULL_SYSTEM_ACTIVATION_CERTIFICATION.md';

describe('Phase 237 — full system activation launch governance contract', () => {
  it('names all six activation domains', () => {
    const vm = deriveFullActivationLaunchCertification();
    expect(vm.domains.map((d) => d.id)).toEqual([
      'new-deal-create',
      'crm-writeback',
      'document-checklist-generation',
      'borrower-communication-send',
      'stage-advancement',
      'portfolio-boarding-persistence',
    ]);
  });

  it('every ENABLED live domain has a real adapter/path and is backed by tests; blocked domains stay blocked honestly', () => {
    const vm = deriveFullActivationLaunchCertification();
    for (const d of vm.domains) {
      // Real adapter/gate path is always named, enabled or not.
      expect(d.adapterPath, d.id).toMatch(/^src\/.+\.ts$/);
      if (d.status === 'enabled') {
        // An enabled domain must have a real flag on AND evidence — never faked.
        expect(d.flagEnabled, d.id).toBe(true);
        expect(d.evidencePresent.length, d.id).toBeGreaterThan(0);
      } else {
        // Blocked domains stay not-enabled and report concrete blockers. Their
        // underlying gate flag may be on, but the domain is honestly NOT launched
        // because the final-launch smoke evidence is insufficient (Launch Phase 5).
        expect(d.status, d.id).not.toBe('enabled');
        expect(d.blockers.length, d.id).toBeGreaterThan(0);
      }
    }
  });

  it('does not fake live success and does not claim full launch while domains are blocked', () => {
    const vm = deriveFullActivationLaunchCertification();
    if (vm.enabledCount < vm.domains.length) {
      expect(vm.fullLaunchAchieved).toBe(false);
      expect(vm.posture).toMatch(/Full launch not yet achieved/i);
    }
    expect(vm.certifications.join(' ')).toMatch(/No live readiness is faked/i);
  });

  it('the model flips no feature gate (no source-default flip)', () => {
    const modelSrc = read('src/admin/fullActivationLaunchCertificationModel.ts');
    expect(modelSrc).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(modelSrc).not.toMatch(/_ENABLED\s*=\s*[^=]/); // no flag re-assignment of any kind
  });

  it('adds no hidden writes / fetches / SDK / create-update-delete / send primitives', () => {
    for (const file of FILES) {
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

  it('widens no route/permission', () => {
    for (const file of FILES) {
      const src = read(file);
      expect(src, file).not.toMatch(/WORKSPACE_ROUTES|deriveWorkspaceLinks|useEntitledRoutes/);
      expect(src, file).not.toMatch(/grantEntitlement|grantRole|addRole|securityRole/i);
    }
  });

  it('implies no external Salesforce / nCino vendor dependency', () => {
    const vm = deriveFullActivationLaunchCertification();
    expect(vm.certifications.join(' ')).toMatch(/No external Salesforce or nCino/i);
    const withoutCerts = JSON.stringify({ ...vm, certifications: [] });
    expect(withoutCerts).not.toMatch(/salesforce|ncino/i);
  });

  it('the legacy panel is retired from the admin workspace', () => {
    const ws = read('src/workspaces/AdminWorkspace.tsx');
    expect(ws).not.toContain('FullSystemActivationLaunchPanel');
    expect(ws).toMatch(/<FinalOperatingCertificationPanel\s*\/>/);
  });

  it('the new governed write adapters are default-OFF, fail-closed, and flip no gate', () => {
    for (const file of ADAPTER_FILES) {
      const src = read(file);
      // No source-default flip and no direct SDK in the static graph.
      expect(src, file).not.toMatch(/_ENABLED\s*=\s*true/);
      expect(src, file).not.toMatch(/from ['"][^'"]*\/generated\//);
      expect(src, file).not.toMatch(/@microsoft\/power-apps/);
      expect(src, file).not.toMatch(/\bfetch\s*\(/);
      // Each adapter reads its gate flag and is disabled by default.
      expect(src, file).toMatch(/enabled\s*\?\?\s*Boolean\(/);
    }
  });

  it('the CRM writeback adapter is internal-only (allow-listed cr664_crm* entities, no external dependency)', () => {
    const src = read('src/crm/crmWritebackAdapter.ts');
    expect(src).toMatch(/CRM_ENTITIES/);
    expect(src).toMatch(/disallowed_entity/);
    expect(src).not.toMatch(/salesforce|ncino/i);
  });

  it('the activation certification doc exists with the required sections', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## Purpose',
      '## Activation classification',
      '## Per-domain status and exact blockers',
      '## What is enabled',
      '## What remains blocked',
      '## Operator unblock requirements',
      '## Is full launch achieved',
    ]) {
      expect(doc, section).toContain(section);
    }
  });
});
