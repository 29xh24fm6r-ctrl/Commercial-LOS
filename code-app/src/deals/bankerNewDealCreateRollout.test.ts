import { describe, it, expect } from 'vitest';
import {
  evaluateBankerCreateRollout,
  isBankerNewDealCreateLive,
  deriveNewDealCreateAvailability,
  describeBankerCreateRolloutState,
  type BankerCreateRolloutInput,
  type BankerCreateRolloutState,
} from './bankerNewDealCreateRollout';

/**
 * Phase 181C -- controlled banker create rollout gate, fail-closed.
 */

// A fully-approved input that, with the hard gates overridden on, reaches
// live_controlled. Each test mutates one dimension to prove a fail-closed branch.
function approved(over: Partial<BankerCreateRolloutInput> = {}): BankerCreateRolloutInput {
  return {
    gateValues: { banker: true, adapter: true, intake: true },
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
    const { gateValues: _omit, ...withoutGates } = approved();
    expect(evaluateBankerCreateRollout(withoutGates)).toBe('disabled');
  });
  it('any single hard gate off -> disabled', () => {
    expect(evaluateBankerCreateRollout(approved({ gateValues: { banker: false, adapter: true, intake: true } }))).toBe('disabled');
    expect(evaluateBankerCreateRollout(approved({ gateValues: { banker: true, adapter: false, intake: true } }))).toBe('disabled');
    expect(evaluateBankerCreateRollout(approved({ gateValues: { banker: true, adapter: true, intake: false } }))).toBe('disabled');
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

const NOW = '2026-07-16T12:00:00.000Z';

describe('Factory Arc Phase 6 -- deriveNewDealCreateAvailability', () => {
  it('live_controlled -> available, no blocking reasons', () => {
    const a = deriveNewDealCreateAvailability('live_controlled', NOW);
    expect(a).toEqual({ id: 'new-deal-create', available: true, blockingReasons: [], checkedAt: NOW });
  });

  it('unauthorized maps to the audit-identity reason kind (an identity-resolution fact)', () => {
    const a = deriveNewDealCreateAvailability('unauthorized', NOW);
    expect(a.available).toBe(false);
    expect(a.blockingReasons).toEqual([{ kind: 'audit-identity', detail: describeBankerCreateRolloutState('unauthorized') }]);
  });

  it('references_not_approved / resolver_not_ready map to the connection reason kind', () => {
    for (const state of ['references_not_approved', 'resolver_not_ready'] as const) {
      const a = deriveNewDealCreateAvailability(state, NOW);
      expect(a.blockingReasons[0]!.kind, state).toBe('connection');
      expect(a.blockingReasons[0]!.detail, state).toBe(describeBankerCreateRolloutState(state));
    }
  });

  it('environment_not_allowed / disabled map to the permission reason kind', () => {
    for (const state of ['environment_not_allowed', 'disabled'] as const) {
      const a = deriveNewDealCreateAvailability(state, NOW);
      expect(a.blockingReasons[0]!.kind, state).toBe('permission');
      expect(a.blockingReasons[0]!.detail, state).toBe(describeBankerCreateRolloutState(state));
    }
  });

  it('carries checkedAt verbatim', () => {
    const a = deriveNewDealCreateAvailability('disabled', '2020-01-01T00:00:00.000Z');
    expect(a.checkedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('every non-live state produces exactly one blocking reason with real plain-language detail', () => {
    const states: BankerCreateRolloutState[] = [
      'disabled', 'unauthorized', 'resolver_not_ready', 'references_not_approved', 'environment_not_allowed',
    ];
    for (const s of states) {
      const a = deriveNewDealCreateAvailability(s, NOW);
      expect(a.blockingReasons, s).toHaveLength(1);
      expect(a.blockingReasons[0]!.detail.length, s).toBeGreaterThan(0);
    }
  });
});

