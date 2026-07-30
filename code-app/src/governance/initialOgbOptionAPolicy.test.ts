import { describe, expect, it } from 'vitest';
import { evaluateBankCreditGovernance, GOVERNED_CREDIT_ACTIONS } from './bankCreditGovernanceEngine';
import { INITIAL_OGB_OPTION_A_POLICY } from './initialOgbOptionAPolicy';

const grant = {
  grantId: 'matthew-option-a',
  actions: GOVERNED_CREDIT_ACTIONS.filter((action) =>
    !['APPROVE_EXCEPTION', 'MODIFY', 'RENEW'].includes(action)),
  maximumAmount: 1_000_000,
  maximumRelationshipExposure: 1_000_000,
  maximumUnsecuredAmount: 0,
  products: ['SECURED_C_AND_I'],
  riskRatings: ['PASS'],
  exceptionTypes: [],
  insiderPermitted: false,
  criticizedClassifiedStatuses: [],
  effectiveFrom: '2026-07-30T00:00:00.000Z',
} as const;

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateBankCreditGovernance({
    evaluationId: 'option-a-certification',
    evaluatedAt: '2026-07-30T12:00:00.000Z',
    action: 'APPROVE',
    policy: INITIAL_OGB_OPTION_A_POLICY,
    facts: {
      amount: 500_000,
      totalRelationshipExposure: 500_000,
      unsecuredExposure: 0,
      product: 'SECURED_C_AND_I',
      collateral: ['ELIGIBLE_COLLATERAL'],
      riskRating: 'PASS',
      hasPolicyException: false,
      insiderStatus: false,
      concentration: [],
      industry: 'COMMERCIAL',
      geography: 'US',
      governmentGuaranteedProgram: undefined,
      criticizedClassifiedStatus: undefined,
    },
    actor: {
      actorId: 'matthew',
      roles: ['OGB_AUTHORIZED_OFFICER'],
      committeeMemberships: [],
      authorityGrants: [grant],
    },
    actionHistory: [
      { action: 'ORIGINATE', actorId: 'matthew', occurredAt: '2026-07-30T10:00:00Z', evidenceId: 'origin' },
      { action: 'UNDERWRITE', actorId: 'matthew', occurredAt: '2026-07-30T11:00:00Z', evidenceId: 'underwrite' },
    ],
    approvals: [],
    ...overrides,
  });
}

describe('INITIAL_OGB_OPTION_A_POLICY', () => {
  it('honestly permits the same authorized officer without claiming independence', () => {
    expect(evaluate()).toMatchObject({ decision: 'PERMIT', findings: [] });
    expect(INITIAL_OGB_OPTION_A_POLICY.rules[0]?.requirements.independentFrom).toBeUndefined();
  });

  it('blocks amount, relationship, unsecured, exception, insider, classified, and excluded actions', () => {
    const baseFacts = evaluate().factSnapshot;
    for (const facts of [
      { ...baseFacts, amount: 1_000_001 },
      { ...baseFacts, totalRelationshipExposure: 1_000_001 },
      { ...baseFacts, unsecuredExposure: 1 },
      { ...baseFacts, hasPolicyException: true, policyExceptionTypes: ['COLLATERAL'] },
      { ...baseFacts, insiderStatus: true },
      { ...baseFacts, criticizedClassifiedStatus: 'SUBSTANDARD' },
      { ...baseFacts, product: 'UNSECURED' },
      { ...baseFacts, riskRating: 'CLASSIFIED' },
    ]) expect(evaluate({ facts }).decision).toBe('BLOCK');
    for (const action of ['APPROVE_EXCEPTION', 'MODIFY', 'RENEW'] as const) {
      expect(evaluate({ action }).decision).toBe('BLOCK');
    }
  });
});
