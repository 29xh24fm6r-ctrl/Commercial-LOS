import { describe, it, expect } from 'vitest';
import { deriveCrmDryRunWritebackCommandViewModel } from './crmDryRunWritebackCommandViewModel';

describe('Phase 146E — crmDryRunWritebackCommandViewModel', () => {
  it('all safety booleans are correct', () => {
    const vm = deriveCrmDryRunWritebackCommandViewModel({ blockedFields: [], eligibleFields: [], rollbackPrerequisites: [] });
    expect(vm.dryRunOnly).toBe(true);
    expect(vm.allowedForLiveWriteNow).toBe(false);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.salesforceWritePerformed).toBe(false);
    expect(vm.ncinoWritePerformed).toBe(false);
    expect(vm.externalSystemChanged).toBe(false);
  });

  it('counts blocked and eligible fields', () => {
    const vm = deriveCrmDryRunWritebackCommandViewModel({
      blockedFields: [
        { fieldKey: 'stage', label: 'Stage', provider: 'salesforce', blockedReason: 'Lifecycle field' },
      ],
      eligibleFields: [
        { fieldKey: 'note', label: 'Note', provider: 'salesforce' },
      ],
      rollbackPrerequisites: ['Backup taken'],
    });
    expect(vm.blockedFields.length).toBe(1);
    expect(vm.eligibleFutureFields.length).toBe(1);
    expect(vm.rollbackPrerequisites.length).toBe(1);
  });
});
