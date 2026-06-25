// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveV1GoLiveReleaseCertification } from './v1GoLiveReleaseCertificationModel';

describe('Phase 236 — V1.0 go-live release certification model', () => {
  it('summarizes the required release/operating coverage gates', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    expect(vm.title).toBe('V1.0 Go-Live Release Certification');
    expect(vm.gates.map((g) => g.id)).toEqual([
      'production-build',
      'regression-suite',
      'banker-operating',
      'manager-operating',
      'executive-restart',
      'admin-action-queue',
      'crm-los-activation',
      'portfolio-boarding',
    ]);
  });

  it('reports live mutation expansion ready after Phase 256B launch (the final V1 decision now reads the enabled gates)', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    // Phase 256B: launched live-write categories make expansion ready.
    expect(vm.liveMutationExpansionReady).toBe(true);
    // The final V1 release decision now sees the enabled checklist/create gates and reports
    // NO_GO for the pre-launch read/operate posture, so the certification is no longer
    // certifying the old gated-restart story.
    expect(vm.operatingRestartReady).toBe(false);
    expect(vm.restartStatement).toMatch(/Operating restart is not yet certified/i);
  });

  it('names the live-write categories that remain gated after Phase 256B launch', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    // Phase 256B launched the five live-write domains; only New Deal create stays gated.
    expect(vm.gatedLiveWriteCategories).toEqual([
      'New Deal create',
    ]);
  });

  it('reflects the build / regression gates as verify-required when not yet confirmed green', () => {
    const vm = deriveV1GoLiveReleaseCertification({ buildGateGreen: false, regressionGateGreen: false });
    const byId = new Map(vm.gates.map((g) => [g.id, g]));
    expect(byId.get('production-build')?.status).toBe('verify-required');
    expect(byId.get('regression-suite')?.status).toBe('verify-required');
    // Operating restart cannot be certified until both gates are confirmed green.
    expect(vm.operatingRestartReady).toBe(false);
  });

  it('build / regression gates default to green (issued from a green baseline)', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    const byId = new Map(vm.gates.map((g) => [g.id, g]));
    expect(byId.get('production-build')?.status).toBe('green');
    expect(byId.get('regression-suite')?.status).toBe('green');
  });

  it('certifies no live write / no gate flip / no external vendor dependency', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    expect(vm.certifications.join(' ')).toMatch(/enables no live write, flips no gate/i);
    expect(vm.certifications.join(' ')).toMatch(/No external Salesforce or nCino/i);
    expect(vm.certifications.join(' ')).toMatch(/Not ready for live mutation expansion/i);
  });

  it('source is pure/read-only with no SDK, fetch, GUID, or Dataverse mutation primitive', () => {
    const src = readFileSync(resolve(__dirname, 'v1GoLiveReleaseCertificationModel.ts'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/graph\.microsoft\.com/i);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    // It must not re-assign any feature flag (no gate flip).
    expect(src).not.toMatch(/_ENABLED\s*=/);
  });
});
