import { describe, it, expect } from 'vitest';
import { deriveExecutiveCrmStrategyViewModel } from './executiveCrmStrategyViewModel';

describe('Phase 146H — executiveCrmStrategyViewModel', () => {
  it('is read-only', () => {
    const vm = deriveExecutiveCrmStrategyViewModel({
      crmCoverageByProduct: false, crmReadinessByBankerTeam: false,
      relationshipIntelligenceGapsAvailable: false, salesforceActivationBlockersAvailable: false,
      ncinoActivationBlockersAvailable: false, depositCrossSellSignalsAvailable: false,
      productStrategyCrmReadinessAvailable: false, revenueProductStrategyDataAvailable: false,
    });
    expect(vm.readOnly).toBe(true);
    expect(vm.liveWritePerformed).toBe(false);
    expect(vm.externalSystemChanged).toBe(false);
  });

  it('has 8 strategy sections', () => {
    const vm = deriveExecutiveCrmStrategyViewModel({
      crmCoverageByProduct: true, crmReadinessByBankerTeam: false,
      relationshipIntelligenceGapsAvailable: true, salesforceActivationBlockersAvailable: true,
      ncinoActivationBlockersAvailable: false, depositCrossSellSignalsAvailable: false,
      productStrategyCrmReadinessAvailable: false, revenueProductStrategyDataAvailable: false,
    });
    expect(vm.sections.length).toBe(8);
    const available = vm.sections.filter((s) => s.status === 'available');
    expect(available.length).toBe(3);
  });

  it('safety copy mentions no fake revenue', () => {
    const vm = deriveExecutiveCrmStrategyViewModel({
      crmCoverageByProduct: false, crmReadinessByBankerTeam: false,
      relationshipIntelligenceGapsAvailable: false, salesforceActivationBlockersAvailable: false,
      ncinoActivationBlockersAvailable: false, depositCrossSellSignalsAvailable: false,
      productStrategyCrmReadinessAvailable: false, revenueProductStrategyDataAvailable: false,
    });
    expect(vm.safetyCopy).toContain('No fake revenue');
  });
});
