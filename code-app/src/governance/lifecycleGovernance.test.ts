import { describe, expect, it, vi } from 'vitest';
import {
  CREDIT_LIFECYCLE_ACTION,
  createLifecycleGovernanceCoordinator,
  executeGovernedLifecycleMutation,
  previewLifecyclePolicy,
  validateLifecycleActionCoverage,
  type CreditLifecyclePoint,
  type LifecycleGovernanceContext,
} from './lifecycleGovernance';
import type { BankCreditGovernanceServer } from './bankCreditGovernancePorts';
import type { ServerGovernanceEvaluationResponse } from './bankCreditGovernancePorts';

const points = Object.keys(CREDIT_LIFECYCLE_ACTION) as CreditLifecyclePoint[];
const context: LifecycleGovernanceContext = {
  bankId: 'bank-1',
  caseId: 'deal-1',
  actorSystemUserId: 'user-1',
  requestedAt: '2026-07-30T12:00:00.000Z',
  operationCorrelationId: 'operation-1',
};
const legacyPermit = { allowed: true as const, evidenceIds: ['legacy-1'] };

function evaluated(
  decision: 'PERMIT' | 'BLOCK',
): Extract<ServerGovernanceEvaluationResponse, { kind: 'evaluated' }> {
  return {
    contractVersion: 'bank-credit-governance/v2',
    kind: 'evaluated',
    evaluationRecordId: 'evaluation-1',
    result: {
      evaluationId: 'evaluation-1',
      decision,
      policyId: 'policy-1',
      policyVersion: 2,
      evaluatedAt: context.requestedAt,
      action: 'APPROVE',
      matchedRuleIds: ['rule-1'],
      findings: decision === 'BLOCK' ? [{
        code: 'ROLE_NOT_PERMITTED',
        ruleId: 'rule-1',
        message: 'Actor role is not permitted.',
        nonOverrideable: true,
        evidenceIds: [],
      }] : [],
      factSnapshot: {
        amount: 1,
        totalRelationshipExposure: 1,
        product: 'test',
        collateral: [],
        riskRating: 'test',
        hasPolicyException: false,
        insiderStatus: false,
        concentration: [],
        industry: 'test',
        geography: 'test',
        governmentGuaranteedProgram: undefined,
        criticizedClassifiedStatus: undefined,
      },
    },
  };
}

describe('lifecycle governance action coverage', () => {
  it('maps each required lifecycle point to exactly one governed action', () => {
    expect(points).toEqual([
      'origination',
      'underwriting',
      'recommendation',
      'approval',
      'exception-approval',
      'commitment',
      'closing',
      'funding-authorization',
      'disbursement-confirmation',
      'boarding',
      'servicing',
      'modification',
      'renewal',
    ]);
    expect(validateLifecycleActionCoverage()).toEqual([]);
  });

  it.each(points)('sends %s through the same v2 server contract', async (point) => {
    const evaluate = vi.fn(async () => evaluated('PERMIT'));
    const coordinator = createLifecycleGovernanceCoordinator({
      mode: 'ENFORCE',
      server: { evaluate },
    });
    const result = await coordinator.evaluate(point, context, legacyPermit);
    expect(result.allowed).toBe(true);
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: 'bank-credit-governance/v2',
      action: CREDIT_LIFECYCLE_ACTION[point],
      operationCorrelationId: context.operationCorrelationId,
    }));
  });
});

describe('lifecycle governance modes', () => {
  it('keeps legacy controls binding in every mode without calling configurable policy', async () => {
    const evaluate = vi.fn(async () => evaluated('PERMIT'));
    const legacyBlock = {
      allowed: false as const,
      reasonCode: 'LEGACY_CONTROL',
      safeMessage: 'Existing control blocked.',
      evidenceIds: ['legacy-block'],
    };
    for (const mode of ['LEGACY_ONLY', 'SHADOW', 'ENFORCE'] as const) {
      const result = await createLifecycleGovernanceCoordinator({
        mode,
        server: { evaluate },
      }).evaluate('approval', context, legacyBlock);
      expect(result).toMatchObject({ allowed: false, reasonCode: 'LEGACY_CONTROL' });
    }
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('records shadow disagreement while preserving the legacy outcome', async () => {
    const coordinator = createLifecycleGovernanceCoordinator({
      mode: 'SHADOW',
      server: { evaluate: async () => evaluated('BLOCK') },
    });
    const result = await coordinator.evaluate('approval', context, legacyPermit);
    expect(result).toMatchObject({
      allowed: true,
      authoritativeBasis: 'LEGACY',
      trace: { decisionsMatch: false, configurableAvailable: true },
    });
  });

  it('fails closed in enforce mode when the server is missing, throws, blocks, or lacks durable evidence', async () => {
    const servers: readonly (BankCreditGovernanceServer | undefined)[] = [
      undefined,
      { evaluate: async () => { throw new Error('network'); } },
      { evaluate: async () => evaluated('BLOCK') },
      {
        evaluate: async () => ({
          ...evaluated('PERMIT'),
          evaluationRecordId: '',
        }),
      },
    ];
    for (const server of servers) {
      const result = await createLifecycleGovernanceCoordinator({ mode: 'ENFORCE', server })
        .evaluate('approval', context, legacyPermit);
      expect(result.allowed).toBe(false);
    }
  });

  it('never calls a mutation after either governance layer blocks', async () => {
    const mutate = vi.fn(async () => 'written');
    const outcome = await executeGovernedLifecycleMutation({
      coordinator: createLifecycleGovernanceCoordinator({
        mode: 'ENFORCE',
        server: { evaluate: async () => evaluated('BLOCK') },
      }),
      lifecyclePoint: 'funding-authorization',
      context,
      legacyDecision: legacyPermit,
      mutate,
    });
    expect(outcome.kind).toBe('governance-blocked');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('marks the client evaluation non-authoritative while using the same policy semantics', () => {
    const preview = previewLifecyclePolicy('approval', {
      evaluationId: 'preview-1',
      evaluatedAt: context.requestedAt,
      policy: undefined,
      facts: evaluated('PERMIT').result.factSnapshot,
      actor: undefined,
      actionHistory: [],
      approvals: [],
    });
    expect(preview).toMatchObject({
      authoritative: false,
      action: 'APPROVE',
      evaluation: { decision: 'BLOCK', findings: [{ code: 'POLICY_MISSING' }] },
    });
  });
});
