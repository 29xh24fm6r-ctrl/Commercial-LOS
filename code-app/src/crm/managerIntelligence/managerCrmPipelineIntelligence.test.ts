import { describe, it, expect } from 'vitest';
import { deriveManagerCrmPipelineIntelligence } from './managerCrmPipelineIntelligence';

describe('Phase 146G — managerCrmPipelineIntelligence', () => {
  it('is read-only', () => {
    const vm = deriveManagerCrmPipelineIntelligence({
      dealsWithMatchConflicts: 0, dealsMissingSalesforceReadiness: 0,
      dealsMissingNcinoReadiness: 0, syncPreviewBlockedCount: 0,
      bankerCrmFollowUpCount: 0, relationshipActivityGapCount: 0,
    });
    expect(vm.readOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.externalSystemChanged).toBe(false);
  });

  it('has 6 KPIs', () => {
    const vm = deriveManagerCrmPipelineIntelligence({
      dealsWithMatchConflicts: 3, dealsMissingSalesforceReadiness: 5,
      dealsMissingNcinoReadiness: 2, syncPreviewBlockedCount: 1,
      bankerCrmFollowUpCount: 8, relationshipActivityGapCount: 4,
    });
    expect(vm.kpis.length).toBe(6);
    expect(vm.kpis[0].value).toBe(3);
  });
});
