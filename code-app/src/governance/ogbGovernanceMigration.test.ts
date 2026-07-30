import { describe, expect, it } from 'vitest';
import type {
  ApprovalEvidence,
  CreditCaseFacts,
  GovernanceActor,
  GovernanceEvaluationRequest,
  GovernedActionEvidence,
} from './bankCreditGovernanceEngine';
import {
  activateOgbPolicyForShadow,
  certifyOgbShadowCases,
  compareOgbShadowCase,
  INITIAL_OGB_SHADOW_POLICY,
  OGB_LEGACY_RULE_INVENTORY,
  type OgbShadowCase,
} from './ogbGovernanceMigration';

const facts = (amount: number): CreditCaseFacts => ({
  amount,
  totalRelationshipExposure: amount,
  product: 'Commercial',
  collateral: ['Business assets'],
  riskRating: 'Pass',
  hasPolicyException: false,
  insiderStatus: false,
  concentration: [],
  industry: 'General',
  geography: 'US',
  governmentGuaranteedProgram: undefined,
  criticizedClassifiedStatus: undefined,
});

const actor = (
  actorId: string,
  action: GovernanceEvaluationRequest['action'],
  maximumAmount = 1_000_000,
  roles: readonly string[] = ['OGB_CREDIT_COMMITTEE'],
): GovernanceActor => ({
  actorId,
  roles,
  committeeMemberships: [],
  authorityGrants: [{
    grantId: `fixture-grant-${actorId}-${action}`,
    actions: [action],
    maximumAmount,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
  }],
});

const origin: GovernedActionEvidence = {
  action: 'ORIGINATE',
  actorId: 'originator-fixture',
  occurredAt: '2026-06-01T00:00:00.000Z',
  evidenceId: 'fixture-origin-evidence',
};

function request(
  action: GovernanceEvaluationRequest['action'],
  amount: number,
  actingActor: GovernanceActor | undefined,
  approvals: readonly ApprovalEvidence[] = [],
  actionHistory: readonly GovernedActionEvidence[] = [origin],
): GovernanceEvaluationRequest {
  return {
    evaluationId: `shadow-${action}-${amount}`,
    evaluatedAt: '2026-07-01T00:00:00.000Z',
    action,
    policy: activateOgbPolicyForShadow(),
    facts: facts(amount),
    actor: actingActor,
    approvals,
    actionHistory,
  };
}

