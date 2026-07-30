import { describe, expect, it } from 'vitest';
import {
  evaluateBankCreditGovernance,
  policyConditionMatches,
  type BankCreditGovernancePolicy,
  type CreditCaseFacts,
  type GovernanceEvaluationRequest,
} from './bankCreditGovernanceEngine';

const NOW = '2026-07-30T12:00:00Z';
const facts: CreditCaseFacts = {
  amount: 500_000,
  totalRelationshipExposure: 900_000,
  product: 'SBA 7(a)',
  collateral: ['real estate', 'equipment'],
  riskRating: '6',
  hasPolicyException: true,
  insiderStatus: true,
  concentration: ['hospitality'],
  industry: 'hotel',
  geography: 'Georgia',
  governmentGuaranteedProgram: 'SBA 7(a)',
  criticizedClassifiedStatus: 'criticized',
};

function policy(rules: BankCreditGovernancePolicy['rules']): BankCreditGovernancePolicy {
  return {
    policyId: 'property-policy',
    version: 1,
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01T00:00:00Z',
    rules,
  };
}

const permissiveRule = {
  ruleId: 'base',
  description: 'Base rule',
  actions: ['APPROVE' as const],
  requirements: { actorRoles: ['officer'], delegatedAuthorityRequired: true },
  nonOverrideable: true,
};

function request(over: Partial<GovernanceEvaluationRequest> = {}): GovernanceEvaluationRequest {
  return {
    evaluationId: 'invariant-evaluation',
    evaluatedAt: NOW,
    action: 'APPROVE',
    policy: policy([permissiveRule]),
    facts,
    actor: {
      actorId: 'actor-1',
      roles: ['officer'],
      committeeMemberships: [],
      authorityGrants: [{
        grantId: 'grant-1',
        actions: ['APPROVE'],
        maximumAmount: 1_000_000,
        maximumRelationshipExposure: 2_000_000,
        effectiveFrom: '2026-01-01T00:00:00Z',
      }],
    },
    actionHistory: [],
    approvals: [],
    ...over,
  };
}

