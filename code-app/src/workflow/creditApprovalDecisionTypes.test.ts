import { describe, it, expect } from 'vitest';
import { evaluateCreditApprovalDecisionReadiness, type CreditApprovalDecisionRecord } from './creditApprovalDecisionTypes';

function record(overrides: Partial<CreditApprovalDecisionRecord> = {}): CreditApprovalDecisionRecord {
  return {
    decisionId: 'cad-1',
    dealId: 'deal-1',
    status: 'APPROVED',
    approvedAmount: 500_000,
    approvedProduct: 'SBA 7(a)',
    approvedTermMonths: 84,
    approvedPricing: 'Prime + 2.00%',
    collateralSummary: undefined,
    conditions: [],
    authorityTier: 'committee',
    rationale: 'Approved on DSCR and collateral coverage.',
    requestedByActorEmail: 'banker@bank.test',
    requestedAtIso: '2026-07-24T10:00:00.000Z',
    decidedByActorEmail: 'committee-member@bank.test',
    decidedAtIso: '2026-07-24T12:00:00.000Z',
    correlationId: 'ca-corr-1',
    supersedesDecisionId: undefined,
    ...overrides,
  };
}

describe('evaluateCreditApprovalDecisionReadiness', () => {
  it('fails closed (not met) when there are no decisions at all', () => {
    const r = evaluateCreditApprovalDecisionReadiness(undefined, 'deal-1');
    expect(r.decisionRecorded.met).toBe(false);
    expect(r.authorityRecorded.met).toBe(false);
    expect(r.conditionsDocumented.met).toBe(false);
    expect(r.currentDecision).toBeUndefined();
  });

  it('fails closed when the only decision is for a DIFFERENT deal', () => {
    const r = evaluateCreditApprovalDecisionReadiness([record({ dealId: 'other-deal' })], 'deal-1');
    expect(r.decisionRecorded.met).toBe(false);
  });

  it('fails closed on a DECLINED decision (not an affirmative approval)', () => {
    const r = evaluateCreditApprovalDecisionReadiness([record({ status: 'DECLINED', authorityTier: undefined })], 'deal-1');
    expect(r.decisionRecorded.met).toBe(false);
  });

  it('fails closed on a RETURNED decision', () => {
    const r = evaluateCreditApprovalDecisionReadiness([record({ status: 'RETURNED' })], 'deal-1');
    expect(r.decisionRecorded.met).toBe(false);
  });

  it('is met on an APPROVED decision with an authority tier recorded', () => {
    const r = evaluateCreditApprovalDecisionReadiness([record()], 'deal-1');
    expect(r.decisionRecorded.met).toBe(true);
    expect(r.authorityRecorded.met).toBe(true);
    expect(r.conditionsDocumented.met).toBe(true);
    expect(r.currentDecision?.decisionId).toBe('cad-1');
  });

  it('is met on an APPROVED_WITH_CONDITIONS decision', () => {
    const r = evaluateCreditApprovalDecisionReadiness(
      [record({ status: 'APPROVED_WITH_CONDITIONS', conditions: ['Executed loan agreement'] })],
      'deal-1',
    );
    expect(r.decisionRecorded.met).toBe(true);
  });

  it('fails authorityRecorded specifically when the authority tier is blank, even though a decision exists', () => {
    const r = evaluateCreditApprovalDecisionReadiness([record({ authorityTier: undefined })], 'deal-1');
    expect(r.decisionRecorded.met).toBe(true);
    expect(r.authorityRecorded.met).toBe(false);
  });

  it('picks the MOST RECENT affirmative decision when several exist (append-only history)', () => {
    const older = record({ decisionId: 'cad-1', decidedAtIso: '2026-07-20T00:00:00.000Z', approvedAmount: 100_000 });
    const newer = record({ decisionId: 'cad-2', decidedAtIso: '2026-07-24T00:00:00.000Z', approvedAmount: 500_000 });
    const r = evaluateCreditApprovalDecisionReadiness([older, newer], 'deal-1');
    expect(r.currentDecision?.decisionId).toBe('cad-2');
  });

  it('never fabricates a met result from a decision belonging to a different deal mixed into the same list', () => {
    const wrongDeal = record({ dealId: 'deal-2', decidedAtIso: '2026-07-25T00:00:00.000Z' });
    const rightDeal = record({ dealId: 'deal-1', decidedAtIso: '2026-07-20T00:00:00.000Z' });
    const r = evaluateCreditApprovalDecisionReadiness([wrongDeal, rightDeal], 'deal-1');
    expect(r.currentDecision?.dealId).toBe('deal-1');
  });

  // Workstream V — unlike its five siblings (evaluateCommitmentReadiness,
  // evaluateConditionVerificationReadiness, evaluateExecutedDocumentAttestationReadiness,
  // evaluateBookingQcReadiness, evaluateAdverseActionReadiness), this evaluator resolves "current"
  // by decidedAtIso timestamp comparison only -- submitCreditApprovalDecision.ts passes through a
  // caller-supplied supersedesDecisionId rather than having this function resolve the chain
  // structurally. This pins the ACTUAL behavior on a same-timestamp collision (a real risk this
  // evaluator carries that its chain-resolving siblings do not) rather than leaving it unspecified.
  // A future change could align this evaluator with the chain-based pattern; not attempted here.
  it('Workstream V — pins the actual (stable-sort) tie-break when two decisions carry an IDENTICAL decidedAtIso (a real ambiguity this evaluator does not resolve structurally, unlike its chain-based siblings)', () => {
    const same = '2026-07-24T10:00:00.000Z';
    const first = record({ decisionId: 'cad-1', decidedAtIso: same, approvedAmount: 100_000 });
    const second = record({ decisionId: 'cad-2', decidedAtIso: same, approvedAmount: 500_000 });
    const r = evaluateCreditApprovalDecisionReadiness([first, second], 'deal-1');
    // Stable sort on an exact tie preserves input order -- the FIRST record in the array wins, not
    // necessarily the one actually decided last. Pinned so a future refactor cannot silently change
    // this without a test failure calling it out.
    expect(r.currentDecision?.decisionId).toBe('cad-1');
  });
});
