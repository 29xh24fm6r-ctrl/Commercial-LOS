import { describe, expect, it, vi } from 'vitest';
import { submitCreditApprovalDecision } from '../creditApproval/submitCreditApprovalDecision';
import { orchestrateDealOrigination } from '../deals/dealOriginationOrchestrator';
import { createLifecycleGovernanceCoordinator } from './lifecycleGovernance';
import type { LifecycleGovernanceInvocation } from './lifecycleGovernanceIntegration';

const invocation: LifecycleGovernanceInvocation = {
  coordinator: createLifecycleGovernanceCoordinator({
    mode: 'ENFORCE',
    server: {
      evaluate: async (command) => ({
        contractVersion: 'bank-credit-governance/v2',
        kind: 'evaluated',
        evaluationRecordId: 'evaluation-1',
        result: {
          evaluationId: command.evaluationId,
          decision: 'BLOCK',
          policyId: 'policy-1',
          policyVersion: 2,
          evaluatedAt: command.requestedAt,
          action: command.action,
          matchedRuleIds: ['blocked'],
          findings: [{
            code: 'ACTION_PROHIBITED',
            ruleId: 'blocked',
            message: 'Configured policy prohibits this action.',
            nonOverrideable: true,
            evidenceIds: [],
          }],
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
      }),
    },
  }),
  context: {
    bankId: 'bank-1',
    caseId: 'deal-1',
    actorSystemUserId: 'user-1',
    requestedAt: '2026-07-30T12:00:00.000Z',
    operationCorrelationId: 'operation-1',
  },
};

describe('runtime lifecycle governance wiring', () => {
  it('blocks origination before the governed create is called in enforce mode', async () => {
    const runGovernedCreate = vi.fn(async () => ({
      kind: 'success' as const,
      dealId: 'deal-1',
      correlationId: 'create-1',
    }));
    const result = await orchestrateDealOrigination({
      form: {
        dealName: 'Test deal',
        assignedBankerId: 'banker-1',
        actorSystemUserId: 'user-1',
        amount: 1,
      },
      context: { requireCrmClient: false },
    }, {
      runGovernedCreate,
      lifecycleGovernance: invocation,
    });
    expect(result).toMatchObject({
      kind: 'unauthorized',
      userFacingMessage: 'Configured policy prohibits this action.',
    });
    expect(runGovernedCreate).not.toHaveBeenCalled();
  });

  it('blocks credit approval before the decision store is called in enforce mode', async () => {
    const createDecisionRecord = vi.fn(async () => ({ success: true, id: 'decision-1' }));
    const result = await submitCreditApprovalDecision({
      dealId: 'deal-1',
      decisionStatus: 'APPROVED',
      approvedAmount: 1,
      approvedProduct: 'test',
      approvedTermMonths: 12,
      approvedPricing: 'test',
      collateralSummary: 'test',
      conditions: [],
      rationale: 'test',
      requestedByActorEmail: 'requester@example.test',
      actorEmail: 'approver@example.test',
      systemUserId: 'user-1',
      actorResolved: true,
      banker: {
        approvalLimit: 100,
        creditCommitteeMember: true,
        approvalOverrideAuthority: false,
      },
      dealAmount: 1,
      requestProfileAmount: 1,
      advancingActorBankerId: 'approver-1',
      originatingBankerId: 'originator-1',
    }, {
      createDecisionRecord,
      listDecisionsForDeal: async () => ({ success: true, decisions: [] }),
    }, async () => ({
      ok: true,
      actorEmail: 'approver@example.test',
      changedById: 'core-user-1',
      changedByBind: '/cr664_users(core-user-1)',
    }), invocation);
    expect(result).toMatchObject({
      kind: 'authority-denied',
      reasonCode: 'ACTION_PROHIBITED',
    });
    expect(createDecisionRecord).not.toHaveBeenCalled();
  });
});
