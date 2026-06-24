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

  it('certifies operating restart readiness while live mutation expansion stays NOT ready', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    expect(vm.operatingRestartReady).toBe(true);
    expect(vm.liveMutationExpansionReady).toBe(false);
    expect(vm.restartStatement).toMatch(/restart can proceed within the governed read\/operate posture/i);
    expect(vm.restartStatement).toMatch(/Live-write expansion remains intentionally gated/i);
  });

  it('names every intentionally gated live-write category by default', () => {
    const vm = deriveV1GoLiveReleaseCertification();
    expect(vm.gatedLiveWriteCategories).toEqual([
      'New Deal create',
      'CRM writeback / live persistence',
      'Document checklist generation',
      'Borrower communication send',
      'Stage advancement',
      'Portfolio boarding live persistence',
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
