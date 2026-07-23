import { describe, it, expect } from 'vitest';
import {
  NEW_DEAL_BANKER_PILOT_LIVE,
  NEW_DEAL_BANKER_PILOT_ROLLOUT_STATE,
  NEW_DEAL_BANKER_PILOT_TRUTH,
  NEW_DEAL_BANKER_PILOT_BLOCKER,
} from './adminNewDealCreateCapabilityTruth';
import { evaluateBankerCreateRollout } from '../deals/bankerNewDealCreateRollout';
import {
  BANKER_CREATE_PILOT,
  BANKER_CREATE_PILOT_ENABLED,
  bankerCreatePilotGateValues,
} from '../deals/bankerCreatePilotConfig';

describe('adminNewDealCreateCapabilityTruth — banker pilot vs public/global', () => {
  it('computes the pilot rollout state from evaluateBankerCreateRollout with the pilot config\'s own values (never a hand-copied duplicate)', () => {
    const expected = evaluateBankerCreateRollout({
      actorSystemUserId: 'any-resolved-actor',
      bankerAuthorized: true,
      resolverReady: true,
      productionReferencesApproved: BANKER_CREATE_PILOT.productionReferencesApproved,
      environmentIsProduction: BANKER_CREATE_PILOT.environmentIsProduction,
      productionRolloutApproved: BANKER_CREATE_PILOT.productionRolloutApproved,
      gateValues: bankerCreatePilotGateValues(),
    });
    expect(NEW_DEAL_BANKER_PILOT_ROLLOUT_STATE).toBe(expected);
  });

  it('reports the pilot as Live today (matching the committed BANKER_CREATE_PILOT_ENABLED = true production config)', () => {
    // This pins the CURRENT committed config's outcome — not a hardcoded
    // assumption. If BANKER_CREATE_PILOT_ENABLED or the pilot's approvals
    // ever flip, this test (and the panel) must be updated to match, not
    // silently pass on stale reasoning.
    expect(BANKER_CREATE_PILOT_ENABLED).toBe(true);
    expect(NEW_DEAL_BANKER_PILOT_ROLLOUT_STATE).toBe('live_controlled');
    expect(NEW_DEAL_BANKER_PILOT_LIVE).toBe(true);
    expect(NEW_DEAL_BANKER_PILOT_BLOCKER).toBeNull();
  });

  it('never reports "Not wired" as the banker pilot\'s own status', () => {
    for (const item of NEW_DEAL_BANKER_PILOT_TRUTH) {
      expect(item.value).not.toMatch(/not wired/i);
    }
  });

  it('the pilot create row reads Live and done:true when the pilot is live', () => {
    const pilotCreateRow = NEW_DEAL_BANKER_PILOT_TRUTH.find((i) =>
      i.label.startsWith('Banker pilot create'),
    );
    expect(pilotCreateRow).toBeDefined();
    expect(pilotCreateRow?.value).toBe('Live');
    expect(pilotCreateRow?.done).toBe(true);
  });
});
