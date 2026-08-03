import { describe, expect, it } from 'vitest';
import {
  buildCreditEvidencePacket,
  derivePortfolioMonitoringAlerts,
  deriveRelationshipIntelligence,
  explainGovernanceEvaluation,
  summarizePolicyComparison,
} from './creditIntelligenceDerivations';

describe('credit intelligence derivations', () => {
  it('calculates ratios only from human-accepted fields with page provenance', () => {
    const packet = buildCreditEvidencePacket([
      { fieldId: 'cash', documentId: 'doc', documentHash: 'sha256:1', page: 4, name: 'cash flow available for debt service', value: 150, confidence: .95, humanStatus: 'accepted', sourceLocator: 'doc:4' },
      { fieldId: 'debt-service', documentId: 'doc', documentHash: 'sha256:1', page: 8, name: 'annual debt service', value: 100, confidence: .93, humanStatus: 'corrected', sourceLocator: 'doc:8' },
      { fieldId: 'pending-debt', documentId: 'doc', documentHash: 'sha256:1', page: 9, name: 'total debt', value: 500, confidence: .51, humanStatus: 'pending', sourceLocator: 'doc:9' },
    ]);
    expect(packet.calculations[0]).toMatchObject({ name: 'debt_service_coverage_ratio', value: 1.5, inputFieldIds: ['cash', 'debt-service'] });
    expect(packet.pendingFields).toHaveLength(1);
    expect(packet.readyForMemoDraft).toBe(false);
  });

  it('blocks memo readiness on conflicting accepted document values', () => {
    const base = { documentId: 'doc', documentHash: 'sha256:1', page: 1, name: 'annual revenue', confidence: 1, humanStatus: 'accepted' as const, sourceLocator: 'doc:1' };
    const packet = buildCreditEvidencePacket([
      { ...base, fieldId: 'a', value: 100 },
      { ...base, fieldId: 'b', value: 200 },
    ]);
    expect(packet.conflicts).toHaveLength(1);
    expect(packet.readyForMemoDraft).toBe(false);
  });

  it('keeps relationship commitments linked to the source communication', () => {
    const result = deriveRelationshipIntelligence([{
      communicationId: 'mail-1',
      source: 'outlook',
      occurredAt: '2026-07-01T00:00:00Z',
      participants: ['borrower@example.com'],
      summary: 'Financials requested.',
      evidenceLocator: 'graph:message/mail-1',
      commitments: [{ text: 'Send financials', ownerUpn: 'borrower@example.com', dueAt: '2026-07-15T00:00:00Z' }],
    }], '2026-07-31T00:00:00Z');
    expect(result.openCommitments[0].evidenceLocator).toBe('graph:message/mail-1');
    expect(result.warnings[0]).toMatch(/overdue/i);
  });

  it('creates cited observations requiring review, never automatic servicing actions', () => {
    const alerts = derivePortfolioMonitoringAlerts({
      dealId: 'deal-1',
      asOf: '2026-07-31T00:00:00Z',
      covenantDueAt: '2026-07-30T00:00:00Z',
      priorBorrowingBase: 1_000_000,
      currentBorrowingBase: 800_000,
      evidenceIds: ['ev-1'],
    });
    expect(alerts).toHaveLength(2);
    expect(alerts.every((alert) => alert.requiresHumanReview && alert.evidenceIds[0] === 'ev-1')).toBe(true);
  });

  it('explains the exact stored governance decision without predicting another result', () => {
    const lines = explainGovernanceEvaluation({
      evaluationId: 'g1', decision: 'BLOCK', policyId: 'p1', policyVersion: 2,
      evaluatedAt: '2026-07-31T00:00:00Z', action: 'APPROVE', matchedRuleIds: ['r1'],
      findings: [{ code: 'DELEGATED_AUTHORITY_EXCEEDED', ruleId: 'r1', message: 'Amount exceeds limit.', nonOverrideable: true, evidenceIds: [] }],
      factSnapshot: { amount: 2, totalRelationshipExposure: 2, product: 'CRE', collateral: [], riskRating: 'Pass', hasPolicyException: false, insiderStatus: false, concentration: [], industry: 'CRE', geography: 'US', governmentGuaranteedProgram: undefined, criticizedClassifiedStatus: undefined },
    });
    expect(lines.join(' ')).toMatch(/authoritative governance decision is BLOCK/);
    expect(lines.join(' ')).toMatch(/Amount exceeds limit/);
  });

  it('labels policy-control direction honestly', () => {
    expect(summarizePolicyComparison({ fromVersionId: '1', toVersionId: '2', weakerControls: ['Limit increased'], strongerControls: ['Quorum increased'], neutralChanges: [] })).toEqual([
      'WEAKER: Limit increased', 'STRONGER: Quorum increased',
    ]);
  });
});
