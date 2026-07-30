import { describe, expect, it } from 'vitest';
import {
  evaluateBankCreditGovernance,
  type BankCreditGovernancePolicy,
  type GovernanceActor,
  type GovernanceEvaluationRequest,
} from './bankCreditGovernanceEngine';

const facts = {
  amount: 500_000,
  totalRelationshipExposure: 750_000,
  product: 'CRE',
  collateral: ['owner occupied real estate'],
  riskRating: '5',
  hasPolicyException: false,
  insiderStatus: false,
  concentration: [],
  industry: 'manufacturing',
  geography: 'Georgia',
  governmentGuaranteedProgram: undefined,
  criticizedClassifiedStatus: undefined,
} as const;

const officer: GovernanceActor = {
  actorId: 'officer-1',
  roles: ['authorized-officer', 'lender', 'underwriter'],
  committeeMemberships: [],
  authorityGrants: [{
    grantId: 'grant-1',
    actions: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'APPROVE_EXCEPTION', 'COMMIT', 'CLOSE', 'AUTHORIZE_FUNDING', 'CONFIRM_DISBURSEMENT', 'BOARD', 'SERVICE', 'MODIFY', 'RENEW'],
    maximumAmount: 1_000_000,
    maximumRelationshipExposure: 2_000_000,
    effectiveFrom: '2026-01-01T00:00:00Z',
  }],
};

function policy(rules: BankCreditGovernancePolicy['rules']): BankCreditGovernancePolicy {
  return {
    policyId: 'bank-policy',
    version: 7,
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01T00:00:00Z',
    rules,
  };
}

function request(
  over: Partial<GovernanceEvaluationRequest> = {},
): GovernanceEvaluationRequest {
  return {
    evaluationId: 'eval-1',
    evaluatedAt: '2026-07-30T12:00:00Z',
    action: 'APPROVE',
    policy: policy([{
      ruleId: 'base-approval',
      description: 'Authorized officers may approve within delegated authority.',
      actions: ['APPROVE'],
      requirements: {
        actorRoles: ['authorized-officer'],
        delegatedAuthorityRequired: true,
      },
      nonOverrideable: true,
    }]),
    facts,
    actor: officer,
    actionHistory: [],
    approvals: [],
    ...over,
  };
}

