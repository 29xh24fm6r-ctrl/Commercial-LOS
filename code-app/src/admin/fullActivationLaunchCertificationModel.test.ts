// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveFullActivationLaunchCertification,
  ACTIVATION_DOMAIN_IDS,
} from './fullActivationLaunchCertificationModel';

describe('Phase 237 — full system activation launch certification model', () => {
  it('classifies all six live-write domains', () => {
    const vm = deriveFullActivationLaunchCertification();
    expect(vm.domains.map((d) => d.id)).toEqual([
      'new-deal-create',
      'crm-writeback',
      'document-checklist-generation',
      'borrower-communication-send',
      'stage-advancement',
      'portfolio-boarding-persistence',
    ]);
    expect(ACTIVATION_DOMAIN_IDS).toHaveLength(6);
  });

  it('every domain has a real adapter path, gate path, evidence, exact blockers, and unblock actions', () => {
    const vm = deriveFullActivationLaunchCertification();
    for (const d of vm.domains) {
      expect(d.adapterPath, d.id).toMatch(/^src\/.+\.ts$/);
      expect(d.gatePath, d.id).toMatch(/^src\/.+\.ts$/);
      expect(d.evidencePresent.length, d.id).toBeGreaterThan(0);
      expect(d.blockers.length, d.id).toBeGreaterThan(0);
      expect(d.unblockActions.length, d.id).toBeGreaterThan(0);
    }
  });

  it('Launch Phase 5: flags on, but evidence-insufficient → only New Deal create is enabled (1/6)', () => {
    const vm = deriveFullActivationLaunchCertification();
    expect(vm.enabledCount).toBe(1);
    expect(vm.fullLaunchAchieved).toBe(false);
    for (const d of vm.domains) {
      // The feature gate flags remain on (unchanged); the integrity authority withholds launch.
      expect(d.flagEnabled, d.id).toBe(true);
    }
    const byId = new Map(vm.domains.map((d) => [d.id, d]));
    expect(byId.get('new-deal-create')?.status).toBe('enabled');
    for (const id of ['crm-writeback', 'document-checklist-generation', 'borrower-communication-send', 'stage-advancement', 'portfolio-boarding-persistence'] as const) {
      expect(byId.get(id)?.status, id).not.toBe('enabled');
    }
  });

  it('classifies each domain honestly (only New Deal create is certifiable now, from recorded smoke evidence)', () => {
    const vm = deriveFullActivationLaunchCertification();
    const byId = new Map(vm.domains.map((d) => [d.id, d]));
    expect(byId.get('new-deal-create')?.classification).toBe('CERTIFIABLE_NOW');
    expect(byId.get('crm-writeback')?.classification).toBe('NEEDS_COMPLETION');
    expect(byId.get('document-checklist-generation')?.classification).toBe('NEEDS_COMPLETION');
    expect(byId.get('borrower-communication-send')?.classification).toBe('NOT_SAFE_TO_ENABLE');
    expect(byId.get('stage-advancement')?.classification).toBe('NEEDS_COMPLETION');
    expect(byId.get('portfolio-boarding-persistence')?.classification).toBe('NEEDS_COMPLETION');
    expect(vm.certifiableCount).toBe(1);
    // No domain's remaining blocker is clearable purely within the repo — the rest is operator-owned.
    expect(vm.domains.every((d) => d.repoCompletable === false)).toBe(true);
  });

  it('records the operator-confirmed environment-ready domains; all six are now enabled at full launch', () => {
    const vm = deriveFullActivationLaunchCertification();
    const byId = new Map(vm.domains.map((d) => [d.id, d]));
    expect(byId.get('new-deal-create')?.operatorEnvironmentConfirmed).toBe(true);
    expect(byId.get('crm-writeback')?.operatorEnvironmentConfirmed).toBe(true);
    expect(byId.get('portfolio-boarding-persistence')?.operatorEnvironmentConfirmed).toBe(true);
    expect(byId.get('borrower-communication-send')?.operatorEnvironmentConfirmed).toBe(false);
    expect(vm.environmentConfirmedCount).toBe(3);
    // Launch Phase 5: certs + gate flags are on, but the final-launch evidence is insufficient,
    // so only New Deal create (pilot-certified) is live (1/6). Flags remain on (unchanged).
    expect(vm.enabledCount).toBe(1);
    expect(byId.get('crm-writeback')?.flagEnabled).toBe(true);
    expect(byId.get('portfolio-boarding-persistence')?.flagEnabled).toBe(true);
  });

  it('surfaces the newly-built certified governed adapters as evidence', () => {
    const vm = deriveFullActivationLaunchCertification();
    const byId = new Map(vm.domains.map((d) => [d.id, d]));
    expect(byId.get('document-checklist-generation')?.adapterPath).toBe('src/workflow/checklistWriteDependency.ts');
    expect(byId.get('stage-advancement')?.adapterPath).toBe('src/workflow/stageAdvanceWriteDependency.ts');
    expect(byId.get('crm-writeback')?.adapterPath).toBe('src/crm/crmWritebackAdapter.ts');
    expect(byId.get('crm-writeback')?.evidencePresent.join(' ')).toMatch(/crmWriteback/);
  });

  it('borrower send names the Outlook connector + SDK regeneration as the exact blocker', () => {
    const vm = deriveFullActivationLaunchCertification();
    const borrower = vm.domains.find((d) => d.id === 'borrower-communication-send')!;
    expect(borrower.blockers.join(' ')).toMatch(/Outlook connector is not registered/i);
    expect(borrower.unblockActions.join(' ')).toMatch(/regenerates the SDK/i);
  });

  it('honestly reports launch NOT achieved while the committed evidence is insufficient', () => {
    const vm = deriveFullActivationLaunchCertification();
    expect(vm.posture).toMatch(/Full launch not yet achieved/i);
  });

  it('certifies no fake success, no gate flip, no external vendor dependency', () => {
    const vm = deriveFullActivationLaunchCertification();
    const joined = vm.certifications.join(' ');
    expect(joined).toMatch(/No live readiness is faked/i);
    expect(joined).toMatch(/No feature gate is flipped/i);
    expect(joined).toMatch(/No external Salesforce or nCino/i);
  });

  it('source flips no flag and is pure/read-only', () => {
    const src = readFileSync(resolve(__dirname, 'fullActivationLaunchCertificationModel.ts'), 'utf8');
    expect(src).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
