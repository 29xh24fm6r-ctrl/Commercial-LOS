import { describe, it, expect } from 'vitest';
import { deriveCrmCommandCenterViewModel } from './crmCommandCenterViewModel';

describe('Phase 146A — crmCommandCenterViewModel', () => {
  const vm = deriveCrmCommandCenterViewModel();

  it('has read-only title and subtitle', () => {
    expect(vm.title).toBe('CRM Command Center');
    expect(vm.subtitle).toContain('preview-only');
  });

  it('all safety booleans are correct', () => {
    expect(vm.readOnly).toBe(true);
    expect(vm.previewOnly).toBe(true);
    expect(vm.dryRunOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.salesforceWritePerformed).toBe(false);
    expect(vm.ncinoWritePerformed).toBe(false);
    expect(vm.externalSystemChanged).toBe(false);
    expect(vm.allowedForLiveWriteNow).toBe(false);
  });

  it('has domain counts derived from source-of-truth map', () => {
    expect(vm.totalSourceOfTruthDomains).toBeGreaterThan(0);
    expect(vm.disabledDomains + vm.activatedDomains).toBeLessThanOrEqual(vm.totalSourceOfTruthDomains);
  });

  it('has Salesforce and nCino lanes', () => {
    expect(vm.salesforceLane.provider).toBe('salesforce');
    expect(vm.ncinoLane.provider).toBe('ncino');
    expect(vm.salesforceLane.writebackStatus).toBe('disabled');
    expect(vm.ncinoLane.writebackStatus).toBe('disabled');
  });

  it('safety copy mentions disabled writes', () => {
    expect(vm.safetyCopy).toContain('disabled');
    expect(vm.safetyCopy).toContain('read-only');
  });
});
