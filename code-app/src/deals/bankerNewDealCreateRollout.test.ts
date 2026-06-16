import { describe, it, expect } from 'vitest';
import {
  evaluateBankerCreateRollout,
  isBankerNewDealCreateLive,
  type BankerCreateRolloutInput,
} from './bankerNewDealCreateRollout';

/**
 * Phase 181C -- controlled banker create rollout gate, fail-closed.
 */

// A fully-approved input that, with the hard gates overridden on, reaches
// live_controlled. Each test mutates one dimension to prove a fail-closed branch.
function approved(over: Partial<BankerCreateRolloutInput> = {}): BankerCreateRolloutInput {
  return {
    gatesOverride: { banker: true, adapter: true, intake: true },
    actorSystemUserId: 'sys-1',
    bankerAuthorized: true,
    productionReferencesApproved: true,
    resolverReady: true,
    environmentIsProduction: false,
    ...over,
  };
}

describe('Phase 181C -- default is disabled (hard constants false)', () => {
  it('no input -> disabled', () => {
    expect(evaluateBankerCreateRollout()).toBe('disabled');
    expect(isBankerNewDealCreateLive()).toBe(false);
  });
  it('approved inputs WITHOUT the gate override stay disabled (committed constants false)', () => {
    const { gatesOverride: _omit, ...withoutGates } = approved();
    expect(evaluateBankerCreateRollout(withoutGates)).toBe('disabled');
  });
  it('any single hard gate off -> disabled', () => {
    expect(evaluateBankerCreateRollout(approved({ gatesOverride: { banker: false, adapter: true, intake: true } }))).toBe('disabled');
    expect(evaluateBankerCreateRollout(approved({ gatesOverride: { banker: true, adapter: false, intake: true } }))).toBe('disabled');
    expect(evaluateBankerCreateRollout(approved({ gatesOverride: { banker: true, adapter: true, intake: false } }))).toBe('disabled');
  });
});

describe('Phase 181C -- authorization + references + resolver gates', () => {
  it('no actor systemuser -> unauthorized', () => {
    expect(evaluateBankerCreateRollout(approved({ actorSystemUserId: null }))).toBe('unauthorized');
  });
  it('not banker-authorized -> unauthorized (manager/team/portfolio-only cannot create)', () => {
    expect(evaluateBankerCreateRollout(approved({ bankerAuthorized: false }))).toBe('unauthorized');
  });
  it('production without explicit rollout approval -> environment_not_allowed', () => {
    expect(
      evaluateBankerCreateRollout(approved({ environmentIsProduction: true, productionRolloutApproved: false })),
    ).toBe('environment_not_allowed');
  });
  it('references not approved -> references_not_approved', () => {
    expect(evaluateBankerCreateRollout(approved({ productionReferencesApproved: false }))).toBe(
      'references_not_approved',
    );
  });
  it('resolver not ready -> resolver_not_ready', () => {
    expect(evaluateBankerCreateRollout(approved({ resolverReady: false }))).toBe('resolver_not_ready');
  });
});

describe('Phase 181C -- live only when every gate passes', () => {
  it('non-prod with all gates + approved refs + ready resolver -> live_controlled', () => {
    expect(evaluateBankerCreateRollout(approved())).toBe('live_controlled');
    expect(isBankerNewDealCreateLive(approved())).toBe(true);
  });
  it('production with explicit rollout approval + approved refs + ready -> live_controlled', () => {
    expect(
      evaluateBankerCreateRollout(
        approved({ environmentIsProduction: true, productionRolloutApproved: true }),
      ),
    ).toBe('live_controlled');
  });
});