describe('OGB legacy inventory and migration profile', () => {
  it('maps every policy mapping to a real rule and keeps the canonical profile inactive', () => {
    const ruleIds = new Set(INITIAL_OGB_SHADOW_POLICY.rules.map((rule) => rule.ruleId));
    expect(OGB_LEGACY_RULE_INVENTORY).not.toHaveLength(0);
    expect(new Set(OGB_LEGACY_RULE_INVENTORY.map((item) => item.legacyRuleId)).size)
      .toBe(OGB_LEGACY_RULE_INVENTORY.length);
    for (const item of OGB_LEGACY_RULE_INVENTORY) {
      expect(item.sourcePaths).not.toHaveLength(0);
      item.policyRuleIds.forEach((ruleId) => expect(ruleIds.has(ruleId)).toBe(true));
    }
    expect(INITIAL_OGB_SHADOW_POLICY.status).toBe('DRAFT');
    expect(JSON.stringify(INITIAL_OGB_SHADOW_POLICY)).not.toMatch(/userId|approvedBy|actorId/);
  });

  it('matches current credit approval permits and denials', () => {
    const cases: OgbShadowCase[] = [
      {
        caseId: 'approval-within-limit',
        description: 'Different committee actor within migrated limit.',
        source: 'REPOSITORY_CONTROLLED',
        legacyPermitted: true,
        request: request('APPROVE', 500_000, actor('approver-fixture', 'APPROVE')),
      },
      {
        caseId: 'approval-over-limit',
        description: 'Committee actor exceeds migrated personal limit.',
        source: 'REPRESENTATIVE_SYNTHETIC',
        legacyPermitted: false,
        request: request('APPROVE', 500_001, actor('approver-fixture', 'APPROVE', 500_000)),
      },
      {
        caseId: 'self-approval',
        description: 'Originator attempts own approval.',
        source: 'REPRESENTATIVE_SYNTHETIC',
        legacyPermitted: false,
        request: request(
          'APPROVE',
          100_000,
          actor('originator-fixture', 'APPROVE'),
        ),
      },
      {
        caseId: 'missing-originator-evidence',
        description: 'Configured policy fails closed where the legacy client had no opinion.',
        source: 'REPRESENTATIVE_SYNTHETIC',
        legacyPermitted: true,
        request: request('APPROVE', 100_000, actor('approver-fixture', 'APPROVE'), [], []),
        expectedClassification: 'CONFIGURABLE_STRONGER',
      },
    ];
    expect(cases.map(compareOgbShadowCase).map((result) => result.classification))
      .toEqual(['MATCH', 'MATCH', 'MATCH', 'CONFIGURABLE_STRONGER']);
  });

  it('matches the inclusive USD 250,000 dual-control boundary', () => {
    const approval = (id: string, actorId: string): ApprovalEvidence => ({
      approvalId: id,
      groupId: 'OGB_FUNDING_APPROVERS',
      actorId,
      actorRoles: ['OGB_FUNDING_APPROVER'],
      decision: 'APPROVE',
      occurredAt: '2026-07-01T00:00:00.000Z',
    });
    const cases: OgbShadowCase[] = [
      {
        caseId: 'below-threshold-one-approval',
        description: 'One approval below USD 250,000.',
        source: 'REPOSITORY_CONTROLLED',
        legacyPermitted: true,
        request: request('AUTHORIZE_FUNDING', 249_999, actor('funding-1', 'AUTHORIZE_FUNDING'), [approval('a1', 'funding-1')]),
      },
      {
        caseId: 'threshold-one-approval',
        description: 'One approval at USD 250,000 is insufficient.',
        source: 'REPOSITORY_CONTROLLED',
        legacyPermitted: false,
        request: request('AUTHORIZE_FUNDING', 250_000, actor('funding-1', 'AUTHORIZE_FUNDING'), [approval('a1', 'funding-1')]),
      },
      {
        caseId: 'threshold-duplicate-identity',
        description: 'Duplicate approval identities do not satisfy dual control.',
        source: 'REPRESENTATIVE_SYNTHETIC',
        legacyPermitted: false,
        request: request('AUTHORIZE_FUNDING', 250_000, actor('funding-1', 'AUTHORIZE_FUNDING'), [
          approval('a1', 'funding-1'),
          approval('a2', 'FUNDING-1'),
        ]),
      },
      {
        caseId: 'threshold-two-approvals',
        description: 'Two distinct approvals at USD 250,000.',
        source: 'REPOSITORY_CONTROLLED',
        legacyPermitted: true,
        request: request('AUTHORIZE_FUNDING', 250_000, actor('funding-1', 'AUTHORIZE_FUNDING'), [
          approval('a1', 'funding-1'),
          approval('a2', 'funding-2'),
        ]),
      },
    ];
    expect(cases.map(compareOgbShadowCase).every((result) => result.classification === 'MATCH')).toBe(true);
  });

  it('blocks cutover for a weaker result, unexplained mismatch, ratification, and production activation', () => {
    const weakCase: OgbShadowCase = {
      caseId: 'deliberate-weaker-sentinel',
      description: 'Certification sentinel proves weaker results cannot pass.',
      source: 'REPRESENTATIVE_SYNTHETIC',
      legacyPermitted: false,
      request: request('APPROVE', 10_000, actor('approver-fixture', 'APPROVE')),
    };
    const certification = certifyOgbShadowCases([weakCase]);
    expect(certification.activationState).toBe('NO_GO');
    expect(certification.cutoverEligible).toBe(false);
    expect(certification.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('weaker'),
      expect.stringContaining('ratification'),
      expect.stringContaining('outside PR 6'),
    ]));
  });
});
