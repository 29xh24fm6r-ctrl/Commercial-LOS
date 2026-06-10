import { describe, it, expect } from 'vitest';
import { deriveSalesforceLaneViewModel } from './salesforceLaneViewModel';

describe('Phase 147B — salesforceLaneViewModel', () => {
  it('all safety booleans pinned', () => {
    const vm = deriveSalesforceLaneViewModel({ accountReady: false, contactReady: false, opportunityReady: false, activityReferenceReady: false, matchConflicts: 0, wouldCreate: 0, wouldUpdate: 0, wouldLink: 0, blocked: 0, noOp: 0 });
    expect(vm.readOnly).toBe(true);
    expect(vm.previewOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.salesforceWritePerformed).toBe(false);
  });

  it('shows readiness rows', () => {
    const vm = deriveSalesforceLaneViewModel({ accountReady: true, contactReady: false, opportunityReady: true, activityReferenceReady: false, matchConflicts: 2, wouldCreate: 3, wouldUpdate: 1, wouldLink: 0, blocked: 1, noOp: 5 });
    expect(vm.readinessRows.length).toBe(4);
    expect(vm.readinessRows[0].status).toBe('ready');
    expect(vm.readinessRows[1].status).toBe('not_ready');
    expect(vm.syncBuckets.length).toBe(5);
    expect(vm.matchConflictCount).toBe(2);
  });

  it('safety copy uses preview language', () => {
    const vm = deriveSalesforceLaneViewModel({ accountReady: false, contactReady: false, opportunityReady: false, activityReferenceReady: false, matchConflicts: 0, wouldCreate: 0, wouldUpdate: 0, wouldLink: 0, blocked: 0, noOp: 0 });
    expect(vm.safetyCopy).toContain('preview');
    expect(vm.safetyCopy).toContain('disabled');
    expect(vm.safetyCopy).not.toMatch(/synced|connected successfully/i);
  });
});