describe('evaluateBankCreditGovernance', () => {
  it('permits a single officer to combine all duties when the active policy permits it', () => {
    const result = evaluateBankCreditGovernance(request({
      actionHistory: [
        { action: 'ORIGINATE', actorId: 'officer-1', occurredAt: '2026-07-01', evidenceId: 'a1' },
        { action: 'UNDERWRITE', actorId: 'officer-1', occurredAt: '2026-07-20', evidenceId: 'a2' },
      ],
    }));
    expect(result).toMatchObject({
      decision: 'PERMIT',
      policyId: 'bank-policy',
      policyVersion: 7,
      matchedRuleIds: ['base-approval'],
      findings: [],
    });
  });

  it('supports a combined lender/underwriter model with independent approval', () => {
    const independentPolicy = policy([{
      ruleId: 'independent-approval',
      description: 'Approval is independent from origination and underwriting.',
      actions: ['APPROVE'],
      requirements: {
        actorRoles: ['authorized-officer'],
        delegatedAuthorityRequired: true,
        independentFrom: ['ORIGINATE', 'UNDERWRITE'],
      },
      nonOverrideable: true,
    }]);
    const history = [
      { action: 'ORIGINATE' as const, actorId: 'lender-uw', occurredAt: '2026-07-01', evidenceId: 'a1' },
      { action: 'UNDERWRITE' as const, actorId: 'lender-uw', occurredAt: '2026-07-20', evidenceId: 'a2' },
    ];
    expect(evaluateBankCreditGovernance(request({ policy: independentPolicy, actionHistory: history })).decision)
      .toBe('PERMIT');
    expect(
      evaluateBankCreditGovernance(request({
        policy: independentPolicy,
        actor: { ...officer, actorId: 'lender-uw' },
        actionHistory: history,
      })),
    ).toMatchObject({
      decision: 'BLOCK',
      findings: expect.arrayContaining([
        expect.objectContaining({ code: 'INDEPENDENCE_REQUIRED', nonOverrideable: true }),
      ]),
    });
  });

  it('supports a traditional separated-duty model and fails closed when prior-actor evidence is absent', () => {
    const separatedPolicy = policy([{
      ruleId: 'funding-separation',
      description: 'Funding is independent of origination, underwriting, approval, and closing.',
      actions: ['AUTHORIZE_FUNDING'],
      requirements: {
        actorRoles: ['funding-officer'],
        independentFrom: ['ORIGINATE', 'UNDERWRITE', 'APPROVE', 'CLOSE'],
      },
      nonOverrideable: true,
    }]);
    const result = evaluateBankCreditGovernance(request({
      action: 'AUTHORIZE_FUNDING',
      policy: separatedPolicy,
      actor: { ...officer, roles: ['funding-officer'] },
    }));
    expect(result.decision).toBe('BLOCK');
    expect(result.findings.filter((item) => item.code === 'INDEPENDENCE_EVIDENCE_MISSING')).toHaveLength(4);
  });

  it('supports committee voting with role eligibility, distinct actors, and unanimity', () => {
    const committeePolicy = policy([{
      ruleId: 'committee-approval',
      description: 'Large relationships require three unanimous senior committee votes.',
      actions: ['APPROVE'],
      when: { minimumRelationshipExposure: 5_000_000 },
      requirements: {
        actorRoles: ['credit-administrator'],
        approvalGroups: [{
          groupId: 'senior-credit',
          approvalsRequired: 3,
          eligibleRoles: ['senior-credit-voter'],
          committeeId: 'senior-committee',
          distinctActors: true,
          unanimous: true,
        }],
      },
      nonOverrideable: true,
    }]);
    const committeeRequest = request({
      policy: committeePolicy,
      facts: { ...facts, totalRelationshipExposure: 8_000_000 },
      actor: { ...officer, roles: ['credit-administrator'] },
      approvals: ['v1', 'v2', 'v3'].map((actorId, index) => ({
        approvalId: `vote-${index}`,
        groupId: 'senior-credit',
        actorId,
        actorRoles: ['senior-credit-voter'],
        committeeId: 'senior-committee',
        decision: 'APPROVE' as const,
        occurredAt: '2026-07-30T11:00:00Z',
      })),
    });
    expect(evaluateBankCreditGovernance(committeeRequest).decision).toBe('PERMIT');
    const withDecline = {
      ...committeeRequest,
      approvals: committeeRequest.approvals.map((vote, index) =>
        index === 2 ? { ...vote, decision: 'DECLINE' as const } : vote),
    };
    expect(evaluateBankCreditGovernance(withDecline)).toMatchObject({
      decision: 'BLOCK',
      findings: [expect.objectContaining({ code: 'COMMITTEE_ACTION_REQUIRED' })],
    });
  });

  it('composes hybrid exception and insider controls restrictively', () => {
    const hybridPolicy = policy([
      {
        ruleId: 'base',
        description: 'Base approval authority.',
        actions: ['APPROVE'],
        requirements: { actorRoles: ['authorized-officer'], delegatedAuthorityRequired: true },
        nonOverrideable: false,
      },
      {
        ruleId: 'exception',
        description: 'Exceptions escalate.',
        actions: ['APPROVE'],
        when: { hasPolicyException: true },
        requirements: { mandatoryEscalation: 'Policy exception requires escalation.' },
        nonOverrideable: false,
      },
      {
        ruleId: 'insider',
        description: 'Insider loans require board approval.',
        actions: ['APPROVE'],
        when: { insiderStatus: true },
        requirements: {
          approvalGroups: [{
            groupId: 'board',
            approvalsRequired: 2,
            committeeId: 'board-credit',
            distinctActors: true,
          }],
        },
        nonOverrideable: true,
      },
    ]);
    const result = evaluateBankCreditGovernance(request({
      policy: hybridPolicy,
      facts: { ...facts, hasPolicyException: true, insiderStatus: true },
    }));
    expect(result.matchedRuleIds).toEqual(['base', 'exception', 'insider']);
    expect(result.decision).toBe('BLOCK');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MANDATORY_ESCALATION', ruleId: 'exception' }),
      expect.objectContaining({ code: 'COMMITTEE_ACTION_REQUIRED', ruleId: 'insider', nonOverrideable: true }),
    ]));
  });

  it.each([
    ['missing policy', { policy: undefined }, 'POLICY_MISSING'],
    ['inactive policy', { policy: { ...policy(request().policy!.rules), status: 'DRAFT' as const } }, 'POLICY_NOT_ACTIVE'],
    ['no matching rule', { action: 'BOARD' as const }, 'NO_MATCHING_RULE'],
    ['missing actor', { actor: undefined }, 'ACTOR_MISSING'],
  ])('fails closed for %s', (_label, over, code) => {
    expect(evaluateBankCreditGovernance(request(over))).toMatchObject({
      decision: 'BLOCK',
      findings: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });

  it('rejects malformed policy rather than interpreting unsafe approval counts', () => {
    const malformed = policy([{
      ruleId: 'bad-committee',
      description: 'Invalid persisted configuration.',
      actions: ['APPROVE'],
      requirements: {
        approvalGroups: [{
          groupId: 'committee',
          approvalsRequired: 0,
          distinctActors: true,
        }],
      },
      nonOverrideable: true,
    }]);
    expect(evaluateBankCreditGovernance(request({ policy: malformed }))).toMatchObject({
      decision: 'BLOCK',
      matchedRuleIds: [],
      findings: [expect.objectContaining({ code: 'POLICY_INVALID' })],
    });
  });

  it('proves delegated authority scope and blocks excess amount or relationship exposure', () => {
    const result = evaluateBankCreditGovernance(request({
      facts: { ...facts, amount: 1_000_001, totalRelationshipExposure: 2_000_001 },
    }));
    expect(result).toMatchObject({
      decision: 'BLOCK',
      findings: [expect.objectContaining({ code: 'DELEGATED_AUTHORITY_EXCEEDED' })],
    });
  });

  it('returns ESCALATE only when escalation is the sole unmet policy result', () => {
    const escalationPolicy = policy([{
      ruleId: 'classified',
      description: 'Classified assets escalate.',
      actions: ['APPROVE'],
      when: { criticizedClassifiedStatuses: ['classified'] },
      requirements: { mandatoryEscalation: 'Classified credit requires senior review.' },
      nonOverrideable: true,
    }]);
    expect(evaluateBankCreditGovernance(request({
      policy: escalationPolicy,
      facts: { ...facts, criticizedClassifiedStatus: 'classified' },
    }))).toMatchObject({
      decision: 'ESCALATE',
      findings: [expect.objectContaining({ code: 'MANDATORY_ESCALATION', nonOverrideable: true })],
    });
  });
});
