import { describe, expect, it } from 'vitest';
import {
  BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION,
  serverResponsePermitsAction,
  type ServerGovernanceEvaluationResponse,
} from './bankCreditGovernancePorts';

const result = {
  evaluationId: 'evaluation-1',
  decision: 'PERMIT' as const,
  policyId: 'policy-1',
  policyVersion: 1,
  evaluatedAt: '2026-07-30T12:00:00Z',
  action: 'APPROVE' as const,
  matchedRuleIds: ['base'],
  findings: [],
  factSnapshot: {
    amount: 1,
    totalRelationshipExposure: 1,
    product: 'term',
    collateral: [],
    riskRating: 'pass',
    hasPolicyException: false,
    insiderStatus: false,
    concentration: [],
    industry: 'other',
    geography: 'US',
    governmentGuaranteedProgram: undefined,
    criticizedClassifiedStatus: undefined,
  },
};

describe('bank credit governance server contract', () => {
  it('uses an explicit cross-runtime contract version', () => {
    expect(BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION).toBe('bank-credit-governance/v2');
  });

  it('permits only a durably evaluated PERMIT response', () => {
    const permit: ServerGovernanceEvaluationResponse = {
      contractVersion: BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION,
      kind: 'evaluated',
      evaluationRecordId: 'record-1',
      result,
    };
    expect(serverResponsePermitsAction(permit)).toBe(true);
    expect(serverResponsePermitsAction({ ...permit, result: { ...result, decision: 'BLOCK' } })).toBe(false);
    expect(serverResponsePermitsAction({
      contractVersion: BANK_CREDIT_GOVERNANCE_CONTRACT_VERSION,
      kind: 'denied-before-evaluation',
      reasonCode: 'EVALUATION_PERSISTENCE_FAILED',
      safeMessage: 'Evaluation evidence could not be recorded.',
    })).toBe(false);
  });
});
