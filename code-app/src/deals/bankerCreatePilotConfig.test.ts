import { describe, it, expect } from 'vitest';
import {
  BANKER_CREATE_PILOT_ENABLED,
  BANKER_CREATE_PILOT,
  bankerCreatePilotGateValues,
} from './bankerCreatePilotConfig';
import { evaluateBankerCreateRollout } from './bankerNewDealCreateRollout';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
} from './dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from './newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../admin/adminNewDealIntakeModel';

/**
 * Phase 182B -- banker create pilot config is the single enablement switch;
 * the global governance constants stay false (public + downstream provably off).
 */

describe('Phase 182B -- pilot config enables banker create without flipping global constants', () => {
  it('the global create-gate constants remain false (public + downstream disabled)', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('the pilot is enabled and supplies banker-only gate values', () => {
    expect(BANKER_CREATE_PILOT_ENABLED).toBe(true);
    expect(bankerCreatePilotGateValues()).toEqual({ banker: true, adapter: true, intake: true });
    expect(BANKER_CREATE_PILOT.productionReferencesApproved).toBe(true);
  });

  it('with the pilot + authorized banker + ready resolver -> rollout is live_controlled', () => {
    const state = evaluateBankerCreateRollout({
      actorSystemUserId: 'sys-1',
      bankerAuthorized: true,
      resolverReady: true,
      productionReferencesApproved: BANKER_CREATE_PILOT.productionReferencesApproved,
      environmentIsProduction: BANKER_CREATE_PILOT.environmentIsProduction,
      productionRolloutApproved: BANKER_CREATE_PILOT.productionRolloutApproved,
      gateValues: bankerCreatePilotGateValues(),
    });
    expect(state).toBe('live_controlled');
  });

  it('without the pilot gate values, the rollout falls back to disabled (global constants false)', () => {
    const state = evaluateBankerCreateRollout({
      actorSystemUserId: 'sys-1',
      bankerAuthorized: true,
      resolverReady: true,
      productionReferencesApproved: true,
      environmentIsProduction: true,
      productionRolloutApproved: true,
      // no gateValues -> global constants (all false)
    });
    expect(state).toBe('disabled');
  });

  it('an unauthorized actor is never live even with the pilot on', () => {
    const state = evaluateBankerCreateRollout({
      actorSystemUserId: null,
      bankerAuthorized: false,
      resolverReady: true,
      productionReferencesApproved: true,
      environmentIsProduction: true,
      productionRolloutApproved: true,
      gateValues: bankerCreatePilotGateValues(),
    });
    expect(state).toBe('unauthorized');
  });
});