describe('bank credit governance property and invariant coverage', () => {
  it('matches every supported policy dimension and rejects a mismatch in each independently', () => {
    const condition = {
      minimumAmount: 100_000,
      maximumAmount: 1_000_000,
      minimumRelationshipExposure: 500_000,
      maximumRelationshipExposure: 2_000_000,
      products: ['sba 7(A)'],
      anyCollateral: ['EQUIPMENT'],
      riskRatings: ['6'],
      hasPolicyException: true,
      insiderStatus: true,
      anyConcentration: ['Hospitality'],
      industries: ['HOTEL'],
      geographies: ['georgia'],
      governmentGuaranteedPrograms: ['SBA 7(a)'],
      criticizedClassifiedStatuses: ['criticized'],
    } as const;
    expect(policyConditionMatches(condition, facts)).toBe(true);
    const mismatches: CreditCaseFacts[] = [
      { ...facts, amount: 99_999 },
      { ...facts, amount: 1_000_001 },
      { ...facts, totalRelationshipExposure: 499_999 },
      { ...facts, totalRelationshipExposure: 2_000_001 },
      { ...facts, product: 'term' },
      { ...facts, collateral: ['cash'] },
      { ...facts, riskRating: '5' },
      { ...facts, hasPolicyException: false },
      { ...facts, insiderStatus: false },
      { ...facts, concentration: [] },
      { ...facts, industry: 'retail' },
      { ...facts, geography: 'Florida' },
      { ...facts, governmentGuaranteedProgram: undefined },
      { ...facts, criticizedClassifiedStatus: undefined },
    ];
    for (const mismatch of mismatches) expect(policyConditionMatches(condition, mismatch)).toBe(false);
  });

  it('never turns a block into a permit when an additional restrictive rule matches', () => {
    const blockingRules = [
      {
        ruleId: 'role',
        description: 'Different role',
        actions: ['APPROVE' as const],
        requirements: { actorRoles: ['board-member'] },
        nonOverrideable: true,
      },
      {
        ruleId: 'separation',
        description: 'Independent originator',
        actions: ['APPROVE' as const],
        requirements: { independentFrom: ['ORIGINATE' as const] },
        nonOverrideable: true,
      },
      {
        ruleId: 'committee',
        description: 'Committee',
        actions: ['APPROVE' as const],
        requirements: {
          approvalGroups: [{
            groupId: 'committee',
            approvalsRequired: 2,
            distinctActors: true,
          }],
        },
        nonOverrideable: true,
      },
    ];
    for (const addedRule of blockingRules) {
      const result = evaluateBankCreditGovernance(request({
        policy: policy([permissiveRule, addedRule]),
        actionHistory: addedRule.ruleId === 'separation'
          ? [{ action: 'ORIGINATE', actorId: 'actor-1', occurredAt: NOW, evidenceId: 'origin' }]
          : [],
      }));
      expect(result.decision).toBe('BLOCK');
      expect(result.matchedRuleIds).toContain(addedRule.ruleId);
    }
  });

  it('is invariant to policy-rule ordering for the decision and finding codes', () => {
    const extra = {
      ruleId: 'exception',
      description: 'Exception escalation',
      actions: ['APPROVE' as const],
      requirements: { mandatoryEscalation: 'Escalate exception.' },
      nonOverrideable: false,
    };
    const first = evaluateBankCreditGovernance(request({ policy: policy([permissiveRule, extra]) }));
    const second = evaluateBankCreditGovernance(request({ policy: policy([extra, permissiveRule]) }));
    expect(first.decision).toBe(second.decision);
    expect(first.findings.map((item) => item.code).sort()).toEqual(
      second.findings.map((item) => item.code).sort(),
    );
  });

  it('never satisfies a distinct-person approval group by duplicating one actor', () => {
    const committee = policy([{
      ruleId: 'two-person',
      description: 'Two people',
      actions: ['APPROVE'],
      requirements: {
        approvalGroups: [{ groupId: 'g1', approvalsRequired: 2, distinctActors: true }],
      },
      nonOverrideable: true,
    }]);
    const duplicateVotes = [1, 2, 3].map((index) => ({
      approvalId: `approval-${index}`,
      groupId: 'g1',
      actorId: 'same-person',
      actorRoles: [],
      decision: 'APPROVE' as const,
      occurredAt: NOW,
    }));
    expect(evaluateBankCreditGovernance(request({ policy: committee, approvals: duplicateVotes })).decision)
      .toBe('BLOCK');
  });

  it('treats effective interval boundaries as inclusive and fails closed outside them', () => {
    const bounded = {
      ...policy([permissiveRule]),
      effectiveFrom: '2026-07-01T00:00:00Z',
      effectiveThrough: '2026-07-31T23:59:59Z',
    };
    for (const evaluatedAt of [bounded.effectiveFrom, bounded.effectiveThrough]) {
      expect(evaluateBankCreditGovernance(request({ policy: bounded, evaluatedAt })).decision).toBe('PERMIT');
    }
    for (const evaluatedAt of ['2026-06-30T23:59:59Z', '2026-08-01T00:00:00Z', 'not-a-date']) {
      expect(evaluateBankCreditGovernance(request({ policy: bounded, evaluatedAt }))).toMatchObject({
        decision: 'BLOCK',
        findings: [expect.objectContaining({ code: 'POLICY_NOT_EFFECTIVE' })],
      });
    }
  });

  it('preserves non-overrideable attribution on every finding from that rule', () => {
    const result = evaluateBankCreditGovernance(request({
      policy: policy([{
        ruleId: 'regulatory',
        description: 'Regulatory prohibition',
        actions: ['APPROVE'],
        requirements: { prohibited: 'Action prohibited by regulation.' },
        nonOverrideable: true,
      }]),
    }));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'ACTION_PROHIBITED',
      ruleId: 'regulatory',
      nonOverrideable: true,
    });
  });
});
