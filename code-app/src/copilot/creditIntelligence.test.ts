import { describe, expect, it, vi } from 'vitest';
import {
  CREDIT_INTELLIGENCE_CONTRACT_VERSION,
  executeCreditIntelligence,
  type CreditIntelligenceAuditPort,
  type CreditIntelligenceDependencies,
  type CreditIntelligenceRequest,
  type CreditSourceArtifact,
} from './creditIntelligence';

const artifact: CreditSourceArtifact = {
  artifactId: 'ev-1',
  sourceId: 'dataverse-los',
  sourceKind: 'dataverse',
  recordId: 'deal-1',
  title: 'Authorized deal snapshot',
  locator: 'dataverse:cr664_loandeal/deal-1',
  retrievedAt: '2026-07-31T12:00:00.000Z',
  contentHash: 'sha256:abc',
  permissionBasis: 'Dataverse row-level access',
  freshness: 'current',
  facts: [{
    factId: 'fact-1',
    name: 'annual_revenue',
    value: 2_000_000,
    classification: 'verified_source_fact',
    evidenceIds: ['ev-1'],
    confidence: 1,
    requiresHumanVerification: false,
  }],
};

function request(overrides: Partial<CreditIntelligenceRequest> = {}): CreditIntelligenceRequest {
  return {
    contractVersion: CREDIT_INTELLIGENCE_CONTRACT_VERSION,
    correlationId: 'corr-1',
    requestedAt: '2026-07-31T12:00:00.000Z',
    tool: 'research_party',
    actor: {
      systemUserId: 'user-1',
      upn: 'banker@oldglorybank.com',
      permissions: ['copilot.research_party'],
    },
    scope: {
      bankId: 'ogb',
      dealId: 'deal-1',
      partyIds: ['party-1'],
      authorizedRecordIds: ['deal-1'],
      authorizedSourceIds: ['dataverse-los'],
      purpose: 'commercial_credit_underwriting',
    },
    ...overrides,
  };
}

