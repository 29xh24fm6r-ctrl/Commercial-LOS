import { describe, it, expect } from 'vitest';
import { deriveCrmSourceOfTruthCockpitViewModel } from './crmSourceOfTruthCockpitViewModel';

describe('Phase 146B — crmSourceOfTruthCockpitViewModel', () => {
  const vm = deriveCrmSourceOfTruthCockpitViewModel();

  it('is read-only', () => {
    expect(vm.readOnly).toBe(true);
  });

  it('has domains derived from source-of-truth map', () => {
    expect(vm.domains.length).toBeGreaterThan(0);
    expect(vm.totalDomains).toBe(vm.domains.length);
  });

  it('each domain has required fields', () => {
    for (const d of vm.domains) {
      expect(d.domain).toBeTruthy();
      expect(d.losOwner).toBeTruthy();
      expect(d.activationStatus).toBeTruthy();
    }
  });

  it('safety copy mentions read-only', () => {
    expect(vm.safetyCopy).toContain('Read-only');
  });
});
