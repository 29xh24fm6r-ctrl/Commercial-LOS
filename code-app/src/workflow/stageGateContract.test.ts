// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  evaluateExitGate,
  outstandingRequirements,
  untrackedRequirementIds,
  type StageGateFacts,
} from './stageGateContract';
import { CANONICAL_STAGE_CODES, type CanonicalStageCode } from './stageOrderingContract';

/** All facts true → every gate satisfied. */
const ALL_MET: StageGateFacts = {
  borrowerPresent: true, loanAmountPresent: true, productTypePresent: true,
  assignedBankerPresent: true, intakeChecklistGenerated: true,
  requiredDocumentsReceived: true, creditMemoDraftExists: true, riskRatingAssigned: true,
  creditMemoFinalized: true, approvalDecisionRecorded: true, approvalAuthoritySufficient: true,
  approvalConditionsDocumented: true,
  commitmentIssued: true, borrowerAcceptanceRecorded: true,
  approvalConditionsCleared: true, closingDocumentsPrepared: true, collateralVerified: true, insuranceVerified: true,
  loanDocumentsExecuted: true, fundsDisbursed: true,
  boardingCompleted: true,
};

describe('evaluateExitGate — satisfied path', () => {
  it.each(CANONICAL_STAGE_CODES)('%s gate is satisfied when all facts are met', (stage) => {
    const result = evaluateExitGate(stage as CanonicalStageCode, ALL_MET);
    expect(result.satisfied).toBe(true);
    expect(result.requirements.every((r) => r.met)).toBe(true);
    expect(outstandingRequirements(result)).toEqual([]);
  });
});

describe('evaluateExitGate — fail-closed on each single missing requirement', () => {
  it('INTAKE fails when the checklist is not generated, flagging exactly that requirement', () => {
    const r = evaluateExitGate('INTAKE', { ...ALL_MET, intakeChecklistGenerated: false });
    expect(r.satisfied).toBe(false);
    const outstanding = outstandingRequirements(r);
    expect(outstanding.map((o) => o.id)).toEqual(['intake.checklist']);
    expect(outstanding[0]!.detail).toMatch(/outstanding/i);
  });

  it('CREDIT_APPROVAL fails when the approver authority is insufficient', () => {
    const r = evaluateExitGate('CREDIT_APPROVAL', { ...ALL_MET, approvalAuthoritySufficient: false });
    expect(r.satisfied).toBe(false);
    expect(outstandingRequirements(r).map((o) => o.id)).toContain('ca.authority');
  });

  it('CLOSING_FUNDING fails when funds are not disbursed', () => {
    const r = evaluateExitGate('CLOSING_FUNDING', { ...ALL_MET, fundsDisbursed: false });
    expect(r.satisfied).toBe(false);
    expect(outstandingRequirements(r).map((o) => o.id)).toEqual(['close.disbursed']);
  });
});

describe('evaluateExitGate — unknown/untracked data is fail-closed and surfaced honestly', () => {
  it('treats absent facts as not met with a "not yet tracked" detail (never auto-passes)', () => {
    const r = evaluateExitGate('UNDERWRITING', {}); // no facts at all
    expect(r.satisfied).toBe(false);
    expect(r.requirements.every((req) => !req.met)).toBe(true);
    expect(r.requirements.every((req) => /not yet tracked/i.test(req.detail))).toBe(true);
  });

  it('untrackedRequirementIds enumerates the not-yet-tracked gaps for follow-up', () => {
    const facts: StageGateFacts = { requiredDocumentsReceived: true }; // only one tracked
    const untracked = untrackedRequirementIds('UNDERWRITING', facts);
    expect(untracked).toContain('uw.memo-draft');
    expect(untracked).toContain('uw.risk-rating');
    expect(untracked).not.toContain('uw.documents');
  });

  it('distinguishes outstanding (false) from not-tracked (undefined) in the detail copy', () => {
    const r = evaluateExitGate('COMMITMENT', { commitmentIssued: false }); // borrowerAcceptance undefined
    const issued = r.requirements.find((req) => req.id === 'commit.issued')!;
    const acceptance = r.requirements.find((req) => req.id === 'commit.acceptance')!;
    expect(issued.detail).toMatch(/outstanding/i);
    expect(acceptance.detail).toMatch(/not yet tracked/i);
  });
});
