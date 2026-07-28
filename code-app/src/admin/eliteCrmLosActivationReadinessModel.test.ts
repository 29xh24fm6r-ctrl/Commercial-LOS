import { describe, expect, it } from 'vitest';
import { deriveEliteCrmLosActivationReadiness } from './eliteCrmLosActivationReadinessModel';

describe('elite CRM + LOS activation readiness', () => {
  it('reports every internal operating domain ready', () => {
    const vm = deriveEliteCrmLosActivationReadiness();
    expect(vm.goLiveState).toBe('ready');
    expect(vm.blockers).toEqual([]);
    expect(vm.domains.every((domain) => domain.state === 'ready')).toBe(true);
  });

  it('uses the certified banker pilot rather than the deliberately closed public create gate', () => {
    const create = deriveEliteCrmLosActivationReadiness().domains.find(
      (domain) => domain.id === 'new-deal-create',
    )!;
    expect(create.state).toBe('ready');
    expect(create.summary).toMatch(/production pilot/i);
  });
});