function dependencies(overrides: Partial<CreditIntelligenceDependencies> = {}): CreditIntelligenceDependencies {
  let auditNumber = 0;
  return {
    authorization: { authorize: async () => ({ allowed: true }) },
    sources: { retrieve: async () => [artifact] },
    audit: { append: async () => ({ kind: 'appended', eventId: `audit-${++auditNumber}` }) },
    hash: { hashCanonical: async () => 'sha256:evaluation' },
    now: () => '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

describe('credit intelligence orchestration', () => {
  it('returns sourced facts, an immutable hash, and start/completion audit evidence', async () => {
    const result = await executeCreditIntelligence(request(), dependencies());
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    expect(result.facts).toHaveLength(1);
    expect(result.evidence[0].locator).toContain('dataverse:');
    expect(result.evaluationHash).toBe('sha256:evaluation');
    expect(result.auditEventIds).toEqual(['audit-1', 'audit-2']);
    expect(result.warnings.join(' ')).toMatch(/governed LOS remains authoritative/i);
  });

  it('never retrieves when start-audit persistence fails', async () => {
    const retrieve = vi.fn(async () => [artifact]);
    const audit: CreditIntelligenceAuditPort = {
      append: async () => ({ kind: 'failed', safeReason: 'audit offline' }),
    };
    const result = await executeCreditIntelligence(
      request(),
      dependencies({ sources: { retrieve }, audit }),
    );
    expect(result).toMatchObject({ status: 'blocked', code: 'AUDIT_UNAVAILABLE' });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('rejects a tool when the authenticated actor lacks its explicit permission', async () => {
    const retrieve = vi.fn(async () => [artifact]);
    const result = await executeCreditIntelligence(
      request({ actor: { systemUserId: 'user-1', upn: 'user@bank.com', permissions: [] } }),
      dependencies({ sources: { retrieve } }),
    );
    expect(result).toMatchObject({ status: 'blocked', code: 'UNAUTHORIZED' });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('fails closed when a connector returns a source or record outside row-level scope', async () => {
    const outside = { ...artifact, sourceId: 'unapproved-web', recordId: 'other-deal' };
    const result = await executeCreditIntelligence(
      request(),
      dependencies({ sources: { retrieve: async () => [outside] } }),
    );
    expect(result).toMatchObject({ status: 'blocked', code: 'EVIDENCE_INTEGRITY_FAILED' });
  });

  it.each(['race', 'religion', 'national-origin', 'marital status', 'age'])(
    'rejects protected characteristic %s before narration',
    async (name) => {
      const unsafe = {
        ...artifact,
        facts: [{ ...artifact.facts[0], name }],
      };
      const compose = vi.fn();
      const result = await executeCreditIntelligence(
        request(),
        dependencies({
          sources: { retrieve: async () => [unsafe] },
          narrator: { compose },
        }),
      );
      expect(result).toMatchObject({ status: 'blocked', code: 'EVIDENCE_INTEGRITY_FAILED' });
      expect(compose).not.toHaveBeenCalled();
    },
  );

  it('identifies contradictory facts and proposes only a human-confirmed governed review', async () => {
    const conflict: CreditSourceArtifact = {
      ...artifact,
      artifactId: 'ev-2',
      contentHash: 'sha256:def',
      facts: [{ ...artifact.facts[0], factId: 'fact-2', value: 3_000_000, evidenceIds: ['ev-2'] }],
    };
    const result = await executeCreditIntelligence(
      request(),
      dependencies({ sources: { retrieve: async () => [artifact, conflict] } }),
    );
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    expect(result.contradictions).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      type: 'flag_for_review',
      requiresConfirmation: true,
      governedWritePath: 'governed-review-task',
    });
  });

  it('rejects uncited narration and any narration that claims a decision or authority', async () => {
    for (const containsDecisionOrAuthorityClaim of [false, true]) {
      const result = await executeCreditIntelligence(
        request(),
        dependencies({
          narrator: {
            compose: async () => ({
              summary: 'Generated narrative',
              sections: [{ heading: 'Analysis', body: 'Unsupported', evidenceIds: containsDecisionOrAuthorityClaim ? ['ev-1'] : [] }],
              citedEvidenceIds: containsDecisionOrAuthorityClaim ? ['ev-1'] : [],
              containsDecisionOrAuthorityClaim,
            }),
          },
        }),
      );
      expect(result).toMatchObject({ status: 'blocked', code: 'UNSAFE_OUTPUT' });
    }
  });

  it('explains only a stored authoritative governance evaluation', async () => {
    const evaluation = {
      evaluationId: 'gov-1',
      decision: 'BLOCK' as const,
      policyId: 'policy-1',
      policyVersion: 1,
      evaluatedAt: '2026-07-31T12:00:00.000Z',
      action: 'APPROVE' as const,
      matchedRuleIds: ['limit'],
      findings: [],
      factSnapshot: {
        amount: 1_500_000,
        totalRelationshipExposure: 1_500_000,
        product: 'CRE',
        collateral: ['real-estate'],
        riskRating: 'Pass',
        hasPolicyException: false,
        insiderStatus: false,
        concentration: [],
        industry: 'Real estate',
        geography: 'US',
        governmentGuaranteedProgram: undefined,
        criticizedClassifiedStatus: undefined,
      },
    };
    const result = await executeCreditIntelligence(
      request({
        tool: 'explain_governance_route',
        governanceEvaluationId: 'gov-1',
        actor: {
          systemUserId: 'user-1',
          upn: 'banker@oldglorybank.com',
          permissions: ['copilot.governance_explain'],
        },
      }),
      dependencies({ governance: { getEvaluation: async () => evaluation } }),
    );
    expect(result.status).toBe('complete');
    if (result.status === 'complete') expect(result.governanceEvaluation).toBe(evaluation);
  });

  it('fails closed if completion audit cannot be written', async () => {
    let call = 0;
    const result = await executeCreditIntelligence(
      request(),
      dependencies({
        audit: {
          append: async () => ++call === 1
            ? { kind: 'appended', eventId: 'start' }
            : { kind: 'failed', safeReason: 'completion unavailable' },
        },
      }),
    );
    expect(result).toMatchObject({ status: 'blocked', code: 'AUDIT_UNAVAILABLE' });
  });
});
