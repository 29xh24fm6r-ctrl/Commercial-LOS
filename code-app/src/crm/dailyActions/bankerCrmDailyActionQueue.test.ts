import { describe, it, expect } from 'vitest';
import { deriveBankerCrmDailyActionQueue } from './bankerCrmDailyActionQueue';

describe('Phase 146F — bankerCrmDailyActionQueue', () => {
  it('is read-only with no live writes', () => {
    const vm = deriveBankerCrmDailyActionQueue({
      matchConflicts: [], sourceOfTruthConflicts: [], syncPreviewBlocked: [],
      missingContactReadiness: [], activityGaps: [], ncinoWorkflowGaps: [], salesforceOpportunityGaps: [],
    });
    expect(vm.readOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
  });

  it('creates actions from input categories', () => {
    const vm = deriveBankerCrmDailyActionQueue({
      matchConflicts: [{ dealName: 'Deal 1', description: 'Name mismatch' }],
      sourceOfTruthConflicts: [{ description: 'Owner conflict' }],
      syncPreviewBlocked: [],
      missingContactReadiness: [],
      activityGaps: [{ description: 'No recent activity' }],
      ncinoWorkflowGaps: [],
      salesforceOpportunityGaps: [],
    });
    expect(vm.totalActions).toBe(3);
    expect(vm.highSeverityCount).toBe(2);
    expect(vm.lowSeverityCount).toBe(1);
  });

  it('all actions are read-only', () => {
    const vm = deriveBankerCrmDailyActionQueue({
      matchConflicts: [{ description: 'Test' }],
      sourceOfTruthConflicts: [], syncPreviewBlocked: [],
      missingContactReadiness: [], activityGaps: [], ncinoWorkflowGaps: [], salesforceOpportunityGaps: [],
    });
    for (const a of vm.actions) {
      expect(a.readOnly).toBe(true);
    }
  });
});
