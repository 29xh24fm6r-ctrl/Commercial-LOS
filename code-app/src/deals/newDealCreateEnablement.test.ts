import { describe, it, expect } from 'vitest';
import {
  evaluateNewDealCreateEnablement,
  isNewDealCreateControlledEnabled,
  type NewDealCreateEnablementInput,
} from './newDealCreateEnablement';

/**
 * Phase 170O -- controlled, fail-closed enablement reader.
 */

// A fully-approved NON-PROD input that reaches `enabled_nonprod_only`. Tests
// mutate one dimension at a time to prove each fail-closed branch.
function approvedNonProd(over: Partial<NewDealCreateEnablementInput> = {}): NewDealCreateEnablementInput {
  return {
    config: {
      adapterEnabled: true,
      auditWired: true,
      allowedNonProdEnvironments: ['pilot'],
    },
    environment: { name: 'pilot', isProduction: false },
    authorization: { isAdminOrDev: true, actorSystemUserId: 'sys-1' },
    resolverReady: true,
    referencesProductionApproved: false,
    ...over,
  };
}

describe('Phase 170O -- default + malformed + unknown env fail closed', () => {
  it('default (no inputs) is disabled', () => {
    expect(evaluateNewDealCreateEnablement()).toBe('disabled');
    expect(evaluateNewDealCreateEnablement({})).toBe('disabled');
    expect(isNewDealCreateControlledEnabled()).toBe(false);
  });

  it('absent config is disabled (not config_invalid)', () => {
    expect(
      evaluateNewDealCreateEnablement({ environment: { name: 'pilot' } }),
    ).toBe('disabled');
  });

  it('malformed config fails closed to config_invalid', () => {
    for (const bad of [
      { config: { adapterEnabled: 'yes' } as unknown },
      { config: { auditWired: 1 } as unknown },
      { config: { allowedNonProdEnvironments: 'pilot' } as unknown },
      { config: 'nope' as unknown },
      { config: 42 as unknown },
    ]) {
      expect(evaluateNewDealCreateEnablement(bad as NewDealCreateEnablementInput)).toBe('config_invalid');
    }
  });

  it('unknown / empty environment is environment_not_allowed', () => {
    expect(evaluateNewDealCreateEnablement(approvedNonProd({ environment: { name: '' } }))).toBe(
      'environment_not_allowed',
    );
    expect(evaluateNewDealCreateEnablement(approvedNonProd({ environment: undefined }))).toBe(
      'environment_not_allowed',
    );
    // An env not in the approved list also fails closed.
    expect(
      evaluateNewDealCreateEnablement(approvedNonProd({ environment: { name: 'staging' } })),
    ).toBe('environment_not_allowed');
  });
});

describe('Phase 170O -- authorization + resolver gates', () => {
  it('non-admin cannot enable (unauthorized)', () => {
    expect(
      evaluateNewDealCreateEnablement(
        approvedNonProd({ authorization: { isAdminOrDev: false, actorSystemUserId: 'sys-1' } }),
      ),
    ).toBe('unauthorized');
  });

  it('admin without a resolved actor systemuser is unauthorized', () => {
    expect(
      evaluateNewDealCreateEnablement(
        approvedNonProd({ authorization: { isAdminOrDev: true, actorSystemUserId: null } }),
      ),
    ).toBe('unauthorized');
  });

  it('resolver not ready blocks even when otherwise approved', () => {
    expect(evaluateNewDealCreateEnablement(approvedNonProd({ resolverReady: false }))).toBe(
      'resolver_not_ready',
    );
  });
});

describe('Phase 170O -- production is a separate, higher bar', () => {
  it('production disables by default (no rollout approval)', () => {
    const prod = approvedNonProd({
      environment: { name: 'production', isProduction: true },
    });
    expect(evaluateNewDealCreateEnablement(prod)).toBe('environment_not_allowed');
  });

  it('production stays blocked when references are not production-approved (TEST rows)', () => {
    const prod = approvedNonProd({
      config: {
        adapterEnabled: true,
        auditWired: true,
        productionRolloutApproved: true,
        productionReferencesApproved: true,
        allowedNonProdEnvironments: ['pilot'],
      },
      environment: { name: 'production', isProduction: true },
      referencesProductionApproved: false, // TEST-only references
    });
    expect(evaluateNewDealCreateEnablement(prod)).toBe('environment_not_allowed');
  });

  it('production enables ONLY with explicit rollout + production-approved references (test-pinned)', () => {
    const prod = approvedNonProd({
      config: {
        adapterEnabled: true,
        auditWired: true,
        productionRolloutApproved: true,
        productionReferencesApproved: true,
        allowedNonProdEnvironments: ['pilot'],
      },
      environment: { name: 'production', isProduction: true },
      referencesProductionApproved: true,
    });
    expect(evaluateNewDealCreateEnablement(prod)).toBe('enabled_nonprod_only');
  });
});

describe('Phase 170O -- controlled enablement (non-prod pilot)', () => {
  it('reaches enabled_nonprod_only only when every gate passes', () => {
    expect(evaluateNewDealCreateEnablement(approvedNonProd())).toBe('enabled_nonprod_only');
    expect(isNewDealCreateControlledEnabled(approvedNonProd())).toBe(true);
  });
});
