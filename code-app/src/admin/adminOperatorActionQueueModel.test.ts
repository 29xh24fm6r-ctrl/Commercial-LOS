import { describe, expect, it } from 'vitest';
import { deriveAdminOperatorActionQueueModel } from './adminOperatorActionQueueModel';

describe('admin operator action queue', () => {
  it('clears all internal activation groups and retains only genuine launch evidence work', () => {
    const vm = deriveAdminOperatorActionQueueModel();
    const byId = new Map(vm.groups.map((group) => [group.id, group]));
    for (const id of [
      'crm-los-activation',
      'new-deal-create',
      'crm-writeback',
      'document-checklist',
      'borrower-communication',
      'portfolio-boarding',
    ] as const) {
      expect(byId.get(id)?.state, id).toBe('clear');
    }
    expect(byId.get('launch-readiness')?.state).toBe('action-required');
    expect(byId.get('launch-readiness')?.actions.length).toBeGreaterThan(0);
    expect(
      byId.get('launch-readiness')?.actions.every((action) =>
        /receipt|recipient|approver|evidence/i.test(action.detail),
      ),
    ).toBe(true);
    expect(vm.totalOpenActions).toBe(byId.get('launch-readiness')?.actions.length);
  });
});
